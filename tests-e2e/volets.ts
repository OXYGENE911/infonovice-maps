import { expect, type Page } from '@playwright/test';

/* OUVRIR UN VOLET SANS SAVOIR OÙ IL VIT.
 *
 * Depuis le regroupement du menu (PR #27), les couches, les lieux et le fond
 * de carte sont RANGÉS derrière un bouton unique en haut à droite, tandis que
 * l'itinéraire et le véhicule restent à gauche. Trente-cinq parcours
 * cliquaient jusque-là un `summary` posé à même la carte.
 *
 * Cet utilitaire les rend INDIFFÉRENTS au placement : il ouvre le menu si le
 * volet visé s'y trouve, sinon il clique directement. Un futur déménagement ne
 * touchera donc qu'un seul fichier — c'était tout l'intérêt de ne pas coder
 * l'emplacement dans chaque test.
 */

const MENU = 'summary[aria-label="Menu : réglages, couches et lieux"]';

/** Ouvre le menu des réglages s'il ne l'est pas déjà. Idempotent. */
export async function ouvrirMenu(page: Page): Promise<void> {
  if (await page.locator('details.reglages[open]').count() > 0) return;
  await page.locator(MENU).click();
  await expect(page.locator('details.reglages[open]')).toHaveCount(1);
}

/**
 * Ouvre le volet désigné par son sélecteur de conteneur (« .poi », « .fonds »…).
 * @param selecteur le conteneur du volet, PAS son `summary`.
 */
export async function ouvrirVolet(page: Page, selecteur: string): Promise<void> {
  // Le volet est-il rangé dans le menu ? On le demande au DOM plutôt que de
  // tenir une liste ici : une liste se périme en silence au prochain
  // déménagement, la question posée au DOM reste vraie.
  if (await page.locator(`.reglages-corps ${selecteur}`).count() > 0) {
    await ouvrirMenu(page);
  }
  await page.locator(`${selecteur} summary`).first().click();
}
