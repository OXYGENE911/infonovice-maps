import { expect, type Page } from '@playwright/test';

/* NAVIGUER DANS LE PLANIFICATEUR SANS SAVOIR COMMENT IL EST BÂTI.
 *
 * Depuis la refonte du 27/08/2026, le planificateur n'empile plus cinq volets
 * dépliables : il montre UNE PAGE à la fois, avec son titre et sa flèche de
 * retour. Armelin le demandait — « au lieu d'ouvrir une nouvelle page à chaque
 * fois qui soit propre et sans nuisance graphique avec un bouton retour ».
 *
 * Quarante parcours cliquaient jusque-là un `<summary>` par section. Cet
 * utilitaire les rend INDIFFÉRENTS à la mécanique : le jour où elle changera
 * encore, un seul fichier bougera. C'est la même leçon que `volets.ts`, tirée
 * de la même façon — après coup.
 */

/** Les pages atteignables depuis le menu du planificateur. */
export type Page_ = 'recharge' | 'feuille' | 'trajet' | 'meteo' | 'alti'
  | 'options' | 'partage';

/** Ouvre le planificateur et attend que sa page d'accueil soit là. */
export async function ouvrirPlanificateur(page: Page): Promise<void> {
  const tete = page.locator('.maplibregl-ctrl-top-left summary')
    .filter({ hasText: 'Itinéraire' });
  if (await page.locator('.iti[open]').count() === 0) await tete.click();
  await expect(page.locator('.vue-accueil')).toBeVisible();
}

/**
 * Va sur une page du planificateur.
 *
 * LE MENU N'EXISTE QU'AVEC UN TRAJET : proposer « feuille de route » quand
 * rien n'est calculé mènerait à une page vide. L'attente ci-dessous le dit
 * clairement plutôt que de laisser un `click` échouer sur un délai.
 */
export async function allerA(page: Page, vers: Page_): Promise<void> {
  /* ON REVIENT D'ABORD À L'ACCUEIL SI L'ON N'Y EST PAS. Le menu vit sur la
     page d'accueil : depuis « Partager », l'entrée « Feuille de route » est
     hors de l'écran — comme pour l'usager, qui presse la flèche avant de
     choisir autre chose. Le raccourci fait donc le même geste, plutôt que
     d'obliger quarante parcours à l'écrire. */
  if (await page.locator('.vue-accueil:visible').count() === 0) {
    await page.locator('.vue-retour').click();
    await expect(page.locator('.vue-accueil')).toBeVisible();
  }
  const entree = page.locator(`.iti-vers[data-vers="${vers}"]`);
  await expect(entree, `la page « ${vers} » n’est pas proposée :`
    + ' le menu des détails attend un trajet calculé').toBeVisible();
  await entree.click();
  await expect(page.locator(`.vue[data-vue="${vers}"]`)).toBeVisible();
}

/** Revient à l'accueil du planificateur. */
export async function retour(page: Page): Promise<void> {
  await page.locator('.vue-retour').click();
  await expect(page.locator('.vue-accueil')).toBeVisible();
}
