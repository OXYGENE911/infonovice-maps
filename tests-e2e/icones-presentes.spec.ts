import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* CHAQUE ICÔNE RÉFÉRENCÉE DOIT RÉPONDRE (MASCOTTE-2, 04/09).
 *
 * LE PIÈGE PAYÉ : « !public/*.png » dans .gitignore n'était pas récursif —
 * les icônes de LOGO-1 (favicon, mascotte, apple-touch) vivaient sur le
 * poste de travail mais n'entraient jamais au dépôt. Le poste les servait,
 * la CI et la production jamais : Armelin a vu « un carré avec une image
 * cassée » à droite de la barre de recherche — la mascotte en 404 — et le
 * favicon de l'onglet était mort aussi.
 *
 * CE PARCOURS TOURNE SUR LE DIST DE LA CI, construit depuis l'arbre GIT :
 * une icône ignorée par git y manque, et le parcours vire au rouge — c'est
 * exactement la faille par laquelle le défaut est passé. */

test('CHAQUE ICÔNE RÉFÉRENCÉE PAR LA PAGE répond — favicon, mascottes, manifeste', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');

  const urls = await page.evaluate(async () => {
    const liens = [...document.querySelectorAll<HTMLLinkElement>(
      'link[rel*="icon"], link[rel="apple-touch-icon"]',
    )].map((l) => l.href);
    const images = [...document.querySelectorAll<HTMLImageElement>('img[src*="/icones/"]')]
      .map((i) => i.src);
    /* Le manifeste PWA porte ses propres icônes — celles de l'écran
       d'accueil du téléphone : mortes, l'installation est défigurée. */
    const manifeste = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const duManifeste: string[] = [];
    if (manifeste) {
      const m = await fetch(manifeste.href).then((r) => r.json()) as
        { icons?: { src: string }[] };
      for (const i of m.icons ?? []) duManifeste.push(new URL(i.src, location.href).href);
    }
    return [...new Set([...liens, ...images, ...duManifeste])];
  });
  /* Favicon + apple-touch + mascottes + manifeste : moins de cinq adresses
     voudrait dire que le filet lui-même a un trou. */
  expect(urls.length, urls.join(', ')).toBeGreaterThanOrEqual(5);

  for (const u of urls) {
    const r = await page.request.get(u);
    expect(r.status(), `${u} doit répondre`).toBe(200);
    expect(r.headers()['content-type'], `${u} doit être une image`).toContain('image');
  }
});

/* LE CHIEN DE LA PAGE VIERGE. Armelin : « ce serait bien de l'égayer avec
   un des logos de Chien en plein milieu du vide blanc en attendant que
   l'utilisateur tape un texte et que le logo disparaisse pour laisser
   apparaître les résultats ». */
test('LE CHIEN MEUBLE LA PAGE VIERGE, et s’efface devant la saisie comme devant les résultats', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  for (const motif of [
    '**/api-adresse.data.gouv.fr/**', '**/data.geopf.fr/geocodage/**',
    '**/recherche-entreprises.api.gouv.fr/**', '**/data.education.gouv.fr/**', '**/api-lannuaire.service-public.fr/**',
  ]) {
    await page.route(motif, (route) => route.fulfill({
      headers: cors, contentType: 'application/json',
      body: JSON.stringify({ features: [], results: [], elements: [] }),
    }));
  }
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: cors, contentType: 'application/json',
    body: JSON.stringify({ elements: [
      { type: 'node', id: 1, lat: 46.605, lon: 2.4,
        tags: { amenity: 'restaurant', name: 'Chez Momo' } },
    ] }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  const chien = page.locator('.entete .recherche-vide');
  await expect(chien).toBeHidden();
  const champ = page.locator('.entete .recherche input');
  await champ.click();
  await expect(chien).toBeVisible();
  /* Et l'image qu'il montre répond — un chien cassé serait pire que pas de
     chien : c'est LE défaut signalé. */
  const src = await chien.locator('img').getAttribute('src');
  const r = await page.request.get(src!);
  expect(r.status(), `${src} doit répondre`).toBe(200);

  await champ.fill('gare');
  await expect(chien).toBeHidden();
  await champ.fill('');
  await expect(chien).toBeVisible();
  /* Les résultats du rail arrivent champ VIDE : le chien s'efface aussi. */
  await page.locator('.entete .recherche-rail').getByRole('button', { name: /Restaurants/ }).click();
  await expect(page.locator('.entete .recherche ul[role="listbox"] li').first()).toBeVisible();
  await expect(chien).toBeHidden();
});
