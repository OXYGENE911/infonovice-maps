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
  reseau?: string; acces?: string; pdc?: number;
}

const ligneIndex = (st: Station, i: number): Record<string, unknown> => ({
  id_station_itinerance: `FRTEST${i}`,
  nom_station: st.nom,
  nom_enseigne: st.reseau ?? 'Réseau d’essai',
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
  { nom: 'Ionity Beaune', lon: 4.84, lat: 47.02, p: 350, reseau: 'Ionity', pdc: 6 },
  { nom: 'Ionity Mâcon', lon: 4.83, lat: 46.31, p: 350, reseau: 'Ionity' },
  { nom: 'Tesla Nemours', lon: 2.69, lat: 48.26, p: 250, reseau: 'Tesla' },
  { nom: 'Tesla Auxerre', lon: 3.57, lat: 47.80, p: 250, reseau: 'Tesla' },
  { nom: 'Engie Lille', lon: 3.06, lat: 50.63, p: 150, reseau: 'ENGIE Vianeo' },
  { nom: 'Flotte municipale', lon: 5.37, lat: 43.30, p: 50, reseau: 'Ville',
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
  await expect(etat).toContainText('stations rapides', { timeout: 20_000 });
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
  await expect(page.locator('.poi-etat')).toContainText('stations rapides', { timeout: 20_000 });
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
  await expect(page.locator('.poi-etat')).toContainText('2 stations rapides');
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
  await expect(fiche).toContainText('vous ne pourrez pas y recharger librement');
  // Le numéro de l'exploitant : on le cherche quand la borne refuse de démarrer.
  await expect(fiche.locator('.fb-tel')).toHaveText('+33 4 91 00 00 00');
  await expect(fiche.locator('.fb-tel')).toHaveAttribute('href', 'tel:+33491000000');
  await expect(fiche).toContainText('Mo-Fr 08:00-18:00');
  // Ce qu'il ignore est écrit : sans quoi le blanc passe pour un oubli.
  await expect(fiche).toContainText('Occupation en direct indisponible');
  await expect(fiche).toContainText('Aucun tarif déclaré');

  // Échap referme, comme partout ailleurs.
  await page.keyboard.press('Escape');
  await expect(fiche).toBeHidden();
});
