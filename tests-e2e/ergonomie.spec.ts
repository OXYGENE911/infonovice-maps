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
   même poids ne hiérarchisaient rien et débordaient de l'écran. */
const RAIL = ['Itinéraire', 'Véhicule'] as const;
const RANGES_DANS_LE_MENU = ['.fonds', '.poi', '.trafic', '.transports', '.favoris'] as const;

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

test('le menu ouvert ne recouvre AUCUN contrôle de la carte', async ({ page }) => {
  await ouvrirLaCarte(page);
  await ouvrirMenu(page);

  /* LE DÉFAUT EXACT QU'UNE CAPTURE A RÉVÉLÉ : posé avant la géolocalisation
     dans la colonne, le panneau recouvrait « Me localiser » — une
     fonctionnalité rendue inatteignable par une décoration. */
  const panneau = await boite(page.locator('.reglages-corps'));
  const controles = page.locator('.maplibregl-ctrl-top-right button');
  const nombre = await controles.count();
  expect(nombre, 'aucun contrôle à droite — la vérification serait vide').toBeGreaterThan(0);

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
  const ouvert = page.locator('.maplibregl-ctrl-top-left details[open]');

  await entree(page, 'Véhicule').click();
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

test('un clic sur la carte referme ce qui est ouvert', async ({ page }) => {
  await ouvrirLaCarte(page);

  await ouvrirMenu(page);
  await page.mouse.click(640, 500);   // plein centre, loin des contrôles
  await expect(page.locator('details.reglages[open]'), 'cliquer à côté doit refermer')
    .toHaveCount(0);
});

test('ouvrir un panneau du rail referme le précédent', async ({ page }) => {
  await ouvrirLaCarte(page);
  const ouvert = page.locator('.maplibregl-ctrl-top-left details[open]');

  await entree(page, 'Itinéraire').click();
  await expect(ouvert).toHaveCount(1);

  await entree(page, 'Véhicule').click();
  await expect(ouvert, 'deux panneaux ouverts en même temps encombrent l’écran').toHaveCount(1);
  await expect(ouvert.locator('summary').first()).toHaveText(/Véhicule/);
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
