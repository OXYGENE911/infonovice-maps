import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE CARTOUCHE NE MANGE PLUS LA FRISE DU TRAJET (BANDEAU-1, 01/09).
 *
 * LE TERRAIN. Armelin, après un essai à pied, capture à l'appui : « à l'aller,
 * le panneau d'indication du trajet affichait un message de fonction non
 * disponible "Repères OpenStreetMap indisponibles…". Quand ce message arrive,
 * le panneau occupe une grande surface et masque la barre verticale de
 * visualisation du trajet. »
 *
 * DEUX CAUSES, ET IL FALLAIT LES DEUX. Le cartouche allait jusqu'à 12 px du
 * bord droit, là où la frise vit à 10 px sur 18 px de large : il la
 * recouvrait PAR CONSTRUCTION, message ou pas. Et l'aveu des repères, deux
 * lignes de texte, le faisait grandir — donc en couvrait davantage.
 *
 * L'AVEU SUIT DÉSORMAIS LA RÈGLE QU'ARMELIN A ÉNONCÉE pour ce genre
 * d'information (« à l'identique de la ligne info trafic orange ») : il se lit
 * au dépliage, pas en roulant. */

/** Une route assez longue pour que la frise ait un sens. */
const ROUTE: [number, number][] = Array.from({ length: 200 }, (_, i) => [
  2.35 + i * 0.0004,
  48.85 + Math.sin(i / 11) * 0.0012,
]);

async function enSuivi(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  /* LES REPÈRES SONT INTROUVABLES, ET C'EST LE SUJET.
     LE SERVICE TOMBE, IL NE REND PAS UNE LISTE VIDE : c'est la distinction que
     fait l'application, et elle est juste — une route sans limite de vitesse
     cartographiée n'est pas une route dont on n'a PAS PU lire les repères.
     L'aveu ne se déclenche donc que sur un échec, et c'est un échec qu'il
     faut simuler pour le voir. */
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    status: 504,
    contentType: 'application/json',
    body: JSON.stringify({ elements: [] }),
  }));
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    if (/resource=bdtopo-pgr/.test(route.request().url())) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    /* LE CARTOUCHE N'EXISTE QU'AVEC UNE MANŒUVRE À ANNONCER : sans `steps`,
       il reste caché et ces parcours mesureraient une boîte invisible. */
    if (/getSteps=true/i.test(route.request().url())) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          geometry: { type: 'LineString', coordinates: ROUTE },
          distance: 9_000, duration: 700,
          portions: [{ steps: [
            { instruction: { type: 'depart' }, distance: 4_000,
              attributes: { name: { nom_1_gauche: 'AVENUE DU PARC DE LA LANDE' } } },
            { instruction: { type: 'turn', modifier: 'right' }, distance: 5_000,
              attributes: { name: { nom_1_gauche: 'AVENUE DU PARC DE LA LANDE' } } },
          ] }],
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: ROUTE },
        distance: 9_000, duration: 700,
      }),
    });
  });
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  const d = ROUTE[0]!; const a = ROUTE[ROUTE.length - 1]!;
  await page.goto(`/#iti=${d[0].toFixed(5)},${d[1].toFixed(5)};`
    + `${a[0].toFixed(5)},${a[1].toFixed(5)};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('.bg-cartouche')).toBeVisible({ timeout: 15_000 });
  /* ET L'AVEU EST BIEN ARMÉ : la panne du corridor l'a déclaré, comme sur le
     terrain. On l'ATTEND plutôt que de le poser à la main — ce qui prouve au
     passage que cette panne le déclenche vraiment, plutôt que de supposer le
     câblage. */
  await expect.poll(() => page.evaluate(() => {
    const p = document.querySelector('.bg-reperes') as HTMLElement | null;
    return p !== null && !p.hidden;
  }), { timeout: 20_000 }).toBe(true);
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: ROUTE[0]![0], latitude: ROUTE[0]![1] });
});

test.use({ viewport: { width: 390, height: 780 } });

test('L’AVEU DES REPÈRES NE PARAÎT QU’AU DÉPLIAGE', async ({ page }) => {
  await enSuivi(page);

  /* REPLIÉ — ET C'EST L'ÉTAT PAR DÉFAUT, celui du conducteur : le message
     existe dans la page, il ne prend pas l'écran. */
  const aveu = page.locator('.bg-reperes');
  await expect(aveu).toBeHidden();

  // DÉPLIÉ : il est là, entier, à un geste de distance.
  await page.locator('.bg-deplier').click();
  await expect(aveu).toBeVisible({ timeout: 5_000 });
  await expect(aveu).toContainText('Repères OpenStreetMap indisponibles');
  await expect(aveu).toContainText('limite de vitesse');
});

test('LE CARTOUCHE LAISSE SA COLONNE À LA FRISE DU TRAJET', async ({ page }) => {
  await enSuivi(page);
  // Déplié : le cartouche est à son plus HAUT, le pire cas pour la frise.
  await page.locator('.bg-deplier').click();
  await expect(page.locator('.bg-reperes')).toBeVisible({ timeout: 5_000 });

  const frise = await page.locator('.bg-frise').boundingBox();
  test.skip(frise === null, 'la frise n’est pas affichée sur ce trajet');
  const cartouche = (await page.locator('.bg-cartouche').boundingBox())!;

  /* LE CARTOUCHE S'ARRÊTE AVANT LA FRISE. On compare des bords, pas des
     apparences : c'est le recouvrement qu'Armelin a photographié, et il se
     mesure au pixel. */
  expect(cartouche.x + cartouche.width,
    'le cartouche d’instruction recouvre la frise du trajet')
    .toBeLessThanOrEqual(frise!.x + 1);

  /* ET LES DEUX SE CHEVAUCHENT BIEN EN HAUTEUR : sans cela, la comparaison
     ci-dessus serait vraie sans rien prouver — deux boîtes à des étages
     différents ne se recouvrent jamais, quelle que soit leur largeur. */
  const memeEtage = cartouche.y < frise!.y + frise!.height
    && frise!.y < cartouche.y + cartouche.height;
  expect(memeEtage, 'garde de non-vacuité : les deux boîtes doivent se croiser')
    .toBe(true);
});
