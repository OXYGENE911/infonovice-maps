import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirPlanificateur } from './planificateur';

/* LES NOMS ACCESSIBLES DISENT LA FONCTION (AUDIT-1, 06/09/2026). L'audit
   Codex : « les trois combobox visibles portent le même nom accessible » et
   « le nom accessible de la carte indique des boutons de zoom en haut à
   droite alors que les commandes sont en bas à droite ». Un lecteur d'écran
   lit ce qu'on écrit : on écrit la vérité. */

test('la recherche, le départ et l’arrivée ont chacun leur nom ; la carte dit où sont ses commandes', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirPlanificateur(page);
  await expect(page.getByRole('combobox', { name: 'Rechercher une adresse en France' })).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'Adresse de départ' })).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'Adresse d’arrivée' })).toHaveCount(1);
  const carte = await page.locator('#carte').getAttribute('aria-label');
  expect(carte).toContain('en bas à droite');
  expect(carte).not.toContain('Zoomer, Dézoomer');
});

test('LE BOUTON D’INSTALLATION N’ÉCRASE PLUS LE CHAMP DE RECHERCHE (A11Y-CIBLE-1)', async ({ page }) => {
  /* Mesuré par Lighthouse le 07/09, sur son écran de référence de 412 px —
     le seul audit d'accessibilité en échec : « Target has insufficient size
     (22px by 34px, should be at least 24px by 24px) ». Le bouton
     « Installer l'application » ne se contentait pas de serrer le champ, il
     le RECOUVRAIT : champ 123–145, bouton 131–271. La règle qui fait céder
     la marque existait, mais sous 400 px — et le défaut vivait juste
     au-dessus. */
  await page.setViewportSize({ width: 412, height: 823 });
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  // Le navigateur propose l'installation : c'est le seul moment où le défaut paraît.
  await page.evaluate(() => { window.dispatchEvent(new Event('beforeinstallprompt')); });
  await expect(page.locator('.installer')).toBeVisible();

  const champ = (await page.locator('.entete recherche-adresse input').boundingBox())!;
  const bouton = (await page.locator('.installer').boundingBox())!;
  expect(Math.round(champ.width), `champ large de ${Math.round(champ.width)} px`).toBeGreaterThanOrEqual(24);
  expect(Math.round(champ.height)).toBeGreaterThanOrEqual(24);
  /* ET ILS NE SE TOUCHENT PAS : une cible tactile recouverte est pire qu'une
     petite — le doigt tombe sur le voisin sans que rien ne le dise. */
  expect(Math.round(champ.x + champ.width), 'le bouton recouvre le champ')
    .toBeLessThanOrEqual(Math.round(bouton.x));
});

test('AUCUN LIBELLÉ ANGLAIS NE TRAÎNE dans une carte française (LOCALE-FR-2)', async ({ page }) => {
  /* TROUVÉ EN TABULANT L'APPLICATION AU CLAVIER, comme le ferait un lecteur
     d'écran : le canevas se présentait « Map », et la croix d'une fiche
     « Close popup ». MapLibre parle anglais par défaut, et trois de nos clés
     de traduction nommaient une API disparue — elles ne servaient à rien
     sans que rien ne le dise. */
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/api-adresse.data.gouv.fr/**', (r) => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      properties: { label: 'Fnac Darty Ivry', context: '94, Val-de-Marne', type: 'housenumber', id: 'a', score: 0.9 },
      geometry: { type: 'Point', coordinates: [2.3901, 48.8234] },
    }] }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  // LE CANEVAS SE PRÉSENTE EN FRANÇAIS.
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toHaveAttribute('aria-label', 'Carte');

  // UNE FICHE OUVERTE : sa croix aussi.
  const champ = page.locator('.entete .recherche input');
  await champ.click();
  await champ.fill('fnac');
  await page.locator('.entete .recherche [role="option"]').first().click();
  await expect(page.locator('.fiche-destination')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.maplibregl-popup-close-button')).toHaveAttribute('aria-label', 'Fermer la fiche');

  /* ET RIEN D'AUTRE À L'ÉCRAN : on relit TOUS les noms accessibles plutôt que
     les deux qu'on vient de corriger — c'est la seule façon d'attraper le
     prochain oubli. */
  const anglais = await page.evaluate(() => {
    const motsAnglais = /\b(close popup|map marker|zoom in|zoom out|find my location|toggle attribution|enter fullscreen|exit fullscreen|map feedback)\b/i;
    return [...document.querySelectorAll('[aria-label], [title]')]
      .map((e) => `${e.tagName.toLowerCase()} « ${e.getAttribute('aria-label') ?? e.getAttribute('title')} »`)
      .filter((t) => motsAnglais.test(t));
  });
  expect(anglais, 'libellés MapLibre restés en anglais').toEqual([]);
});
