import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE CONTRAT DE ROUTE (CONTRAT-1, 09/09/2026).
 *
 * L'audit du 06/09, volet Maps : « contrat de route commun (points raccordés,
 * provenance) ». Le guidage vit de DEUX appels séparés — l'un rend la
 * géométrie et les totaux, l'autre les instructions — et rien ne vérifiait
 * qu'ils décrivent la même route. Mesuré le 09/09 sur le service réel : deux
 * demandes qui ne diffèrent que par l'optimisation rendent 465,6 km et
 * 448,1 km pour le même Paris–Lyon. Une feuille prise sur l'une et posée sur
 * le tracé de l'autre décale l'instruction de dix-sept kilomètres, en
 * silence, à cent trente à l'heure.
 *
 * CE PARCOURS FABRIQUE EXACTEMENT CE DÉSACCORD, puis regarde ce que
 * l'application EN FAIT. Le point n'est pas qu'elle le détecte en interne :
 * c'est qu'elle le DISE et qu'elle cesse de donner des consignes fausses.
 * « Toute fonction cachée à l'utilisateur est une fonction inutilisable. » */

/* Trente kilomètres plein est, comme le parcours des aires. */
const TRACE: [number, number][] = Array.from({ length: 61 }, (_, i) => [3.5 + i * 0.0068, 47.8]);
const DEPART = TRACE[0]!;
const FIN = TRACE[60]!;

/** Une feuille de route dont les étapes totalisent `total` mètres. */
function feuille(total: number): string {
  return JSON.stringify({
    geometry: { type: 'LineString', coordinates: TRACE },
    distance: total, duration: 1_000,
    portions: [{ steps: [
      { distance: total * 0.4, duration: 400, instruction: { type: 'depart' }, attributes: {} },
      { distance: total * 0.4, duration: 400, instruction: { type: 'turn', modifier: 'right' }, attributes: {} },
      { distance: total * 0.2, duration: 200, instruction: { type: 'arrive' }, attributes: {} },
    ] }],
  });
}

/**
 * Démarre un suivi ; `totalFeuille` est la distance que rend l'appel AUX
 * ÉTAPES, celui qui porte `getSteps`. Le tracé, lui, fait toujours 30 km.
 */
async function suivre(page: Page, totalFeuille: number): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ longitude: DEPART[0], latitude: DEPART[1] });
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe = (c) => {
      rappel?.({ coords: { accuracy: 5, altitude: null, altitudeAccuracy: null, ...c } });
    };
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: (ok: (p: unknown) => void) => { rappel = ok; return 1; },
        clearWatch: () => { rappel = null; },
        getCurrentPosition: (ok: (p: unknown) => void) => { rappel = ok; },
      },
    });
  });
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (/resource=bdtopo-pgr/.test(url)) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    /* LA SEULE DIFFÉRENCE ENTRE LES DEUX APPELS EST `getSteps` : c'est
       précisément pour cela qu'on peut leur faire dire deux choses. */
    if (/getSteps=true/.test(url)) {
      return route.fulfill({ contentType: 'application/json', body: feuille(totalFeuille) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: TRACE }, distance: 30_000, duration: 1_000,
    }) });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.goto(`/#iti=${DEPART[0]},${DEPART[1]};${FIN[0]},${FIN[1]};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
  await rouler(page, DEPART[0]);
}

async function rouler(page: Page, lon: number): Promise<void> {
  await page.evaluate((lo) => {
    (window as unknown as { __pousserFixe: (c: object) => void })
      .__pousserFixe({ longitude: lo, latitude: 47.8, speed: 25, heading: 90 });
  }, lon);
  await page.waitForTimeout(700);
}

test('UNE FEUILLE QUI CONCORDE EST SUIVIE : les instructions paraissent, sans alerte', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  /* Trente kilomètres de tracé, trente kilomètres d'étapes : le cas normal,
     et celui qu'on mesure sur le service réel — moins de 0,5 m d'écart. */
  await suivre(page, 30_000);
  await expect(page.locator('.bg-contrat-mot')).toBeHidden();

  /* LE CARTOUCHE NE PARAÎT QU'À L'APPROCHE (260 m) : on roule jusqu'à la
     première manœuvre, au tiers du trajet, et l'on regarde ce qu'il dit. */
  await rouler(page, 3.5 + 23.7 * 0.0068);
  const cartouche = page.locator('.bg-cartouche');
  await expect(cartouche).toBeVisible({ timeout: 10_000 });
  await expect(cartouche.locator('.bg-instruction')).toHaveText('Tournez à droite');
});

test('UNE FEUILLE QUI NE CONCORDE PAS EST ÉCARTÉE, ET LE BANDEAU DIT POURQUOI', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  /* Vingt kilomètres d'étapes sur trente kilomètres de tracé : un tiers
     d'écart, l'ordre de grandeur du désaccord fastest/shortest mesuré. */
  await suivre(page, 20_000);

  /* 1. ON LE DIT. Un bandeau muet sur ce qu'il ne fait pas laisserait croire
        qu'il n'y avait rien à dire — l'usager attendrait une consigne qui ne
        viendra jamais, et prendrait la sortie au jugé. */
  const mot = page.locator('.bg-contrat-mot');
  await expect(mot).toBeVisible({ timeout: 10_000 });
  await expect(mot).toContainText('écartées');

  /* 2. ON NE GUIDE PLUS FAUX. Là où le trajet concordant annonçait « Tournez
        à droite », il n'y a plus RIEN à annoncer : pas de manœuvre, donc pas
        de cartouche — et surtout pas une consigne prise sur une autre route. */
  await rouler(page, 3.5 + 23.7 * 0.0068);
  await expect(page.locator('.bg-cartouche')).toBeHidden();
  /* ET L'AVERTISSEMENT TIENT : il ne s'efface pas au premier fixe GPS, ce qui
     serait pire que de ne rien dire — l'usager aurait vu passer une phrase
     sans pouvoir la relire. */
  await expect(mot).toBeVisible();

  /* 3. ET LE RESTE DU SUIVI TIENT. Écarter la feuille n'éteint pas le
        guidage : la distance restante et l'heure d'arrivée viennent du tracé,
        qui n'a jamais été mis en doute. C'est tout l'intérêt de n'écarter que
        ce qui est douteux. */
  await expect(page.locator('bandeau-guidage')).toBeVisible();
  await expect(page.locator('.bg-restant')).toContainText('km');
});

/* Le détour du bis : la même course, un kilomètre plus au nord. */
const DETOUR: [number, number][] = Array.from(
  { length: 61 }, (_, i) => [3.5 + i * 0.0068, 47.81] as [number, number],
);

test('APRÈS UN ITINÉRAIRE BIS, LA FEUILLE DE ROUTE DÉCRIT LE DÉTOUR — pas la '
  + 'route d’avant (le bug que ce contrat a mis au jour)', async ({ page }) => {
  /* CE QUI SE PASSAIT. Le point latéral qui force la divergence entrait dans
     la REQUÊTE du tracé, mais pas dans le cliché du calcul (BIS-2 le voulait
     ainsi, pour de bonnes raisons : rangé dans les étapes, il paraissait dans
     la liste et s'empilait). Or la feuille de route se reconstruit depuis ce
     cliché. Elle repartait donc SANS le via, c'est-à-dire sur la route qu'on
     venait justement de quitter — pendant que la carte dessinait le détour.
     Personne ne pouvait le voir : les deux étaient également plausibles.

     CE PARCOURS NE JUGE PAS UN AFFICHAGE, IL JUGE CE QUI PART. Le mock note
     chaque URL ; la question est de savoir si la demande d'instructions porte
     le même point intermédiaire que la demande de tracé. */
  await page.setViewportSize({ width: 390, height: 844 });
  const urls: string[] = [];
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ longitude: DEPART[0], latitude: DEPART[1] });
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe = (c) => {
      rappel?.({ coords: { accuracy: 5, altitude: null, altitudeAccuracy: null,
        speed: 25, heading: 90, ...c } });
    };
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: (ok: (p: unknown) => void) => { rappel = ok; return 1; },
        clearWatch: () => { rappel = null; },
        getCurrentPosition: (ok: (p: unknown) => void) => { rappel = ok; },
      },
    });
  });
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = decodeURIComponent(route.request().url());
    urls.push(url);
    if (/resource=bdtopo-pgr/.test(url)) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    const parLeVia = /intermediates=/.test(url);
    const trace = parLeVia ? DETOUR : TRACE;
    /* Deux chiffres qui ne se confondent pas une fois arrondis. */
    const distance = parLeVia ? 44_000 : 30_000;
    if (/getSteps=true/.test(url)) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: trace },
        distance, duration: 1_000,
        portions: [{ steps: [
          { distance: distance * 0.4, duration: 400, instruction: { type: 'depart' }, attributes: {} },
          { distance: distance * 0.4, duration: 400, instruction: { type: 'turn', modifier: 'right' }, attributes: {} },
          { distance: distance * 0.2, duration: 200, instruction: { type: 'arrive' }, attributes: {} },
        ] }],
      }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: trace }, distance, duration: 1_000,
    }) });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));

  await page.goto(`/#iti=${DEPART[0]},${DEPART[1]};${FIN[0]},${FIN[1]};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
  await rouler(page, DEPART[0]);

  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  await page.getByRole('button', { name: 'Chercher un itinéraire bis' }).click();
  await expect(page.locator('.bg-bis-mot')).toContainText('Itinéraire bis', { timeout: 20_000 });

  /* LE TRACÉ ADOPTÉ EST CELUI DU DÉTOUR : sa distance le dit. */
  await expect(page.locator('.iti-resultat')).toContainText('44 km', { timeout: 20_000 });

  /* ET LA DEMANDE D'INSTRUCTIONS PORTE LE MÊME VIA. C'est tout le procès :
     avant la correction, aucune URL ne pouvait porter à la fois `getSteps` et
     un point intermédiaire — la feuille repartait toujours sans le détour. */
  await expect.poll(
    () => urls.filter((u) => /getSteps=true/.test(u) && /intermediates=/.test(u)).length,
    { message: 'la feuille de route est repartie sans le via du bis', timeout: 20_000 },
  ).toBeGreaterThan(0);

  /* ET RIEN N'A ÉTÉ ÉCARTÉ : les deux appels concordent, donc les
     instructions restent. Le contrat n'est pas là pour tout jeter. */
  await expect(page.locator('.bg-contrat-mot')).toBeHidden();
});
