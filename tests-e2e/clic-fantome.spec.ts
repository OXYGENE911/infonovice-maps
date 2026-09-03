import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirPlanificateur } from './planificateur';

/* LE CLIC FANTÔME PAR TRANSPARENCE (FANTOME-1, 03/09).
 *
 * ARMELIN, EN VERSION 1.52, APRÈS L'AVOIR DÉJÀ SIGNALÉ LE 28/08 :
 *
 *   « Quand je configure une adresse de départ ou de destination et que je
 *   clique sur la première suggestion de la liste de complétion, mon doigt
 *   traverse la complétion pour aller cliquer sur le bouton situé en dessous,
 *   qui est soit "Sur la carte", soit "Ma position" ou "travail" suivant
 *   l'adresse de complétion sélectionnée. […] parfois je dois m'y prendre à
 *   trois ou quatre fois pour cliquer au bon endroit. Pour être sûr de ne pas
 *   cliquer sur un bouton situé en dessous, je dois cliquer le plus à droite
 *   possible, là où il n'y a pas de bouton en dessous. »
 *
 * CE QUE J'AVAIS CONCLU LE 28/08 ÉTAIT FAUX, ET LE PARCOURS QUI LE DISAIT
 * AUSSI. J'avais écrit dans `ergonomie.spec.ts` que le `preventDefault()` du
 * `pointerdown` « SUPPRIME déjà les événements souris de compatibilité, click
 * compris » — et j'en avais tiré qu'aucun correctif n'était nécessaire. Ce
 * parcours-là cliquait à la SOURIS. À la souris, il n'y a pas de clic
 * fantôme : le `click` d'une souris se dispatche sur l'ancêtre commun du
 * `mousedown` et du `mouseup`. AU DOIGT, c'est autre chose — le `click` naît
 * de la séquence tactile et vise ce qui se trouve aux coordonnées APRÈS le
 * `touchend`. Comme la sélection referme la liste pendant le `pointerdown`,
 * ce qui se trouve là, c'est le bouton.
 *
 * CE FICHIER TAPE DONC AU DOIGT. C'est la seule façon de voir le défaut
 * qu'Armelin voit, et la raison pour laquelle il a survécu à un parcours
 * écrit exprès pour lui. */

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

const ADRESSE = '8 Rue de la Paix 75002 Paris';

async function ouvrirLaListe(page: Page, champ: 'depart' | 'arrivee'): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/api-adresse.data.gouv.fr/search**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [
      { geometry: { coordinates: [2.330992, 48.868831] },
        properties: { label: ADRESSE, type: 'housenumber', postcode: '75002', city: 'Paris', score: 0.9 } },
      { geometry: { coordinates: [2.3, 48.87] },
        properties: { label: '8 Rue de la Paix 78000 Versailles', type: 'housenumber', postcode: '78000', city: 'Versailles', score: 0.8 } },
    ] }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirPlanificateur(page);
  await page.locator(`[data-role="${champ}"] input`).fill('8 rue de la paix');
  await expect(page.locator(`[data-role="${champ}"] [role="option"]`).first()).toBeVisible();
}

/** Un VRAI toucher : c'est tout le sujet de ce fichier. */
async function taper(page: Page, ou: { x: number; y: number }): Promise<void> {
  await page.touchscreen.tap(ou.x, ou.y);
}

for (const champ of ['depart', 'arrivee'] as const) {
  test(`AU DOIGT, choisir une suggestion de « ${champ} » n’atteint AUCUN bouton dessous`, async ({ page }) => {
    await ouvrirLaListe(page, champ);
    const option = page.locator(`[data-role="${champ}"] [role="option"]`).first();
    const boite = (await option.boundingBox())!;

    /* ON VISE LE HAUT À GAUCHE DE LA SUGGESTION — précisément là où Armelin
       dit ne PAS pouvoir taper : « je dois cliquer le plus à droite possible,
       là où il n'y a pas de bouton en dessous ». Viser ailleurs ferait passer
       ce parcours sans rien prouver.

       MESURÉ LE 03/09 EN 390×844 : la première suggestion occupe y 478→540 sur
       x 22→368, « Sur la carte » et « Ma position » y 472→502 sur x 15→211. Le
       recouvrement est donc la BANDE HAUTE de la suggestion, sur sa moitié
       gauche — huit pixels sous son bord suffisent à tomber dedans. */
    const cible = { x: boite.x + 24, y: boite.y + 8 };

    /* ET L'ON VÉRIFIE QU'IL Y A BIEN UN BOUTON DESSOUS : sans cela, le
       parcours ne prouverait rien. `elementsFromPoint` dit la pile complète,
       ce que l'arithmétique de boîtes ne sait pas faire. */
    const dessous = await page.evaluate(({ x, y }) => document.elementsFromPoint(x, y)
      .map((e) => `${e.tagName}.${String(e.className)}`), cible);
    expect(dessous.join(' '), 'aucun bouton sous la suggestion : le test ne prouve rien')
      .toMatch(/iti-raccourci|BUTTON/);

    await taper(page, cible);

    // LE CHOIX A PORTÉ : c'est l'adresse de la suggestion qui est dans le champ.
    await expect(page.locator(`[data-role="${champ}"] input`)).toHaveValue(ADRESSE);
    /* ET AUCUN BOUTON DE DESSOUS N'A RÉPONDU. « Ma position » remplacerait le
       champ par la position ou lancerait la géolocalisation ; « Sur la carte »
       fermerait le volet pour passer en désignation. */
    await page.waitForTimeout(400);
    await expect(page.locator(`[data-role="${champ}"] input`)).toHaveValue(ADRESSE);
    await expect(page.locator('body'), 'le fantôme a lancé la désignation sur la carte')
      .not.toHaveClass(/cible-en-cours/);
    await expect(page.locator('.iti[open]'), 'le volet s’est refermé sous le doigt')
      .toHaveCount(1);
  });
}

test('LA GARDE NE SURVIT PAS À SA RAISON D’ÊTRE', async ({ page }) => {
  /* LE REMÈDE POURRAIT ÊTRE PIRE QUE LE MAL. La garde retire le clic qui suit
     la sélection s'il tombe dans le rectangle qu'occupait la liste : si elle
     restait en place, elle mangerait aussi le clic VOLONTAIRE que l'usager
     fait ensuite au même endroit — et « Sur la carte » deviendrait
     inatteignable après chaque recherche. Ce parcours est là pour cela. */
  await ouvrirLaListe(page, 'depart');
  const option = page.locator('[data-role="depart"] [role="option"]').first();
  const boite = (await option.boundingBox())!;
  await page.touchscreen.tap(boite.x + 24, boite.y + 8);
  await expect(page.locator('[data-role="depart"] input')).toHaveValue(ADRESSE);
  // LA LISTE EST REFERMÉE : on a trouvé, elle n'a plus à occuper l'écran.
  await expect(page.locator('[data-role="depart"] ul[role="listbox"]')).toBeHidden();

  /* PUIS ON TAPE VRAIMENT SUR « Sur la carte », au même endroit, une fois la
     garde expirée. Il DOIT répondre. */
  const surCarte = page.locator('[data-pour="depart"] .iti-raccourci-carte');
  await expect(surCarte).toBeVisible();
  await page.waitForTimeout(500);
  const b = (await surCarte.boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  /* LA DÉSIGNATION SUR LA CARTE EST LANCÉE : le volet s'efface pour laisser
     voir la carte, ce qui est très exactement ce que le fantôme provoquait
     par erreur — et qui doit rester possible à la demande. */
  await expect(page.locator('.iti[open]')).toHaveCount(0);
});
