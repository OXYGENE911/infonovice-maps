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

/* LE RÉPERTOIRE DES COMMUNES est simulé pour la même raison, et il le fallait :
   depuis l'adressage en mots, chaque appui long l'interroge. Sans cette
   simulation, la CI appellerait geo.api.gouv.fr à chaque poussée, pour trois
   parcours qui ne cherchent même pas à l'éprouver. Le module a ses propres
   tests unitaires, et le service a été vérifié par appels réels (docs/apis.md).
   Un test qui veut VRAIMENT juger l'adressage pose sa propre route : la
   dernière enregistrée l'emporte. */
export async function simulerCommunes(page: Page): Promise<void> {
  await page.route('**/geo.api.gouv.fr/communes**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{
      nom: 'Paris', code: '75056',
      centre: { type: 'Point', coordinates: [2.3488, 48.8534] },
    }]),
  }));
}
