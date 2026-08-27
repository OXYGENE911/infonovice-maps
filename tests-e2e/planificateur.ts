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
  /* LA DÉCISION SE REJOUE, ELLE NE SE PREND PAS SUR UN INSTANTANÉ. L'attribut
     `open` du volet est posé de façon SYNCHRONE au clic, mais l'événement
     `toggle` — celui qui ramène le volet à sa page d'accueil — est dispatché
     de façon ASYNCHRONE. Un instantané pris entre les deux voyait l'accueil
     caché, partait cliquer la flèche de retour… que le retour à l'accueil
     venait de cacher : trente secondes d'attente pour une flèche qui ne
     reviendrait pas. La version précédente attendait `.vue-tete` avant de
     juger — un rendez-vous qui ne fermait pas la fenêtre, mesuré : 1 échec
     sur 4 en répétition, 3 sur 4 dès qu'un changement anodin décalait le
     rendu. La boucle ci-dessous REJOUE la décision entière jusqu'à ce
     qu'elle aboutisse : voir l'accueil, ou cliquer une flèche encore là. */
  const accueil = page.locator('.vue-accueil');
  const fleche = page.locator('.vue-retour');
  await expect(async () => {
    if (await accueil.isVisible()) return;
    await fleche.click({ timeout: 1_500 });
    await expect(accueil).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
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
