import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* CHOISIR SA LISTE AU MOMENT OÙ L'ON GARDE (FAVORIS-4, 03/09).
 *
 * ARMELIN, DEUX FOIS DANS LE MÊME RETOUR :
 *  1. « Quand on clique sur un POI et qu'on clique sur "Ajouter aux favoris",
 *     on n'a pas la possibilité de choisir directement dans quelle catégorie
 *     l'enregistrer (Listes de favoris). »
 *  2. « Quand on clique sur une borne de recharge, on peut y aller, mais on ne
 *     peut pas l'ajouter en favoris dans une liste qu'on aurait créée pour
 *     retrouver plus facilement ses bornes de recharge favorites. »
 *
 * LE DÉFAUT N'ÉTAIT PAS DANS LE STOCKAGE. `ajouterFavori(nom, point, liste)`
 * accepte une liste depuis FAVORIS-2 (31/08) ; seule l'interface ne la
 * demandait jamais, et tout tombait dans « Lieux favoris ». Ranger après coup
 * demande de retrouver ce qu'on vient d'ajouter : c'est le geste que personne
 * ne fait, et c'est pour cela que le retour est arrivé.
 *
 * CES PARCOURS MESURENT LE GESTE ENTIER, jusqu'au volet Favoris : qu'une
 * rangée paraisse ne prouve pas que le lieu soit allé où on l'a mis. */

const ADRESSE = '8 Rue de la Paix 75002 Paris';

async function ouvrirLaFicheDUnPoint(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/api-adresse.data.gouv.fr/reverse/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { coordinates: [2.330992, 48.868831] },
      properties: {
        label: ADRESSE, type: 'housenumber', postcode: '75002', city: 'Paris',
      },
    }] }),
  }));
  await page.goto('/');
  const canevas = page.locator('#carte canvas.maplibregl-canvas');
  await canevas.waitFor({ timeout: 15_000 });
  // L'APPUI LONG (600 ms) ouvre la fiche du point, celle qui porte le bouton.
  const cadre = await canevas.boundingBox();
  await page.mouse.move(cadre!.x + 640, cadre!.y + 360);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('.pa-libelle')).toContainText('8 Rue de la Paix', { timeout: 10_000 });
}

test('LA QUESTION SE POSE : les trois listes paraissent sous le bouton', async ({ page }) => {
  await ouvrirLaFicheDUnPoint(page);
  const ajouter = page.getByRole('button', { name: 'Ajouter aux favoris' });
  await expect(ajouter).toBeEnabled({ timeout: 10_000 });
  /* AVANT LE CLIC, RIEN : la rangée ne doit pas encombrer une fiche qu'on n'a
     pas encore décidé d'utiliser. */
  await expect(page.locator('.choix-liste')).toHaveCount(0);

  await ajouter.click();
  const choix = page.locator('.choix-liste');
  await expect(choix).toBeVisible();
  await expect(choix).toContainText('Dans quelle liste ?');
  const listes = choix.locator('.choix-liste-bouton');
  await expect(listes).toHaveCount(3);
  await expect(listes.nth(0)).toHaveText('⭐ Lieux favoris');
  await expect(listes.nth(1)).toHaveText('🚩 À visiter');
  await expect(listes.nth(2)).toHaveText('🍽️ Restaurants');
  /* LE FOCUS EST ENTRÉ DANS LA RANGÉE : au clavier, une rangée qui paraît
     sans recevoir le focus est une rangée qu'on ne trouve pas. */
  await expect(listes.nth(0)).toBeFocused();
});

test('LE LIEU VA DANS LA LISTE CHOISIE, et le bouton la NOMME', async ({ page }) => {
  await ouvrirLaFicheDUnPoint(page);
  const ajouter = page.getByRole('button', { name: 'Ajouter aux favoris' });
  await expect(ajouter).toBeEnabled({ timeout: 10_000 });
  await ajouter.click();
  await page.locator('.choix-liste').getByRole('button', { name: '🍽️ Restaurants' }).click();

  /* LE BOUTON REDIT LE CHOIX. Sans le nom de la liste, l'usager qui vient de
     choisir ne sait pas si son choix a porté, et ira vérifier — ce qui annule
     le gain du geste. */
  await expect(page.getByRole('button', { name: 'Ajouté aux favoris — Restaurants' }))
    .toBeVisible();
  // LA RANGÉE S'EFFACE : la question est répondue, elle n'a plus à occuper.
  await expect(page.locator('.choix-liste')).toHaveCount(0);

  /* ET LE LIEU EST VRAIMENT LÀ-BAS. C'est le cœur du retour d'Armelin :
     jusqu'ici tout tombait dans « Lieux favoris » quoi qu'on veuille. */
  await ouvrirVolet(page, '.favoris');
  await expect(page.getByLabel(`Liste de ${ADRESSE}`))
    .toHaveValue('restaurants', { timeout: 10_000 });
});

test('UN SECOND CLIC REFERME la rangée — on a le droit de changer d’avis', async ({ page }) => {
  /* Sans cela, ouvrir la rangée obligerait à choisir pour s'en débarrasser :
     une question sans porte de sortie. */
  await ouvrirLaFicheDUnPoint(page);
  const ajouter = page.getByRole('button', { name: 'Ajouter aux favoris' });
  await expect(ajouter).toBeEnabled({ timeout: 10_000 });
  await ajouter.click();
  await expect(page.locator('.choix-liste')).toBeVisible();
  await ajouter.click();
  await expect(page.locator('.choix-liste')).toHaveCount(0);
  // RIEN N'A ÉTÉ GARDÉ : refermer n'est pas ranger.
  await ouvrirVolet(page, '.favoris');
  await expect(page.getByRole('button', { name: `Aller à ${ADRESSE}` })).toHaveCount(0);
});

test('UNE LISTE CRÉÉE PAR L’USAGER est proposée comme les autres', async ({ page }) => {
  /* « une liste qu'on aurait créée » — c'est le mot d'Armelin, et c'est le cas
     qui compte : les trois livrées, on ne les a pas choisies. */
  await ouvrirLaFicheDUnPoint(page);
  await ouvrirVolet(page, '.favoris');
  await page.locator('.favoris-nouvelle > summary').click();
  await page.getByLabel('Nom de la liste').fill('Bornes du boulot');
  await page.getByLabel('Émoji de la liste').fill('🔌');
  await page.getByRole('button', { name: 'Créer la liste' }).click();
  await expect(page.locator('.favoris-entete-liste').filter({ hasText: 'Bornes du boulot' }))
    .toBeVisible();

  const ajouter = page.getByRole('button', { name: 'Ajouter aux favoris' });
  await expect(ajouter).toBeEnabled({ timeout: 10_000 });
  await ajouter.click();
  const choix = page.locator('.choix-liste');
  await expect(choix.locator('.choix-liste-bouton')).toHaveCount(4);
  await choix.getByRole('button', { name: '🔌 Bornes du boulot' }).click();
  await expect(page.getByRole('button', { name: 'Ajouté aux favoris — Bornes du boulot' }))
    .toBeVisible();
  await expect(page.getByLabel(`Liste de ${ADRESSE}`))
    .toHaveValue('bornes-du-boulot', { timeout: 10_000 });
});

test('LA RANGÉE NE DÉBORDE PAS de la fiche qui la porte', async ({ page }) => {
  /* CE PROJET MESURE DES RECTANGLES. Une rangée de puces posée dans une fiche
     de 320 pixels est exactement le genre de chose qui déborde en silence — et
     la leçon d'ERGO-6 est qu'on ne le voit jamais en relisant le CSS. */
  await ouvrirLaFicheDUnPoint(page);
  const ajouter = page.getByRole('button', { name: 'Ajouter aux favoris' });
  await expect(ajouter).toBeEnabled({ timeout: 10_000 });
  await ajouter.click();
  await expect(page.locator('.choix-liste')).toBeVisible();

  const debord = await page.evaluate(() => {
    const rangee = document.querySelector('.choix-liste');
    const fiche = rangee?.closest('.popup-adresse');
    if (!rangee || !fiche) return 'rangée ou fiche introuvable';
    const r = rangee.getBoundingClientRect();
    const f = fiche.getBoundingClientRect();
    if (r.right > f.right + 1 || r.left < f.left - 1) {
      return `rangée ${r.left}–${r.right} hors de ${f.left}–${f.right}`;
    }
    /* ET AUCUNE PUCE NE SORT DE LA RANGÉE : `flex-wrap` doit les faire
       descendre, pas les laisser filer à droite. */
    for (const b of rangee.querySelectorAll('.choix-liste-bouton')) {
      const p = b.getBoundingClientRect();
      if (p.right > r.right + 1) return `${b.textContent} déborde de ${p.right - r.right}px`;
    }
    return '';
  });
  expect(debord, 'la rangée de listes doit tenir dans sa fiche').toBe('');
});
