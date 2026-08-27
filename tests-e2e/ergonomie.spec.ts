import { test, expect, type Locator, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirMenu } from './volets';

/* ERGONOMIE — ce que l'œil voit se prouve par des RECTANGLES, pas par des
   captures d'écran. Un panneau qui recouvre le bouton d'à côté, un menu posé
   sur « Me localiser », un pied de page sur l'attribution IGN : ce sont des
   intersections de boîtes englobantes, et une intersection se mesure. Le
   dépôt a déjà appris cette leçon une fois — le décalage des contrôles sous
   l'en-tête était un nombre magique jusqu'à ce qu'un `elementFromPoint` le
   corrige. */

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

/* DEUX POINTS D'ENTRÉE, PAS SIX. À gauche ce qui concerne le TRAJET ; en haut
   à droite, derrière un menu, ce qui concerne les RÉGLAGES. Six pastilles de
   même poids ne hiérarchisaient rien et débordaient de l'écran.

   LA FRONTIÈRE A BOUGÉ LE 26/08/2026, sur le retour d'Armelin : « la recherche
   de point de charge devrait être dans le menu de gauche », et « jongler entre
   le menu de gauche et celui de droite nuit à l'ergonomie ». Le volet des
   bornes et services est donc passé à gauche — avec les stations-service et
   les parkings, qui sont comme elles des endroits où l'on s'arrête EN ROUTE.
   Chercher où recharger n'est pas régler l'affichage de la carte.

   Le menu de droite garde ce qui répond vraiment à « que voir sur la carte » :
   le fond, le trafic, les transports — et « mes lieux ». */
/* UN SEUL BOUTON, depuis le 27/08/2026. Armelin : « il y a trois boutons dans
   la page d'accueil "Itinéraire", "Recharge et services" et "Véhicule", qui
   pourraient tous être regroupés dans un unique bouton "Itinéraire" […] Un
   seul bouton est plus efficace à comprendre que trois boutons où il faudra se
   rappeler dans quel menu on peut trouver quelle option. » */
const RAIL = ['Itinéraire'] as const;
const RANGES_DANS_LE_MENU = ['.fonds', '.trafic', '.transports', '.favoris'] as const;

const entree = (page: Page, nom: string): Locator =>
  page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: nom }).first();

interface Boite { x: number; y: number; width: number; height: number }

async function boite(l: Locator): Promise<Boite> {
  const b = await l.boundingBox();
  if (!b) throw new Error('élément sans boîte englobante — invisible ?');
  return b;
}

/** Une tolérance d'un pixel évite de compter deux bords jointifs comme défaut. */
function seChevauchent(a: Boite, b: Boite): boolean {
  const marge = 1;
  return a.x < b.x + b.width - marge && a.x + a.width - marge > b.x
    && a.y < b.y + b.height - marge && a.y + a.height - marge > b.y;
}

async function ouvrirLaCarte(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

test('le rail de gauche ne porte QUE le trajet', async ({ page }) => {
  await ouvrirLaCarte(page);

  /* SEULS LES VOLETS DE TÊTE COMPTENT. Le planificateur contient ses propres
     volets imbriqués (profil altimétrique, feuille de route, météo, trajet) :
     les compter donnait six entrées là où l'écran n'en montre que deux. */
  const rail = page.locator('.maplibregl-ctrl-top-left > div > * > details > summary');
  await expect(rail, 'un rail qui s’allonge redevient un fouillis').toHaveCount(RAIL.length);
  for (const nom of RAIL) await expect(entree(page, nom)).toBeVisible();
});

test('le menu range les couches, les lieux et l’affichage', async ({ page }) => {
  await ouvrirLaCarte(page);

  // Fermé, il ne montre rien : c'est tout l'intérêt.
  for (const volet of RANGES_DANS_LE_MENU) {
    await expect(page.locator(`${volet} summary`),
      `« ${volet} » ne doit pas s’afficher menu fermé`).toBeHidden();
  }

  await ouvrirMenu(page);
  for (const volet of RANGES_DANS_LE_MENU) {
    await expect(page.locator(`.reglages-corps ${volet} summary`),
      `« ${volet} » devrait être rangé dans le menu`).toBeVisible();
  }
});

test('la recharge est une PAGE du trajet — jamais un bouton de plus', async ({ page }) => {
  /* CE TEST EXISTE POUR EMPÊCHER UN RETOUR EN ARRIÈRE, deux fois. Le
     va-et-vient entre les deux côtés de l'écran était le premier reproche ; la
     multiplication des boutons à gauche fut le second. Ni l'un ni l'autre ne
     doit se réinstaller par souci de symétrie — la symétrie n'est pas le
     critère, l'intention l'est. */
  await ouvrirLaCarte(page);
  await expect(page.locator('.reglages-corps .poi'),
    'la recherche de bornes est retournée dans le menu de droite').toHaveCount(0);
  await expect(page.locator('.vue-hote[data-vue="couches"] .poi'),
    'la recherche de bornes n’est plus une page du planificateur').toHaveCount(1);
  await expect(page.locator('.vue-hote[data-vue="vehicule"] .vehicule')).toHaveCount(1);
});

test('le haut-droit ne porte QUE le menu', async ({ page }) => {
  /* Mêler « où je regarde » (zoom, boussole, localisation) et « ce que
     j'affiche » (couches, lieux, fond) dans une même colonne obligeait l'œil à
     trier. Les commandes de vue sont descendues en bas de la même colonne. */
  await ouvrirLaCarte(page);
  await expect(page.locator('.maplibregl-ctrl-top-right .maplibregl-ctrl'),
    'un coin qui se remplit redevient un fouillis').toHaveCount(1);
  await expect(page.locator('.maplibregl-ctrl-top-right .reglages')).toBeVisible();

  // Et les commandes de vue sont bien en bas, atteignables.
  await expect(page.getByRole('button', { name: 'Zoomer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Me localiser' })).toBeVisible();
});

test('le menu ouvert ne recouvre AUCUN contrôle de la carte', async ({ page }) => {
  /* LE DÉFAUT EXACT QU'UNE CAPTURE A RÉVÉLÉ : posé avant la géolocalisation
     dans la colonne, le panneau recouvrait « Me localiser » — une
     fonctionnalité rendue inatteignable par une décoration. */
  await ouvrirLaCarte(page);
  await ouvrirMenu(page);

  const panneau = await boite(page.locator('.reglages-corps'));
  const controles = page.locator(
    '.maplibregl-ctrl-top-right button, .maplibregl-ctrl-bottom-right button');
  const nombre = await controles.count();
  expect(nombre, 'aucun contrôle — la vérification serait vide').toBeGreaterThan(0);

  for (let i = 0; i < nombre; i++) {
    const bouton = controles.nth(i);
    if (!(await bouton.isVisible())) continue;
    const nom = (await bouton.getAttribute('aria-label')) ?? `bouton ${i}`;
    expect(seChevauchent(panneau, await boite(bouton)),
      `le menu recouvre « ${nom} »`).toBe(false);
  }
});

test('un panneau ouvert ne recouvre aucune autre entrée du rail', async ({ page }) => {
  await ouvrirLaCarte(page);

  for (const nom of RAIL) {
    await entree(page, nom).click();
    const panneau = page.locator('.maplibregl-ctrl-top-left details[open] > :not(summary)').first();
    await expect(panneau).toBeVisible();
    const boitePanneau = await boite(panneau);

    for (const autre of RAIL) {
      if (autre === nom) continue;
      const bouton = entree(page, autre);
      // Le bouton doit rester VISIBLE et CLIQUABLE, pas seulement présent.
      await expect(bouton, `« ${autre} » disparaît quand « ${nom} » est ouvert`).toBeVisible();
      expect(seChevauchent(boitePanneau, await boite(bouton)),
        `le panneau « ${nom} » recouvre le bouton « ${autre} »`).toBe(false);
    }

    await page.keyboard.press('Escape');
  }
});

test('Échap referme le panneau ouvert', async ({ page }) => {
  await ouvrirLaCarte(page);
  const ouvert = page.locator('.maplibregl-ctrl-top-left > div > * > details[open]');

  await entree(page, 'Itinéraire').click();
  await expect(ouvert).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(ouvert, 'Échap doit refermer — sans clavier, le menu est un piège').toHaveCount(0);
});

test('Échap referme aussi le menu des réglages', async ({ page }) => {
  await ouvrirLaCarte(page);
  await ouvrirMenu(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('details.reglages[open]')).toHaveCount(0);
});

test('un clic sur la carte NE referme PAS le planificateur', async ({ page }) => {
  /* CE PARCOURS A CHANGÉ DE SENS LE 27/08/2026, et le motif compte.
     Le rail portait des volets TRANSITOIRES qu'un clic à côté refermait — le
     bon comportement pour un formulaire qu'on remplit puis qu'on quitte.
     Depuis que le planificateur ABRITE les couches de la carte et le profil du
     véhicule, il est devenu une SURFACE DE TRAVAIL : on y coche « Bornes
     électriques », on inspecte une borne, on en coche une autre. Le refermer à
     chaque clic obligerait à le rouvrir entre chaque geste — c'est exactement
     le défaut relevé le 26/08 sur ce même volet. */
  await ouvrirLaCarte(page);

  await entree(page, 'Itinéraire').click();
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]')).toHaveCount(1);
  await page.mouse.click(640, 500);   // plein centre, loin des contrôles
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]'),
    'le planificateur s’est évanoui au premier clic sur la carte').toHaveCount(1);

  // Il se ferme par Échap, ou par son propre bouton.
  await page.keyboard.press('Escape');
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]')).toHaveCount(0);
});

test('mais un clic sur la carte NE referme PAS le menu des réglages', async ({ page }) => {
  /* LE MENU EST UNE SURFACE DE TRAVAIL, pas un volet transitoire. On y active
     une couche, on inspecte un point sur la carte, on en active une autre :
     le refermer à chaque clic obligerait à le rouvrir entre chaque geste.
     Cinq parcours écrits AVANT ce menu encodaient déjà ce va-et-vient, et la
     CI les a vus rougir le jour où le menu s'est mis à disparaître. */
  await ouvrirLaCarte(page);
  await ouvrirMenu(page);

  await page.mouse.click(640, 500);
  await expect(page.locator('details.reglages[open]'),
    'le menu s’est évanoui au premier clic sur la carte').toHaveCount(1);

  // Il se ferme par Échap, par son bouton, ou en ouvrant le planificateur.
  await entree(page, 'Itinéraire').click();
  await expect(page.locator('details.reglages[open]'),
    'ouvrir le planificateur devrait refermer le menu').toHaveCount(0);
});

test('ouvrir le planificateur referme le menu des réglages, et l’inverse', async ({ page }) => {
  /* IL N'Y A PLUS QU'UN VOLET DANS LE RAIL : l'exclusion se joue désormais
     entre lui et le menu de droite. Deux surfaces de trois cents pixels
     ouvertes ensemble ne laisseraient presque plus de carte. */
  await ouvrirLaCarte(page);
  await entree(page, 'Itinéraire').click();
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]')).toHaveCount(1);

  await ouvrirMenu(page);
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]'),
    'deux surfaces ouvertes en même temps ne laissent plus de carte').toHaveCount(0);

  await entree(page, 'Itinéraire').click();
  await expect(page.locator('details.reglages[open]')).toHaveCount(0);
});

test('le pied de page ne recouvre rien', async ({ page }) => {
  await ouvrirLaCarte(page);

  const pied = page.locator('.pied-carte');
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  await expect(pied).toBeVisible();
  await expect(attribution).toBeVisible();

  // L'attribution est une OBLIGATION de la Géoplateforme : la masquer, même à
  // moitié, n'est pas un défaut cosmétique.
  const boitePied = await boite(pied);
  expect(seChevauchent(boitePied, await boite(attribution)),
    'les liens légaux se posent sur l’attribution IGN').toBe(false);

  /* ET AUCUN AUTRE OCCUPANT DES COINS BAS. Un premier correctif dégageait
     l'attribution et posait aussitôt le pied sur un bouton fraîchement
     déplacé : une collision réparée, une créée. */
  const voisins = page.locator(
    '.maplibregl-ctrl-bottom-right .maplibregl-ctrl, .maplibregl-ctrl-bottom-left .maplibregl-ctrl');
  const nombre = await voisins.count();
  for (let i = 0; i < nombre; i++) {
    const voisin = voisins.nth(i);
    if (!(await voisin.isVisible())) continue;
    expect(seChevauchent(boitePied, await boite(voisin)),
      `les liens légaux recouvrent un contrôle du bas (n° ${i})`).toBe(false);
  }
});

test('l’attribution de MapLibre n’est PAS traitée comme un de nos volets', async ({ page }) => {
  /* MAPLIBRE REND SON ATTRIBUTION COMPACTE AVEC UN <details>. Une détection
     purement structurelle — « un <details> sans <details> ancêtre » —
     l'adoptait comme volet de tête. Deux conséquences, dont une grave :
     ouvrir un volet refermait l'attribution (une OBLIGATION de la
     Géoplateforme), et MapLibre l'ouvrant au chargement refermait le
     planificateur — un lien partagé n'affichait alors plus rien.

     La CI l'a attrapé, pas les essais locaux : le défaut dépend de l'ordre
     dans lequel MapLibre bascule son attribution. */
  await ouvrirLaCarte(page);

  const attribution = page.locator('details.maplibregl-ctrl-attrib');
  await expect(attribution, 'l’attribution devrait bien être un <details>').toHaveCount(1);

  // 1. Ouvrir un volet ne doit pas refermer l'attribution.
  await attribution.evaluate((d: HTMLDetailsElement) => { d.open = true; });
  await entree(page, 'Itinéraire').click();
  await expect(attribution, 'ouvrir un volet a refermé l’attribution IGN')
    .toHaveAttribute('open', '');

  // 2. Ouvrir l'attribution ne doit pas refermer notre volet.
  await attribution.evaluate((d: HTMLDetailsElement) => { d.open = false; });
  await attribution.evaluate((d: HTMLDetailsElement) => { d.open = true; });
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]'),
    'l’attribution a refermé le volet — un lien partagé n’afficherait plus rien')
    .toHaveCount(1);
});
