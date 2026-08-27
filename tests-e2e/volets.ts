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
    await page.locator(`${selecteur} summary`).first().click();
    return;
  }

  /* OU EST-IL DEVENU UNE PAGE DU PLANIFICATEUR ? Depuis le 27/08/2026, le
     véhicule et les couches n'ont plus de bouton propre : « un seul bouton est
     plus efficace à comprendre que trois boutons où il faudra se rappeler dans
     quel menu on peut trouver quelle option » (Armelin). On demande encore une
     fois au DOM plutôt que d'inscrire ici une liste qui se périmerait. */
  const hote = page.locator(`.vue-hote:has(${selecteur})`);
  if (await hote.count() > 0) {
    const vue = await hote.first().getAttribute('data-vue');
    const tete = page.locator('.maplibregl-ctrl-top-left summary')
      .filter({ hasText: 'Itinéraire' });
    if (await page.locator('.iti[open]').count() === 0) await tete.click();
    if (await page.locator('.vue-accueil:visible').count() === 0) {
      await page.locator('.vue-retour').click();
    }
    await page.locator(`.iti-vers[data-vers="${vue}"]`).click();
    await expect(page.locator(`.vue[data-vue="${vue}"]`)).toBeVisible();
    return;
  }

  await page.locator(`${selecteur} summary`).first().click();
}
