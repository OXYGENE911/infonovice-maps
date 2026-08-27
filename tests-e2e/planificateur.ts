import { expect, type Page } from '@playwright/test';

/* NAVIGUER DANS LE PLANIFICATEUR SANS SAVOIR COMMENT IL EST BÂTI.
 *
 * Depuis la refonte du 27/08/2026, le planificateur n'empile plus des volets
 * dépliables : il montre UNE PAGE à la fois, avec son titre et sa flèche de
 * retour. Armelin le demandait — « au lieu d'ouvrir une nouvelle page à chaque
 * fois qui soit propre et sans nuisance graphique avec un bouton retour ».
 *
 * Quarante parcours cliquaient jusque-là un `summary` par section. Cet
 * utilitaire les rend INDIFFÉRENTS à la mécanique : le jour où elle changera
 * encore, un seul fichier bougera. C'est la même leçon que `volets.ts`, tirée
 * de la même façon — après coup.
 */

/** Les pages atteignables depuis le menu du planificateur. */
export type PageTrajet = 'recharge' | 'feuille' | 'trajet' | 'meteo' | 'alti'
  | 'options' | 'partage' | 'vehicule' | 'couches';

/**
 * Ouvre le planificateur et ramène sa page d'accueil.
 *
 * DEUX CONDITIONS, DANS CET ORDRE, ET CHACUNE ATTENDUE. La CI a attrapé ce que
 * la machine locale laissait passer : un parcours qui referme le volet — un
 * clic sur la carte, un cartouche de borne — laissait ensuite le raccourci
 * attendre une flèche de retour INVISIBLE, puisqu'elle vit dans le volet
 * fermé. Trente secondes d'attente pour une condition qui ne pouvait pas
 * venir. On ouvre donc d'abord, ON ATTEND, puis seulement on revient.
 */
export async function ouvrirPlanificateur(page: Page): Promise<void> {
  if (await page.locator('.iti[open]').count() === 0) {
    await page.locator('.maplibregl-ctrl-top-left summary')
      .filter({ hasText: 'Itinéraire' }).click();
    await expect(page.locator('.iti[open]')).toHaveCount(1);
  }
  /* ON ATTEND QUE LE VOLET SOIT RENDU avant de juger quoi que ce soit. Sans
     cette attente, la lecture de visibilite ci-dessous etait un instantane
     pris trop tot : l'accueil paraissait cache alors qu'il allait paraitre,
     et l'on cliquait une fleche de retour qui, elle, etait bel et bien
     cachee — trente secondes d'attente pour rien. */
  await expect(page.locator('.vue-tete')).toBeVisible();
  if (await page.locator('.vue-accueil').isVisible()) return;
  const fleche = page.locator('.vue-retour');
  await expect(fleche).toBeVisible();
  await fleche.click();
  await expect(page.locator('.vue-accueil')).toBeVisible();
}

/**
 * Va sur une page du planificateur.
 *
 * LE MENU DES DÉTAILS N'EXISTE QU'AVEC UN TRAJET : proposer « feuille de
 * route » quand rien n'est calculé mènerait à une page vide. L'attente
 * ci-dessous le dit clairement plutôt que de laisser un clic échouer sur un
 * délai. Le véhicule, les couches et les options, eux, sont toujours là.
 */
export async function allerA(page: Page, vers: PageTrajet): Promise<void> {
  await ouvrirPlanificateur(page);
  const entree = page.locator(`.iti-vers[data-vers="${vers}"]`);
  await expect(entree, `la page « ${vers} » n’est pas proposée :`
    + ' le menu des détails attend un trajet calculé').toBeVisible();
  await entree.click();
  await expect(page.locator(`.vue[data-vue="${vers}"]`)).toBeVisible();
}

/** Revient à l'accueil du planificateur, quel que soit son état. */
export async function retour(page: Page): Promise<void> {
  await ouvrirPlanificateur(page);
}
