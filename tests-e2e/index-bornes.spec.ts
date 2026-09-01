import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* L'INDEX NATIONAL DES BORNES RAPIDES, VU DE L'INTERFACE.
 *
 * Ce que ces parcours défendent est une propriété que le calcul pur ne peut
 * pas tenir seul : que la carte MONTRE quelque chose sous le zoom 12, là où
 * elle affichait « Zoomez pour afficher les points d'intérêt ». C'était le
 * premier des reproches d'Armelin du 25/08/2026, capture à l'appui.
 *
 * ET QUE L'INDEX NE SOIT PAS RETÉLÉCHARGÉ À CHAQUE GESTE : sept cents
 * kilo-octets par déplacement de carte seraient une régression bien pire que
 * le défaut qu'on corrige. Les parcours comptent donc les appels.
 */

/** Une station de l'index, dans la forme de l'export agrégé. */
interface Station {
  nom: string; lon: number; lat: number; p: number;
  reseau?: string; operateur?: string; acces?: string; pdc?: number;
}

const ligneIndex = (st: Station, i: number): Record<string, unknown> => ({
  id_station_itinerance: `FRTEST${i}`,
  nom_station: st.nom,
  nom_enseigne: st.reseau ?? 'Réseau d’essai',
  /* L'OPÉRATEUR PORTE LE FILTRE depuis le 26/08 : l'enseigne forme 1 799
     groupes dont 1 314 d'une seule station, parce que certains producteurs y
     écrivent le nom du site. La fixture suit le vrai modèle. */
  nom_operateur: st.operateur ?? st.reseau ?? 'Réseau d’essai',
  condition_acces: st.acces ?? 'Accès libre',
  prise_type_combo_ccs: '1',
  prise_type_chademo: '0',
  prise_type_2: '0',
  p: st.p,
  pdc: st.pdc ?? 4,
  lon: st.lon,
  lat: st.lat,
});

/** Compteur d'appels à l'export, partagé avec le test par référence. */
interface Compteur { exports: number; detail: number }

async function simulerPortail(
  page: Page, stations: Station[], detail?: Record<string, unknown>[],
): Promise<Compteur> {
  const compte: Compteur = { exports: 0, detail: 0 };
  await page.route('**/public.opendatasoft.com/**', (route) => {
    const url = route.request().url();
    if (url.includes('/exports/json')) {
      compte.exports += 1;
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(stations.map(ligneIndex)),
      });
    }
    /* LE CARTOUCHE INTERROGE LES ENREGISTREMENTS, pas l'export : deux formes
       de réponse, discriminées sur la clause `where`. La requête de la couche
       porte elle aussi « nom_station », mais dans son `select`. */
    const decode = decodeURIComponent(url);
    if (decode.includes('id_station_itinerance =') || decode.includes('nom_station =')) {
      compte.detail += 1;
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ total_count: detail?.length ?? 0, results: detail ?? [] }),
      });
    }
    // La couche par emprise, au-dessus du zoom 12.
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ total_count: 0, results: [] }),
    });
  });
  return compte;
}

/** Quelques stations réparties sur la France, pour que les amas aient un sens. */
const FRANCE: Station[] = [
  { nom: 'Ionity Beaune', lon: 4.84, lat: 47.02, p: 350, operateur: 'Ionity', pdc: 6 },
  { nom: 'Ionity Mâcon', lon: 4.83, lat: 46.31, p: 350, operateur: 'Ionity' },
  { nom: 'Tesla Nemours', lon: 2.69, lat: 48.26, p: 250, operateur: 'Tesla' },
  { nom: 'Tesla Auxerre', lon: 3.57, lat: 47.80, p: 250, operateur: 'Tesla' },
  { nom: 'Engie Lille', lon: 3.06, lat: 50.63, p: 150, operateur: 'ENGIE Vianeo' },
  { nom: 'Flotte municipale', lon: 5.37, lat: 43.30, p: 50, operateur: 'Ville',
    acces: 'Accès réservé' },
];

async function ouvrirBornes(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirVolet(page, '.poi');
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
}

const compterRendus = (page: Page, couche: string): Promise<number> => page.evaluate(
  (c) => (window as unknown as {
    __carte: { queryRenderedFeatures(o: object): unknown[] };
  }).__carte.queryRenderedFeatures({ layers: [c] }).length,
  couche,
);

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

test('sous le zoom 12, la carte montre le réseau national — et DIT son seuil', async ({ page }) => {
  const compte = await simulerPortail(page, FRANCE);
  await ouvrirBornes(page);
  // On reste au zoom d'accueil : la France entière, 5,4.

  /* CE QUI A CHANGÉ : la ligne d'état disait « Zoomez pour afficher les points
     d'intérêt » et la carte restait nue. Elle annonce maintenant ce qu'elle
     montre, et surtout CE QU'ELLE OMET — les bornes sous 50 kW. */
  const etat = page.locator('.poi-etat');
  await expect(etat).toContainText('stations dans la vue', { timeout: 20_000 });
  await expect(etat, 'un index muet sur son seuil ment par omission')
    .toContainText('50 kW et plus');

  // Et des amas sont réellement dessinés — pixels à l'appui, pas texte.
  await expect.poll(() => compterRendus(page, 'poi-bornes-amas'), { timeout: 15_000 })
    .toBeGreaterThan(0);
  expect(compte.exports, 'un seul export pour tout le réseau').toBe(1);
});

test('déplacer la carte sous le seuil ne retélécharge RIEN', async ({ page }) => {
  /* Sept cents kilo-octets par `moveend` seraient une régression bien pire que
     le défaut corrigé. L'index est lu une fois, puis découpé en mémoire. */
  const compte = await simulerPortail(page, FRANCE);
  await ouvrirBornes(page);
  await expect(page.locator('.poi-etat')).toContainText('stations dans la vue', { timeout: 20_000 });
  expect(compte.exports).toBe(1);

  for (const centre of [[3.0, 47.5], [5.4, 45.2], [1.4, 43.6]]) {
    await page.evaluate((c) => {
      (window as unknown as { __carte: { jumpTo(o: object): void } })
        .__carte.jumpTo({ center: c, zoom: 7 });
    }, centre);
    await page.waitForTimeout(700);
  }
  expect(compte.exports, 'l’index a été redemandé au déplacement').toBe(1);
});

test('un amas se déplie au clic — un nombre au milieu de la carte serait un cul-de-sac', async ({ page }) => {
  await simulerPortail(page, FRANCE);
  await ouvrirBornes(page);
  await expect.poll(() => compterRendus(page, 'poi-bornes-amas'), { timeout: 20_000 })
    .toBeGreaterThan(0);

  const avant = await page.evaluate(() =>
    (window as unknown as { __carte: { getZoom(): number } }).__carte.getZoom());

  // On clique au centre du premier amas rendu.
  const point = await page.evaluate(() => {
    const carte = (window as unknown as {
      __carte: {
        queryRenderedFeatures(o: object): { geometry: { coordinates: [number, number] } }[];
        project(c: [number, number]): { x: number; y: number };
      };
    }).__carte;
    const amas = carte.queryRenderedFeatures({ layers: ['poi-bornes-amas'] })[0]!;
    return carte.project(amas.geometry.coordinates);
  });
  const cadre = await page.locator('#carte canvas.maplibregl-canvas').boundingBox();
  await page.mouse.click(cadre!.x + point.x, cadre!.y + point.y);

  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { getZoom(): number } }).__carte.getZoom(),
  ), { message: 'le clic sur l’amas n’a pas rapproché la carte', timeout: 10_000 })
    .toBeGreaterThan(avant);
});

test('le filtre réseau est NATIONAL et survit au déplacement', async ({ page }) => {
  await simulerPortail(page, FRANCE);
  await ouvrirBornes(page);
  await expect(page.locator('.poi-reseau')).toHaveCount(4, { timeout: 20_000 });

  /* LE COMPTE EST NATIONAL, et le panneau le dit : un réseau coché peut
     n'avoir aucune borne dans la vue. C'est la contrepartie assumée du
     « quel que soit le niveau de zoom ». */
  await expect(page.locator('.poi-filtres')).toContainText('Réseaux — France entière');
  await expect(page.locator('.poi-reseaux')).toContainText('Ionity (2)');

  // Ne garder qu'Ionity réduit ce que la carte porte, sans aucun appel.
  await page.locator('.poi-reseau[value="Ionity"]').check();
  await expect.poll(async () => {
    const n = await compterRendus(page, 'poi-bornes-amas');
    const p = await compterRendus(page, 'poi-bornes');
    return n + p;
  }, { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(page.locator('.poi-etat')).toContainText('2 stations dans la vue');
});

test('le nom de station filtre l’index LOCALEMENT, sourd aux graphies', async ({ page }) => {
  /* Sous le zoom 12, l'index est complet en mémoire : la recherche par nom
     s'y applique sans le moindre appel. « IZIVIA FAST - Mc Donald's » et
     « McDonald's » sont les graphies RÉELLES du fichier, mesurées le
     27/08/2026 — l'usager qui tape « mcdonald » doit trouver les deux. */
  await simulerPortail(page, [
    { nom: 'IZIVIA FAST - Mc Donald’s - Bellac', lon: 1.06, lat: 46.12, p: 150,
      operateur: 'IZIVIA' },
    { nom: 'IZIVIA FAST - McDonald’s - Argentan', lon: -0.02, lat: 48.74, p: 150,
      operateur: 'IZIVIA' },
    { nom: 'Ionity Beaune', lon: 4.84, lat: 47.02, p: 350, operateur: 'Ionity' },
  ]);
  await ouvrirBornes(page);
  await expect(page.locator('.poi-etat')).toContainText('3 stations dans la vue',
    { timeout: 20_000 });

  await page.getByLabel('Chercher un réseau ou un nom de station').fill('mcdonald');
  await expect(page.locator('.poi-etat')).toContainText('2 stations dans la vue',
    { timeout: 10_000 });

  // Effacer le champ rend tout — un filtre qui colle serait une panne muette.
  await page.getByLabel('Chercher un réseau ou un nom de station').fill('');
  await expect(page.locator('.poi-etat')).toContainText('3 stations dans la vue',
    { timeout: 10_000 });
});

test('le cartouche dit l’ACCÈS RÉSERVÉ, le téléphone, et ce qu’il ignore', async ({ page }) => {
  /* Onze pour cent des stations françaises sont réservées à une flotte ou à
     des résidents. L'ancienne bulle les montrait comme les autres, et envoyait
     l'usager vers une borne où il ne pouvait pas brancher. */
  await simulerPortail(page, FRANCE, [{
    nom_station: 'Flotte municipale',
    adresse_station: '1 quai du Port, 13002 Marseille',
    nom_enseigne: 'Ville', nom_operateur: 'Régie municipale',
    telephone_operateur: 'tel:+33-4-91-00-00-00',
    condition_acces: 'Accès réservé', horaires: 'Mo-Fr 08:00-18:00',
    implantation_station: 'Voirie', accessibilite_pmr: 'Réservé PMR',
    paiement_cb: '0', paiement_acte: '0', reservation: '0',
    station_deux_roues: '0', tarification: null, gratuit: '0',
    puissance_nominale: 50, nbre_pdc: 2,
    id_station_itinerance: 'FRTEST5', id_pdc_itinerance: 'FRTEST5E1',
    date_maj: '2026-06-01', prise_type_combo_ccs: '1', prise_type_2: '0',
    prise_type_chademo: '0', prise_type_ef: '0',
  }]);
  await ouvrirBornes(page);

  /* ON ZOOME SUR MARSEILLE pour que la station soit une punaise et non un
     amas : le zoom 11 reste sous le seuil des requêtes par emprise, donc
     toujours servi par l'index, mais au-delà de la portée des amas. */
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [5.37, 43.30], zoom: 11 });
  });
  await expect.poll(() => compterRendus(page, 'poi-bornes'), { timeout: 20_000 })
    .toBeGreaterThan(0);

  const point = await page.evaluate(() => {
    const carte = (window as unknown as {
      __carte: { project(c: [number, number]): { x: number; y: number } };
    }).__carte;
    return carte.project([5.37, 43.30]);
  });
  const cadre = await page.locator('#carte canvas.maplibregl-canvas').boundingBox();
  await page.mouse.click(cadre!.x + point.x, cadre!.y + point.y);

  const fiche = page.locator('fiche-borne');
  await expect(fiche).toBeVisible({ timeout: 10_000 });
  await expect(fiche.locator('.fb-acces'), 'l’accès réservé doit se lire SANS la couleur')
    .toContainText('Accès réservé');
  /* « RÉSERVÉ » N'EST PAS « INTERDIT » : le badge d'un opérateur suffit
     souvent (retour d'Armelin du 27/08). Le bandeau nomme la condition ET
     invite à vérifier — il ne condamne plus la borne. */
  await expect(fiche).toContainText('badge, clientèle ou résidents');
  await expect(fiche).toContainText('vérifiez avant le détour');
  // Le numéro de l'exploitant : on le cherche quand la borne refuse de démarrer.
  await expect(fiche.locator('.fb-tel')).toHaveText('+33 4 91 00 00 00');
  await expect(fiche.locator('.fb-tel')).toHaveAttribute('href', 'tel:+33491000000');
  await expect(fiche).toContainText('Mo-Fr 08:00-18:00');
  /* Ce qu'il ignore est écrit : sans quoi le blanc passe pour un oubli. La
     phrase a changé avec IRVE-1 (01/09) : une source publique française
     DIFFUSE bien l'état des points — elle n'est simplement pas vivante, et
     prétendre qu'elle n'existe pas revenait à cacher une donnée réelle. */
  await expect(fiche).toContainText('L’occupation en direct n’existe dans'
    + ' aucune source publique française');
  await expect(fiche).toContainText('Aucun tarif déclaré');

  // Échap referme, comme partout ailleurs.
  await page.keyboard.press('Escape');
  await expect(fiche).toBeHidden();
});


test('deux écritures d’un même réseau ne font qu’une case', async ({ page }) => {
  /* MESURÉ SUR L'INDEX LUI-MÊME le 26/08/2026 : 14 133 stations portent
     2 615 écritures d'enseigne, dont onze groupes désignent le même réseau
     sous deux ou trois orthographes — 2 098 stations, 15 % du réseau rapide
     français. « LIDL » (446) et « Lidl France » (434) en tête.
     Cocher l'une écartait donc les stations de l'autre : un filtre qui ment
     sans le dire, exactement le défaut que l'index venait de corriger
     ailleurs. */
  await simulerPortail(page, [
    /* TOUTES AU CENTRE DE LA FRANCE, à dessein : le compteur de la carte ne
       compte que ce que la VUE contient, quand la liste des réseaux, elle, est
       nationale. Une station posée à Lille sortait du cadre au zoom d'accueil
       et faisait échouer l'assertion pour une raison qui n'avait rien à voir
       avec la fusion des écritures. */
    { nom: 'Lidl Beaune', lon: 4.84, lat: 47.02, p: 150, operateur: 'LIDL' },
    { nom: 'Lidl Mâcon', lon: 4.83, lat: 46.31, p: 150, operateur: 'LIDL' },
    { nom: 'Lidl Auxerre', lon: 3.57, lat: 47.80, p: 150, operateur: 'Lidl France' },
    { nom: 'Lidl Nevers', lon: 3.16, lat: 46.99, p: 150, operateur: 'Lidl France' },
    { nom: 'Lidl Bourges', lon: 2.40, lat: 47.08, p: 150, operateur: 'Lidl France' },
    { nom: 'Ionity Dijon', lon: 5.04, lat: 47.32, p: 350, operateur: 'Ionity' },
  ]);
  await ouvrirBornes(page);

  // UNE case pour Lidl, et son compte est le TOTAL des deux écritures.
  await expect(page.locator('.poi-reseau')).toHaveCount(2, { timeout: 20_000 });
  await expect(page.locator('.poi-reseaux'), 'les deux écritures n’ont pas fusionné')
    .toContainText('Lidl France (5)');
  await expect(page.locator('.poi-reseaux')).toContainText('Ionity (1)');

  // Et la cocher retient bien les CINQ stations, pas les trois d'une écriture.
  await page.locator('.poi-reseau').first().check();
  await expect(page.locator('.poi-etat')).toContainText('5 stations dans la vue',
    { timeout: 10_000 });
});


/** Le détail complet d'une station, avec les champs du cartouche. */
const DETAIL_TYPE = [{
  nom_station: 'Aire de Beaune',
  adresse_station: 'Autoroute A6, aire de Beaune-Tailly, 21200 Merceuil',
  nom_enseigne: 'Ionity', nom_operateur: 'IONITY GmbH | FR*ION',
  telephone_operateur: 'tel:+33-1-23-45-67-89', condition_acces: 'Accès libre',
  horaires: '24/7', implantation_station: 'Station dédiée à la recharge rapide',
  accessibilite_pmr: 'Accessible mais non réservé PMR', paiement_cb: '1',
  paiement_acte: '1', reservation: '0', station_deux_roues: '0',
  tarification: 'Tarification au kWh plus frais de connexion éventuels en fonction de votre contrat de mobilité',
  gratuit: '0', puissance_nominale: 350, nbre_pdc: 6,
  id_station_itinerance: 'FRTEST0', id_pdc_itinerance: 'FRTEST0E1',
  date_maj: '2026-06-01', prise_type_combo_ccs: '1', prise_type_2: '0',
  prise_type_chademo: '0', prise_type_ef: '0',
}];

const COMMODITES = {
  elements: [
    { type: 'node', id: 1, lat: 47.0205, lon: 4.8405,
      tags: { amenity: 'restaurant', name: 'Le Relais des Grands Crus de Bourgogne' } },
    { type: 'node', id: 2, lat: 47.0202, lon: 4.8402,
      tags: { amenity: 'fuel', brand: 'TotalEnergies' } },
    // Sans nom NI marque : le type doit tenir lieu de libellé.
    { type: 'node', id: 3, lat: 47.0208, lon: 4.8408, tags: { amenity: 'toilets' } },
  ],
};

async function ouvrirCartoucheBeaune(page: Page): Promise<void> {
  await ouvrirBornes(page);
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [4.84, 47.02], zoom: 11 });
  });
  await expect.poll(() => compterRendus(page, 'poi-bornes'), { timeout: 20_000 })
    .toBeGreaterThan(0);
  const point = await page.evaluate(() => (window as unknown as {
    __carte: { project(c: [number, number]): { x: number; y: number } };
  }).__carte.project([4.84, 47.02]));
  const cadre = await page.locator('#carte canvas.maplibregl-canvas').boundingBox();
  await page.mouse.click(cadre!.x + point.x, cadre!.y + point.y);
  await expect(page.locator('fiche-borne')).toBeVisible({ timeout: 10_000 });
}

test('les textes du cartouche ne se chevauchent JAMAIS, adresse longue comprise', async ({ page }) => {
  /* « Les textes des encarts se chevauchent encore » (Armelin, 26/08/2026).
     La cause est le piège classique de flexbox : un enfant flexible a
     `min-width: auto`, donc il refuse de descendre sous la largeur de son plus
     long mot. Une adresse d'autoroute ou un tarif bavard débordait de sa
     colonne et passait SOUS la voisine au lieu de revenir à la ligne — ce qui
     n'arrive qu'avec un texte assez long, d'où sa survie aux relectures.
     Ce parcours mesure des RECTANGLES, comme le reste de l'ergonomie du
     projet : ce que l'œil voit se prouve, il ne se juge pas. */
  await simulerPortail(page, FRANCE, DETAIL_TYPE);
  await ouvrirCartoucheBeaune(page);
  await expect(page.locator('fiche-borne')).toContainText('Merceuil', { timeout: 10_000 });

  const chevauchements = await page.evaluate(() => {
    const boites = [...document.querySelectorAll<HTMLElement>(
      'fiche-borne .fb-intitule, fiche-borne .fb-valeur, fiche-borne .fb-titre,'
      + ' fiche-borne .fb-pdc-titre, fiche-borne .fb-pdc-prises,'
      + ' fiche-borne .fb-tarif, fiche-borne .fb-acces',
    )].map((e) => ({ t: (e.textContent ?? '').slice(0, 24), r: e.getBoundingClientRect() }))
      .filter((b) => b.r.width > 0 && b.r.height > 0);
    const fautes: string[] = [];
    for (let i = 0; i < boites.length; i += 1) {
      for (let j = i + 1; j < boites.length; j += 1) {
        const a = boites[i]!.r; const b = boites[j]!.r;
        // Une marge d'un pixel évite de compter deux bords jointifs.
        const croise = a.left < b.right - 1 && a.right - 1 > b.left
          && a.top < b.bottom - 1 && a.bottom - 1 > b.top;
        if (croise) fautes.push(`« ${boites[i]!.t} » sur « ${boites[j]!.t} »`);
      }
    }
    return fautes;
  });
  expect(chevauchements, 'des textes du cartouche se recouvrent').toEqual([]);

  // Et rien ne déborde du cartouche par la droite.
  const deborde = await page.evaluate(() => {
    const carte = document.querySelector('fiche-borne .fb')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('fiche-borne .fb-corps *')]
      .filter((e) => e.getBoundingClientRect().right > carte.right + 1)
      .map((e) => (e.textContent ?? '').slice(0, 30));
  });
  expect(deborde, 'du texte sort du cartouche').toEqual([]);
});

test('un commerce à proximité se situe et se rejoint', async ({ page }) => {
  /* « Ça ne me donne pas la possibilité de cliquer dessus pour programmer un
     itinéraire vers ce service » (Armelin, 26/08/2026). Une liste qu'on lit
     sans pouvoir s'y rendre oblige à recopier un nom dans un champ de
     recherche — pour un restaurant qu'on regarde déjà sur la carte. */
  await simulerPortail(page, FRANCE, DETAIL_TYPE);
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(COMMODITES),
  }));
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[4.84, 47.02], [4.8405, 47.0205]] },
      distance: 620, duration: 90,
    }),
  }));
  /* LA BAN EST SIMULÉE DÈS LE DÉPART. Sans cela, le géocodage inverse partait
     vers le VRAI service : le parcours dépendait alors d'une réponse qu'on ne
     maîtrise pas, et il aurait rougi le jour où la BAN change un libellé. */
  await page.route('**api-adresse.data.gouv.fr/reverse**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { type: 'Point', coordinates: [4.8405, 47.0205] },
      properties: {
        label: '2 route de Pommard, 21200 Beaune', type: 'housenumber',
        postcode: '21200', city: 'Beaune', context: '21, Côte-d’Or',
      },
    }] }),
  }));
  await ouvrirCartoucheBeaune(page);

  await page.getByRole('button', { name: 'Chercher les commerces et services' }).click();
  const liste = page.locator('.fb-liste-commodites');
  await expect(liste).toContainText('Le Relais des Grands Crus', { timeout: 15_000 });
  // Une commodité SANS nom porte son type : la case ne reste pas vide, sans
  // quoi la grille décalait la distance sous le libellé.
  await expect(liste).toContainText('Toilettes');

  await expect(page.getByRole('button', { name: /Voir Le Relais.*sur la carte/ })).toBeVisible();
  await page.getByRole('button', { name: /Itinéraire vers Le Relais/ }).click();

  /* LE CARTOUCHE S'EFFACE — on a obtenu ce qu'on venait y chercher — et le
     planificateur porte le NOM du lieu : « itinéraire vers 4,84 ; 47,02 » ne
     dirait à personne vers quoi il va. */
  await expect(page.locator('fiche-borne')).toBeHidden();
  await expect(page.locator('.iti')).toHaveAttribute('open', '');
  await expect(page.locator('[data-role="arrivee"] input'))
    .toHaveValue(/Le Relais des Grands Crus/);

  /* L'ADRESSE VOYAGE AVEC LE NOM. Armelin, le 26/08/2026 : « le champ de
     recherche affiche seulement le nom du commerce mais pas son adresse […]
     il existe des milliers de Carrefour en France ». Le trajet partait bel et
     bien des bonnes coordonnées — mais rien ne permettait de le vérifier. */
  await expect(page.locator('[data-role="arrivee"] input'))
    .toHaveValue(/route de Pommard/);

  /* ET SANS DÉPART, ON PROPOSE LE PLUS PROBABLE plutôt que de renvoyer à un
     champ vide : le garde-fou du calcul rend la main en silence quand une
     extrémité manque. */
  await expect(page.locator('.iti-erreur')).toContainText('Choisissez votre départ');
  await expect(page.getByRole('button', { name: 'Partir de ma position actuelle' }))
    .toBeVisible();

  // Et dès qu'un départ est posé, le trajet se calcule pour de bon.
  await page.route('**api-adresse.data.gouv.fr**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { type: 'Point', coordinates: [4.84, 47.02] },
      properties: {
        label: 'Aire de Beaune-Tailly, Merceuil', type: 'street',
        postcode: '21200', city: 'Merceuil', context: '21, Côte-d’Or',
      },
    }] }),
  }));
  await page.locator('[data-role="depart"] input').fill('Beaune');
  await page.locator('[data-role="depart"] [role="option"]').first().click();
  await expect(page.locator('.iti-resultat')).toContainText('620 m', { timeout: 15_000 });
});

test('l’étendue du réseau est un CHOIX, et son prix est affiché', async ({ page }) => {
  /* « La carte n'affiche pas toutes les stations électriques de France »
     (Armelin, 26/08/2026). C'était vrai : le seuil de 50 kW en était la cause.
     Il reste le défaut — en deçà on ne s'arrête pas en voyage — mais ce n'est
     plus une limite imposée. */
  await simulerPortail(page, FRANCE);
  await ouvrirBornes(page);

  const note = page.locator('.poi-etendue-note');
  await expect(note).toContainText('14 133 stations');
  await expect(note, 'le poids doit être annoncé avant d’être payé').toContainText('700 Ko');
  /* ET LE POINT DE COMPARAISON EST DONNÉ, parce qu'il sera fait de toute
     façon : l'Avere compte des POINTS DE RECHARGE, nous des STATIONS. Sans le
     dire, l'écart passe pour un trou de quatre-vingt-dix pour cent. */
  await expect(note).toContainText('200 045');

  await page.getByLabel('Étendue du réseau national chargé')
    .selectOption({ label: 'Toutes les bornes' });
  await expect(note).toContainText('56 781 stations');
  await expect(note).toContainText('2,5 Mo');
});

test('on trouve un réseau qui n’est pas dans les douze premiers', async ({ page }) => {
  /* « Plusieurs réseaux que j'ai l'habitude d'utiliser n'y figurent pas »
     (Armelin, 26/08/2026). La liste s'arrêtait aux douze premiers : IZIVIA
     FAST était treizième, Atlante dix-huitième, ALLEGO vingt-deuxième. */
  const beaucoup: Station[] = Array.from({ length: 20 }, (_, i) => ({
    nom: `Station ${i}`, lon: 2 + i * 0.05, lat: 46 + i * 0.05, p: 150,
    operateur: i < 15 ? `Gros reseau ${i}` : 'Fastned France',
  }));
  await simulerPortail(page, beaucoup);
  await ouvrirBornes(page);
  await expect(page.locator('.poi-reseau').first()).toBeVisible({ timeout: 20_000 });

  // Douze cases au plus, et le panneau DIT qu'il en cache.
  await expect(page.locator('.poi-reseau')).toHaveCount(12);
  await expect(page.locator('.poi-reseaux')).toContainText('sur 16');

  // La recherche ouvre la liste à tout ce qui correspond.
  await page.getByLabel('Chercher un réseau ou un nom de station').fill('fastned');
  await expect(page.locator('.poi-reseau')).toHaveCount(1);
  await expect(page.locator('.poi-reseaux')).toContainText('Fastned France');
});

test('le cartouche et les volets ne se recouvrent JAMAIS : une surface a la fois', async ({ page }) => {
  /* CE QUE LES MESURES DE TEXTE NE VOYAIENT PAS. Le cartouche et les volets du
     rail occupent le meme bord de l'ecran : ouverts ensemble, le premier
     RECOUVRE le second — les filtres des bornes passaient sous la carte de
     detail. Leurs textes ne se recouvrent pas ; c'est la surface entiere qui
     masque l'autre, et c'est aussi un chevauchement. */
  await simulerPortail(page, FRANCE, DETAIL_TYPE);
  await ouvrirCartoucheBeaune(page);

  /* Ouvrir le cartouche a referme le PLANIFICATEUR, qui abrite depuis le
     27/08 la page des couches : c'est lui qui occupe la colonne. */
  await expect(page.locator('.iti'), 'le volet reste ouvert SOUS le cartouche')
    .not.toHaveAttribute('open', '');

  // Et aucune boite ne croise l'autre — la preuve par les rectangles.
  const croisement = await page.evaluate(() => {
    const carte = document.querySelector('fiche-borne .fb')?.getBoundingClientRect();
    if (!carte) return 'cartouche absent';
    const fautes: string[] = [];
    for (const v of document.querySelectorAll<HTMLElement>(
      '#carte .maplibregl-ctrl-top-left > div > * > details[open] > *:not(summary)',
    )) {
      const r = v.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.left < carte.right - 1 && r.right - 1 > carte.left
        && r.top < carte.bottom - 1 && r.bottom - 1 > carte.top) {
        fautes.push(v.className || v.tagName);
      }
    }
    return fautes;
  });
  expect(croisement).toEqual([]);

  // Et dans l'autre sens : rouvrir un volet referme le cartouche.
  await ouvrirVolet(page, '.poi');
  await expect(page.locator('fiche-borne'),
    "le cartouche survit par-dessus le volet qu’on vient d’ouvrir").toBeHidden();
});


test('un bouton mène de la borne au planificateur', async ({ page }) => {
  /* « Quand je clique sur une borne de recharge, je n'ai pas la possibilité de
     cliquer sur un bouton pour démarrer un itinéraire vers cette dernière »
     (Armelin, 26/08/2026). Le cartouche décrivait la station sans jamais
     permettre d'y aller : il fallait relever son adresse et la retaper dans le
     planificateur, pour un point qu'on désignait déjà du doigt. */
  await simulerPortail(page, FRANCE, DETAIL_TYPE);
  await ouvrirCartoucheBeaune(page);

  const aller = page.getByRole('button', { name: 'Itinéraire vers cette borne' });
  await expect(aller).toBeVisible();
  await aller.click();

  await expect(page.locator('fiche-borne')).toBeHidden();
  await expect(page.locator('.iti')).toHaveAttribute('open', '');
  /* LE LIBELLÉ PORTE L'ADRESSE : « Aire de Beaune » désigne peut-être deux
     aires, « Aire de Beaune — Autoroute A6… » une seule. */
  await expect(page.locator('[data-role="arrivee"] input'))
    .toHaveValue(/Aire de Beaune — Autoroute A6/);
});

test('les titres de section restent DANS leur cadre', async ({ page }) => {
  /* « J'ai toujours les titres des fenêtres qui se chevauchent » (Armelin,
     26/08/2026, capture à l'appui). La cause est native : un `<legend>` est
     rendu À CHEVAL SUR LA BORDURE de son `<fieldset>`, une demi-hauteur de
     ligne au-dessus du cadre. Tant que les cadres étaient plats et jointifs
     personne ne le voyait ; depuis que chaque section est une carte arrondie
     avec son ombre, la légende sort de la carte et se pose sur celle du
     dessus. */
  await simulerPortail(page, FRANCE);
  await ouvrirBornes(page);
  await expect(page.locator('.poi-filtres')).toBeVisible();

  const fautes = await page.evaluate(() => {
    const mauvais: string[] = [];
    for (const lg of document.querySelectorAll<HTMLElement>('#carte fieldset > legend')) {
      const r = lg.getBoundingClientRect();
      if (r.width === 0) continue;
      const cadre = lg.closest('fieldset')!.getBoundingClientRect();
      if (r.top < cadre.top - 0.5 || r.bottom > cadre.bottom + 0.5) {
        mauvais.push(`${lg.textContent} déborde de son cadre`);
      }
    }
    return mauvais;
  });
  expect(fautes).toEqual([]);
});

/* ================= L'ÉTAT DÉCLARÉ DES POINTS (IRVE-1, 01/09) ================
 *
 * Armelin demandait « les points libres ou occupés » et un reroutage
 * automatique. MESURÉ le jour même sur 1 400 points du fichier national :
 * AUCUN relevé de moins de 9,6 heures, 45 % de plus de sept jours. Ce que ces
 * parcours défendent, c'est donc la seule chose honnête à en tirer : une
 * panne signalée, une occupation DATÉE, et pas un mot qui laisse croire au
 * direct. */

const STATION_DEUX_POINTS = {
  nom_station: 'Relais du Plessis', adresse_station: '2 avenue Ardouin, 94420',
  nom_enseigne: 'Ionity', nom_operateur: 'Ionity',
  condition_acces: 'Accès libre', puissance_nominale: 350, nbre_pdc: 2,
  id_station_itinerance: 'FRIOYP1', date_maj: '2026-08-01',
  prise_type_combo_ccs: '1', prise_type_2: '0',
  prise_type_chademo: '0', prise_type_ef: '0',
};

/** Les deux lignes de points que rend le portail pour cette station. */
const LIGNES_STATION = [
  { ...STATION_DEUX_POINTS, id_pdc_itinerance: 'FRIOYE410255' },
  { ...STATION_DEUX_POINTS, id_pdc_itinerance: 'FRIOYE410256' },
];

/** Ouvre la fiche de la station simulée, et rend les URL de relevés appelées. */
async function ficheAvecReleves(
  page: Page, releves: Record<string, unknown>[],
): Promise<string[]> {
  const appels: string[] = [];
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/tabular-api.data.gouv.fr/**', (route) => {
    appels.push(decodeURIComponent(route.request().url()));
    /* L'EN-TÊTE CORS N'EST PAS UN DÉTAIL DE SIMULATION : le portail réel
       l'envoie (`access-control-allow-origin: *`, vérifié le 01/09), et sans
       lui le navigateur refuse la réponse — la fiche affichait alors « les
       relevés ne répondent pas », ce qui aurait fait passer un correctif
       correct pour une panne. */
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ data: releves, meta: { total: releves.length } }),
    });
  });
  await simulerPortail(page, [{
    nom: 'Relais du Plessis', lon: 2.5722, lat: 48.8103, p: 350,
    operateur: 'Ionity',
  }], LIGNES_STATION);
  await ouvrirBornes(page);
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.5722, 48.8103], zoom: 11 });
  });
  await expect.poll(() => compterRendus(page, 'poi-bornes'), { timeout: 20_000 })
    .toBeGreaterThan(0);
  const point = await page.evaluate(() => (window as unknown as {
    __carte: { project(c: [number, number]): { x: number; y: number } };
  }).__carte.project([2.5722, 48.8103]));
  const cadre = await page.locator('#carte canvas.maplibregl-canvas').boundingBox();
  await page.mouse.click(cadre!.x + point.x, cadre!.y + point.y);
  await expect(page.locator('fiche-borne')).toBeVisible({ timeout: 10_000 });
  return appels;
}

/** Un relevé daté de `heures` heures avant maintenant. */
const releve = (id: string, etat: string, occupation: string, heures: number) => ({
  id_pdc_itinerance: id, etat_pdc: etat, occupation_pdc: occupation,
  horodatage: new Date(Date.now() - heures * 3600_000)
    .toISOString().replace('T', ' ').replace('Z', '+00:00'),
});

test('UN POINT HORS SERVICE SE VOIT, ET SE LIT SANS LA COULEUR', async ({ page }) => {
  /* C'est la seule information de ce cartouche qui peut rendre le détour
     inutile — et la seule qui ne se périme pas comme une place occupée :
     mesuré, les trois quarts des points en panne ont été relevés il y a plus
     d'une semaine et le sont probablement encore. */
  const appels = await ficheAvecReleves(page, [
    releve('FRIOYE410255', 'en_service', 'libre', 16),
    releve('FRIOYE410256', 'hors_service', 'inconnu', 16),
  ]);
  const bloc = page.locator('fiche-borne .fb-etat');
  await expect(bloc.locator('.fb-alerte')).toContainText('HORS SERVICE',
    { timeout: 10_000 });
  await expect(bloc.locator('.fb-alerte')).toContainText('1 point');

  /* L'ÂGE EST ÉCRIT, ET IL EST INMANQUABLE : sans lui, une ligne « 1 libre »
     se lit « maintenant » — alors que le relevé date de la veille. */
  await expect(bloc).toContainText('il y a 16 h');
  await expect(bloc).toContainText('ne sont PAS en direct');

  /* UN SEUL APPEL, JAMAIS EN BOUCLE. Interroger « à intervalles en
     approchant », comme demandé, redemanderait la même valeur d'hier à un
     service public. */
  expect(appels).toHaveLength(1);
  expect(appels[0]).toContain('id_pdc_itinerance__in=FRIOYE410255,FRIOYE410256');
});

test('L’OCCUPATION SE DATE, ET DISPARAÎT PASSÉ UNE SEMAINE', async ({ page }) => {
  /* Au-delà de sept jours la valeur ne dit plus rien d'une place de parking,
     et l'afficher même datée inviterait à la lire. La PANNE, elle, reste. */
  await ficheAvecReleves(page, [
    releve('FRIOYE410255', 'hors_service', 'libre', 24 * 40),
    releve('FRIOYE410256', 'en_service', 'libre', 24 * 40),
  ]);
  const bloc = page.locator('fiche-borne .fb-etat');
  await expect(bloc).toContainText('il y a un mois', { timeout: 10_000 });
  await expect(bloc.locator('.fb-alerte')).toContainText('HORS SERVICE');
  await expect(bloc, 'une occupation d’il y a un mois ne se montre pas')
    .not.toContainText('Occupation ce jour-là');
});

test('SANS RELEVÉ, LA FICHE DIT DE QUI EST LE SILENCE', async ({ page }) => {
  /* Une rubrique muette se lit comme un oubli d'affichage. Mesuré autour du
     Plessis-Trévise : 14 points sur 40 seulement portent un relevé — c'est le
     fichier qui se tait, pas la carte, et il faut le dire. */
  await ficheAvecReleves(page, []);
  const bloc = page.locator('fiche-borne .fb-etat');
  await expect(bloc).toContainText('Aucun relevé public', { timeout: 10_000 });
  await expect(bloc).toContainText('pas de la carte');
});

test('LA FICHE NE PRÉTEND PLUS QU’AUCUNE SOURCE N’EXISTE', async ({ page }) => {
  /* Cette phrase était FAUSSE et IRVE-1 l'a établi : une source publique
     française diffuse bien l'état des points à l'échelle nationale. Se tromper
     dans ce sens-là revenait à cacher une donnée qui existe. */
  await ficheAvecReleves(page, []);
  const source = page.locator('fiche-borne .fb-source');
  await expect(source).toContainText('déposé par lots', { timeout: 10_000 });
  /* C'EST CETTE AFFIRMATION-LÀ QUI ÉTAIT FAUSSE — « aucune source ne la
     DIFFUSE » — et non le constat que l'occupation en direct n'existe pas.
     La nuance est tout le correctif : la donnée est publiée, elle n'est pas
     vivante. */
  await expect(source).not.toContainText('ne la diffuse à l’échelle nationale');
});
