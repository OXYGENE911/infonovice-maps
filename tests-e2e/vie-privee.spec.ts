import { test, expect } from '@playwright/test';

/* LA PAGE « VIE PRIVÉE » DIT LA VÉRITÉ SUR CE QU'ON GARDE (RGPD-1, 02/09).
 *
 * LE DÉFAUT, ET IL ÉTAIT GRAVE. La page affirmait « pas de trajets
 * conservés ». C'était vrai quand elle a été écrite. Depuis STATS-2 (01/09),
 * l'application enregistre des parcours À LA DEMANDE ; depuis HIST-2 (02/09),
 * ces parcours contiennent le TRACÉ GPS complet — un point toutes les trente
 * secondes. La page publique disait donc le contraire du code, et c'est la
 * pire sorte de faux : celui qu'on affiche sur la page qui promet la
 * franchise.
 *
 * PERSONNE NE L'AVAIT VU parce que rien ne le regardait. Ces parcours
 * n'existent que si la page en parle : c'est le seul endroit où le contrat
 * est écrit, et un contrat que rien ne teste dérive en silence.
 *
 * CE FICHIER EXISTE POUR QUE LA DÉRIVE SE VOIE. Chaque affirmation vérifiée
 * ici correspond à un comportement du code ; le jour où l'un change sans
 * l'autre, un parcours échoue. */

test.beforeEach(async ({ page }) => {
  await page.goto('/vie-privee.html');
  await expect(page.locator('h1')).toBeVisible();
});

test('LA PAGE NE PRÉTEND PLUS qu’aucun trajet n’est conservé', async ({ page }) => {
  const corps = page.locator('.page-corps');
  /* L'AFFIRMATION FAUSSE NE DOIT PLUS S'Y TROUVER, sous aucune forme. */
  await expect(corps).not.toContainText('pas de trajets');
  /* ET LA VRAIE DOIT Y ÊTRE : les parcours existent, sur demande seulement. */
  await expect(corps).toContainText('Les parcours que vous avez choisi de garder');
  await expect(corps).toContainText('tant que vous n’appuyez pas, rien n’est gardé');
});

test('ELLE DIT CE QU’UN PARCOURS CONTIENT — le tracé GPS nommément', async ({ page }) => {
  const corps = page.locator('.page-corps');
  /* LE MOT « TRACÉ GPS » DOIT Y ÊTRE. Une page qui parlerait de « statistiques
     de trajet » sans nommer les positions serait exacte et trompeuse. */
  await expect(corps).toContainText('le tracé GPS de votre trajet');
  await expect(corps).toContainText('un point tous les trente secondes');
  /* ET LA LIMITE DE CINQUANTE, qui est dans le code (TRAJETS_GARDES). */
  await expect(corps).toContainText('Cinquante parcours au plus');
  /* ET LE GESTE POUR EFFACER, avec le nom exact du bouton de l'application. */
  await expect(corps).toContainText('Oublier');
});

test('ELLE DÉCRIT LA CONTRIBUTION, y compris les 500 mètres coupés', async ({ page }) => {
  const corps = page.locator('.page-corps');
  await expect(corps).toContainText('Contribuer à l’algorithme');
  /* RIEN NE PART TOUT SEUL — c'est la promesse centrale du bouton. */
  await expect(corps).toContainText('Rien ne part tout seul');
  /* LA COUPE DES BOUTS EST DANS LE CODE (COUPE_BOUTS_M = 500) : la page doit
     dire le même chiffre, sans quoi l'une des deux ment. */
  await expect(corps).toContainText('les 500 premiers et 500 derniers mètres');
});

test('ELLE NUANCE LA GÉOLOCALISATION au lieu de dire « jamais enregistrée »', async ({ page }) => {
  const corps = page.locator('.page-corps');
  /* L'ANCIENNE PHRASE — « Elle n'est ni enregistrée, ni transmise » — était
     devenue fausse sur sa première moitié. La page doit maintenant porter
     l'exception, et la nommer. */
  await expect(corps).toContainText('si vous demandez à garder un parcours');
  await expect(corps).toContainText('Sans ce geste, elles disparaissent avec la page');
});

test('ET ELLE NE POSE TOUJOURS AUCUN COOKIE', async ({ page }) => {
  /* LA PROMESSE D'ORIGINE tient toujours : on ne la vérifie pas moins parce
     qu'on en a ajouté d'autres. */
  await expect(page.getByText('Non — aucun.')).toBeVisible();
  expect(await page.context().cookies()).toHaveLength(0);
});
