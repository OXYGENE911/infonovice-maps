import { test, expect, type Locator, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* ERGONOMIE — ce que l'œil voit se prouve par des RECTANGLES, pas par des
   captures d'écran. Un panneau qui recouvre le bouton d'à côté, un pied de
   page posé sur l'attribution IGN : ces défauts sont des intersections de
   boîtes englobantes, et une intersection se mesure. Le dépôt a déjà appris
   cette leçon une fois — le décalage des contrôles sous l'en-tête était un
   nombre magique jusqu'à ce qu'un `elementFromPoint` le corrige. */

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

/** Les cinq entrées du rail de gauche. « Fonds » n'y est plus : il vit en bas
 *  à droite, avec les réglages d'affichage. */
const RAIL = ['Itinéraire', 'Autour', 'Trafic', 'Transports', 'Favoris'] as const;

const entree = (page: Page, nom: string): Locator =>
  page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: nom }).first();

interface Boite { x: number; y: number; width: number; height: number }

async function boite(l: Locator): Promise<Boite> {
  const b = await l.boundingBox();
  if (!b) throw new Error('élément sans boîte englobante — invisible ?');
  return b;
}

/** Deux rectangles se chevauchent-ils ? Une tolérance d'un pixel évite de
 *  compter comme défaut deux bords simplement jointifs. */
function seChevauchent(a: Boite, b: Boite): boolean {
  const marge = 1;
  return a.x < b.x + b.width - marge && a.x + a.width - marge > b.x
    && a.y < b.y + b.height - marge && a.y + a.height - marge > b.y;
}

async function ouvrirLaCarte(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

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
      const boiteBouton = await boite(bouton);
      expect(seChevauchent(boitePanneau, boiteBouton),
        `le panneau « ${nom} » recouvre le bouton « ${autre} »`).toBe(false);
    }

    await page.keyboard.press('Escape');
  }
});

test('Échap referme le panneau ouvert', async ({ page }) => {
  await ouvrirLaCarte(page);
  const ouvert = page.locator('.maplibregl-ctrl-top-left details[open]');

  await entree(page, 'Autour').click();
  await expect(ouvert).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(ouvert, 'Échap doit refermer — sans clavier, le menu est un piège').toHaveCount(0);
});

test('un clic sur la carte referme le panneau ouvert', async ({ page }) => {
  await ouvrirLaCarte(page);
  const ouvert = page.locator('.maplibregl-ctrl-top-left details[open]');

  await entree(page, 'Trafic').click();
  await expect(ouvert).toHaveCount(1);

  // Loin des contrôles : le centre-droit de la carte.
  await page.mouse.click(900, 500);
  await expect(ouvert, 'cliquer à côté doit refermer').toHaveCount(0);
});

test('ouvrir un panneau referme le précédent — un seul à la fois', async ({ page }) => {
  await ouvrirLaCarte(page);
  const ouvert = page.locator('.maplibregl-ctrl-top-left details[open]');

  await entree(page, 'Autour').click();
  await expect(ouvert).toHaveCount(1);

  await entree(page, 'Favoris').click();
  await expect(ouvert, 'deux panneaux ouverts en même temps encombrent l’écran').toHaveCount(1);
  await expect(ouvert.locator('summary')).toHaveText(/Favoris/);
});

test('le pied de page ne recouvre pas l’attribution IGN', async ({ page }) => {
  await ouvrirLaCarte(page);

  const pied = page.locator('.pied-carte');
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  await expect(pied).toBeVisible();
  await expect(attribution).toBeVisible();

  // L'attribution est une OBLIGATION de la Géoplateforme : la masquer, même
  // à moitié, n'est pas un défaut cosmétique.
  expect(seChevauchent(await boite(pied), await boite(attribution)),
    'les liens légaux se posent sur l’attribution IGN').toBe(false);

  /* ET AUCUN AUTRE OCCUPANT DES COINS BAS. Le premier correctif dégageait
     l'attribution et posait aussitôt le pied sur le bouton « Fonds »
     fraîchement déplacé : une collision réparée, une créée. On vérifie donc
     tout le voisinage, pas la seule paire qui avait fait défaut. */
  const boitePied = await boite(pied);
  const voisins = page.locator(
    '.maplibregl-ctrl-bottom-right .maplibregl-ctrl, .maplibregl-ctrl-bottom-left .maplibregl-ctrl');
  const nombre = await voisins.count();
  expect(nombre, 'aucun contrôle en bas — la vérification serait vide').toBeGreaterThan(0);
  for (let i = 0; i < nombre; i++) {
    const voisin = voisins.nth(i);
    if (!(await voisin.isVisible())) continue;
    expect(seChevauchent(boitePied, await boite(voisin)),
      `les liens légaux recouvrent un contrôle du bas (n° ${i})`).toBe(false);
  }
});

test('le choix du fond de carte vit en bas à droite', async ({ page }) => {
  await ouvrirLaCarte(page);

  const fonds = page.locator('.maplibregl-ctrl-bottom-right summary').filter({ hasText: 'Fonds' });
  await expect(fonds, 'les réglages d’affichage appartiennent au coin bas-droit').toBeVisible();

  // Et son panneau s'ouvre VERS LE HAUT : sous le bouton, il sortirait de l'écran.
  await fonds.click();
  const panneau = page.locator('.maplibregl-ctrl-bottom-right details[open] fieldset');
  await expect(panneau).toBeVisible();
  const [bBouton, bPanneau] = [await boite(fonds), await boite(panneau)];
  expect(bPanneau.y, 'le panneau doit s’ouvrir au-dessus du bouton').toBeLessThan(bBouton.y);
});
