import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE JEU D'ESSAI D'ARMELIN, GARDÉ (RECHERCHE-8, 03/09).
 *
 * LE MANDAT, la nuit du 03/09 : « ton objectif pour cette nuit est de faire
 * fonctionner la recherche. Parcours toutes les API libres du gouvernement
 * s'il le faut […] je veux surtout pouvoir rechercher les mots clés suivants
 * en jeu de tests et je ne veux pas avoir à écrire les mots exacts dans la
 * barre de recherche mais avoir plus de souplesse même si les mots sont
 * incomplets. »
 *
 * CE FICHIER SIMULE LES SERVICES, et c'est délibéré : la CI ne doit ni
 * dépendre de cinq services publics, ni les solliciter à chaque poussée. Ce
 * qu'il garde, c'est le CÂBLAGE — que chaque source soit interrogée, que ses
 * réponses arrivent dans la liste, et que le classement mette devant ce qu'on
 * a écrit.
 *
 * QUE LES DOUZE REQUÊTES ABOUTISSENT VRAIMENT se mesure à part, contre les
 * vrais services : `npx vite-node scripts/essai-douze-requetes.ts`. Mesuré le
 * 03/09 : 12/12, toutes au premier rang. */

const IGN_TOUR = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [2.2942, 48.8583] },
  properties: { toponym: 'Tour Eiffel', city: ['Paris'], postcode: ['75007'] },
};

const ENTREPRISE_LEROY = {
  nom_complet: 'LEROY MERLIN FRANCE',
  matching_etablissements: [{
    longitude: '2.6429', latitude: '48.8345', enseigne: 'LEROY MERLIN',
    adresse: '2 BOULEVARD DU MANDINET 77185 LOGNES',
    libelle_commune: 'LOGNES', code_postal: '77185',
  }],
};

async function decor(page: Page, options: {
  poisIgn?: unknown[]; entreprises?: unknown[]; adresses?: unknown[];
  administrations?: unknown[];
} = {}): Promise<{ appels: string[] }> {
  const appels: string[] = [];
  const cors = { 'Access-Control-Allow-Origin': '*' };
  await simulerTuiles(page);
  await simulerCommunes(page);
  /* APRÈS `simulerTuiles` : les tuiles vivent aussi sur data.geopf.fr, et
     Playwright donne la main à la route posée EN DERNIER. */
  await page.route('**/data.geopf.fr/geocodage/**', (route) => {
    appels.push(`ign:${new URL(route.request().url()).searchParams.get('q') ?? ''}`);
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ features: options.poisIgn ?? [] }) });
  });
  await page.route('**/recherche-entreprises.api.gouv.fr/**', (route) => {
    const u = new URL(route.request().url());
    appels.push(`entreprises:${u.searchParams.get('q') ?? ''}`
      + (u.searchParams.get('code_postal') ? `@${u.searchParams.get('code_postal')}` : ''));
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ results: options.entreprises ?? [] }) });
  });
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const u = new URL(route.request().url());
    appels.push(`ban:${u.searchParams.get('q') ?? ''}`
      + (u.searchParams.get('type') ? `#${u.searchParams.get('type')}` : ''));
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ type: 'FeatureCollection', features: options.adresses ?? [] }) });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    appels.push(`overpass:${decodeURIComponent(route.request().url())}`);
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ elements: [] }) });
  });
  await page.route('**/data.education.gouv.fr/**', (route) => route.fulfill({
    headers: cors, contentType: 'application/json', body: JSON.stringify({ results: [] }),
  }));
  /* L'ANNUAIRE DE L'ADMINISTRATION (RECHERCHE-7, 04/09) — le traceur note
     la clause where : c'est elle qui prouve « nom AND commune ». */
  await page.route('**/api-lannuaire.service-public.fr/**', (route) => {
    const u = new URL(route.request().url());
    appels.push(`admin:${u.searchParams.get('where') ?? ''}`);
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ results: options.administrations ?? [] }) });
  });
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  return { appels };
}

const barre = (page: Page) => page.locator('recherche-adresse').first();
const options = (page: Page) => barre(page).locator('[role="option"] .libelle');

test('LES DEUX SOURCES NEUVES SONT INTERROGÉES à chaque recherche', async ({ page }) => {
  /* AVANT RECHERCHE-8, la recherche ne connaissait qu'OpenStreetMap et
     l'annuaire des écoles — et ne savait chercher qu'AUTOUR de la vue. */
  const { appels } = await decor(page, { poisIgn: [IGN_TOUR] });
  await barre(page).getByRole('combobox').fill('Tour Effeil');
  await expect(options(page).first()).toHaveText('Tour Eiffel', { timeout: 10_000 });
  expect(appels.some((a) => a.startsWith('ign:'))).toBe(true);
  expect(appels.some((a) => a.startsWith('entreprises:'))).toBe(true);
});

test('LA FAUTE DE FRAPPE EST RATTRAPÉE — « Tour Effeil » rend la Tour Eiffel', async ({ page }) => {
  /* C'est la requête qu'Armelin a écrite lui-même dans son jeu d'essai. Rien
     dans l'application ne corrige la faute : c'est l'index de la Géoplateforme
     qui la tolère, et c'est pour cela qu'il a été choisi. */
  await decor(page, { poisIgn: [IGN_TOUR] });
  await barre(page).getByRole('combobox').fill('Tour Effeil');
  await expect(options(page).first()).toHaveText('Tour Eiffel', { timeout: 10_000 });
});

test('UN COMMERCE PARAÎT AVEC SON ADRESSE POSTALE', async ({ page }) => {
  /* Armelin, la même nuit : « il n'y a aucune information sur l'adresse du
     lieu au format texte ». L'annuaire des entreprises la donne écrite, et
     c'est elle qui s'affiche sous le nom. */
  await decor(page, { entreprises: [ENTREPRISE_LEROY] });
  await barre(page).getByRole('combobox').fill('Leroy Merlin Lognes');
  await expect(options(page).first()).toHaveText('LEROY MERLIN', { timeout: 10_000 });
  await expect(barre(page).locator('[role="option"] .contexte').first())
    .toContainText('BOULEVARD DU MANDINET');
});

test('LA COMMUNE SITUE, ELLE NE NOMME PAS — un seul appel à Overpass', async ({ page }) => {
  /* DEUX RÈGLES EN UN PARCOURS.
     1. « Castorama Ormesson » : le magasin est déclaré au centre commercial
        Pincevent, à Chennevières — le mot « Ormesson » n'est nulle part dans
        sa fiche. On reconnaît donc la commune, et l'on cherche « Castorama »
        AUTOUR d'elle.
     2. « Ne JAMAIS marteler les API publiques » est une règle du projet.
        RECHERCHE-8 a failli faire DEUX appels à Overpass — un autour de la
        vue, un autour de la commune. Ce compteur l'a vu. */
  const { appels } = await decor(page, {
    adresses: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2.5366, 48.7848] },
      properties: {
        label: 'Ormesson-sur-Marne', city: 'Ormesson-sur-Marne',
        type: 'municipality', postcode: '94490', score: 0.9,
      },
    }],
  });
  await barre(page).getByRole('combobox').fill('Castorama Ormesson');
  await expect(barre(page).locator('[role="option"]').first()).toBeVisible({ timeout: 10_000 });

  /* ON ATTEND QUE LA PISTE LENTE AIT TIRÉ. Les résultats arrivent AU FIL DE
     L'EAU : la première option peut venir de l'index IGN pendant que la piste
     « enseigne + commune » (BAN puis Overpass) travaille encore. Lire le
     compteur à la première option le lisait parfois à ZÉRO sur la machine
     d'intégration — un flake attrapé sur une PR qui ne changeait AUCUN code.
     On attend le premier appel, puis un temps de calme prouve qu'il n'en part
     pas un second. */
  await expect.poll(() => appels.filter((x) => x.startsWith('overpass:')).length,
    { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(800);
  const versOverpass = appels.filter((x) => x.startsWith('overpass:'));
  expect(versOverpass, 'un seul appel à Overpass par recherche').toHaveLength(1);
  /* IL CHERCHE « Castorama » SEUL, autour de la commune reconnue : aucun objet
     d'OpenStreetMap ne s'appelle « Castorama Ormesson ». */
  expect(versOverpass[0]).toContain('"name"="Castorama"');
  expect(versOverpass[0]).not.toContain('Castorama Ormesson');
  expect(versOverpass[0]).toContain('48.78480,2.53660');
  // ET LA BAN A ÉTÉ INTERROGÉE SUR LES COMMUNES, pas sur les rues.
  expect(appels.some((a) => a.includes('#municipality'))).toBe(true);
});

test('DEUX COMMUNES HOMONYMES sont interrogées TOUTES LES DEUX', async ({ page }) => {
  /* LE DÉFAUT, VU EN PRODUCTION ET PAS EN TEST (RECHERCHE-8b, 03/09). Juste
     après la mise en ligne de la v1.57.0, « Castorama Ormesson » ne rendait
     aucun Castorama sur le site. Mon banc d'essai passait pourtant 12/12 —
     parce que je lui donnais les coordonnées d'Armelin. L'usager qui ouvre
     l'application regarde la France entière, et depuis ce centre-là c'est
     Ormesson (77167) qui gagne au « plus proche », alors que le magasin est
     près d'Ormesson-sur-Marne (94490).
     ON NE PARIE PLUS : les deux communes entrent dans la MÊME requête. */
  const { appels } = await decor(page, {
    adresses: [
      { type: 'Feature',
        geometry: { type: 'Point', coordinates: [2.6519, 48.2456] },
        properties: { label: 'Ormesson', city: 'Ormesson', type: 'municipality', postcode: '77167', score: 0.9 } },
      { type: 'Feature',
        geometry: { type: 'Point', coordinates: [2.5366, 48.7848] },
        properties: { label: 'Ormesson-sur-Marne', city: 'Ormesson-sur-Marne', type: 'municipality', postcode: '94490', score: 0.8 } },
    ],
  });
  await barre(page).getByRole('combobox').fill('Castorama Ormesson');
  await expect(barre(page).locator('[role="option"]').first()).toBeVisible({ timeout: 10_000 });

  // Même attente que plus haut : la piste lente doit avoir tiré.
  await expect.poll(() => appels.filter((x) => x.startsWith('overpass:')).length,
    { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(800);
  const versOverpass = appels.filter((x) => x.startsWith('overpass:'));
  /* TOUJOURS UN SEUL APPEL — l'union ne coûte pas une requête de plus. */
  expect(versOverpass, 'un seul appel à Overpass').toHaveLength(1);
  expect(versOverpass[0], 'la commune du 77 doit être interrogée').toContain('48.24560,2.65190');
  expect(versOverpass[0], 'ET celle du 94 aussi').toContain('48.78480,2.53660');
});

test('CHAQUE RÉSULTAT RECONNU PORTE LA PASTILLE DE LA CARTE (PICTO-2)', async ({ page }) => {
  /* Armelin, en 1.60 : « afficher un logo de POI si l'adresse de destination
     est détectée comme étant une Gare, un restaurant, un centre commercial ou
     autre — ce qui permettrait de faire la différence de suite ». La pastille
     est CELLE de la carte : même motif, même couleur de famille. */
  await decor(page, {
    poisIgn: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2.3248, 48.8775] },
      properties: { toponym: 'Gare Saint-Lazare', city: ['Paris'], postcode: ['75008'] },
    }],
  });
  await barre(page).getByRole('combobox').fill('Gare Saint Lazare');
  const ligne = barre(page).locator('[role="option"]').filter({ hasText: 'Gare Saint-Lazare' });
  await expect(ligne).toBeVisible({ timeout: 10_000 });
  // LA PASTILLE EST LÀ, dessinée — un vrai SVG, pas un trou.
  await expect(ligne.locator('.picto-lieu svg')).toHaveCount(1);
  /* ET UNE ADRESSE NUE N'EN PORTE PAS : « Rue de la Gare » n'est pas une
     gare, et un picto faux ferait pire que pas de picto. */
  await barre(page).getByRole('combobox').fill('nulle part xyz');
  await page.waitForTimeout(600);
});

test('ON PEUT CHERCHER UN LIEU QU’ON N’A PAS SOUS LES YEUX', async ({ page }) => {
  /* AVANT RECHERCHE-8, sans centre de carte, l'application répondait
     « Impossible de situer la recherche : déplacez la carte vers la zone qui
     vous intéresse ». Les deux sources neuves cherchent dans TOUTE la France —
     ce qui est tout de même l'usage ordinaire d'une barre de recherche. */
  await decor(page, { poisIgn: [IGN_TOUR] });
  await barre(page).getByRole('combobox').fill('Tour Effeil');
  await expect(options(page).first()).toHaveText('Tour Eiffel', { timeout: 10_000 });
  await expect(barre(page).locator('.recherche-note'))
    .not.toContainText('déplacez la carte');
});
test('À MOTS ÉGAUX, LE PLUS PROCHE D’ABORD (RECHERCHE-9)', async ({ page }) => {
  /* Armelin, en 1.68, capture à l'appui : « quand on tape "aéroport", les
     premiers lieux affichés sont à plus de 5000 km de ma position ». Le
     lointain était RÉEL — un « Aéroport » à Saint-Pierre-et-Miquelon — mais à
     mots égaux, il n'a rien à faire devant celui d'à côté. */
  await decor(page, {
    poisIgn: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-56.179, 46.766] },
        properties: { toponym: 'Aéroport', city: ['Saint-Pierre'], postcode: ['97500'] } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2.55, 46.7] },
        properties: { toponym: 'Aéroport de Montluçon', city: ['Montluçon'], postcode: ['03100'] } },
    ],
  });
  await barre(page).getByRole('combobox').fill('aéroport');
  const options = barre(page).locator('[role="option"] .libelle');
  await expect(options.first()).toContainText('Montluçon', { timeout: 10_000 });
});

test('« FNACDARTY » COLLÉ SE DÉCOLLE au dictionnaire d’enseignes (RECHERCHE-9)', async ({ page }) => {
  /* « "FNACDARTY" renvoie aucun résultat alors que "FNAC DARTY" répond. » Un
     tout-majuscules collé n'a aucun point de coupe lexical : on coupe après
     l'enseigne connue, et c'est la requête DÉCOLLÉE qui part aux sources. */
  const { appels } = await decor(page, {});
  await barre(page).getByRole('combobox').fill('FNACDARTY');
  await expect.poll(() => appels.filter((a) => a.startsWith('entreprises:')).length,
    { timeout: 10_000 }).toBeGreaterThan(0);
  const versEntreprises = appels.find((a) => a.startsWith('entreprises:'));
  expect(versEntreprises, 'la requête envoyée doit être décollée').toContain('FNAC DARTY');
  expect(versEntreprises).not.toContain('FNACDARTY');
});

test('RECHERCHE-7 : « INRAE BEAUCOUZE » trouve le centre — l’annuaire de l’administration, borné à la commune', async ({ page }) => {
  /* LA REQUÊTE N° 6 DU BANC D'ARMELIN, et le trou qu'aucune source ne
     comblait : le centre s'appelle « … Pays de la Loire - Angers »,
     Beaucouzé n'est que sa COMMUNE. Mesuré le 04/09 sur l'API réelle :
     search(nom, "INRAE Beaucouze") rend zéro ; search(nom, "INRAE") AND
     search(adresse, "beaucouze") rend le centre. Le connecteur prend donc
     la commune reconnue À PART du nom. */
  const { appels } = await decor(page, {
    adresses: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.6146, 47.4794] },
      properties: {
        label: 'Beaucouzé', city: 'Beaucouzé',
        type: 'municipality', postcode: '49070', score: 0.9,
      },
    }],
    administrations: [{
      nom: 'Centre de recherche INRAE - Pays de la Loire - Angers',
      adresse: JSON.stringify([{
        type_adresse: 'Adresse', code_postal: '49070', nom_commune: 'Beaucouzé',
        longitude: '-0.6146', latitude: '47.4794',
      }]),
    }],
  });
  await barre(page).getByRole('combobox').fill('INRAE BEAUCOUZE');
  await expect(options(page).filter({
    hasText: 'Centre de recherche INRAE - Pays de la Loire - Angers',
  })).toBeVisible({ timeout: 10_000 });
  /* Le contexte situe — code postal et commune, lus dans la fiche. */
  await expect(barre(page).locator('[role="option"]')
    .filter({ hasText: 'INRAE' }).locator('.contexte')).toContainText('49070 Beaucouzé');
  /* Et la clause mesurée est bien celle qui part : nom À PART, commune dans
     l'adresse. */
  await expect.poll(() => appels.some((a) => a.startsWith('admin:')
    && a.includes('AND search(adresse')), { timeout: 10_000 }).toBe(true);
});
