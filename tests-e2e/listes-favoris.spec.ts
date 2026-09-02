import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* LES LISTES DE FAVORIS (FAVORIS-2, 31/08).
 *
 * Armelin : « quand on ajoute un POI à l'écran, ce serait bien de pouvoir
 * l'enregistrer dans une catégorie custom de ses POI en indiquant soi-même un
 * nom, un émoji et couleur dédiée pour ce POI, ou en sélectionnant une liste
 * prédéfinie comme sur Google Maps qui possède déjà des listes de favoris
 * prédéfinies pour les restaurants, les lieux favoris et les lieux à visiter
 * (Drapeau vert). » */

async function ouvrirFavoris(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**api-adresse.data.gouv.fr/reverse**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { coordinates: [2.3522, 48.8566] },
      properties: { label: ADRESSE, type: 'housenumber', postcode: '75001', city: 'Paris' },
    }] }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirVolet(page, '.favoris');
}

/* ON POSE LE FAVORI COMME L'USAGER : appui long sur la carte, puis le bouton.
   Passer par le module en douce aurait testé le stockage, pas le parcours —
   et c'est le parcours qui a un défaut à garder fermé. */
const ADRESSE = 'Le Bistrot du Coin';

async function poserUnFavori(page: Page): Promise<void> {
  const canevas = page.locator('#carte canvas.maplibregl-canvas');
  const cadre = await canevas.boundingBox();
  await page.mouse.move(cadre!.x + 200, cadre!.y + 300);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('.pa-libelle')).toContainText(ADRESSE, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
  /* LA LISTE SE CHOISIT MAINTENANT (FAVORIS-4, 03/09) : trois listes sont
     livrées, donc le bouton pose la question au lieu de tout verser dans
     « Lieux favoris ». */
  await page.locator('.choix-liste').getByRole('button', { name: '⭐ Lieux favoris' }).click();
  await expect(page.getByRole('button', { name: /Ajouté aux favoris/ })).toBeVisible();
}

test('LES TROIS LISTES QU’IL CITE sont là d’emblée', async ({ page }) => {
  /* UNE APPLICATION QUI S'OUVRE SUR « créez votre première liste » demande un
     travail avant de rendre un service. */
  await ouvrirFavoris(page);
  const entetes = page.locator('.favoris-entete-liste');
  await expect(entetes).toHaveCount(3, { timeout: 10_000 });
  await expect(entetes.nth(0)).toContainText('Lieux favoris');
  await expect(entetes.nth(1)).toContainText('À visiter');
  await expect(entetes.nth(2)).toContainText('Restaurants');
  // Le drapeau vert qu'il nomme.
  await expect(entetes.nth(1)).toContainText('🚩');
});

test('ON CRÉE UNE LISTE avec son nom, son émoji et sa couleur', async ({ page }) => {
  await ouvrirFavoris(page);
  await page.locator('.favoris-nouvelle > summary').click();
  await page.getByLabel('Nom de la liste').fill('Bars à vin');
  await page.getByLabel('Émoji de la liste').fill('🍷');
  await page.locator('.favoris-couleur').nth(7).click();
  await page.getByRole('button', { name: 'Créer la liste' }).click();

  await expect(page.locator('.favoris-etat')).toContainText('Bars à vin');
  const nouvelle = page.locator('.favoris-entete-liste').filter({ hasText: 'Bars à vin' });
  await expect(nouvelle).toBeVisible();
  await expect(nouvelle).toContainText('🍷');
  // ET SA COULEUR EST CELLE QU'ON A CHOISIE, pas celle par défaut.
  const teinte = await nouvelle.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--teinte').trim());
  expect(teinte.toUpperCase()).toBe('#6C4FA1');
});

test('UNE LISTE SANS NOM EST REFUSÉE, et le dit', async ({ page }) => {
  /* Une liste sans nom serait invisible dans son propre panneau : mieux vaut
     refuser clairement que garder l'infirme. */
  await ouvrirFavoris(page);
  await page.locator('.favoris-nouvelle > summary').click();
  await page.getByLabel('Émoji de la liste').fill('🍷');
  await page.getByRole('button', { name: 'Créer la liste' }).click();
  await expect(page.locator('.favoris-etat')).toContainText('besoin d’un nom');
  await expect(page.locator('.favoris-entete-liste')).toHaveCount(3);
});

test('UN FAVORI SE RANGE SANS SORTIR DE SA LIGNE', async ({ page }) => {
  /* Ranger doit coûter UN geste, sinon personne ne range. */
  await ouvrirFavoris(page);
  await poserUnFavori(page);
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirVolet(page, '.favoris');

  const choix = page.getByLabel(`Liste de ${ADRESSE}`);
  await expect(choix).toBeVisible({ timeout: 10_000 });
  // Sans choix, il est dans la liste par défaut — jamais nulle part.
  await expect(choix).toHaveValue('favoris');
  await choix.selectOption('restaurants');

  await expect(choix).toHaveValue('restaurants', { timeout: 10_000 });
  /* IL A VRAIMENT CHANGÉ DE PLACE : le favori suit l'en-tête « Restaurants »,
     et n'est plus sous « Lieux favoris ». */
  /* LE PANNEAU SE RECONSTRUIT APRÈS L'ÉCRITURE : on interroge jusqu'à ce
     qu'il ait fini, plutôt que de lire un instantané pris entre les deux. */
  const sousQuelleListe = (): Promise<string> => page.evaluate(() => {
    /* ON REMONTE DEPUIS LA LIGNE DU FAVORI jusqu'à l'en-tête qui la précède :
       c'est ce que l'œil fait, et c'est plus solide qu'un calcul d'indices. */
    const ligne = [...document.querySelectorAll('.favoris-liste > li')]
      .find((li) => !li.className.includes('entete'));
    let n = ligne?.previousElementSibling ?? null;
    while (n && !n.className.includes('entete')) n = n.previousElementSibling;
    return n?.textContent ?? '';
  });
  await expect.poll(sousQuelleListe, { timeout: 10_000 }).toContain('Restaurants');
});

test('SUPPRIMER UNE LISTE NE SUPPRIME PAS SES LIEUX', async ({ page }) => {
  /* PERDRE SES FAVORIS PARCE QU'ON A SUPPRIMÉ UNE CATÉGORIE serait une
     trahison du contrat : ranger n'est pas jeter. */
  await ouvrirFavoris(page);
  await page.locator('.favoris-nouvelle > summary').click();
  await page.getByLabel('Nom de la liste').fill('Provisoire');
  await page.getByRole('button', { name: 'Créer la liste' }).click();
  await expect(page.locator('.favoris-entete-liste').filter({ hasText: 'Provisoire' }))
    .toBeVisible();

  await poserUnFavori(page);
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirVolet(page, '.favoris');
  await page.getByLabel(`Liste de ${ADRESSE}`).selectOption('provisoire');
  await expect(page.getByLabel(`Liste de ${ADRESSE}`)).toHaveValue('provisoire');

  await page.getByRole('button', { name: /Supprimer la liste Provisoire/ }).click();
  await expect(page.locator('.favoris-etat')).toContainText('Lieux favoris');
  // LE LIEU EST TOUJOURS LÀ, rendu à la liste par défaut.
  await expect(page.getByRole('button', { name: `Aller à ${ADRESSE}` })).toBeVisible();
  await expect(page.getByLabel(`Liste de ${ADRESSE}`)).toHaveValue('favoris');
});

test('LES LISTES LIVRÉES NE S’EFFACENT PAS — elles sont le fond du meuble', async ({ page }) => {
  await ouvrirFavoris(page);
  await expect(page.getByRole('button', { name: /Supprimer la liste Lieux favoris/ }))
    .toHaveCount(0);
  await expect(page.getByRole('button', { name: /Supprimer la liste À visiter/ }))
    .toHaveCount(0);
});

test('IMPORTER SES FAVORIS GOOGLE MAPS — sans rien envoyer à Google', async ({ page }) => {
  /* Armelin, 31/08 : « pouvoir exporter et importer ses favoris Google Maps
     […] recréer une structure similaire sous forme de liste ».
     RIEN NE PART CHEZ GOOGLE : le fichier vient de Takeout, l'usager le
     télécharge lui-même, et tout se lit dans le navigateur. Ce parcours
     COMPTE les requêtes sortantes pour le prouver. */
  const versGoogle: string[] = [];
  await page.route('**://*.google.com/**', (route) => {
    versGoogle.push(route.request().url());
    return route.abort();
  });
  await page.route('**://*.googleapis.com/**', (route) => {
    versGoogle.push(route.request().url());
    return route.abort();
  });
  await ouvrirFavoris(page);

  await page.locator('.favoris-google-fichier').setInputFiles({
    name: 'Envie d’y aller.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'Titre,Note,URL',
      '"Chez Paul, Lyon",Le meilleur,'
        + 'https://www.google.com/maps/place/x/data=!3d45.7640!4d4.8357',
      'Tour Eiffel,,"https://maps.google.com/?q=48.8584,2.2945"',
      'Lieu mystère,,https://maps.google.com/?cid=999',
    ].join('\n'), 'utf8'),
  });

  const etat = page.locator('.favoris-etat');
  await expect(etat).toContainText('2 lieux importés', { timeout: 15_000 });
  // LE NOM DU FICHIER FAIT LA LISTE — aucune saisie demandée.
  await expect(etat).toContainText('Envie d’y aller');
  /* CE QU'ON N'A PAS SU SITUER EST DIT, avec sa raison : le taire ferait
     croire à un import complet. */
  await expect(etat).toContainText('1 sans position');
  await expect(etat).toContainText('Lieu mystère');
  await expect(etat).toContainText('identifiant interne');

  const nouvelle = page.locator('.favoris-entete-liste').filter({ hasText: 'Envie d’y aller' });
  await expect(nouvelle).toBeVisible();
  await expect(nouvelle).toContainText('2');
  await expect(page.getByRole('button', { name: 'Aller à Chez Paul, Lyon' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aller à Tour Eiffel' })).toBeVisible();

  expect(versGoogle, 'aucune requête ne doit partir chez Google').toEqual([]);
});

test('UN FICHIER QUI N’EN EST PAS UN le dit, et ne crée rien', async ({ page }) => {
  await ouvrirFavoris(page);
  await page.locator('.favoris-google-fichier').setInputFiles({
    name: 'photo.csv', mimeType: 'text/csv',
    buffer: Buffer.from('ceci nest pas un export', 'utf8'),
  });
  await expect(page.locator('.favoris-etat'))
    .toContainText('ne ressemble pas à un export Google Maps', { timeout: 15_000 });
  // AUCUNE LISTE FANTÔME : un fichier illisible ne doit pas laisser de trace.
  await expect(page.locator('.favoris-entete-liste')).toHaveCount(3);
});
