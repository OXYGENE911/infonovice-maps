import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { allerA, retour } from './planificateur';
import { ouvrirVolet } from './volets';

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
/** L'identifiant d'itinérance que l'index simulé fabrique pour une borne. */
const idSimule = (b: LigneIndex): string =>
  `FR${b.nom.replace(/\W/g, '').slice(0, 8).toUpperCase()}`;

async function simulerIndexBornes(page: Page, bornes: LigneIndex[]): Promise<void> {
  await page.route('**/public.opendatasoft.com/**', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes('/exports/json')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(bornes.map((b) => ({
          id_station_itinerance: idSimule(b),
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
    /* LE DÉTAIL D'UNE STATION (cartouche) : la même borne, dans la forme des
       enregistrements. Sans cette route, ouvrir une fiche depuis le plan
       répondait « n'est plus dans le fichier national » — et les parcours du
       27/08 (ajouter/retirer un arrêt depuis la fiche) mesuraient un bouton
       qui ne peut pas paraître. */
    if (url.includes('/records')) {
      const id = /id_station_itinerance = "([^"]+)"/.exec(url)?.[1];
      const b = bornes.find((x) => idSimule(x) === id)
        ?? bornes.find((x) => url.includes(`nom_station = "${x.nom}"`));
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(b ? { total_count: 1, results: [{
          nom_station: b.nom,
          adresse_station: 'Route d’essai, 21200 Beaune',
          nom_enseigne: b.reseau ?? 'Réseau d’essai',
          nom_operateur: b.operateur ?? b.reseau ?? 'Réseau d’essai',
          condition_acces: b.acces ?? 'Accès libre',
          puissance_nominale: b.p,
          nbre_pdc: b.pdc ?? 4,
          id_station_itinerance: idSimule(b),
          id_pdc_itinerance: `${idSimule(b)}P1`,
          prise_type_combo_ccs: '1',
          date_maj: '2026-08-01',
        }] } : { total_count: 0, results: [] }),
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
      /* 390 km en 10 800 s = 130 km/h PILE : le facteur vitesse du modèle des
         conditions vaut 1, et les plans de tous ces parcours restent ceux
         d'avant les conditions (28/08). */
      distance: 390_000, duration: 10_800,
    }),
  }));
  /* LES CONDITIONS SE BOUCHONNENT EN NEUTRE — 20 °C, terrain plat : les
     facteurs valent 1 et les plans attendus ne bougent pas. Sans ces routes,
     chaque parcours frapperait le VRAI Open-Meteo et la VRAIE altimétrie
     (la leçon Overpass/Bison Futé, encore). Les tests qui veulent du froid
     ou du relief posent leur propre route PAR-DESSUS. */
  await page.route('**/api.open-meteo.com/**', (route) => {
    const base = new Date();
    const heure = (h: number): string => {
      const d = new Date(base.getTime() + h * 3600 * 1000);
      const p = (n: number): string => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:00`;
    };
    const heures = [-1, 0, 1, 2, 3, 4, 5];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      utc_offset_seconds: 0,
      hourly: {
        time: heures.map(heure),
        temperature_2m: heures.map(() => 20),
        precipitation: heures.map(() => 0),
        weather_code: heures.map(() => 0),
        wind_speed_10m: heures.map(() => 5),
      },
    }) });
  });
  await page.route('**/data.geopf.fr/altimetrie/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ elevations: [
      { lon: 2.3522, lat: 48.8566, z: 100, acc: 'Average value' },
      { lon: 3.6, lat: 47.3, z: 100, acc: 'Average value' },
      { lon: 4.8357, lat: 45.764, z: 100, acc: 'Average value' },
    ] }),
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
  /* LE VÉHICULE EST UNE PAGE DU PLANIFICATEUR depuis le 27/08/2026 : « un seul
     bouton est plus efficace à comprendre que trois boutons où il faudra se
     rappeler dans quel menu on peut trouver quelle option » (Armelin). */
  await ouvrirVolet(page, '.vehicule');
  await page.getByLabel('Batterie', { exact: true }).fill('87.7');
  await page.getByLabel('Santé (SOCE)').fill('94');
  await page.getByLabel('Charge (SOC)').fill('100');
  await page.getByLabel('Charge max', { exact: true }).fill('150');
  await page.getByLabel('Sur autoroute').fill('280');
  // Le bilan confirme que le profil est pris en compte AVANT de continuer.
  await expect(page.locator('.veh-bilan-lignes')).toContainText('Sur autoroute');
  /* ET L'ON REVIENT AU TRAJET par la flèche, comme l'usager. Le véhicule est
     une PAGE du planificateur : cliquer de nouveau son bouton de tête le
     REFERMERAIT, puisqu'un <details> bascule. */
  await retour(page);
  await expect(page.locator('.iti-vers[data-vers="recharge"]')).toBeVisible();
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
  await allerA(page, 'recharge');
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
     tait ses hypothèses se fait prendre pour une prévision. Depuis le
     28/08, les conditions neutres du beforeEach sont RELEVÉES : la note dit
     ce qui est compté ET ce qui reste inconnu. */
  await expect(corps).toContainText('relief et vitesse du parcours sont comptés');
  await expect(corps).toContainText('restent inconnus le vent, la pluie');
  await expect(corps, 'le seuil de l’index doit être annoncé').toContainText('50 kW et plus');
});

test('« Pourquoi ce plan ? » explique avec ce qu’on SAIT — consignes, critère, aveu', async ({ page }) => {
  /* Mandat UX du 28/08 (PR UX-4). L'explication n'a droit qu'aux données du
     calcul : les consignes de l'usager, le critère réel du choix de borne
     (lib/arrets.ts), la puissance RETENUE, l'écart au tracé — et l'aveu du
     modèle. Jamais « plus fiable » ni « meilleur choix » sans critère. */
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de Beaune', { timeout: 15_000 });

  const volet = corps.locator('.recharge-pourquoi');
  await volet.locator('summary').click();
  // Les consignes de l'usager, reprises en toutes lettres.
  await expect(volet).toContainText('Vos consignes');
  await expect(volet).toContainText('votre réserve');
  // Le critère du choix — celui que le planificateur calcule VRAIMENT.
  await expect(volet).toContainText('compromis distance gagnée / puissance / détour');
  // La puissance retenue est NOMMÉE : min(borne, véhicule) = 150 kW ici.
  await expect(volet).toContainText('150 kW retenus');
  /* Et l'aveu du modèle clôt l'explication — sa forme d'APRÈS le 28/08 :
     les conditions neutres du beforeEach sont RELEVÉES (20 °C), le volet ne
     prétend donc plus calculer « à plat », il dit ce qui reste inconnu. */
  await expect(volet).toContainText('le vent, la pluie, le trafic');
  await expect(volet).toContainText('pas de la batterie');

  /* LE PLAFOND N'EST DIT QUE S'IL EXISTE : à « au besoin » (100), pas une
     ligne — puis choisi à 80 %, la consigne apparaît. */
  await expect(volet).not.toContainText('au-delà de');
  await page.getByLabel('Plafond de charge aux bornes').selectOption('80');
  await expect(corps).toContainText('Aire de Beaune', { timeout: 15_000 });
  await corps.locator('.recharge-pourquoi summary').click();
  await expect(corps.locator('.recharge-pourquoi'))
    .toContainText('ne jamais charger au-delà de 80 %');
});

test('le plafond descend à 50 % — et un plafond intenable le DIT, réversible', async ({ page }) => {
  /* Mandat UX du 28/08 (EV-1) : plafond élargi 50-90. Sous 80 %, la charge
     reste dans la zone rapide — certains préfèrent trois arrêts éclair à un
     plein. Sur CE trajet (390 km, une seule borne à 197 km), 50 % ne couvre
     pas la seconde jambe : le refus doit le dire AVEC le remède, et relever
     le plafond doit rendre le plan — les commandes restent. */
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de Beaune', { timeout: 15_000 });

  await page.getByLabel('Plafond de charge aux bornes').selectOption('50');
  await expect(corps).toContainText('relever le plafond');
  await page.getByLabel('Plafond de charge aux bornes').selectOption('80');
  await expect(corps).toContainText('Aire de Beaune');
});

test('la durée de charge est SUR la pastille de la carte, pas seulement en liste', async ({ page }) => {
  /* Mandat UX du 28/08 (EV-1) : « 2 » dit l'ordre, pas le prix — 18 min et
     45 min ne se valent pas quand on choisit lequel sauter. On lit la DONNÉE
     de la couche plutôt que ses pixels : le rendu du texte dépend des
     glyphes, la donnée non. */
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);
  await expect(page.locator('.iti-recharge-corps'))
    .toContainText('Aire de Beaune', { timeout: 15_000 });

  await expect.poll(() => page.evaluate(() => {
    const carte = (window as unknown as {
      __carte: {
        getLayer(id: string): unknown;
        getSource(id: string): { serialize(): { data: GeoJSON.FeatureCollection } } | undefined;
      };
    }).__carte;
    const source = carte.getSource('iti-arrets');
    const durees = source ? source.serialize().data.features
      .map((f) => (f.properties as { duree?: string }).duree) : [];
    return Boolean(carte.getLayer('iti-arrets-duree'))
      && durees.length === 1 && /^\d+ min$/.test(durees[0] ?? '');
  }), { timeout: 10_000 }).toBe(true);
});

test('l’HIVER entre dans le plan : bridage du VF8 appliqué, et DIT avec sa provenance', async ({ page }) => {
  /* La demande d'Armelin du 28/08 : température, relief, vitesse et bridage
     BMS dans le calcul. Scénario gel (−2 °C aux deux bouts) sur SON VF8 —
     « sous 0 °C je ne dépasse pas 30 kW ». Le volet « Pourquoi ce plan ? »
     doit dire le degré, le facteur, le bridage ET la limite de la méthode
     (la température d'AIR, pas celle de la batterie). */
  await page.route('**/api.open-meteo.com/**', (route) => {
    const base = new Date();
    const heure = (h: number): string => {
      const d = new Date(base.getTime() + h * 3600 * 1000);
      const p = (n: number): string => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:00`;
    };
    const heures = [-1, 0, 1, 2, 3, 4, 5];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      utc_offset_seconds: 0,
      hourly: {
        time: heures.map(heure),
        temperature_2m: heures.map(() => -2),
        precipitation: heures.map(() => 0),
        weather_code: heures.map(() => 71),
        wind_speed_10m: heures.map(() => 10),
      },
    }) });
  });
  await simulerIndexBornes(page, [BEAUNE]);
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  await saisirVehicule(page);
  // Le bridage à froid du VF8, saisi comme le ferait son propriétaire —
  // saisirVehicule vient de refermer la page, on y retourne.
  await allerA(page, 'vehicule');
  await page.getByLabel('Charge max sous 0 °C').fill('30');
  await retour(page);
  await allerA(page, 'recharge');

  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de Beaune', { timeout: 15_000 });
  await corps.locator('.recharge-pourquoi summary').click();
  const volet = corps.locator('.recharge-pourquoi');
  await expect(volet).toContainText('-2 °C au départ');
  // La durée de l'arrêt et sa puissance disent la MÊME histoire : bridé, on
  // n'écrit pas « à 150 kW retenus » sur la ligne qui explique 3 h de charge.
  await expect(volet).toContainText('à 30 kW retenus');
  // Et l'aveu final ne prétend plus calculer « à plat » : le relief est compté.
  await expect(volet).not.toContainText('calcule à plat');
  await expect(volet).toContainText('charge bridée à 30 kW');
  // La limite de la méthode est ÉCRITE : l'air, pas la batterie.
  await expect(volet).toContainText('AIR');
  await expect(volet).toContainText('kWh/100 km retenus');
  // Et les limites du parcours sont comptées par la vitesse moyenne du moteur.
  await expect(volet).toContainText('130 km/h de moyenne');
});

test('les conditions se relèvent UNE fois par trajet — cocher une case ne rappelle RIEN', async ({ page }) => {
  /* La frugalité du plan : Open-Meteo et l'altimétrie sont interrogés au
     premier calcul, puis chaque « + », « − » ou réglage REJOUE le plan sur
     les relevés en mémoire. */
  let appelsMeteo = 0;
  let appelsAlti = 0;
  await page.route('**/api.open-meteo.com/**', (route) => {
    appelsMeteo += 1;
    return route.fulfill({ status: 404, body: '' });
  });
  await page.route('**/data.geopf.fr/altimetrie/**', (route) => {
    appelsAlti += 1;
    return route.fulfill({ status: 404, body: '' });
  });
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de Beaune', { timeout: 15_000 });
  const meteoApres = appelsMeteo;
  const altiApres = appelsAlti;
  expect(meteoApres, 'départ et arrivée : deux relevés au plus').toBeLessThanOrEqual(2);

  await page.getByLabel('Plafond de charge aux bornes').selectOption('80');
  await expect(corps).toContainText('Aire de Beaune');
  expect(appelsMeteo, 'un réglage a rappelé la météo').toBe(meteoApres);
  expect(appelsAlti, 'un réglage a rappelé l’altimétrie').toBe(altiApres);

  /* ET LEUR ÉCHEC (404 ici) N'A RIEN BLOQUÉ : le plan est sorti quand même,
     et le volet DIT qu'il roule à 20 °C, à plat. */
  await corps.locator('.recharge-pourquoi summary').click();
  await expect(corps.locator('.recharge-pourquoi'))
    .toContainText('130 km/h de moyenne');
});

test('les PAUSES HUMAINES : la pause paie la charge, le profil famille trouve son aire de jeux', async ({ page }) => {
  /* Décision d'Armelin du 28/08. Trois contrats mesurés ici : la pause
     minimale allonge l'arrêt ET remplit plus (jamais du temps perdu) ; le
     profil famille relève les environs UNE fois (union de disques Overpass,
     jamais le corridor qui sature) et l'arrêt DIT sa trouvaille ; un réglage
     ne rappelle rien. */
  let appelsOverpass = 0;
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    appelsOverpass += 1;
    // Une aire de jeux à ~150 m à l'est de l'Aire de Beaune.
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ elements: [{ lat: 47.3, lon: 3.602 }] }),
    });
  });
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de Beaune', { timeout: 15_000 });
  // Le premier .recharge-detail est celui du PLAN ; le second vit dans la
  // liste « toutes les bornes ».
  const detailArret = corps.locator('.recharge-liste .recharge-detail').first();
  const sansPause = await detailArret.innerText();

  /* LA PAUSE PAIE LA CHARGE : l'arrêt passe à 30 min, et l'on repart PLUS
     chargé qu'avant — le départ affiché monte. */
  await page.getByLabel('Durée minimale de chaque arrêt').selectOption('30');
  await expect(detailArret).toContainText('30 min de charge');
  const avecPause = await detailArret.innerText();
  const depart = (t: string): number => Number(/départ (\d+) %/.exec(t)?.[1] ?? 0);
  expect(depart(avecPause), 'la pause n’a pas rempli la batterie')
    .toBeGreaterThan(depart(sansPause));

  // LE PROFIL FAMILLE : un relevé, une trouvaille, et l'arrêt la dit.
  expect(appelsOverpass).toBe(0);
  await page.getByLabel('Profil de pause').selectOption('famille');
  await expect(page.locator('.recharge-pause-etat'))
    .toContainText('1 borne du trajet avec aire de jeux');
  await expect(detailArret).toContainText(/aire de jeux à \d+ m/);
  expect(appelsOverpass).toBe(1);

  // Et le Pourquoi consigne le réglage, préférence — jamais filtre.
  await corps.locator('.recharge-pourquoi summary').click();
  await expect(corps.locator('.recharge-pourquoi'))
    .toContainText('une préférence, jamais un filtre');

  // FRUGALITÉ : un autre réglage rejoue le plan SANS rappeler Overpass.
  await page.getByLabel('Plafond de charge aux bornes').selectOption('80');
  await expect(corps).toContainText('Aire de Beaune');
  expect(appelsOverpass, 'un réglage a rappelé Overpass').toBe(1);
});

test('le COPILOTE connaît le plan : l’arrêt, ses SOC prévus, ses commodités à la demande', async ({ page, context }) => {
  /* Le panneau du passager pendant un suivi AVEC plan de recharge : la carte
     d'arrêt porte le nom, la distance restante et les SOC prévus — déjà en
     mémoire — et les commodités ne partent que sur le bouton. */
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
  let appelsOverpass = 0;
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    appelsOverpass += 1;
    const corps = route.request().postData() ?? '';
    // Le démarrage relève les LIMITES (way/maxspeed) : rien à rendre ici.
    if (corps.includes('maxspeed')) {
      return route.fulfill({
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json', body: JSON.stringify({ elements: [] }),
      });
    }
    // Les COMMODITÉS de l'arrêt : un restaurant nommé, des WC.
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ elements: [
        { lat: 47.3, lon: 3.601, tags: { amenity: 'restaurant', brand: 'Aire Gourmande' } },
        { lat: 47.3, lon: 3.5995, tags: { amenity: 'toilets' } },
      ] }),
    });
  });
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);
  await expect(page.locator('.iti-recharge-corps'))
    .toContainText('Aire de Beaune', { timeout: 15_000 });

  await retour(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
  const overpassApresDemarrage = appelsOverpass;

  await page.getByRole('button', { name: 'Ouvrir le panneau du copilote' }).click();
  const copilote = page.locator('.bg-copilote');
  await expect(copilote).toContainText('Recharges à venir', { timeout: 15_000 });
  await expect(copilote).toContainText('Aire de Beaune');
  await expect(copilote).toContainText(/dans .+ km/);
  await expect(copilote).toContainText(/arrivée \d+ % → départ \d+ %/);
  // Ouvrir le panneau n'a RIEN appelé de plus : tout était en mémoire.
  expect(appelsOverpass).toBe(overpassApresDemarrage);

  await copilote.getByRole('button', { name: 'Commodités sur place' }).click();
  await expect(copilote).toContainText('Restauration (Aire Gourmande)');
  await expect(copilote).toContainText('Toilettes');
  expect(appelsOverpass).toBe(overpassApresDemarrage + 1);
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
  /* DES PUCES À PICTOGRAMMES depuis le 27/08 (« de beaux logos toutes les
     commodités » — restautoroute.fr en exemple) : le nom en toutes lettres,
     le type en picto dessiné, la distance qui décide. */
  await expect(sortie).toContainText('TotalEnergies');
  await expect(sortie).toContainText('Toilettes');
  await expect(sortie).toContainText('L’Arche');
  await expect(sortie.locator('.com-puce')).toHaveCount(3);
  await expect(sortie.locator('.com-puce svg'), 'chaque puce porte son picto dessiné')
    .toHaveCount(3);
  await expect(sortie.locator('.com-distance').first()).toContainText(/\d+ m/);
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
  await allerA(page, 'recharge');
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

/* LE PLAN SE RÈGLE, ET SE CHOISIT SUR LA CARTE — les retours d'Armelin du
   27/08/2026 : plafond de charge, carte assainie pendant le plan, et la fiche
   d'une borne qui sait l'ajouter ou la retirer. */

test('le plafond de charge tronque les départs, quitte à AJOUTER un arrêt', async ({ page }) => {
  await simulerIndexBornes(page, TROIS);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de', { timeout: 15_000 });

  /* Une cible d'arrivée haute force une grosse charge : « au besoin », un seul
     arrêt rempli à ~100 % suffit. */
  await page.getByLabel('Charge voulue à l’arrivée').selectOption('30');
  await expect(corps.locator('.recharge-liste li')).toHaveCount(1);
  await expect(corps.locator('.recharge-liste')).toContainText(/départ (9\d|100) %/);

  /* Plafonné à 80 : la même charge ne passe plus en un arrêt. Le plan doit en
     prendre deux — et AUCUN départ ne dépasse le plafond. */
  await page.getByLabel('Plafond de charge aux bornes').selectOption('80');
  await expect(corps.locator('.recharge-liste li')).toHaveCount(2);
  const texte = await corps.locator('.recharge-liste').innerText();
  for (const [, depart] of texte.matchAll(/départ (\d+) %/g)) {
    expect(Number(depart), 'un départ dépasse le plafond choisi').toBeLessThanOrEqual(80);
  }
});

test('un plafond intenable produit un refus qui NOMME le remède', async ({ page }) => {
  // Une seule borne à mi-parcours : à 80 % de départ, la fin du trajet avec
  // une cible à 30 % ne passe pas, et rien d'autre n'existe plus loin.
  await simulerIndexBornes(page, [BEAUNE]);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de Beaune', { timeout: 15_000 });

  await page.getByLabel('Charge voulue à l’arrivée').selectOption('30');
  await page.getByLabel('Plafond de charge aux bornes').selectOption('80');
  await expect(corps).toContainText('plafond de charge');
});

test('le plan affiché, la carte ne montre plus que les bornes du trajet', async ({ page }) => {
  await simulerIndexBornes(page, TROIS);
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });

  /* LA COUCHE NATIONALE D'ABORD : on l'active pour la voir disparaître —
     sans elle, le parcours mesurerait un masquage sans témoin. */
  await allerA(page, 'couches');
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
  await expect.poll(() => page.evaluate(() =>
    Boolean((window as unknown as { __carte: { getLayer(id: string): unknown } })
      .__carte.getLayer('poi-bornes'))), { timeout: 10_000 }).toBe(true);
  await retour(page);

  await saisirVehicule(page);
  await allerA(page, 'recharge');
  await expect(page.locator('.iti-recharge-corps')).toContainText('Aire de',
    { timeout: 15_000 });

  /* LES BORNES NATIONALES S'EFFACENT… */
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { getLayoutProperty(c: string, p: string): unknown } })
      .__carte.getLayoutProperty('poi-bornes', 'visibility'))).toBe('none');
  /* …ET LE VOLET DES COUCHES LE DIT, plutôt que de paraître en panne. */
  await expect(page.locator('.poi-etat')).toContainText('trajet planifié');

  /* LES COUCHES DU TRAJET EXISTENT : pastilles d'arrêt et corridor. */
  const couches = await page.evaluate(() => {
    const c = (window as unknown as { __carte: { getLayer(id: string): unknown } }).__carte;
    return {
      arrets: Boolean(c.getLayer('iti-arrets-pastille')),
      corridor: Boolean(c.getLayer('iti-corridor')),
    };
  });
  expect(couches.arrets, 'la couche des arrêts du plan manque').toBe(true);
  expect(couches.corridor, 'la couche du corridor manque').toBe(true);

  /* EFFACER LE TRAJET REND LA CARTE : couches du trajet retirées, bornes
     nationales de retour. */
  await retour(page);
  await page.locator('.iti-effacer').click();
  await expect.poll(() => page.evaluate(() => {
    const c = (window as unknown as {
      __carte: { getLayer(id: string): unknown; getLayoutProperty(x: string, p: string): unknown };
    }).__carte;
    return {
      arrets: Boolean(c.getLayer('iti-arrets-pastille')),
      visibilite: c.getLayoutProperty('poi-bornes', 'visibility'),
    };
  })).toEqual({ arrets: false, visibilite: 'visible' });
});

test('une pastille d’arrêt SUR LA CARTE se clique, et sa fiche retire l’arrêt', async ({ page }) => {
  await simulerIndexBornes(page, TROIS);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de Beaune', { timeout: 15_000 });

  /* LE CLIC TOMBE SUR LA PASTILLE : on projette la position de la borne dans
     l'écran plutôt que de deviner des pixels. */
  await page.waitForTimeout(900); // fitBounds en cours : on laisse la carte se poser
  const point = await page.evaluate(() => {
    const c = (window as unknown as {
      __carte: { project(l: [number, number]): { x: number; y: number } };
    }).__carte;
    return c.project([3.6, 47.3]);
  });
  const canevas = await page.locator('#carte canvas.maplibregl-canvas').boundingBox();
  await page.mouse.click(canevas!.x + point.x, canevas!.y + point.y);

  /* LA FICHE S'OUVRE, et propose de retirer l'arrêt : cette borne est retenue
     par le plan. */
  const fiche = page.locator('fiche-borne');
  await expect(fiche).toBeVisible();
  await expect(fiche.locator('.fb-titre')).toContainText('Aire de Beaune');
  const retirer = fiche.getByRole('button', { name: 'Retirer cet arrêt du plan de recharge' });
  await expect(retirer).toBeVisible();
  await retirer.click();

  /* L'ARRÊT SORT DU PLAN — la liste ne le porte plus, le plan reste vivant. */
  await expect(corps.locator('.recharge-liste')).not.toContainText('Aire de Beaune');
  await expect(corps.locator('.recharge-liste')).toContainText('km');
});

test('la fiche d’une borne NON retenue propose de l’ajouter au plan', async ({ page }) => {
  await simulerIndexBornes(page, TROIS);
  await ouvrirRecharge(page);
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps).toContainText('Aire de', { timeout: 15_000 });
  // La borne lente des deux tiers n'est pas retenue d'office.
  await expect(corps.locator('.recharge-liste')).not.toContainText('Aire des Deux Tiers');

  // On ouvre sa fiche depuis la liste complète du trajet.
  await corps.locator('.recharge-toutes > summary').click();
  await page.getByRole('button', { name: 'Détail de Aire des Deux Tiers' }).click();

  const fiche = page.locator('fiche-borne');
  await expect(fiche).toBeVisible();
  const ajouter = fiche.getByRole('button', { name: 'Ajouter au plan de recharge' });
  await expect(ajouter).toBeVisible();
  await ajouter.click();

  await expect(corps.locator('.recharge-liste')).toContainText('Aire des Deux Tiers');
});

test('hors trajet, la fiche ne promet RIEN au plan', async ({ page }) => {
  /* Une borne loin de la route : sa fiche ne doit proposer ni ajout ni
     retrait — un bouton qui mènerait à un plan qu'elle ne peut pas servir. */
  await simulerIndexBornes(page, [BEAUNE,
    { nom: 'Hors route', lon: -1.5, lat: 43.5, p: 150 }]);
  await ouvrirRecharge(page);
  await expect(page.locator('.iti-recharge-corps')).toContainText('Aire de Beaune',
    { timeout: 15_000 });

  /* On ouvre la fiche de la borne lointaine comme le ferait un clic sur la
     couche nationale : elle n'est pas sur le corridor. */
  await page.evaluate(() => {
    document.querySelector<HTMLElement & {
      ouvrir(c: { id: string | null; lon: number; lat: number; nom: string }): void;
    }>('fiche-borne')!.ouvrir({
      id: 'FRHORSROUT', lon: -1.5, lat: 43.5, nom: 'Hors route',
    });
  });
  const fiche = page.locator('fiche-borne');
  await expect(fiche).toBeVisible();
  await expect(fiche.getByRole('button', { name: 'Itinéraire vers cette borne' }))
    .toBeVisible();
  await expect(fiche.locator('.fb-plan')).toHaveCount(0);
});
