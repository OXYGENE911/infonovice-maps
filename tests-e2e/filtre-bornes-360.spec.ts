import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirReglagesBornes } from './volets';

/* LE PANNEAU DES BORNES TIENT DANS UN TÉLÉPHONE ÉTROIT (FILTRE-1, 03/09).
 *
 * ARMELIN, en 1.60 : « dans la configuration du filtre des bornes de recharge,
 * plusieurs rectangles sont décalés et débordent de l'affichage. Le rectangle
 * qui permet d'afficher toutes les bornes est décentré sur la droite. Idem
 * pour la liste déroulante de la puissance minimale […] la barre de recherche
 * des réseaux […] le filtre du réseau national à garder hors ligne […] le
 * texte de la lecture de la carte qui déborde à l'avant-dernière ligne. »
 *
 * MESURÉ SUR LE SITE, à 360 px de large — la largeur Android la plus
 * courante : TOUT débordait de 12 px, uniformément. Cinq symptômes, UNE
 * cause : le sélecteur du réseau à télécharger porte une option de 305 px
 * (« Recharge rapide (50 kW et plus) ») qu'un <select> ne sait pas plier —
 * `min-width` vaut `auto` en flexbox. Sa ligne élargissait la piste de la
 * grille du fieldset, et toutes les sœurs suivaient.
 *
 * CE PARCOURS MESURE DES RECTANGLES à 360 px, comme le reste de l'ergonomie
 * du projet : à 390 px, rien ne débordait — c'est pour cela que personne ne
 * l'avait vu. */

test.use({ viewport: { width: 360, height: 800 } });

test('À 360 px, RIEN NE DÉBORDE du panneau des réglages de bornes', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirReglagesBornes(page);
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
  await expect(page.locator('.poi-filtres')).toBeVisible();

  const fautes = await page.evaluate(() => {
    const panneau = document.querySelector('.poi-hote-recharge');
    if (!panneau) return ['panneau introuvable'];
    const cadre = panneau.getBoundingClientRect();
    const vues: string[] = [];
    for (const e of panneau.querySelectorAll('*')) {
      const b = e.getBoundingClientRect();
      if (b.width === 0) continue;
      /* UN PIXEL DE TOLÉRANCE : les bordures arrondies se mesurent au
         demi-pixel près selon la densité d'écran. */
      if (b.right > cadre.right + 1 || b.left < cadre.left - 1) {
        const nom = String(e.className).slice(0, 40) || e.tagName;
        if (!vues.includes(nom)) vues.push(`${nom} (${Math.round(b.right - cadre.right)}px)`);
      }
    }
    return vues;
  });
  expect(fautes, 'ces éléments débordent du panneau à 360 px').toEqual([]);
});

test('LE SÉLECTEUR DU RÉSEAU À TÉLÉCHARGER RESTE UTILISABLE une fois plié', async ({ page }) => {
  /* Le remède pourrait être pire que le mal : un sélecteur plié à zéro serait
     un sélecteur mort. Mesuré sur le site avant d'écrire la règle : 200 px —
     on garde une borne basse bien en deçà, mais au-dessus de l'inutilisable. */
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirReglagesBornes(page);
  /* LE FILTRE NE PARAÎT QU'AVEC LES BORNES COCHÉES : sans ce geste, le
     fieldset est caché et le parcours mesurerait du vide. */
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();

  const etendue = page.locator('select.poi-etendue');
  await expect(etendue).toBeVisible();
  const boite = await etendue.boundingBox();
  expect(boite!.width, 'le sélecteur plié doit rester lisible').toBeGreaterThan(100);
  // Et il répond toujours : on choisit une autre étendue.
  await etendue.selectOption({ index: 0 });
});
