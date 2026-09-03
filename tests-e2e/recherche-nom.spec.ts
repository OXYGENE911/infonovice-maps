import { test, expect } from '@playwright/test';
import { simulerTuiles } from './tuiles-simulees';

/* LA RECHERCHE PAR NOM (RECHERCHE-2, refondue par RECHERCHE-3 le 01/09).
 *
 * Armelin, le lendemain de la livraison : « quand je tape un nom dans la
 * barre de recherche, je ne parviens pas à trouver une adresse. Par exemple
 * le collège de ma fille […] ou alors "Tour Eiffel Paris" […] "Castorama". »
 *
 * MESURÉ, ET C'EST LA CAUSE : la BAN rend presque TOUJOURS quelque chose —
 * « Tour Eiffel Paris » y rend « Avenue Gustave Eiffel » (0,378). La porte
 * de RECHERCHE-2, ouverte sur le seul SILENCE de la BAN, ne s'ouvrait donc
 * jamais. Ces parcours défendent la nouvelle règle : une saisie qui ressemble
 * à un NOM cherche aussi un nom, et cherche AUTOUR du meilleur résultat de la
 * BAN — c'est lui qui porte la commune que l'usager vient d'écrire. */

const AVENUE_EIFFEL = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [2.2945, 48.8584] },
  properties: {
    label: 'Avenue Gustave Eiffel 75007 Paris', type: 'street',
    postcode: '75007', city: 'Paris',
    /* LE SCORE MESURÉ SUR LA BAN pour « Tour Eiffel Paris » : elle rend
       l'avenue faute de mieux, et le dit par un 0,378. C'est ce doute qui
       autorise à chercher plus loin. */
    score: 0.378,
  },
};

const TOUR = {
  type: 'node', id: 5013364, lat: 48.8583, lon: 2.2944,
  tags: { tourism: 'attraction', name: 'Tour Eiffel' },
};

async function decor(page: import('@playwright/test').Page, options: {
  adresses?: unknown[]; lieux?: unknown[]; expiration?: boolean;
  etablissements?: unknown[];
  /* LES DEUX SOURCES DE RECHERCHE-8 (03/09), simulées comme les autres : la
     CI ne doit ni dépendre d'un service public, ni le solliciter à chaque
     poussée. Leur disponibilité RÉELLE se prouve par mesure, avec
     `scripts/essai-douze-requetes.ts`. */
  poisIgn?: unknown[]; entreprises?: unknown[];
} = {}): Promise<{ ban: string[]; overpass: string[]; annuaire: string[] }> {
  const ban: string[] = [];
  const overpass: string[] = [];
  const annuaire: string[] = [];
  /* L'ANNUAIRE DE L'ÉDUCATION NATIONALE (ECOLES-1) : simulé comme les autres
     services publics — la CI ne doit ni en dépendre, ni le solliciter à
     chaque poussée. Sa disponibilité réelle est prouvée par mesure. */
  await page.route('**/data.education.gouv.fr/**', (route) => {
    annuaire.push(decodeURIComponent(route.request().url()));
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        total_count: (options.etablissements ?? []).length,
        results: options.etablissements ?? [],
      }),
    });
  });
  await simulerTuiles(page);
  /* APRÈS `simulerTuiles`, ET C'EST VOULU : les tuiles vivent aussi sur
     data.geopf.fr, et Playwright donne la main à la route posée EN DERNIER.
     Le motif est plus précis que celui des tuiles, mais l'ordre décide. */
  /* L'EN-TÊTE CORS N'EST PAS DÉCORATIVE : sans elle, le navigateur refuse la
     réponse simulée et le code voit « Failed to fetch » — une panne réseau qui
     masque celle qu'on voulait mesurer. Payé une fois ici, en cherchant
     pourquoi le parcours de l'expiration ne disait plus « pas eu le temps ». */
  const cors = { 'Access-Control-Allow-Origin': '*' };
  await page.route('**/data.geopf.fr/geocodage/**', (route) => route.fulfill({
    headers: cors,
    contentType: 'application/json',
    body: JSON.stringify({ type: 'FeatureCollection', features: options.poisIgn ?? [] }),
  }));
  await page.route('**/recherche-entreprises.api.gouv.fr/**', (route) => route.fulfill({
    headers: cors,
    contentType: 'application/json',
    body: JSON.stringify({ results: options.entreprises ?? [] }),
  }));
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    ban.push(new URL(route.request().url()).searchParams.get('q') ?? '');
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ type: 'FeatureCollection', features: options.adresses ?? [] }),
    });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    overpass.push(decodeURIComponent(route.request().url()));
    /* UNE RÉPONSE VIDE ACCOMPAGNÉE D'UN `remark` EST UNE EXPIRATION, pas un
       zéro : c'est la forme exacte que rend le service quand la requête a
       coûté trop cher (mesuré : 57 s sur une expression régulière). */
    const corps = options.expiration
      ? { elements: [], remark: 'runtime error: Query timed out in "query" after 57 seconds.' }
      : { elements: options.lieux ?? [] };
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json', body: JSON.stringify(corps),
    });
  });
  return { ban, overpass, annuaire };
}

/* TROIS BARRES VIVENT DANS LA PAGE — l'accueil, le départ, l'arrivée. Un
   sélecteur global les prend toutes et Playwright refuse net (mode strict). */
const barre = (page: import('@playwright/test').Page) =>
  page.locator('recherche-adresse').first();

async function ouvrir(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

test('UN NOM SE TROUVE MÊME QUAND LA BAN A RÉPONDU À CÔTÉ', async ({ page }) => {
  /* LE CAS EXACT DU TERRAIN : la BAN rend l'avenue Gustave Eiffel, la Tour
     Eiffel n'apparaissait pas. Elle doit désormais passer DEVANT. */
  const { overpass } = await decor(page, { adresses: [AVENUE_EIFFEL], lieux: [TOUR] });
  await ouvrir(page);
  await barre(page).getByRole('combobox').fill('Tour Eiffel Paris');

  await expect(barre(page).locator('[role="option"] .libelle').first())
    .toHaveText('Tour Eiffel', { timeout: 10_000 });
  // L'adresse de la BAN reste proposée dessous : on n'a rien perdu.
  await expect(barre(page).locator('[role="option"] .libelle'))
    .toContainText(['Tour Eiffel', 'Avenue Gustave Eiffel 75007 Paris']);

  /* CE QUI PART COMPTE AUTANT : une ÉGALITÉ (l'index d'Overpass), jamais une
     expression régulière — mesurée expirée — et autour du point que la BAN
     vient de désigner, pas autour de la vue. */
  /* UN SEUL APPEL À OVERPASS, et c'est une règle du projet : « ne JAMAIS
     marteler les API publiques ». RECHERCHE-8 a failli en faire deux — un
     autour de la vue, un autour de la commune — et ce compteur l'a vu. */
  expect(overpass).toHaveLength(1);
  /* ET IL CHERCHE « Tour Eiffel », PAS « Tour Eiffel Paris » (RECHERCHE-8).
     La commune SITUE, elle ne NOMME pas : aucun objet d'OpenStreetMap ne
     s'appelle « Tour Eiffel Paris », et l'égalité exacte sur cette chaîne ne
     pouvait donc jamais aboutir. */
  expect(overpass[0]).toContain('["name"="Tour Eiffel"]');
  expect(overpass[0]).not.toContain('"Tour Eiffel Paris"');
  expect(overpass[0]).not.toContain('~');
  expect(overpass[0]).toContain('around:25000,48.85840,2.29450');
});

test('UNE ADRESSE AVEC UN NUMÉRO NE DÉRANGE PAS OVERPASS', async ({ page }) => {
  /* LA FRUGALITÉ RESTE UNE RÈGLE : un numéro en tête, c'est la BAN qui
     répond, et le service bénévole n'a rien à faire là. */
  const { ban, overpass } = await decor(page, { adresses: [{
    ...AVENUE_EIFFEL,
    properties: { ...AVENUE_EIFFEL.properties, score: 0.965 },
  }] });
  await ouvrir(page);
  await barre(page).getByRole('combobox').fill('25 avenue du prophète');
  await expect(barre(page).locator('[role="option"]').first()).toBeVisible({ timeout: 10_000 });
  expect(ban.length).toBeGreaterThan(0);
  expect(overpass, 'une adresse numérotée ne coûte rien à Overpass').toHaveLength(0);
});

test('UN SERVICE QUI EXPIRE NE DIT PAS « CE LIEU N’EXISTE PAS »', async ({ page }) => {
  /* LE PIÈGE PAYÉ DEUX FOIS DANS CE PROJET : une réponse VIDE accompagnée
     d'un `remark` est une expiration. La lire comme un zéro ferait nier
     l'existence d'un lieu qu'on n'a simplement pas eu le temps de chercher. */
  await decor(page, { adresses: [], expiration: true });
  await ouvrir(page);
  await barre(page).getByRole('combobox').fill('Castorama');

  const note = barre(page).locator('.recherche-note');
  await expect(note).toBeVisible({ timeout: 10_000 });
  await expect(note).toContainText('pas eu le temps');
  await expect(note, 'ne jamais conclure à l’absence').not.toContainText('Aucune adresse ni lieu');
});

test('SANS RIEN TROUVER, ON DIT CE QU’IL FAUT ÉCRIRE', async ({ page }) => {
  /* LE PRIX DE L'ÉGALITÉ EXACTE, DIT À L'USAGER : « Castorama » trouve,
     « Casto » ne trouve pas. Une recherche par morceaux expirerait toujours
     — mieux vaut une règle claire qu'une promesse qui traîne. */
  await decor(page, { adresses: [], lieux: [] });
  await ouvrir(page);
  await barre(page).getByRole('combobox').fill('Casto');

  const note = barre(page).locator('.recherche-note');
  await expect(note).toBeVisible({ timeout: 10_000 });
  /* LE MESSAGE A CHANGÉ AVEC RECHERCHE-8 : « le nom doit être écrit en
     entier » n'est plus vrai — l'index de la Géoplateforme tolère la faute et
     le mot incomplet. On dit donc ce qu'on sait : rien trouvé. */
  await expect(note).toContainText('Aucune adresse ni lieu');
});

const AVENUE_CAMUS = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [2.5760, 48.8051] },
  properties: {
    label: 'avenue albert camus 94420 Le Plessis-Trévise', type: 'street',
    postcode: '94420', city: 'Le Plessis-Trévise',
    /* LE SCORE MESURÉ SUR LA BAN pour la saisie d'Armelin : 0,636. Elle rend
       l'avenue faute de connaître le collège — et ce doute autorise à
       chercher plus loin. */
    score: 0.636,
  },
};

const COLLEGE = {
  nom_etablissement: 'Collège Albert Camus', type_etablissement: 'Collège',
  nom_commune: 'Le Plessis-Trévise', latitude: 48.80512, longitude: 2.57597,
};

test('LE COLLÈGE INTROUVABLE DANS OSM SE TROUVE DANS L’ANNUAIRE', async ({ page }) => {
  /* ECOLES-1 (01/09) — le cas exact d'Armelin : « le collège de ma fille ne
     donne rien en tapant "Collège Albert Camus Plessis-Trévise" ».
     MESURÉ le jour même : OpenStreetMap ne le connaît pas (soixante écoles
     autour de chez lui, aucune de ce nom), l'annuaire de l'Éducation
     nationale le porte. Les deux sources sont donc interrogées ENSEMBLE. */
  const { annuaire, overpass } = await decor(page, {
    adresses: [AVENUE_CAMUS], lieux: [], etablissements: [COLLEGE],
  });
  await ouvrir(page);
  await barre(page).getByRole('combobox').fill('Collège Albert Camus');

  await expect(barre(page).locator('[role="option"] .libelle').first())
    .toHaveText('Collège Albert Camus', { timeout: 10_000 });
  /* LA SOURCE SE DIT : savoir d'où vient une réponse, c'est pouvoir la
     contester. */
  await expect(barre(page).locator('[role="option"] .contexte').first())
    .toHaveText('Collège · Le Plessis-Trévise');
  // L'avenue de la BAN reste dessous : on n'a rien perdu.
  await expect(barre(page).locator('[role="option"] .libelle'))
    .toContainText(['Collège Albert Camus', 'avenue albert camus 94420 Le Plessis-Trévise']);

  /* UN SEUL APPEL À CHAQUE SOURCE, autour du point que la BAN vient de
     désigner — et les deux partent EN MÊME TEMPS. */
  expect(annuaire).toHaveLength(1);
  expect(annuaire[0]).toContain('search(nom_etablissement');
  expect(annuaire[0]).toContain('48.80510');
  expect(overpass).toHaveLength(1);
});

test('L’ÉCHEC D’UNE SOURCE N’EMPORTE PAS L’AUTRE', async ({ page }) => {
  /* `allSettled` ET NON `all` : Overpass tombe régulièrement, et une école
     trouvée vaut mieux qu'une page vide. */
  const { annuaire } = await decor(page, {
    adresses: [AVENUE_CAMUS], expiration: true, etablissements: [COLLEGE],
  });
  await ouvrir(page);
  await barre(page).getByRole('combobox').fill('Collège Albert Camus');

  await expect(barre(page).locator('[role="option"] .libelle').first())
    .toHaveText('Collège Albert Camus', { timeout: 10_000 });
  expect(annuaire).toHaveLength(1);
});

const LIEUDIT_LOINTAIN = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [3.0640, 50.4750] },
  properties: {
    label: 'Collège Albert Camus 59239 Thumeries', type: 'locality',
    postcode: '59239', city: 'Thumeries',
    /* LE SCORE RÉELLEMENT MESURÉ SUR LA PRODUCTION : **0,945** (RECHERCHE-5,
       01/09), et non 0,48 comme l'affirmait ce fixture hier. L'écart vient du
       paramètre `autocomplete` que l'application envoie et que ma mesure à la
       main avait omis. C'est TOUT le sujet : à 0,48 le test passait sur du
       code qui, en production, ne cherchait jamais — parce que 0,945 franchit
       le seuil de confiance de 0,9. La valeur mesurée est la seule qui
       défende quelque chose. */
    score: 0.945,
  },
};

test('UN HOMONYME LOINTAIN NE DÉPLACE PAS LA RECHERCHE, SI SÛR SOIT-IL', async ({ page }) => {
  /* RECHERCHE-4 puis RECHERCHE-5 (01/09). MESURÉ dans le navigateur
     d'Armelin, sur la production : taper « Collège Albert Camus » rend le
     LIEU-DIT « Collège Albert Camus 59239 Thumeries » — dans le Nord, à deux
     cents kilomètres — que la BAN donne pour SÛR à 0,945.
     CE TEST DÉFEND DEUX CHOSES À LA FOIS, et la seconde est celle que j'avais
     manquée : que l'annuaire soit interrogé MALGRÉ la confiance affichée, et
     qu'il le soit autour de la VUE et non de Thumeries. Un score élevé dit
     que la BAN est sûre de son lieu-dit ; il ne dit pas que c'est celui-là
     qu'on cherchait. */
  const { annuaire } = await decor(page, {
    adresses: [LIEUDIT_LOINTAIN], etablissements: [COLLEGE],
  });
  await ouvrir(page);
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.5722, 48.8103], zoom: 13 });
  });
  await barre(page).getByRole('combobox').fill('Collège Albert Camus');

  await expect(barre(page).locator('[role="option"] .libelle').first())
    .toHaveText('Collège Albert Camus', { timeout: 10_000 });
  /* L'ANCRE EST LA VUE, PAS THUMERIES : 48,81 et non 50,47. */
  expect(annuaire).toHaveLength(1);
  expect(annuaire[0]).toContain('48.81030');
  expect(annuaire[0], 'Thumeries ne doit pas ancrer la recherche').not.toContain('50.47');
});
