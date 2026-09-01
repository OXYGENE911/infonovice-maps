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

/* UNE IMAGE 2:1 — la signature d'un panorama équirectangulaire. Le PNG d'un
   pixel sert partout ailleurs ; il ne peut PAS servir ici, un carré n'étant
   pas un panorama. 64×32, avec un motif pour que le rendu ait quelque chose
   à montrer. */
export const PNG_PANORAMA_2X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAB8klEQVR4nGNgSDyk3PLUbTlH5intnrd+6wUKLxlP+Rq2XaLylvWcv3H7FRofOS9hTTuu0fnKew1v3nmDiZ+Ct4iWXbeY+St6j2zdfYeFTMlHVNuee6zkyj6j2/c+YKNQ8RXTad8jdkpV37Gd9z/hoFLzE9dl7Bkntbrf+K7jL7hoNPlL6DbxiptWs//E7pNveOi0mCX1mHrHS6/VPLnn9Cd8DNosUnrNfMbPqN0ytffsFzAmHVZpfea+gjPrtE7vO/8NgkWXTaZ+C98hWXXbZu6/eAY62nVAsemxy1K29BOaXa991vLlXzCc9Dlkq1j5DctZv2P2ytU/cFzEnHJUrf2F5yrunLN6/R8CNwmXXDWb/iNyl3TNXbv5WMOagY520SReGehoF03ilYGe6ZUW8cpAz/RKi3hloGd6pUW8MtC1zKNBvDLQtcyjQbwy0LXMo0G8MtC13qR+vDLQt96kfrwy0LfepH68MtC57UX1eGWgc9uL6vHKQOe2F9XjlYHe7XdqxysDvdvv1I5XBnq336kdrwx07wNSOV4Z6N4HpHK8MtC9D0jleGWg/zgCdeOVgf7jCNSNVwb6jyNQN14ZBmAsiqrxyjAAY1FUjVeGARiLomq8MgzEeCY145VhIMYzqRmvDAMxnknNeGUYkDFxKsYrAO4s9KbeVcAzAAAAAElFTkSuQmCC',
  'base64');

export async function simulerTuiles(page: Page): Promise<void> {
  await page.route('**/data.geopf.fr/wmts**', (route) => route.fulfill({
    contentType: 'image/png', body: PNG_1PX,
  }));
  /* L'ÉTAT DES POINTS DE CHARGE PART À CHAQUE FICHE OUVERTE (IRVE-1, 01/09) :
     sans cette simulation, la CI interrogerait `tabular-api.data.gouv.fr` à
     chaque poussée pour des parcours qui ne cherchent pas à l'éprouver — la
     règle du projet l'interdit, et une panne du service ferait rougir une CI
     qui n'a rien à voir. La réponse VIDE est le bon défaut : c'est le cas le
     plus fréquent sur le terrain (14 points sur 40 seulement portent un
     relevé autour du Plessis-Trévise). L'en-tête CORS n'est pas décoratif :
     le portail réel l'envoie, et sans lui la fiche croirait à une panne.
     Un parcours qui veut VRAIMENT juger l'état pose sa propre route : la
     dernière enregistrée l'emporte. */
  await page.route('**/tabular-api.data.gouv.fr/**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ data: [], meta: { total: 0 } }),
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
