import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LES FEUILLES BASSES — la décision d'Armelin du 28/08 : « commence par les
 * bottom sheets ». Sur téléphone, planificateur et menu s'ancrent en bas et
 * se règlent à la poignée ; sur grand écran, RIEN ne change. Tout se mesure
 * en rectangles, comme le socle mobile de la PR #69.
 */

const VUE = { width: 375, height: 812 };

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

async function ouvrirCarte(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

/** Tire la poignée d'une feuille de `dy` pixels (négatif = vers le haut). */
async function tirer(page: Page, selecteur: string, dy: number, pas = 12): Promise<void> {
  const poignee = (await page.locator(selecteur).boundingBox())!;
  const x = poignee.x + poignee.width / 2;
  const y = poignee.y + poignee.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: pas });
  await page.mouse.up();
}

test('sur téléphone, le planificateur est une FEUILLE : ancrée en bas, mi-hauteur, carte visible', async ({ page }) => {
  await page.setViewportSize(VUE);
  await ouvrirCarte(page);
  await page.locator('.iti > summary').click();

  const corps = (await page.locator('.iti-corps').boundingBox())!;
  // Ancrée au bas de l'écran, pleine largeur.
  expect(corps.y + corps.height, 'la feuille ne touche pas le bas').toBeGreaterThan(VUE.height - 2);
  expect(corps.x).toBeLessThanOrEqual(1);
  expect(corps.width).toBeGreaterThan(VUE.width - 3);
  // À mi-hauteur : la carte respire au-dessus — c'était le reproche des
  // captures (le volet couvrait l'écran).
  expect(corps.height).toBeGreaterThan(VUE.height * 0.4);
  expect(corps.height).toBeLessThan(VUE.height * 0.6);
  await expect(page.locator('.feuille-poignee').first()).toBeVisible();
});

test('la poignée RÈGLE la hauteur : plein écran au tirer, fermée au geste franc vers le bas', async ({ page }) => {
  await page.setViewportSize(VUE);
  await ouvrirCarte(page);
  await page.locator('.iti > summary').click();
  await expect(page.locator('.iti .feuille-poignee')).toBeVisible();

  // Tirée vers le HAUT : la feuille s'arrime au plein écran (~88 %), et
  // l'en-tête reste visible — une feuille ne mange jamais tout.
  await tirer(page, '.iti .feuille-poignee', -320);
  await expect.poll(async () => (await page.locator('.iti-corps').boundingBox())!.height)
    .toBeGreaterThan(VUE.height * 0.8);
  const entete = (await page.locator('.entete').boundingBox())!;
  const haut = (await page.locator('.iti-corps').boundingBox())!;
  expect(haut.y, 'la feuille recouvre l’en-tête').toBeGreaterThanOrEqual(entete.y + entete.height - 1);

  // Un geste FRANC vers le bas depuis la poignée : la feuille se ferme.
  await tirer(page, '.iti .feuille-poignee', 640, 3);
  await expect(page.locator('.iti')).not.toHaveAttribute('open', '');
  // Et la prochaine ouverture repart à MI-hauteur : la hauteur ne colle pas.
  await page.locator('.iti > summary').click();
  const rouverte = (await page.locator('.iti-corps').boundingBox())!;
  expect(rouverte.height).toBeLessThan(VUE.height * 0.6);
});

/* LE MENU N'EST PLUS UNE FEUILLE — Armelin, le 29/08 : « ce serait mieux
 * d'afficher le menu sous forme de fenêtre flottante ». Il l'ouvrait, y
 * lisait « un grand vide noir en haut » (la poignée s'étirait sur 72 px
 * mesurés dans un corps en grille) et son sous-menu « Fonds » tombait SOUS
 * l'écran (mesuré : y = 852 px sur 844). Une fenêtre haute comme son
 * contenu règle les deux. Le planificateur, lui, garde sa feuille : c'est
 * le panneau qu'on ouvre et referme sans arrêt. */
test('le MENU est une FENÊTRE flottante : détachée des quatre bords, haute comme son contenu', async ({ page }) => {
  await page.setViewportSize(VUE);
  await ouvrirCarte(page);
  await page.locator('summary[aria-label="Menu : réglages, couches et lieux"]').click();

  const corps = (await page.locator('.reglages-corps').boundingBox())!;
  expect(corps.x, 'la fenêtre touche le bord gauche').toBeGreaterThan(4);
  expect(corps.x + corps.width, 'la fenêtre touche le bord droit').toBeLessThan(VUE.width - 4);
  expect(corps.y + corps.height, 'la fenêtre touche le bas').toBeLessThan(VUE.height - 4);
  // Haute comme son contenu, pas comme un demi-écran : plus de vide en tête.
  expect(corps.height).toBeLessThan(VUE.height * 0.62);
  await expect(page.locator('.reglages .feuille-poignee'),
    'une fenêtre ne se tire pas : pas de poignée').toBeHidden();

  /* ET LE SOUS-MENU « FONDS » SE VOIT AU CLIC, dans le cadre. */
  await page.locator('.reglages-corps .fonds summary').click();
  const choix = page.locator('.reglages-corps .fonds fieldset');
  await expect(choix).toBeVisible();
  const boite = (await choix.boundingBox())!;
  expect(boite.y + boite.height, 'le choix des fonds tombe hors de l’écran')
    .toBeLessThanOrEqual(VUE.height);
});

test('une PAGE du planificateur est une fenêtre — et le retour rend la feuille', async ({ page }) => {
  /* Armelin, le 29/08 : « quand je clique sur un pictogramme, je n'ai
     toujours pas de fenêtre flottante pour la configuration ». L'accueil
     reste la feuille qu'il avait demandée ; la page se détache. */
  await page.setViewportSize(VUE);
  await ouvrirCarte(page);
  await page.locator('.iti > summary').click();

  const feuille = (await page.locator('.iti-corps').boundingBox())!;
  expect(feuille.y + feuille.height, 'l’accueil doit rester une feuille')
    .toBeGreaterThan(VUE.height - 2);

  await page.locator('.iti-vers[data-vers="vehicule"]').click();
  await expect(page.locator('.vue[data-vue="vehicule"]')).toBeVisible();
  await expect(page.locator('details.iti')).toHaveAttribute('data-page', 'vehicule');
  const fenetre = (await page.locator('.iti-corps').boundingBox())!;
  expect(fenetre.x, 'la fenêtre touche le bord gauche').toBeGreaterThan(4);
  expect(fenetre.x + fenetre.width).toBeLessThan(VUE.width - 4);
  expect(fenetre.y + fenetre.height, 'la fenêtre touche le bas').toBeLessThan(VUE.height - 4);
  await expect(page.locator('.iti .feuille-poignee')).toBeHidden();

  // Retour : la feuille revient, poignée comprise — rien n'est perdu.
  await page.locator('.vue-retour').click();
  await expect(page.locator('details.iti')).not.toHaveAttribute('data-page', /.*/);
  const revenue = (await page.locator('.iti-corps').boundingBox())!;
  expect(revenue.y + revenue.height).toBeGreaterThan(VUE.height - 2);
  await expect(page.locator('.iti .feuille-poignee')).toBeVisible();
});

test('FEN-4 : sur GRAND ÉCRAN aussi, une page est une fenêtre — et le voile ne la grise PAS', async ({ page }) => {
  /* Armelin, le 29/08, sur bureau : « quand je clique sur les options
     d'itinéraire, la fenêtre est grisée dans tous les menus et un éclairage
     qui diminue et je n'ai toujours pas les fenêtres flottantes ». DEUX
     défauts en un : le voile de FEN-2 se peignait PAR-DESSUS le panneau
     (la montée du conteneur porteur ne vivait que dans le bloc téléphone),
     et FEN-2 n'avait détaché que le téléphone. */
  await ouvrirCarte(page);
  await page.locator('.iti > summary').click();
  await page.locator('.iti-vers[data-vers="options"]').click();
  await expect(page.locator('.vue[data-vue="options"]')).toBeVisible();

  // LE PORTEUR PASSE AU-DESSUS DU VOILE : la fenêtre n'est plus grisée.
  const rangs = await page.evaluate(() => ({
    porteur: Number(getComputedStyle(
      document.querySelector('#carte .maplibregl-ctrl-top-left')!).zIndex),
    voile: Number(getComputedStyle(document.querySelector('#carte')!, '::after').zIndex),
  }));
  expect(rangs.porteur, 'le voile recouvre la fenêtre').toBeGreaterThan(rangs.voile);

  /* ELLE SE POSE AU CENTRE (FEN-5). Le premier correctif l'avait décrochée
     de sa colonne… pour la reposer douze pixels plus loin : « la
     colorimétrie est revenue mais je n'ai toujours pas de fenêtre
     flottante ». Une fenêtre ancrée là où le tiroir se trouvait RESTE un
     tiroir à l'œil. On mesure donc le CENTRAGE, pas un écart au bord. */
  const fenetre = (await page.locator('.iti-corps').boundingBox())!;
  const ecran = page.viewportSize()!;
  expect(Math.abs((fenetre.x + fenetre.width / 2) - ecran.width / 2),
    'la fenêtre n’est pas centrée').toBeLessThan(4);
  expect(fenetre.x, 'la fenêtre reste dans la colonne de gauche')
    .toBeGreaterThan(ecran.width * 0.25);
  await expect(page.locator('.iti-corps')).toHaveCSS('border-radius', '18px');
  await expect(page.locator('.iti-corps')).toHaveCSS('position', 'fixed');
  // ET ELLE SE FERME : une fenêtre a une croix, pas seulement une flèche.
  await expect(page.locator('.vue-fermer')).toBeVisible();

  // Et le retour à l'accueil rend le volet latéral d'origine.
  await page.locator('.vue-retour').click();
  await expect(page.locator('.iti-corps')).toHaveCSS('position', 'static');
  await expect(page.locator('.vue-fermer'), 'l’accueil n’est pas une fenêtre')
    .toBeHidden();

  /* LA CROIX CONGÉDIE TOUT : elle ferme la fenêtre ET le volet, et l'on
     revient à l'accueil — rouvrir sur la page qu'on venait de quitter
     serait une surprise. */
  await page.locator('.iti-vers[data-vers="options"]').click();
  await page.locator('.vue-fermer').click();
  await expect(page.locator('.iti')).not.toHaveAttribute('open', '');
  await page.locator('.iti > summary').click();
  await expect(page.locator('.vue-accueil')).toBeVisible();
});

test('sur GRAND écran, l’accueil ne change pas : volet latéral, poignée absente', async ({ page }) => {
  /* La feuille est un remède au pouce et au petit écran — pas une mode à
     imposer au bureau, où les panneaux latéraux laissent lire la carte. */
  await ouvrirCarte(page);
  await page.locator('.iti > summary').click();
  const corps = (await page.locator('.iti-corps').boundingBox())!;
  // Le volet vit à gauche, PAS ancré au bas de la fenêtre.
  expect(corps.x).toBeGreaterThan(4);
  expect(corps.y + corps.height).toBeLessThan(719);
  await expect(page.locator('.iti .feuille-poignee')).toBeHidden();
});

test('FEN-3 : un cartouche de détail est une fenêtre — au-dessus de son voile, et le pied de page se tait', async ({ page }) => {
  /* « Poursuivre […] les fenêtres flottantes » (Armelin, 29/08) : les pages
     et le menu l'étaient devenus, les cartouches de détail gardaient
     l'ancien habit. DEUX PIÈGES DÉJÀ PAYÉS AILLEURS se retrouvaient ici —
     le voile qui passe PAR-DESSUS sa propre fenêtre (rang 5 contre 9), et
     le pied de page qui traverse tout ce qui vit dans #carte. */
  await page.setViewportSize(VUE);
  await page.route('**/donnees/monuments.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([[2.35, 48.857, 'Chapelle d’essai', 'Paris', 'PA00000001', '', '']]),
  }));
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [2.4, 48.87]] },
      distance: 5_000, duration: 600,
    }),
  }));
  // Wikidata muet : la fiche vit sans photo, et ce parcours ne parle pas d'elle.
  await page.route('**query.wikidata.org/**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: '{"results":{"bindings":[]}}',
  }));
  await page.goto('/#iti=2.35220,48.85660;2.40000,48.87000;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('5,0 km', { timeout: 15_000 });
  await page.locator('.iti-vers[data-vers="monuments"]').click();
  await page.locator('.monuments-voir').first().click();

  const fiche = page.locator('fiche-lieu');
  await expect(fiche).toBeVisible();
  // Elle passe AU-DESSUS du voile : une fenêtre ne s'assombrit pas elle-même.
  const rangs = await page.evaluate(() => ({
    fiche: Number(getComputedStyle(document.querySelector('fiche-lieu')!).zIndex),
    voile: Number(getComputedStyle(document.querySelector('#carte')!, '::after').zIndex),
  }));
  expect(rangs.fiche).toBeGreaterThan(rangs.voile);
  // Et le pied de page cesse de la traverser.
  await expect(page.locator('.pied-carte')).toBeHidden();
  await fiche.locator('.fb-fermer').click();
  await expect(page.locator('.pied-carte')).toBeVisible();
});
