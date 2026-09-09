import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LA FAUTE DE FRAPPE (FRAPPE-1, 09/09/2026).
 *
 * Le retour du 04/09 : « à un caractère près, l'adresse est introuvable ».
 * LA MESURE DIT AUTRE CHOSE — 22 adresses réelles vérifiées auprès du service,
 * 72 variantes d'une faute : 94 % rendent la bonne adresse AU PREMIER RANG.
 * Il n'y avait donc pas de correcteur à écrire.
 *
 * MAIS LES 6 % QUI RESTENT ÉCHOUENT EN SILENCE, et c'est cela qui blesse.
 * « Place Kléer » à Strasbourg rend cinq VRAIES rues de Strasbourg — Heckler,
 * Geiler, Cuvier, Herder, Doller — dont aucune ne s'appelle Kléber. Rien ne le
 * dit. On choisit la première, et l'on part ailleurs.
 *
 * CES PARCOURS REJOUENT LES RÉPONSES RÉELLES du service, relevées le 09/09.
 */

const KLEER = [
  '1 Rue Heckler 67000 Strasbourg', 'Rue Geiler 67000 Strasbourg',
  '1 Rue Cuvier 67000 Strasbourg', '1 Rue Herder 67000 Strasbourg',
  '1 Rue de la Doller 67000 Strasbourg',
];

/** Le service simulé : il rend les libellés qu'on lui donne, dans l'ordre. */
async function simulerBAN(page: Page, labels: string[]): Promise<void> {
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      features: labels.map((label, i) => ({
        geometry: { coordinates: [7.75 + i * 0.001, 48.58] },
        properties: {
          label, type: 'housenumber', score: 0.56 - i * 0.01,
          city: 'Strasbourg', postcode: '67000', context: '67, Bas-Rhin',
          name: label.replace(/^\d+ /, '').replace(/ \d{5}.*$/, ''),
        },
      })),
    }),
  }));
}

async function taper(page: Page, texte: string): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  const champ = page.locator('recherche-adresse input').first();
  await champ.click();
  await champ.fill(texte);
}

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  /* Les autres services de la recherche par nom restent muets : ce parcours
     juge la liste d'adresses, pas la recherche de lieux. */
  await page.route('**overpass**', (route) => route.fulfill({
    contentType: 'application/json', body: '{"elements":[]}',
  }));
});

test('QUAND AUCUNE SUGGESTION NE REPREND LA SAISIE, LA RECHERCHE LE DIT', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simulerBAN(page, KLEER);
  await taper(page, '1 Place Kléer 67000 Strasbourg');

  const mot = page.locator('.recherche-a-cote');
  await expect(mot).toBeVisible({ timeout: 10_000 });
  await expect(mot).toContainText('orthographe');
  /* ON NE DIT PAS « aucun résultat » : il y en a cinq, ils sont sous les yeux,
     et le nier passerait pour une panne du service. */
  await expect(mot).not.toContainText(/aucun résultat/i);

  /* LES SUGGESTIONS RESTENT. On n'efface pas la liste : parmi cinq rues de la
     bonne ville, il y a peut-être celle qu'on cherchait sous un autre nom.
     C'est un avertissement, pas une censure. */
  await expect(page.locator('ul[role="listbox"] li')).toHaveCount(5);

  /* ELLE EST AU-DESSUS DE LA LISTE, et c'est le point : sous cinq suggestions,
     sur un téléphone, elle serait hors de l'écran au moment où l'on choisit.
     « Toute fonction cachée à l'utilisateur est une fonction inutilisable. » */
  const ligne = await mot.boundingBox();
  const premier = await page.locator('ul[role="listbox"] li').first().boundingBox();
  expect(ligne!.y + ligne!.height).toBeLessThanOrEqual(premier!.y + 1);
  expect(ligne!.y, 'l’avertissement est sous le pli').toBeLessThan(844);
});

test('ELLE SE TAIT QUAND LE SERVICE A RATTRAPÉ LA FAUTE — le cas des 94 %', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  /* « Kléebr » : une inversion de deux lettres, la faute la plus banale qui
     soit. Le service rend Kléber, et il a raison — l'accuser serait un
     contresens. C'est ce cas qui a imposé Damerau plutôt que Levenshtein :
     une inversion vaut UNE faute, pas deux. */
  await simulerBAN(page, ['1 Place Kléber 67000 Strasbourg', ...KLEER.slice(0, 4)]);
  await taper(page, '1 Place Kléebr 67000 Strasbourg');

  await expect(page.locator('ul[role="listbox"] li').first())
    .toContainText('Kléber', { timeout: 10_000 });
  await expect(page.locator('.recherche-a-cote')).toBeHidden();
});

test('ET ELLE SE TAIT PENDANT QU’ON TAPE — sans quoi elle serait un bruit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simulerBAN(page, ['1 Place Kléber 67000 Strasbourg']);
  await taper(page, '1 Place Kle');

  /* LE PRÉFIXE EST UNE CORRESPONDANCE : « Kle » n'est pas à côté de « Kléber »,
     il est en avance. Le score du service, lui, tombe sous le seuil sur 13 %
     des saisies en cours — un avertissement accroché au score crierait
     pendant la frappe, et l'on apprendrait à ne plus le lire. */
  await expect(page.locator('ul[role="listbox"] li').first())
    .toContainText('Kléber', { timeout: 10_000 });
  await expect(page.locator('.recherche-a-cote')).toBeHidden();

  // Et la saisie finie, toujours juste : rien à dire non plus.
  await page.locator('recherche-adresse input').first().fill('1 Place Kléber 67000 Strasbourg');
  await expect(page.locator('.recherche-a-cote')).toBeHidden();
});

test('L’AVERTISSEMENT S’EFFACE DÈS QUE LA SAISIE REDEVIENT JUSTE', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let bonnes = false;
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const labels = bonnes ? ['1 Place Kléber 67000 Strasbourg'] : KLEER;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      features: labels.map((label, i) => ({
        geometry: { coordinates: [7.75 + i * 0.001, 48.58] },
        properties: { label, type: 'housenumber', score: 0.56, city: 'Strasbourg',
          postcode: '67000', context: '67, Bas-Rhin',
          name: label.replace(/^\d+ /, '').replace(/ \d{5}.*$/, '') },
      })),
    }) });
  });
  await taper(page, '1 Place Kléer 67000 Strasbourg');
  await expect(page.locator('.recherche-a-cote')).toBeVisible({ timeout: 10_000 });

  /* UN AVERTISSEMENT QUI RESTE APRÈS CORRECTION EST PIRE QUE PAS
     D'AVERTISSEMENT : il ferait douter d'une saisie juste. */
  bonnes = true;
  await page.locator('recherche-adresse input').first().fill('1 Place Kléber 67000 Strasbourg');
  await expect(page.locator('ul[role="listbox"] li').first())
    .toContainText('Kléber', { timeout: 10_000 });
  await expect(page.locator('.recherche-a-cote')).toBeHidden();
});
