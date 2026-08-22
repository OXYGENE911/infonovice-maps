import type { Page } from '@playwright/test';

/* LES TUILES IGN SONT SIMULÉES EN E2E — pour deux raisons qui n'en font
   qu'une : la CI ne doit ni dépendre de la disponibilité d'un tiers, ni
   MARTELER la Géoplateforme à chaque poussée (nos propres règles : ces quotas
   sont un bien commun). Ce que la suite prouve reste réel : l'application
   émet les bonnes requêtes vers les bons endpoints — la disponibilité de
   l'IGN, elle, a été prouvée par appels réels et vit dans docs/apis.md. */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');

export async function simulerTuiles(page: Page): Promise<void> {
  await page.route('**/data.geopf.fr/wmts**', (route) => route.fulfill({
    contentType: 'image/png', body: PNG_1PX,
  }));
}
