import { test, expect } from '@playwright/test';
import { ouvrirVolet } from './volets';

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

/* LES BÂTIMENTS EN RELIEF SONT DESSINÉS, AVEC DE VRAIES HAUTEURS IGN
 * (FOND-5, 02/09).
 *
 * Armelin : « existe-t-il des cartes 3D gouvernementales pour une navigation
 * en 3D avec les bâtiments en relief ? » Les tests unitaires prouvent que le
 * calque est BIEN FORMÉ ; seul un parcours sur les vraies tuiles prouve que
 * l'attribut `hauteur` existe et qu'il est peuplé. C'est exactement la leçon
 * de FOND-2 : un calque déclaré n'est pas un calque dessiné. */

test('LE RELIEF SE DESSINE, et ses hauteurs viennent de l’IGN', async ({ page }) => {
  test.slow();
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });

  /* LA CASE EST DANS « Affichage » — on passe par elle, et non par une
     manipulation directe du style : c'est le geste de l'usager qu'on
     éprouve, pas l'API de MapLibre. */
  /* ON SE PLACE D'ABORD, ON COCHE ENSUITE — et c'est l'ordre de l'usager, qui
     regarde une ville avant de demander à la voir en relief. L'ordre inverse
     ferait courir la caméra : `jumpTo` interrompt l'inclinaison en cours et la
     fige à mi-chemin, ce qui n'apprendrait rien sur le calque. */
  await page.evaluate(() => {
    /* PARIS 4e, ZOOM 16 : 710 bâtiments dans la tuile, 583 avec hauteur
       (mesuré le 02/09 en décodant la tuile). */
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3550, 48.8560], zoom: 16 });
  });

  await ouvrirVolet(page, '.fonds');
  await page.locator('input[name="relief3d"]').check();

  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { areTilesLoaded(): boolean } })
      .__carte.areTilesLoaded()), { timeout: 30_000 }).toBe(true);

  const hauteurs = await page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      queryRenderedFeatures(o?: object): { layer: { id: string };
        properties: Record<string, unknown> }[];
    } }).__carte;
    return c.queryRenderedFeatures({ layers: ['bati-relief'] })
      .map((f) => Number(f.properties['hauteur']))
      .filter((h) => Number.isFinite(h) && h > 0);
  });

  expect(hauteurs.length,
    'aucun bâtiment avec hauteur dessiné — le calque 3D ne rend rien')
    .toBeGreaterThan(20);
  /* DES HAUTEURS PLAUSIBLES, ET PAS DES MÈTRES INVENTÉS : à Paris, la
     médiane mesurée vaut 8,8 m et le maximum 35,7 m. Un bâtiment de 300 m
     signalerait qu'on lit le mauvais attribut. */
  expect(Math.max(...hauteurs)).toBeLessThan(200);
  expect(Math.min(...hauteurs)).toBeGreaterThan(0.5);

  /* ET LA CAMÉRA S'EST INCLINÉE : à plat, l'extrusion ne se verrait pas, et
     la case n'aurait rien fait de visible. */
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { getPitch(): number } }).__carte.getPitch()),
  { timeout: 5_000, message: 'la caméra est restée à plat : le relief ne se voit pas' })
    .toBeGreaterThan(20);
});

/* LES NUMÉROS DE ROUTE SONT DANS LEUR ÉCUSSON (FOND-6, 02/09).
 *
 * Armelin : « on voit les numéros des routes s'afficher seulement au format
 * texte. Ce serait bien que les routes et autoroutes soient affichées dans
 * leur vrai cartouche cartographique. Par exemple, l'autoroute A86 apparaît
 * seulement sous format texte écrit en blanc au contour noir, alors que sur
 * Google Maps, une autoroute apparaît dans un cartouche rouge A86 aux
 * contours blancs. »
 *
 * CE PARCOURS TOUCHE LES VRAIES TUILES, comme les deux précédents et pour la
 * même raison : un écusson déclaré n'est pas un écusson dessiné, et c'est la
 * leçon de FOND-2. */

test('LES ÉCUSSONS SONT POSÉS, et les numéros les portent', async ({ page }) => {
  test.slow();
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });

  await page.evaluate(() => {
    /* AUTOUR DU PLESSIS-TRÉVISE : l'A4, l'A86 et une poignée de
       départementales — de quoi voir les deux écussons à la fois. */
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.5722, 48.8103], zoom: 12 });
  });
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { areTilesLoaded(): boolean } })
      .__carte.areTilesLoaded()), { timeout: 30_000 }).toBe(true);

  /* LES DEUX IMAGES SONT DANS LE REGISTRE : sans elles, `icon-optional`
     laisserait paraître les numéros nus — et rien ne le dirait. */
  const registre = await page.evaluate(() => {
    const c = (window as unknown as { __carte: { hasImage(id: string): boolean } }).__carte;
    return { rouge: c.hasImage('cartouche-rouge'), jaune: c.hasImage('cartouche-jaune') };
  });
  expect(registre.rouge, 'l’écusson rouge n’a pas été posé').toBe(true);
  expect(registre.jaune, 'l’écusson jaune n’a pas été posé').toBe(true);

  /* ET LES CALQUES LES RÉCLAMENT, chacun le sien. C'est ce lien-là qui
     transforme un numéro nu en cartouche. */
  const calques = await page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      getStyle(): { layers: { id: string; layout?: Record<string, unknown> }[] };
    } }).__carte;
    return c.getStyle().layers
      .filter((l) => /^num-route-/.test(l.id))
      .map((l) => ({ id: l.id, image: l.layout?.['icon-image'] as string | undefined }));
  });
  expect(calques.length, 'aucun calque de numéro de route').toBeGreaterThanOrEqual(3);
  for (const c of calques) {
    expect(c.image, `${c.id} n’a pas d’écusson`).toMatch(/^cartouche-(rouge|jaune)$/);
  }
  /* L'AUTOROUTE ET LA NATIONALE SUR ROUGE, LA DÉPARTEMENTALE SUR JAUNE :
     c'est la signalisation française, et c'est ce qu'Armelin a photographié. */
  expect(calques.find((c) => c.id.includes('autoroute'))?.image).toBe('cartouche-rouge');
  expect(calques.find((c) => c.id.includes('nationale'))?.image).toBe('cartouche-rouge');
  expect(calques.find((c) => c.id.includes('partementale'))?.image).toBe('cartouche-jaune');

  /* ET DES NUMÉROS SONT BIEN DESSINÉS — le reste ne vaudrait rien sans ça. */
  const numeros = await page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      queryRenderedFeatures(): { layer: { id: string }; properties: Record<string, unknown> }[];
    } }).__carte;
    return [...new Set(c.queryRenderedFeatures()
      .filter((x) => /^num-route-/.test(x.layer.id))
      .map((x) => String(x.properties['texte'])))];
  });
  expect(numeros.length, `numéros dessinés : ${numeros.join(', ')}`).toBeGreaterThanOrEqual(3);
});
