import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* FILTRES DES BORNES — ce qui compte n'est pas ce que l'interface affiche,
   c'est CE QUI PART DANS LA REQUÊTE. Le portail plafonne à 100
   enregistrements : un filtre appliqué localement trierait un ensemble déjà
   tronqué et montrerait trois bornes CCS là où la zone en compte cinquante.
   Ces parcours lisent donc l'URL réellement émise. */

const IRVE = '**/public.opendatasoft.com/**';

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

/** Capture les URL IRVE émises, et répond une collection vide pour ne pas
 *  dépendre du portail — ni le marteler depuis la CI. */
async function espionnerIrve(page: import('@playwright/test').Page): Promise<string[]> {
  const vues: string[] = [];
  await page.route(IRVE, (route) => {
    /* L'ESPION LAISSE PASSER LES FACETTES. Playwright donne la priorité au
       calque enregistré EN DERNIER : ce motif large recouvrait sans le vouloir
       la route des facettes de réseaux, qui recevait alors une réponse
       d'enregistrements et rendait une liste vide. Le laisser dépendre de
       l'ordre d'écriture des tests aurait été une bombe à retardement. */
    const url = route.request().url();
    if (url.includes('/facets')) return route.fallback();
    /* ET IL LAISSE PASSER L'EXPORT DE L'INDEX NATIONAL, pour la même raison :
       lui répondre une collection d'enregistrements rendrait un index vide,
       donc une liste de réseaux vide, sans qu'aucune assertion ne dise
       pourquoi. */
    if (url.includes('/exports/json')) return route.fallback();
    vues.push(decodeURIComponent(url));
    return route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ total_count: 0, results: [] }) });
  });
  return vues;
}

async function ouvrirBornes(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  /* LES POI NE SE CHARGENT QU'AU ZOOM 12 — frugalité assumée depuis la PR #9.
     Sans ce saut, aucune requête ne part et le parcours mesurerait le vide. */
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3522, 48.8566], zoom: 13 });
  });
  await ouvrirVolet(page, '.poi');
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
}

test('les filtres ne paraissent qu’une fois la couche des bornes active', async ({ page }) => {
  await espionnerIrve(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirVolet(page, '.poi');

  const filtres = page.locator('.poi-filtres');
  await expect(filtres, 'des réglages sans objet encombrent').toBeHidden();

  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
  await expect(filtres).toBeVisible();
  await expect(page.getByLabel('Puissance minimale des bornes')).toBeVisible();
  for (const nom of ['CCS Combo', 'Type 2', 'CHAdeMO', 'Prise domestique']) {
    await expect(page.getByRole('checkbox', { name: nom })).toBeVisible();
  }
});

test('la puissance choisie PART DANS LA REQUÊTE, elle ne trie pas l’acquis', async ({ page }) => {
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);

  await page.getByLabel('Puissance minimale des bornes').selectOption('150');
  await expect.poll(() => vues.some((u) => u.includes('puissance_nominale >= 150')),
    { message: 'la puissance n’est pas partie au service' }).toBe(true);
});

test('les connecteurs partent en OU — un véhicule accepte l’un OU l’autre', async ({ page }) => {
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);

  await page.getByRole('checkbox', { name: 'CCS Combo' }).check();
  await page.getByRole('checkbox', { name: 'CHAdeMO' }).check();

  await expect.poll(() => vues.some((u) =>
    u.includes('prise_type_combo_ccs = "1"') && u.includes('prise_type_chademo = "1"')
    && u.includes('OR')), { message: 'les connecteurs ne sont pas partis en OU' }).toBe(true);
});

test('le nom de station tapé PART DANS LA REQUÊTE, en suggest()', async ({ page }) => {
  /* « Distinguer les IZIVIA FAST sur des McDonald's de celles de la rue »
     (Armelin, 27/08/2026). Au-delà du zoom 12, le portail plafonne à 100
     enregistrements : un tri local mentirait, le filtre part donc au
     service — suggest() est sa recherche plein-texte, vérifiée par appel
     réel (36 lignes pour « Donald », zéro pour un like). */
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);

  await page.getByLabel('Chercher un réseau ou un nom de station').fill('Mc Donald');
  await expect.poll(() => vues.some((u) => u.includes('suggest(nom_station,"Mc Donald")')),
    { message: 'le nom n’est pas parti au service' }).toBe(true);
});

test('sans filtre, aucune clause parasite ne part', async ({ page }) => {
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);

  await expect.poll(() => vues.length).toBeGreaterThan(0);
  const premiere = vues.find((u) => u.includes('mobilityref-france-irve'));
  expect(premiere, 'aucune requête IRVE émise').toBeTruthy();
  expect(premiere).toContain('in_bbox(point_geo');
  expect(premiere, 'une clause vide fausse la requête').not.toContain(' AND ');
});

/* LES ÉCLAIRS DE PUISSANCE — un à trois selon le palier. Les icônes sont
   DESSINÉES au démarrage sur un canevas : aucun binaire au dépôt, mais aussi
   aucune garantie qu'elles existent si le contexte 2D échoue. On vérifie donc
   qu'elles sont bien enregistrées, et que chaque borne porte le bon palier. */
test('les quatre pastilles de puissance sont dessinées et posées', async ({ page }) => {
  await espionnerIrve(page);
  await ouvrirBornes(page);

  const images = await page.evaluate(() => {
    const c = (window as unknown as { __carte: { hasImage(n: string): boolean } }).__carte;
    return ['borne-1', 'borne-2', 'borne-3', 'borne-inconnue'].map((n) => c.hasImage(n));
  });
  expect(images, 'une pastille manquante laisserait des bornes invisibles').toEqual(
    [true, true, true, true]);
});

test('chaque borne porte le palier de SA puissance, frontières comprises', async ({ page }) => {
  // Fixture au format réel, calibrée sur les BORNES des intervalles : 50 kW
  // est « lent », 150 « rapide », 151 « très rapide ». C'est là que se logent
  // les erreurs d'un cran, invisibles à l'œil sur une carte.
  await page.route(IRVE, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ total_count: 4, results: [
      { point_geo: { lon: 2.35, lat: 48.856 }, nom_station: 'Lente', puissance_nominale: 50 },
      { point_geo: { lon: 2.352, lat: 48.857 }, nom_station: 'Rapide', puissance_nominale: 150 },
      { point_geo: { lon: 2.354, lat: 48.858 }, nom_station: 'Très rapide', puissance_nominale: 151 },
      { point_geo: { lon: 2.356, lat: 48.859 }, nom_station: 'Inconnue' },
    ] }),
  }));
  await ouvrirBornes(page);

  /* ON ATTEND QUE LA SOURCE PORTE LES QUATRE BORNES avant de juger. La couche
     se remplit de façon asynchrone : lire `getData()` trop tôt rendait parfois
     un jeu partiel, et le parcours rougissait pour une raison qui n'avait rien
     à voir avec les paliers. Une CI plus lente le révélait, pas la machine de
     développement. */
  const lire = async (): Promise<unknown[][]> => page.evaluate(async () => {
    const c = (window as unknown as {
      __carte: { getSource(id: string): { getData(): unknown } | undefined };
    }).__carte;
    const d = await c.getSource('poi-bornes')?.getData() as GeoJSON.FeatureCollection | undefined;
    return (d?.features ?? []).map((f) => [f.properties?.['nom'], f.properties?.['icone']]);
  });
  await expect.poll(async () => (await lire()).length,
    { message: 'la couche n’a jamais porté les quatre bornes' }).toBe(4);
  const paliers = await lire();

  expect(paliers).toEqual([
    ['Lente', 'borne-1'],
    ['Rapide', 'borne-2'],
    ['Très rapide', 'borne-3'],
    ['Inconnue', 'borne-inconnue'],
  ]);
});

/* LE FILTRE PAR RÉSEAU — DEUXIÈME ÂGE.
 *
 * CE QUI A CHANGÉ, ET POURQUOI. La liste venait de la FACETTE du portail,
 * bornée à l'emprise : elle ne proposait donc que ce que la vue montrait déjà,
 * et son contenu changeait à chaque déplacement de carte. Armelin, le
 * 25/08/2026 : « le filtre réseau devrait fonctionner quel que soit le niveau
 * de zoom ». Elle se calcule désormais sur l'INDEX NATIONAL, en mémoire, sans
 * le moindre appel — et le compte affiché est celui de la France entière.
 *
 * Ces parcours vérifient les deux propriétés qui en découlent : la liste est
 * nationale, et elle ne bouge pas quand la carte bouge. */

/** L'export agrégé simulé — la source de la liste des réseaux. */
async function simulerIndexNational(
  page: import('@playwright/test').Page,
  stations: { nom: string; reseau: string; lon: number; lat: number; p?: number }[],
): Promise<number> {
  let appels = 0;
  await page.route('**/mobilityref-france-irve-220/exports/json**', (route) => {
    appels += 1;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(stations.map((st, i) => ({
        id_station_itinerance: `FRTEST${i}`,
        nom_station: st.nom,
        nom_enseigne: st.reseau,
        nom_operateur: st.reseau,
        condition_acces: 'Accès libre',
        prise_type_combo_ccs: '1',
        prise_type_chademo: '0',
        prise_type_2: '0',
        p: st.p ?? 150,
        pdc: 4,
        lon: st.lon,
        lat: st.lat,
      }))),
    });
  });
  // Un compteur par référence, pour que l'appelant lise la valeur à jour.
  return appels;
}

const RESEAUX_ESSAI = [
  { nom: 'Bump 1', reseau: 'Bump', lon: 2.35, lat: 48.85 },
  { nom: 'Bump 2', reseau: 'Bump', lon: 2.36, lat: 48.86 },
  { nom: 'Belib 1', reseau: "Belib'", lon: 2.34, lat: 48.84 },
  { nom: 'Belib 2', reseau: "Belib'", lon: 2.33, lat: 48.83 },
  { nom: 'Belib 3', reseau: "Belib'", lon: 2.32, lat: 48.82 },
  // Loin de Paris : elle DOIT quand même paraître dans la liste.
  { nom: 'Alpine', reseau: 'ACCOR Hotels', lon: 6.9, lat: 43.6 },
];

test('les réseaux proposés sont NATIONAUX, du plus fourni au moins', async ({ page }) => {
  await simulerIndexNational(page, RESEAUX_ESSAI);
  await espionnerIrve(page);
  await ouvrirBornes(page);

  const cases_ = page.locator('.poi-reseau');
  await expect(cases_).toHaveCount(3, { timeout: 15_000 });
  await expect(page.locator('.poi-reseaux')).toContainText("Belib' (3)");
  // Du plus fourni au moins fourni : l'usager cherche d'abord les grands.
  const valeurs = await cases_.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(valeurs).toEqual(["Belib'", 'Bump', 'ACCOR Hotels']);

  /* LA PREUVE DU CHANGEMENT : « ACCOR Hotels » est à Antibes, la carte est sur
     Paris. L'ancienne facette, bornée à l'emprise, ne l'aurait jamais proposée. */
  await expect(page.locator('.poi-reseaux'),
    'un réseau hors de la vue doit rester proposable').toContainText('ACCOR Hotels');
});

test('la liste des réseaux ne bouge PAS quand la carte bouge', async ({ page }) => {
  await simulerIndexNational(page, RESEAUX_ESSAI);
  await espionnerIrve(page);
  await ouvrirBornes(page);
  await expect(page.locator('.poi-reseau')).toHaveCount(3, { timeout: 15_000 });

  // Sept cents kilomètres plus loin : la liste doit être la même.
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [5.37, 43.29], zoom: 13 });
  });
  await page.waitForTimeout(1200);
  await expect(page.locator('.poi-reseau'),
    'la liste s’est remise à suivre la vue').toHaveCount(3);
  await expect(page.locator('.poi-reseaux')).toContainText("Belib' (3)");
});

test('cocher un réseau le fait partir DANS LA REQUÊTE', async ({ page }) => {
  /* AU ZOOM 12 ET AU-DELÀ, les bornes viennent toujours du portail par
     emprise : le filtre doit donc partir AU SERVICE, et non trier localement
     un ensemble déjà tronqué à cent enregistrements. */
  await simulerIndexNational(page, [
    { nom: 'Belib 1', reseau: "Belib'", lon: 2.34, lat: 48.84 },
  ]);
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);
  await expect(page.locator('.poi-reseau')).toHaveCount(1, { timeout: 15_000 });

  await page.locator('.poi-reseau').check();
  /* SUR `nom_operateur` DEPUIS LE 26/08. La liste groupe par exploitant — voir
     la mesure dans lib/index-bornes.ts — et la clause envoyée au portail doit
     interroger LE MÊME CHAMP : les deux se répondent, ou le filtre ment. */
  await expect.poll(() => vues.some((u) => u.includes('nom_operateur =') && u.includes('Belib')),
    { message: 'le réseau n’est pas parti au service' }).toBe(true);
});

test('un index en panne n’emporte PAS les bornes', async ({ page }) => {
  /* L'index n'est qu'un confort de filtrage tant qu'on est au-dessus du zoom
     12 : son échec ne doit pas priver l'usager de la couche elle-même. C'est
     le même contrat que la facette d'autrefois. */
  await page.route('**/mobilityref-france-irve-220/exports/json**',
    (route) => route.fulfill({ status: 500, body: 'panne' }));
  await espionnerIrve(page);
  await ouvrirBornes(page);

  // La couche est demandée, ses réglages sont là, et rien n'a explosé.
  await expect(page.locator('.poi-filtres')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.poi-reseau')).toHaveCount(0);
  await expect(page.locator('.poi-etat')).toContainText('Bornes électriques', { timeout: 15_000 });
});
