import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { allerA } from './planificateur';

/* LES RELEVÉS QUI TIENNENT LEUR PROMESSE (RELEVÉS-1, 31/08).
 *
 * CE QUE CES PARCOURS DÉFENDENT : qu'une expiration d'Overpass ne se lise
 * JAMAIS « zéro ». C'est le défaut qu'Armelin a rencontré — « les feux n'ont
 * pas pu être relevés […] idem pour les péages » — et sa forme silencieuse
 * était pire encore : un trajet annoncé sans péage là où il en traverse
 * quarante-huit.
 *
 * TROIS CAUSES, MESURÉES le 31/08 sur Paris–Marseille : une requête unique
 * qui épuisait le budget du service, un client qui abandonnait AVANT le
 * serveur, et un `remark` d'expiration que personne ne lisait. */

/** La réponse d'un Overpass qui a renoncé : vide, avec son aveu. */
const EXPIRATION = {
  version: 0.6,
  elements: [],
  remark: 'runtime error: Query timed out in "query" at line 1 after 26 seconds.',
};

const TRACE = {
  type: 'LineString',
  // Paris → Marseille : assez long pour être découpé en plusieurs tronçons.
  coordinates: [[2.3522, 48.8566], [4.8357, 45.764], [5.3698, 43.2965]],
};

async function trajet(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ geometry: TRACE, distance: 775_000, duration: 29_000 }),
  }));
  await page.goto('/#iti=2.35220,48.85660;5.36980,43.29650;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('km', { timeout: 15_000 });
  await allerA(page, 'options');
}

test('UNE EXPIRATION NE SE LIT PAS « aucun péage »', async ({ page }) => {
  /* LE DÉFAUT EXACT : Overpass qui renonce rend `elements: []` AVEC un
     `remark`. Sans le lire, on affichait « aucune gare de péage » sur un
     trajet qui en traverse quarante-huit. Un chiffre faux est pire qu'un
     aveu — celui-ci ne coûte qu'une phrase. */
  await trajet(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: JSON.stringify(EXPIRATION),
  }));
  await page.getByRole('button', { name: 'Relever les péages du trajet' }).click();
  const corps = page.locator('.iti-peages-corps');
  /* CE QUI EST DÉFENDU N'EST PAS UNE FORMULE, C'EST UNE VÉRITÉ : que le
     panneau AVOUE au lieu de compter zéro. Quand tout expire, « pas
     disponibles » dit déjà la bonne chose ; quand une partie répond, c'est
     « n'a pas abouti ». Les deux sont honnêtes, et le parcours accepte les
     deux — figer la phrase aurait défendu ma rédaction, pas l'usager. */
  await expect(corps).toContainText(/pas disponibles|n’a pas abouti/, { timeout: 60_000 });
  await expect(corps, 'une expiration ne doit JAMAIS s’annoncer comme un trajet sans péage')
    .not.toContainText('Aucune gare');
});

test('UN RELEVÉ PARTIEL S’ANNONCE COMME UN MINIMUM', async ({ page }) => {
  /* Un tronçon répond, un autre renonce : le total est vrai mais incomplet.
     Le dire, c'est la différence entre un chiffre et un mensonge. */
  await trajet(page);
  let appels = 0;
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    appels += 1;
    // Le premier tronçon répond, les suivants expirent.
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify(appels === 1 ? {
        elements: [{
          type: 'node', id: 1, lat: 48.8566, lon: 2.3522,
          tags: { barrier: 'toll_booth', name: 'Gare de Fleury' },
        }],
      } : EXPIRATION),
    });
  });
  await page.getByRole('button', { name: 'Relever les péages du trajet' }).click();
  const corps = page.locator('.iti-peages-corps');
  await expect(corps).toContainText('Gare de Fleury', { timeout: 60_000 });
  await expect(corps, 'un compte incomplet doit se dire incomplet')
    .toContainText('minimum');
});

test('LE TRAJET EST DÉCOUPÉ — plus jamais une requête pour tout', async ({ page }) => {
  /* LA PREMIÈRE CAUSE : un couloir de 775 km épuise le budget d'Overpass
     (26 s puis rien, mesuré). Par tronçons, les mêmes péages arrivent en
     7,7 s. On vérifie donc qu'il Y A plusieurs requêtes — et qu'aucune ne
     porte le couloir entier. */
  await trajet(page);
  const corps: string[] = [];
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    corps.push(decodeURIComponent(route.request().url()));
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json', body: '{"elements":[]}',
    });
  });
  await page.getByRole('button', { name: 'Relever les péages du trajet' }).click();
  await expect(page.locator('.iti-peages-corps'))
    .toContainText('Aucune gare', { timeout: 60_000 });
  expect(corps.length, 'un long trajet doit être découpé').toBeGreaterThan(1);
  for (const u of corps) {
    // L'EMPRISE A REMPLACÉ LE COULOIR : c'est lui qui expirait.
    expect(u).not.toContain('around:');
    expect(u).toContain('"barrier"="toll_booth"');
  }
});

test('UNE EXPIRATION DES FEUX NE SE LIT PAS « aucun feu »', async ({ page }) => {
  await trajet(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: JSON.stringify(EXPIRATION),
  }));
  await page.locator('.iti-feux-carte').check();
  const note = page.locator('.iti-feux-corps');
  await expect(note).toContainText(/n’ont pas pu être relevés|n’a pas abouti/, { timeout: 60_000 });
  await expect(note, 'un boulevard ne doit pas paraître dégagé parce que le service a renoncé')
    .not.toContainText('Aucun feu tricolore relevé');
});

test('L’ATTENTE SE COMPTE EN TRONÇONS', async ({ page }) => {
  /* Un relevé de deux minutes derrière un témoin muet passe pour une panne —
     le même retour de terrain que pour les lieux d'exception le 29/08. */
  await trajet(page);
  await page.route('**overpass.openstreetmap.fr**', async (route) => {
    await new Promise((r) => { setTimeout(r, 900); });
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json', body: '{"elements":[]}',
    });
  });
  await page.getByRole('button', { name: 'Relever les péages du trajet' }).click();
  await expect(page.locator('.iti-peages-corps'))
    .toContainText(/tronçons? sur \d+/, { timeout: 30_000 });
});
