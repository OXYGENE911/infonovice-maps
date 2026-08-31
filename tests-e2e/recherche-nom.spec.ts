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
  },
};

const TOUR = {
  type: 'node', id: 5013364, lat: 48.8583, lon: 2.2944,
  tags: { tourism: 'attraction', name: 'Tour Eiffel' },
};

async function decor(page: import('@playwright/test').Page, options: {
  adresses?: unknown[]; lieux?: unknown[]; expiration?: boolean;
} = {}): Promise<{ ban: string[]; overpass: string[] }> {
  const ban: string[] = [];
  const overpass: string[] = [];
  await simulerTuiles(page);
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
  return { ban, overpass };
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
  expect(overpass).toHaveLength(1);
  expect(overpass[0]).toContain('["name"="Tour Eiffel Paris"]');
  expect(overpass[0]).not.toContain('~');
  expect(overpass[0]).toContain('around:25000,48.85840,2.29450');
});

test('UNE ADRESSE AVEC UN NUMÉRO NE DÉRANGE PAS OVERPASS', async ({ page }) => {
  /* LA FRUGALITÉ RESTE UNE RÈGLE : un numéro en tête, c'est la BAN qui
     répond, et le service bénévole n'a rien à faire là. */
  const { ban, overpass } = await decor(page, { adresses: [AVENUE_EIFFEL] });
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
  await expect(note).toContainText('écrit en entier');
});
