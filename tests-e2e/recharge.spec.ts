import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* ARRÊTS DE RECHARGE — le calcul est pur et testé à sec (tests/arrets.test.ts) ;
   ces parcours vérifient le BRANCHEMENT : que le profil véhicule est bien lu,
   que les bornes du trajet lui parviennent, et surtout que le refus s'affiche
   quand le trajet n'est pas faisable. */

const PARIS_LYON = '/#iti=2.35220,48.85660;4.83570,45.76400;car';

/** Une ligne de l'INDEX NATIONAL, telle que l'export agrégé la rend. */
interface LigneIndex {
  nom: string; lon: number; lat: number; p: number;
  reseau?: string; operateur?: string; pdc?: number; acces?: string;
}

/**
 * Simule l'index national des bornes rapides.
 *
 * POURQUOI CE CHANGEMENT DE FIXTURE. Le planificateur n'interroge plus le
 * portail par emprise — six requêtes plafonnées à cent résultats, sur
 * lesquelles il travaillait sans savoir qu'il voyait un échantillon. Il lit
 * désormais l'export agrégé PAR STATION, une fois, et découpe en mémoire.
 * La forme de la réponse change donc : un TABLEAU nu, pas un objet
 * `{ total_count, results }`.
 *
 * L'AUTRE ROUTE ODS RESTE SERVIE : le cartouche de détail interroge, lui, les
 * enregistrements. Les confondre rendrait un tableau là où le cartouche attend
 * un objet, et le détail paraîtrait introuvable sans qu'on sache pourquoi.
 */
async function simulerIndexBornes(page: Page, bornes: LigneIndex[]): Promise<void> {
  await page.route('**/public.opendatasoft.com/**', (route) => {
    const url = route.request().url();
    if (url.includes('/exports/json')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(bornes.map((b) => ({
          id_station_itinerance: `FR${b.nom.replace(/\W/g, '').slice(0, 8).toUpperCase()}`,
          nom_station: b.nom,
          nom_enseigne: b.reseau ?? 'Réseau d’essai',
          /* L'OPÉRATEUR PORTE LE FILTRE : l'enseigne écrit souvent le nom du
             site, et le regroupement s'y perdait. */
          nom_operateur: b.operateur ?? b.reseau ?? 'Réseau d’essai',
          condition_acces: b.acces ?? 'Accès libre',
          prise_type_combo_ccs: '1',
          prise_type_chademo: '0',
          prise_type_2: '0',
          p: b.p,
          pdc: b.pdc ?? 4,
          lon: b.lon,
          lat: b.lat,
        }))),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ total_count: 0, results: [] }),
    });
  });
}

/** Le trajet Paris-Lyon simulé passe par là : une borne à mi-parcours. */
const BEAUNE: LigneIndex = { nom: 'Aire de Beaune', lon: 3.6, lat: 47.3, p: 150, pdc: 8 };

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  /* LE TRACÉ ET LA DISTANCE DOIVENT S'ACCORDER. Une première version annonçait
     465 km — la vraie route Paris-Lyon — sur un tracé en LIGNE DROITE de
     390 km. Les avancements des bornes, mesurés sur le tracé, ne parlaient
     alors pas de la même échelle que la distance donnée au planificateur : une
     borne à mi-parcours semblait à 195 km d'un trajet qu'on croyait long de
     465. Le plan échouait pour une raison qui n'existait que dans la fixture. */
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 390_000, duration: 13_000,
    }),
  }));
});

/* LE PROFIL SE SAISIT PAR L'INTERFACE, comme un usager le ferait.
 *
 * Deux versions antérieures poussaient directement dans IndexedDB. La
 * première, par `addInitScript`, écrivait de façon asynchrone et
 * l'application lisait parfois avant. La seconde chargeait la page d'abord —
 * mais l'application y persiste un profil VIDE au démarrage, et les deux
 * écritures se couraient après. Les deux produisaient le même faux négatif :
 * « Renseignez d'abord votre véhicule », une fois sur trois, accusant le code
 * au lieu du test.
 *
 * Passer par le formulaire supprime la course à sa racine, et éprouve au
 * passage le chemin réel. */
async function saisirVehicule(page: Page): Promise<void> {
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Véhicule' }).click();
  await page.getByLabel('Batterie', { exact: true }).fill('87.7');
  await page.getByLabel('Santé (SOCE)').fill('94');
  await page.getByLabel('Charge (SOC)').fill('100');
  await page.getByLabel('Charge max').fill('150');
  await page.getByLabel('Sur autoroute').fill('280');
  // Le bilan confirme que le profil est pris en compte AVANT de continuer.
  await expect(page.locator('.veh-bilan-lignes')).toContainText('Sur autoroute');
  /* ET ON ROUVRE LE PLANIFICATEUR. Ouvrir le volet « Véhicule » a refermé
     celui de l'itinéraire — l'exclusion mutuelle du rail fonctionne comme
     prévu, et la section des arrêts vit DEDANS. */
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Itinéraire' }).click();
  await expect(page.locator('.iti-recharge summary')).toBeVisible();
}

async function ouvrirRecharge(page: Page, avecVehicule = true): Promise<void> {
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  /* ON ATTEND QUE L'ITINÉRAIRE SOIT CALCULÉ avant d'ouvrir la section. Sans
     cette attente, le clic pouvait précéder le calcul : la remise à zéro des
     sections refermait alors ce que le clic venait d'ouvrir, et le parcours
     rougissait sur un corps vide, une fois sur trois. Une précondition qu'on
     n'attend pas est une course qu'on parie. */
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  if (avecVehicule) await saisirVehicule(page);
  await page.locator('.iti-recharge summary').click();
}

test('sans véhicule renseigné, la section le DIT au lieu d’inventer', async ({ page }) => {
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
  }));
  await ouvrirRecharge(page, false);
  await expect(page.locator('.iti-recharge-corps'))
    .toContainText('Renseignez d’abord votre véhicule');
});

test('un trajet sans borne à portée est REFUSÉ, avec le kilomètre exact', async ({ page }) => {
  /* Une seule borne, et hors du trajet : la VF8 fait 280 km sur autoroute, le
     trajet en fait 390. Un index VIDE ne conviendrait pas — le module refuse
     un index vide, à juste titre : mieux vaut l'échec que la carte muette. */
  await simulerIndexBornes(page, [{ nom: 'Loin de tout', lon: -1.5, lat: 43.5, p: 150 }]);
  await ouvrirRecharge(page);

  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aucune borne utilisable', { timeout: 15_000 });
  // Le refus SITUE le point de rupture : « avant 251 km » et non « impossible ».
  await expect(corps, 'un refus sans kilomètre ne sert à personne').toContainText(/\d+\s*km/);
});

test('avec une borne bien placée, le plan sort avec ses chiffres', async ({ page }) => {
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);

  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de Beaune', { timeout: 15_000 });
  // Le résumé porte les trois chiffres qui décident : arrêts, minutes, arrivée.
  await expect(corps).toContainText(/1 arrêt/);
  await expect(corps).toContainText(/min de charge/);
  await expect(corps).toContainText(/arrivée à \d+ %/);
  // Et le détail dit à quel SOC on arrive et repart.
  await expect(corps).toContainText(/arrivée \d+ % → départ \d+ %/);
});

test('la réserve du modèle est écrite sous le plan, jamais sous-entendue', async ({ page }) => {
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de Beaune', { timeout: 15_000 });
  /* CE QUE LE MODÈLE NE SAIT PAS DOIT ÊTRE ÉCRIT SOUS LE PLAN. Un plan qui
     tait ses hypothèses se fait prendre pour une prévision. */
  await expect(corps).toContainText('ni le relief, ni le vent');
  await expect(corps, 'le seuil de l’index doit être annoncé').toContainText('50 kW et plus');
});

test('AUCUN appel tant que la section est repliée — les quotas sont un bien commun', async ({ page }) => {
  let appels = 0;
  await page.route('**/public.opendatasoft.com/**', (route) => {
    appels += 1;
    return route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ total_count: 0, results: [] }) });
  });
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 10_000 });
  await page.waitForTimeout(800);
  expect(appels, 'des bornes ont été cherchées sans que personne ne le demande').toBe(0);
});

test('les arrêts sont POSÉS SUR LA CARTE, et le clic y vole', async ({ page }) => {
  /* Une liste d'arrêts qu'on ne peut pas situer oblige à chercher des yeux ce
     que l'application sait déjà. Le marqueur répond « où », le clic « montre-
     moi ». */
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);
  await expect(page.locator('.iti-recharge-corps')).toContainText('Aire de Beaune',
    { timeout: 15_000 });

  const bouton = page.getByRole('button', { name: 'Détail de Aire de Beaune' }).first();
  await expect(bouton).toBeVisible();

  const avant = await page.evaluate(() => {
    const c = (window as unknown as { __carte: { getZoom(): number } }).__carte;
    return c.getZoom();
  });
  await bouton.click();
  await page.waitForTimeout(1200);
  const apres = await page.evaluate(() => {
    const c = (window as unknown as {
      __carte: { getZoom(): number; getCenter(): { lng: number; lat: number } };
    }).__carte;
    return { zoom: c.getZoom(), centre: c.getCenter() };
  });
  expect(apres.zoom, 'le clic n’a pas rapproché la carte').toBeGreaterThan(avant);
  expect(Math.abs(apres.centre.lng - 3.6), 'la carte n’a pas volé vers la borne')
    .toBeLessThan(0.5);
});

test('les commodités sont À LA DEMANDE, et un seul arrêt à la fois', async ({ page }) => {
  /* Overpass est un service bénévole : on ne l'interroge pas pour les quatre
     arrêts d'un coup au cas où l'usager regarderait. Ce parcours compte les
     appels RÉELLEMENT émis. */
  let appels = 0;
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    appels += 1;
    /* L'EN-TÊTE CORS EST OBLIGATOIRE sur une réponse simulée vers une AUTRE
       origine : sans lui, le navigateur bloque avant que le code voie quoi que
       ce soit, et l'erreur remonte comme une panne réseau générique. */
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json', body: JSON.stringify({ elements: [
      { type: 'node', id: 1, lat: 47.3, lon: 3.6,
        tags: { amenity: 'fuel', brand: 'TotalEnergies' } },
      { type: 'node', id: 2, lat: 47.301, lon: 3.601, tags: { amenity: 'toilets' } },
      { type: 'way', id: 3, center: { lat: 47.302, lon: 3.602 },
        tags: { amenity: 'restaurant', name: 'L’Arche' } },
    ] }) });
  });
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);
  await expect(page.locator('.iti-recharge-corps')).toContainText('Aire de Beaune',
    { timeout: 15_000 });

  expect(appels, 'Overpass interrogé sans que personne ne le demande').toBe(0);

  await page.getByRole('button', { name: 'Voir les commodités à Aire de Beaune' }).click();
  const sortie = page.locator('.recharge-commodites-corps');
  await expect(sortie).toContainText('Station-service (TotalEnergies)');
  await expect(sortie).toContainText('Toilettes');
  await expect(sortie).toContainText('L’Arche');
  // L'attribution OSM est une obligation de la licence ODbL, pas un ornement.
  await expect(sortie).toContainText('OpenStreetMap');
  expect(appels, 'un arrêt demandé, un appel').toBe(1);
});

test('Overpass en panne parle français et reste réessayable', async ({ page }) => {
  // En surcharge, Overpass rend une page HTML : la lire en JSON lèverait une
  // exception illisible pour l'usager.
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    status: 200, contentType: 'text/html',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: '<html><body>Dispatcher_Client::request_read_and_idx::timeout</body></html>',
  }));
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);
  await expect(page.locator('.iti-recharge-corps')).toContainText('Aire de Beaune',
    { timeout: 15_000 });

  const bouton = page.getByRole('button', { name: 'Voir les commodités à Aire de Beaune' });
  await bouton.click();
  await expect(page.locator('.recharge-commodites-corps')).toContainText('saturé');
  await expect(bouton, 'un service qui tombe souvent doit rester réessayable').toBeEnabled();
});

test('la marge d’arrivée est RÉGLABLE, et elle change le plan', async ({ page }) => {
  /* « Arriver avec 30 % » n'est pas le même trajet qu'« arriver avec 5 % » :
     la marge décide du nombre d'arrêts et du temps passé à charger. La laisser
     codée en dur revenait à imposer une prudence à tout le monde. */
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('arrivée à', { timeout: 15_000 });

  const lireArrivee = async (): Promise<number> => {
    const t = await corps.locator('.recharge-resume').innerText();
    return Number(/arrivée à (\d+)/.exec(t)?.[1] ?? -1);
  };

  await page.getByLabel('Charge voulue à l’arrivée').selectOption('5');
  await expect.poll(lireArrivee).toBeGreaterThanOrEqual(5);
  const petite = await lireArrivee();

  await page.getByLabel('Charge voulue à l’arrivée').selectOption('30');
  await expect.poll(lireArrivee, { message: 'la marge n’a pas changé le plan' })
    .toBeGreaterThan(petite);
});

test('la réserve en route est réglable elle aussi', async ({ page }) => {
  // Aucune borne SUR LE TRAJET : une réserve plus haute rapproche la rupture.
  await simulerIndexBornes(page, [{ nom: 'Loin de tout', lon: -1.5, lat: 43.5, p: 150 }]);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aucune borne utilisable', { timeout: 15_000 });

  const lireRupture = async (): Promise<number> => {
    const t = await corps.innerText();
    return Number(/avant (\d+) km/.exec(t)?.[1] ?? -1);
  };
  const basse = await lireRupture();
  expect(basse).toBeGreaterThan(0);

  await page.getByLabel('Réserve minimale en route').selectOption('20');
  await expect.poll(lireRupture,
    { message: 'une réserve plus haute doit rapprocher le point de rupture' })
    .toBeLessThan(basse);
});


/* LA MAIN SUR LE PLAN — « des + et des - pour choisir moi-même les arrêts »,
   et « filtrer par réseaux préférés » (Armelin, 25/08/2026). Un planificateur
   qui décide seul est un planificateur qu'on subit. */

/** Trois bornes échelonnées sur le Paris-Lyon simulé (390 km en ligne droite). */
const TROIS: LigneIndex[] = [
  { nom: 'Aire du Tiers', lon: 3.2, lat: 47.8, p: 150, reseau: 'Ionity' },
  { nom: 'Aire de Beaune', lon: 3.6, lat: 47.3, p: 150, reseau: 'Ionity' },
  { nom: 'Aire des Deux Tiers', lon: 4.2, lat: 46.6, p: 50, reseau: 'Tesla' },
];

test('la durée dit si la charge est comprise — et le détail dit combien', async ({ page }) => {
  /* LE DÉFAUT : « 4 h 25 » était le temps de CONDUITE seul, sans le dire. Sur
     un trajet électrique long, l'écart se compte en heures — une erreur de
     planification qu'on découvre en route. */
  await simulerIndexBornes(page, [BEAUNE]);
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  const resume = page.locator('.iti-resultat');
  await expect(resume).toContainText('390 km', { timeout: 15_000 });
  // Tant qu'aucun plan n'existe, on le DIT plutôt que de laisser un nombre nu.
  await expect(resume, 'une durée sans mention de la recharge se lit comme un total')
    .toContainText('hors recharge');

  await saisirVehicule(page);
  await page.locator('.iti-recharge summary').click();
  await expect(page.locator('.iti-recharge-corps')).toContainText('Aire de Beaune',
    { timeout: 15_000 });

  // Le plan calculé, le résumé porte le TOTAL et sa décomposition.
  await expect(resume).toContainText('au total');
  await expect(resume).toContainText('de route +');
  await expect(resume).toContainText('de charge');
  // Et l'arrêt dit son temps de charge en toutes lettres, pas en « min » nu.
  await expect(page.locator('.recharge-liste')).toContainText('min de charge');
});

test('le « − » écarte un arrêt, et le plan se refait SANS rien recharger', async ({ page }) => {
  await simulerIndexBornes(page, TROIS);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de Beaune', { timeout: 15_000 });

  await page.getByRole('button', { name: 'Écarter Aire de Beaune du plan' }).first().click();

  /* LE PLAN CHANGE : Beaune écartée, le modèle doit se rabattre ailleurs. On
     n'affirme pas QUELLE borne il prend — c'est son travail — mais qu'il ne
     prend plus celle qu'on a refusée. */
  await expect(corps.locator('.recharge-liste'))
    .not.toContainText('Aire de Beaune', { timeout: 10_000 });
  await expect(corps.locator('.recharge-liste'), 'le plan doit rester faisable')
    .toContainText('km');
});

test('le « + » impose un arrêt que le modèle n’aurait pas choisi', async ({ page }) => {
  await simulerIndexBornes(page, TROIS);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de', { timeout: 15_000 });

  // Le plan de départ ne retient PAS la borne lente des deux tiers.
  const listeRetenue = corps.locator('.recharge-liste');
  await expect(listeRetenue).not.toContainText('Aire des Deux Tiers');

  // On déplie la liste complète et on l'impose.
  await corps.locator('.recharge-toutes > summary').click();
  await expect(corps.locator('.recharge-toutes-liste li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Imposer un arrêt à Aire des Deux Tiers' }).click();

  await expect(listeRetenue, 'l’arrêt imposé n’est pas entré dans le plan')
    .toContainText('Aire des Deux Tiers', { timeout: 10_000 });

  /* ET LA LISTE RESTE DÉPLIÉE. Le plan est reconstruit à chaque consigne ;
     sans mémoire de l'état, elle se refermait sous le doigt et il fallait la
     rouvrir pour choisir l'arrêt suivant. */
  await expect(corps.locator('.recharge-toutes'),
    'la liste s’est refermée sous le doigt').toHaveAttribute('open', '');
});

test('les réseaux préférés se cochent, et ils bornent le plan', async ({ page }) => {
  await simulerIndexBornes(page, TROIS);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de', { timeout: 15_000 });

  await corps.locator('.recharge-reseaux > summary').click();
  const cases_ = corps.locator('.recharge-reseaux-corps input[type="checkbox"]');
  await expect(cases_).toHaveCount(2);

  /* NE GARDER QUE TESLA : les deux bornes Ionity disparaissent du calcul, et
     le trajet devient infaisable — ce que le planificateur doit DIRE, avec le
     kilomètre, plutôt que de proposer un plan bancal. */
  await corps.locator('.recharge-reseaux-corps label').filter({ hasText: 'Tesla' })
    .locator('input').check();
  await expect(corps).toContainText('Aucune borne utilisable', { timeout: 10_000 });
  await expect(corps).toContainText(/\d+\s*km/);

  /* ET ON PEUT REVENIR EN ARRIÈRE. Un refus qui efface les réglages qui l'ont
     causé enferme l'usager : il voit le mur, et plus rien pour le contourner. */
  const tesla = corps.locator('.recharge-reseaux-corps label').filter({ hasText: 'Tesla' })
    .locator('input');
  await expect(tesla, 'les réglages ont disparu avec le plan').toBeChecked();
  await tesla.uncheck();
  await expect(corps.locator('.recharge-liste'))
    .toContainText('Aire de', { timeout: 10_000 });
});

test('toutes les bornes du trajet sont listées, retenues ou non', async ({ page }) => {
  /* « Le planificateur devrait afficher toutes les bornes présentes sur le
     trajet » : le plan répond à « où m'arrêter », la liste à « qu'y a-t-il ». */
  await simulerIndexBornes(page, TROIS);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de', { timeout: 15_000 });

  await corps.locator('.recharge-toutes > summary').click();
  await expect(corps.locator('.recharge-toutes > summary'))
    .toHaveText('Toutes les bornes du trajet (3)');
  const lignes = corps.locator('.recharge-toutes-liste li');
  await expect(lignes).toHaveCount(3);
  // Chacune porte son kilométrage, sa puissance et son réseau.
  await expect(lignes.first()).toContainText('km');
  await expect(lignes.first()).toContainText('kW');
  await expect(corps.locator('.recharge-toutes-liste')).toContainText('Ionity');
  /* ET L'ÉTAT SE LIT EN TOUTES LETTRES, pas seulement à la couleur du cadre
     (WCAG 1.4.1) : « retenue par le plan » est écrit. */
  await expect(corps.locator('.recharge-toutes-liste li.est-retenue'))
    .toContainText('retenue par le plan');
});


test('les réseaux du trajet se groupent par EXPLOITANT, pas par site', async ({ page }) => {
  /* Armelin, le 26/08/2026, capture à l'appui : la liste des réseaux préférés
     affichait « Allego - Burger King Chelles Sud (1) », « Allego - Burger King
     Massy Opéra (1) », « Allego - Burger King Orléans Ingré (1) »… deux cent
     quatorze entrées d'une station chacune sur un seul trajet.
     La cause est celle que la carte avait déjà connue : certains producteurs
     écrivent le NOM DU SITE dans l'enseigne. J'avais corrigé le panneau des
     couches et oublié celui-ci — deux listes, un seul défaut. */
  const allego: LigneIndex[] = [
    /* LES TROIS SONT POSÉES SUR LE TRACÉ simulé Paris-Lyon : une borne à
       quarante kilomètres du trajet en serait écartée par le rayon de
       recherche, et le parcours mesurerait alors le vide. */
    { nom: 'Chelles Sud', lon: 2.725, lat: 48.393, p: 150,
      reseau: 'Allego - Burger King Chelles Sud', operateur: 'Allego' },
    { nom: 'Massy Opéra', lon: 3.098, lat: 47.929, p: 150,
      reseau: 'Allego - Burger King Massy Opéra', operateur: 'Allego' },
    { nom: 'Orléans Ingré', lon: 3.470, lat: 47.464, p: 150,
      reseau: 'Allego - Burger King Orléans Ingré', operateur: 'Allego' },
    { ...BEAUNE, reseau: 'Ionity', operateur: 'IONITY GmbH' },
  ];
  await simulerIndexBornes(page, allego);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de', { timeout: 15_000 });

  await corps.locator('.recharge-reseaux > summary').click();
  const cases_ = corps.locator('.recharge-reseaux-corps input[type="checkbox"]');
  /* DEUX EXPLOITANTS, pas quatre sites. Le compte suit : Allego vaut pour ses
     trois stations d'un bloc. */
  await expect(cases_).toHaveCount(2);
  await expect(corps.locator('.recharge-reseaux-corps')).toContainText('Allego (3)');
  await expect(corps.locator('.recharge-reseaux-corps'))
    .not.toContainText('Burger King');
});
