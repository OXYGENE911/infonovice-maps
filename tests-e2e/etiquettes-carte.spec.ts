import { test, expect } from '@playwright/test';

/* LES ÉTIQUETTES SE DESSINENT AU PREMIER CHARGEMENT (FOND-2, 01/09).
 *
 * FOND-1 les avait déclarées DANS le style initial, et les tests unitaires
 * s'en contentaient : ils vérifiaient la présence des calques, jamais leur
 * RENDU. En production, la surcouche restait vide — sans une erreur pour le
 * dire — alors qu'un `setStyle(getStyle())` la faisait paraître d'un coup
 * (66 numéros mesurés dans le navigateur d'Armelin : A86, A4, N104, D282…).
 * Le style était juste ; c'est le MOMENT de la création de la source qui ne
 * l'était pas.
 *
 * CE PARCOURS MESURE CE QUI EST DESSINÉ, pas ce qui est déclaré : c'est la
 * seule chose que la production ait démentie. Il touche les vraies tuiles
 * IGN — comme le parcours des photos de rue, et pour la même raison : ce
 * qu'on veut prouver ici n'existe qu'avec la vraie donnée. */

test('AU PREMIER CHARGEMENT, les numéros de route sont DESSINÉS', async ({ page }) => {
  test.slow();
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });

  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.5722, 48.8103], zoom: 12 });
  });

  /* ON ATTEND LES TUILES, PAS UN DÉLAI : `areTilesLoaded` dit quand il n'y a
     plus rien en vol — un `waitForTimeout` mesurerait la patience, pas le
     rendu. */
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { areTilesLoaded(): boolean } })
      .__carte.areTilesLoaded()), { timeout: 30_000 }).toBe(true);

  const numeros = await page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      queryRenderedFeatures(): { layer: { id: string }; properties: Record<string, unknown> }[];
    } }).__carte;
    const f = c.queryRenderedFeatures().filter((x) => /^num-route-/.test(x.layer.id));
    return [...new Set(f.map((x) => String(x.properties['texte'])))];
  });

  /* AUTOUR DU PLESSIS-TRÉVISE, LE RÉSEAU EST DENSE : l'A4, l'A86 et une
     poignée de départementales. En exiger UNE seule suffirait à prouver le
     rendu ; on en demande trois pour que le parcours ne passe pas sur un
     hasard de placement. */
  expect(numeros.length,
    `aucun numéro dessiné au premier chargement (vu : ${numeros.join(', ')})`)
    .toBeGreaterThanOrEqual(3);
  expect(numeros.some((n) => /^A\d/.test(n)), 'au moins une autoroute').toBe(true);
});
