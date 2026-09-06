import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* UNE SEULE FICHE À LA FOIS SUR LA CARTE (POPUP-1, 03/09).
 *
 * ARMELIN, premier retour de la 1.60, capture à l'appui (FNAC DARTY et Disney
 * Village empilées) : « si je relance dans la foulée une autre requête, une
 * nouvelle fenêtre s'ouvre sur la carte et les anciennes fenêtres ne sont
 * jamais fermées. En pleine navigation, je peux croiser tous les gros
 * rectangles ouverts correspondant à une fenêtre de recherche précédente. Il
 * faudrait donc fermer automatiquement les fenêtres de recherche précédentes
 * quand on démarre une nouvelle recherche et d'effacer toutes les fenêtres
 * quand on démarre un nouvel itinéraire. »
 *
 * LA CAUSE : chaque sélection créait `new Popup(...)` sans rien retenir de la
 * précédente. Le MARQUEUR, lui, était bien remplacé — la fiche avait été
 * oubliée du même geste. */

const LIEUX: Record<string, [number, number]> = {
  fnac: [2.3901, 48.8234],
  disney: [2.777, 48.8697],
  paris: [2.3522, 48.8566],
  lyon: [4.8357, 45.764],
};

async function ouvrir(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const q = (new URL(route.request().url()).searchParams.get('q') ?? '').toLowerCase();
    const cle = q.includes('disney') ? 'disney' : (q.includes('lyon') ? 'lyon' : (q.includes('paris') ? 'paris' : 'fnac'));
    const nom = { fnac: 'Fnac Darty Ivry', disney: 'Disney Village', paris: 'Paris', lyon: 'Lyon' }[cle];
    return route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({
      features: [{
        geometry: { coordinates: LIEUX[cle] },
        properties: { label: nom, type: cle === 'paris' || cle === 'lyon' ? 'municipality' : 'housenumber', postcode: '', city: nom, score: 0.9 },
      }],
    }) });
  });
  await page.route('**/api-adresse.data.gouv.fr/reverse/**', (route) => route.fulfill({
    headers: cors, contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { coordinates: [2.33, 48.86] },
      properties: { label: '8 Rue de la Paix 75002 Paris', type: 'housenumber', postcode: '75002', city: 'Paris' },
    }] }),
  }));
  for (const motif of ['**/data.geopf.fr/geocodage/**', '**/recherche-entreprises.api.gouv.fr/**',
    '**overpass.openstreetmap.fr**', '**/data.education.gouv.fr/**',
    '**/api-lannuaire.service-public.fr/**']) {
    await page.route(motif, (route) => route.fulfill({
      headers: cors, contentType: 'application/json',
      body: JSON.stringify({ features: [], results: [], elements: [] }),
    }));
  }
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    headers: cors, contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

async function chercher(page: Page, texte: string, option: string): Promise<void> {
  const champ = page.locator('.entete .recherche input');
  await champ.click();
  await champ.fill(texte);
  await page.locator('.entete .recherche [role="option"]').filter({ hasText: option }).first().click();
  await expect(page.locator('.fiche-destination .pa-libelle').last()).toHaveText(option, { timeout: 10_000 });
}

test('UNE SECONDE RECHERCHE FERME LA FICHE DE LA PREMIÈRE', async ({ page }) => {
  /* C'est mot pour mot la capture d'Armelin : FNAC DARTY restait ouverte sous
     Disney Village. */
  await ouvrir(page);
  await chercher(page, 'fnac darty', 'Fnac Darty Ivry');
  await expect(page.locator('.maplibregl-popup')).toHaveCount(1);

  await chercher(page, 'disney village', 'Disney Village');
  await expect(page.locator('.maplibregl-popup'), 'l’ancienne fiche doit être fermée')
    .toHaveCount(1);
  await expect(page.locator('.fiche-destination .pa-libelle')).toHaveText('Disney Village');
});

test('L’APPUI LONG FERME AUSSI LA FICHE DE RECHERCHE — une seule surface', async ({ page }) => {
  await ouvrir(page);
  await chercher(page, 'fnac darty', 'Fnac Darty Ivry');

  const canevas = page.locator('#carte canvas.maplibregl-canvas');
  const cadre = await canevas.boundingBox();
  await page.mouse.move(cadre!.x + 400, cadre!.y + 300);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('.pa-libelle').last()).toContainText('8 Rue de la Paix', { timeout: 10_000 });
  await expect(page.locator('.maplibregl-popup')).toHaveCount(1);
});

test('LE DÉPART D’UN ITINÉRAIRE EFFACE TOUTES LES FICHES — on regarde la route', async ({ page }) => {
  /* « effacer toutes les fenêtres quand on démarre un nouvel itinéraire en
     mode navigation » — la seconde moitié de sa demande. */
  await ouvrir(page);
  await chercher(page, 'fnac darty', 'Fnac Darty Ivry');
  await expect(page.locator('.maplibregl-popup')).toHaveCount(1);

  await page.locator('.iti > summary').click();
  const champs = page.locator('.vue-accueil input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');
  await page.getByRole('option', { name: 'Lyon' }).first().click();
  await expect(page.locator('.iti-resultat')).toContainText('km', { timeout: 10_000 });

  await expect(page.locator('.maplibregl-popup'), 'les fiches doivent être effacées')
    .toHaveCount(0);
});

test('LA CROIX FERME ENCORE, et ne laisse pas de fantôme derrière elle', async ({ page }) => {
  /* Le registre retient les fiches ouvertes : une fiche fermée à la main doit
     en sortir, sans quoi on garderait des références mortes. */
  await ouvrir(page);
  await chercher(page, 'fnac darty', 'Fnac Darty Ivry');
  await page.locator('.maplibregl-popup-close-button').click();
  await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
  // Et une nouvelle recherche rouvre normalement.
  await chercher(page, 'disney village', 'Disney Village');
  await expect(page.locator('.maplibregl-popup')).toHaveCount(1);
});

test('LA FICHE SE POSE SOUS L’EN-TÊTE — sa croix reste cliquable (FICHE-SOUS-ENTETE)', async ({ page }) => {
  /* Vu sur la CI le 06/09 : la fiche monte depuis le point centré par le
     « voler vers » de la recherche ; sur un écran bas (720 px), son haut —
     et la croix qui y vit — passait SOUS l'en-tête fixe, qui recouvre la
     carte sans que MapLibre le sache. Le contrat : une fois le vol fini, le
     haut de la fiche est sous le bas de l'en-tête, et la croix ferme. */
  await ouvrir(page);
  await chercher(page, 'fnac darty', 'Fnac Darty Ivry');
  /* ON MESURE LA CARTE ARRÊTÉE : pendant le vol, la fiche suit le point et
     passe par des positions où tout va bien — un `poll` réussissait à mi-
     course, puis la croix finissait sous l'en-tête (payé le 06/09). */
  type Fenetre = { __carte: { isMoving(): boolean } };
  await page.waitForFunction(() => !(window as unknown as Fenetre).__carte.isMoving(), null, { timeout: 15_000 });
  const e = (await page.locator('.entete').boundingBox())!;
  const f = (await page.locator('.maplibregl-popup-content').boundingBox())!;
  expect(Math.round(f.y - (e.y + e.height)), `haut de la fiche à ${Math.round(f.y)} px, bas de l’en-tête à ${Math.round(e.y + e.height)} px`)
    .toBeGreaterThanOrEqual(0);
  const croix = page.locator('.maplibregl-popup-close-button');
  const boite = (await croix.boundingBox())!;
  // Ce qui est SOUS le doigt, à la croix, doit être la croix — pas l'en-tête.
  const dessus = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.className ?? '', [boite.x + boite.width / 2, boite.y + boite.height / 2]);
  expect(dessus, 'la croix est recouverte').toContain('maplibregl-popup-close-button');
  await croix.click();
  await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
});
