import { test, expect } from '@playwright/test';

/* LES TUILES IGN SONT SIMULÉES EN E2E — pour deux raisons qui n'en font
   qu'une : la CI ne doit ni dépendre de la disponibilité d'un tiers, ni
   MARTELER la Géoplateforme à chaque poussée (nos propres règles : ces quotas
   sont un bien commun). Ce que la suite prouve reste réel : l'application
   émet les bonnes requêtes vers les bons endpoints — la disponibilité de
   l'IGN, elle, a été prouvée par appels réels et vit dans docs/apis.md. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');

test.beforeEach(async ({ page }) => {
  await page.route('**/data.geopf.fr/wmts**', (route) => route.fulfill({
    contentType: 'image/png', body: PNG_1PX,
  }));
});

// Depuis la PR #2, la page EST la carte : on vérifie que MapLibre s'amorce,
// que les contrôles parlent français, et que la souveraineté tient.

test('la carte s’amorce : canevas présent, contrôles en français', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Infonovice Maps/);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Zoomer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Me localiser' })).toBeVisible();
  // L'attribution IGN est une obligation de la Géoplateforme, pas un ornement.
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('IGN');
});

test('SOUVERAINETÉ : seules les origines déclarées sont contactées', async ({ page }) => {
  // La contrainte n° 3 du projet, mesurée au navigateur. La liste blanche
  // s'élargit par PR, jamais par accident : data.geopf.fr est arrivée avec
  // la carte (PR #2), api-adresse.data.gouv.fr avec la recherche (PR #4).
  // data.economie.gouv.fr et public.opendatasoft.com sont arrivées avec les
  // POI (PR #9) — et ne sont contactées QUE couche activée, zoom ≥ 12.
  const AUTORISEES = new Set(['localhost', 'data.geopf.fr', 'api-adresse.data.gouv.fr',
    'data.economie.gouv.fr', 'public.opendatasoft.com']);
  const intrus: string[] = [];
  page.on('request', (r) => {
    const h = new URL(r.url()).hostname;
    if (!AUTORISEES.has(h)) intrus.push(h);
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(2500); // le temps que les tuiles partent
  expect([...new Set(intrus)], `origines non déclarées : ${intrus.join(', ')}`).toHaveLength(0);
});

test('l’application demande ses tuiles au WMTS Géoplateforme, et les affiche', async ({ page }) => {
  const tuiles: number[] = [];
  page.on('response', (r) => {
    if (r.url().includes('data.geopf.fr/wmts') && r.url().includes('GetTile')) tuiles.push(r.status());
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await expect.poll(() => tuiles.length, { timeout: 15_000 }).toBeGreaterThan(3);
  expect(tuiles.filter((s) => s === 200).length, 'aucune tuile servie en 200').toBeGreaterThan(0);
});

test('le sélecteur de fonds bascule en satellite, et la préférence survit au rechargement', async ({ page }) => {
  const ortho: string[] = [];
  page.on('request', (r) => { if (r.url().includes('ORTHOIMAGERY')) ortho.push(r.url()); });

  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.locator('.fonds summary').click();
  await page.getByRole('radio', { name: 'Satellite', exact: true }).check();
  await expect.poll(() => ortho.length, { timeout: 15_000 }).toBeGreaterThan(0);

  // LA PERSISTANCE : on recharge, le satellite doit revenir tout seul (IndexedDB).
  const orthoApres: string[] = [];
  page.on('request', (r) => { if (r.url().includes('ORTHOIMAGERY')) orthoApres.push(r.url()); });
  await page.reload();
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await expect.poll(() => orthoApres.length, { timeout: 15_000 }).toBeGreaterThan(0);
});

test('la recherche BAN propose, sélectionne au clavier, et pose un marqueur', async ({ page }) => {
  // La BAN est SIMULÉE : le test doit être déterministe, et son quota est un
  // bien commun — la CI n'a pas à le consommer à chaque poussée.
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { coordinates: [2.330992, 48.868831] },
      properties: { label: '8 Rue de la Paix 75002 Paris', type: 'housenumber', postcode: '75002', city: 'Paris' },
    }] }),
  }));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });

  const champ = page.getByRole('combobox', { name: 'Rechercher une adresse en France' });
  await champ.fill('8 rue de la paix');
  const option = page.getByRole('option', { name: /Rue de la Paix/ });
  await expect(option).toBeVisible({ timeout: 5_000 });

  // Sélection AU CLAVIER : l'accessibilité se prouve, elle ne se déclare pas.
  await champ.press('ArrowDown');
  await champ.press('Enter');
  await expect(page.locator('.maplibregl-marker')).toBeVisible({ timeout: 5_000 });
  await expect(champ).toHaveValue('8 Rue de la Paix 75002 Paris');
});

test('l’erreur BAN parle français et n’éventre pas l’interface', async ({ page }) => {
  await page.route('**/api-adresse.data.gouv.fr/**', (route) => route.abort('failed'));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.getByRole('combobox', { name: /Rechercher une adresse/ }).fill('rue de la paix');
  await expect(page.getByRole('alert')).toContainText('momentanément indisponible', { timeout: 10_000 });
});

test('l’itinéraire A→B se calcule, se trace, et SURVIT au changement de fond', async ({ page }) => {
  // BAN et service d'itinéraire simulés : déterminisme, zéro quota consommé.
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    const [libelle, lon, lat] = q.includes('lyon')
      ? ['Lyon', 4.8357, 45.7640] : ['Paris', 2.3522, 48.8566];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{
      geometry: { coordinates: [lon, lat] },
      properties: { label: libelle, type: 'municipality', postcode: '', city: libelle },
    }] }) });
  });
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [3.5, 47.3], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }),
  }));

  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.locator('.iti > summary').click();

  const champs = page.locator('.iti input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');
  await page.getByRole('option', { name: 'Lyon' }).first().click();

  // Le résultat : distance et durée au format français.
  await expect(page.locator('.iti-resultat')).toContainText('465 km', { timeout: 10_000 });
  await expect(page.locator('.iti-resultat')).toContainText('4 h 18');
  // Le tracé et ses deux marqueurs sont posés.
  await expect(page.locator('.maplibregl-marker')).toHaveCount(2);
  // LE TRAIT EST RÉELLEMENT RENDU — au niveau des PIXELS. De v0.5.0 à v0.9.0,
  // le worker MapLibre manquait au build (404 silencieux) : aucune couche
  // GeoJSON ne se dessinait, en production non plus, et cette suite n'y voyait
  // rien parce qu'elle ne vérifiait que la source et les marqueurs DOM.
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { queryRenderedFeatures(o: object): unknown[] } })
      .__carte.queryRenderedFeatures({ layers: ['itineraire-trait'] }).length,
  ), { timeout: 15_000 }).toBeGreaterThan(0);

  // LE CHANGEMENT DE FOND NE MANGE PAS LE TRAJET : setStyle détruit les
  // sources ; le panneau doit reposer le tracé sur style.load.
  await page.locator('.fonds summary').click();
  await page.getByRole('radio', { name: 'Satellite', exact: true }).check();
  await page.waitForTimeout(1200);
  const traitPresent = await page.evaluate(() =>
    Boolean((window as unknown as { __carte?: { getSource(n: string): unknown } })
      .__carte?.getSource('itineraire')));
  expect(traitPresent, 'le tracé a disparu au changement de fond').toBe(true);
  // Et il se REDESSINE vraiment sur le nouveau fond, pixels à l'appui.
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { queryRenderedFeatures(o: object): unknown[] } })
      .__carte.queryRenderedFeatures({ layers: ['itineraire-trait'] }).length,
  ), { timeout: 15_000 }).toBeGreaterThan(0);
});

test('un lien d’itinéraire partagé rejoue le trajet à l’ouverture — sans serveur', async ({ page }) => {
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }),
  }));
  // On OUVRE directement le lien partagé : le fragment porte tout.
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('465 km', { timeout: 10_000 });
  await expect(page.locator('.maplibregl-marker')).toHaveCount(2);
});

test('le profil altimétrique se charge À LA DEMANDE, et affiche les dénivelés', async ({ page }) => {
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }),
  }));
  let appelsAlti = 0;
  await page.route('**/data.geopf.fr/altimetrie/**', (route) => {
    appelsAlti += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elevations: [
      { lon: 2.3522, lat: 48.8566, z: 35, acc: 'Average value' },
      { lon: 3.5, lat: 47.3, z: 320, acc: 'Average value' },
      { lon: 4.8357, lat: 45.764, z: 168, acc: 'Average value' },
    ] }) });
  });
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await page.locator('.iti-actions').waitFor({ state: 'visible', timeout: 15_000 });
  // Tant que la section est repliée, AUCUN appel : les quotas sont un bien commun.
  expect(appelsAlti, 'l’altimétrie a été appelée sans demande').toBe(0);
  await page.locator('.iti-alti summary').click();
  await expect(page.locator('.alti-bilan')).toContainText('D+ 285 m', { timeout: 10_000 });
  await expect(page.locator('.alti-bilan')).toContainText('D− 152 m');
  await expect(page.locator('.iti-alti svg')).toBeVisible();
  // Refermer puis rouvrir ne rappelle pas le service : le profil est acquis.
  await page.locator('.iti-alti summary').click();
  await page.locator('.iti-alti summary').click();
  await expect(page.locator('.alti-bilan')).toBeVisible();
  expect(appelsAlti, 'le service a été rappelé pour le même itinéraire').toBe(1);
});

test('étapes intermédiaires et évitements PARLENT AU SERVICE, et se retirent', async ({ page }) => {
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    const [libelle, lon, lat] = q.includes('dijon') ? ['Dijon', 5.0415, 47.322]
      : q.includes('lyon') ? ['Lyon', 4.8357, 45.7640] : ['Paris', 2.3522, 48.8566];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{
      geometry: { coordinates: [lon, lat] },
      properties: { label: libelle, type: 'municipality', postcode: '', city: libelle },
    }] }) });
  });
  const urls: string[] = [];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    urls.push(route.request().url());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [5.0415, 47.322], [4.8357, 45.764]] },
      distance: 539_000, duration: 37_000,
    }) });
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.locator('.iti > summary').click();
  const champs = page.locator('.iti-champs input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');
  await page.getByRole('option', { name: 'Lyon' }).first().click();
  await expect(page.locator('.iti-resultat')).toContainText('539 km', { timeout: 10_000 });
  expect(urls[urls.length - 1]).not.toContain('constraints');

  // Éviter les autoroutes : le recalcul porte la contrainte, encodée.
  await page.getByRole('checkbox', { name: 'Autoroutes' }).check();
  await expect.poll(() => urls.length).toBe(2);
  expect(decodeURIComponent(urls[1]!)).toContain('"value":"autoroute"');

  // Une étape intermédiaire : le recalcul porte intermediates.
  await page.getByRole('button', { name: 'Ajouter une étape' }).click();
  await page.locator('.etape-ligne input[type="search"]').fill('dijon');
  await page.getByRole('option', { name: 'Dijon' }).first().click();
  await expect.poll(() => urls.length).toBe(3);
  expect(urls[2]).toContain('intermediates=5.0415,47.322');
  // Trois marqueurs : départ, arrivée, étape.
  await expect(page.locator('.maplibregl-marker')).toHaveCount(3);

  // Retirer l'étape : le recalcul repart sans intermediates.
  await page.getByRole('button', { name: 'Retirer l’étape' }).click();
  await expect.poll(() => urls.length).toBe(4);
  expect(urls[3]).not.toContain('intermediates');
});

test('réordonner les étapes, copier le lien, ouvrir la feuille : tout suit le CLICHÉ', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    const [libelle, lon, lat] = q.includes('dijon') ? ['Dijon', 5.0415, 47.322]
      : q.includes('macon') ? ['Mâcon', 4.8328, 46.3069] : ['Autre', 2.0, 48.0];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{
      geometry: { coordinates: [lon, lat] },
      properties: { label: libelle, type: 'municipality', postcode: '', city: libelle },
    }] }) });
  });
  const urls: string[] = [];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = route.request().url();
    urls.push(url);
    if (url.includes('getSteps=true')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ portions: [{ steps: [
        { instruction: { type: 'depart', modifier: 'left' }, distance: 10,
          attributes: { name: { nom_1_gauche: 'R DE RIVOLI', cpx_numero: '', cpx_toponyme: '' } } },
        { instruction: { type: 'arrive' }, distance: 0,
          attributes: { name: { nom_1_gauche: '', cpx_numero: '', cpx_toponyme: '' } } },
      ] }] }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 539_000, duration: 37_000,
    }) });
  });
  // Deux étapes déjà posées par le lien : Dijon puis Mâcon.
  await page.goto('/#iti=2.35220,48.85660;5.04150,47.32200;4.83280,46.30690;4.83570,45.76400;car;evite=autoroute');
  await page.locator('.iti-resultat').waitFor({ state: 'visible', timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('539 km');
  expect(urls[0]).toContain('intermediates=5.0415,47.322|4.8328,46.3069');

  // MONTER la seconde étape : l'ordre s'inverse dans la requête suivante,
  // et la saisie de la ligne déplacée SURVIT au déplacement.
  await page.getByRole('button', { name: 'Monter l’étape' }).nth(1).click();
  await expect.poll(() => urls.length).toBe(2);
  expect(urls[1]).toContain('intermediates=4.8328,46.3069|5.0415,47.322');
  await expect(page.locator('.etape-ligne input').first()).toHaveValue(/46,30690/);

  // Une ligne VIDE ajoutée puis déplacée ou retirée : AUCUNE requête de plus.
  await page.getByRole('button', { name: 'Ajouter une étape' }).click();
  await page.getByRole('button', { name: 'Monter l’étape' }).nth(2).click();
  // Le ↑ a remonté la ligne vide en position 2 sur 3 : c'est elle qu'on retire.
  await page.getByRole('button', { name: 'Retirer l’étape' }).nth(1).click();
  await page.waitForTimeout(400);
  expect(urls.length, 'une ligne vide a déclenché un recalcul').toBe(2);

  // COPIER LE LIEN : il décrit le trajet CALCULÉ (ordre inversé, évitement).
  await page.getByRole('button', { name: 'Copier le lien' }).click();
  const lien = await page.evaluate(() => navigator.clipboard.readText());
  expect(lien).toContain('4.83280,46.30690;5.04150,47.32200');
  expect(lien).toContain(';car;evite=autoroute');

  // LA FEUILLE DE ROUTE hérite étapes ET évitements du cliché.
  await page.locator('.iti-feuille summary').click();
  await expect(page.locator('.feuille-etapes li')).toHaveCount(2, { timeout: 10_000 });
  const urlFeuille = urls.find((u) => u.includes('getSteps=true'));
  expect(urlFeuille).toContain('intermediates=4.8328,46.3069|5.0415,47.322');
  expect(decodeURIComponent(urlFeuille!)).toContain('"value":"autoroute"');
});

test('après Effacer, le bouton « Ajouter une étape » revient — même depuis six étapes', async ({ page }) => {
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 539_000, duration: 37_000,
    }),
  }));
  const six = [...Array(6)].map((_, i) => `${(3 + i / 10).toFixed(5)},46.00000`).join(';');
  await page.goto(`/#iti=2.35220,48.85660;${six};4.83570,45.76400;car`);
  await page.locator('.iti-resultat').waitFor({ state: 'visible', timeout: 15_000 });
  // Six étapes : la borne est atteinte, le bouton d'ajout est masqué.
  await expect(page.locator('.etape-ligne')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Ajouter une étape' })).toBeHidden();
  await page.getByRole('button', { name: 'Effacer' }).click();
  await expect(page.locator('.etape-ligne')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ajouter une étape' })).toBeVisible();
});

test('un lien partagé porte étapes et évitements, et les rejoue', async ({ page }) => {
  const urls: string[] = [];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    urls.push(route.request().url());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [5.0415, 47.322], [4.8357, 45.764]] },
      distance: 539_000, duration: 37_000,
    }) });
  });
  await page.goto('/#iti=2.35220,48.85660;5.04150,47.32200;4.83570,45.76400;car;evite=autoroute');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('539 km', { timeout: 10_000 });
  expect(urls[0]).toContain('intermediates=5.0415,47.322');
  expect(decodeURIComponent(urls[0]!)).toContain('"value":"autoroute"');
  await expect(page.getByRole('checkbox', { name: 'Autoroutes' })).toBeChecked();
  await expect(page.locator('.etape-ligne input')).toHaveValue(/47,32200/);
  await expect(page.locator('.maplibregl-marker')).toHaveCount(3);
});

test('la feuille de route parle français, et ne se charge qu’à la demande', async ({ page }) => {
  let appelsEtapes = 0;
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = route.request().url();
    if (url.includes('getSteps=true')) {
      appelsEtapes += 1;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ portions: [{ steps: [
        { instruction: { type: 'depart', modifier: 'left' }, distance: 98.2, duration: 40,
          attributes: { name: { nom_1_gauche: 'R DE RIVOLI', nom_1_droite: 'R DE RIVOLI', cpx_numero: '', cpx_toponyme: '' } } },
        { instruction: { type: 'turn', modifier: 'right' }, distance: 19.6, duration: 8,
          attributes: { name: { nom_1_gauche: 'AV VICTORIA', nom_1_droite: 'AV VICTORIA', cpx_numero: '', cpx_toponyme: '' } } },
        { instruction: { type: 'arrive', modifier: 'straight' }, distance: 0, duration: 0,
          attributes: { name: { nom_1_gauche: '', nom_1_droite: '', cpx_numero: '', cpx_toponyme: '' } } },
      ] }] }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }) });
  });
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await page.locator('.iti-actions').waitFor({ state: 'visible', timeout: 15_000 });
  expect(appelsEtapes, 'les étapes ont été demandées sans ouverture').toBe(0);
  await page.locator('.iti-feuille summary').click();
  const etapes = page.locator('.feuille-etapes li');
  await expect(etapes).toHaveCount(3, { timeout: 10_000 });
  await expect(etapes.nth(0)).toContainText('Départ — Rue de Rivoli');
  await expect(etapes.nth(1)).toContainText('Tournez à droite — Avenue Victoria');
  await expect(etapes.nth(2)).toContainText('Vous êtes arrivé');
  await expect(page.locator('.feuille-imprimer')).toBeVisible();
  expect(appelsEtapes, 'le service doit être appelé une fois').toBe(1);

  // Refermer puis rouvrir ne rappelle pas le service : les étapes sont acquises.
  await page.locator('.iti-feuille summary').click();
  await page.locator('.iti-feuille summary').click();
  await expect(etapes).toHaveCount(3);
  expect(appelsEtapes, 'le service a été rappelé pour le même itinéraire').toBe(1);

  // LE CONTRAT D'IMPRESSION, déterministe : window.print() est remplacé par un
  // témoin, le clone .zone-impression et la classe body doivent apparaître au
  // clic et disparaître à afterprint.
  await page.evaluate(() => {
    (window as unknown as { __imprime: boolean }).__imprime = false;
    window.print = () => { (window as unknown as { __imprime: boolean }).__imprime = true; };
  });
  await page.locator('.feuille-imprimer').click();
  expect(await page.evaluate(() => (window as unknown as { __imprime: boolean }).__imprime)).toBe(true);
  await expect(page.locator('body > .zone-impression .feuille-etapes li')).toHaveCount(3);
  await expect(page.locator('body.impression-feuille')).toHaveCount(1);
  // Sous le média print, la page disparaît et la feuille reste seule.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.entete')).toBeHidden();
  await expect(page.locator('body > .zone-impression')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('body > .zone-impression')).toHaveCount(0);
  await expect(page.locator('body.impression-feuille')).toHaveCount(0);
  // RÉGRESSION Ctrl+P (revue 21/08) : SANS le clic Imprimer, le média print ne
  // doit RIEN masquer — la première version rendait des pages blanches.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.entete')).toBeVisible();
});

test('la feuille de route en panne parle français, et se réessaie', async ({ page }) => {
  let enPanne = true;
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = route.request().url();
    if (!url.includes('getSteps=true')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
        distance: 465_000, duration: 15_480,
      }) });
    }
    if (enPanne) return route.abort('failed');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ portions: [{ steps: [
      { instruction: { type: 'depart', modifier: 'left' }, distance: 10,
        attributes: { name: { nom_1_gauche: 'R DE RIVOLI', cpx_numero: '', cpx_toponyme: '' } } },
      { instruction: { type: 'arrive' }, distance: 0,
        attributes: { name: { nom_1_gauche: '', cpx_numero: '', cpx_toponyme: '' } } },
    ] }] }) });
  });
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await page.locator('.iti-actions').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('.iti-feuille summary').click();
  await expect(page.locator('.iti-feuille-corps')).toContainText('momentanément indisponible', { timeout: 10_000 });
  // Le service revient : refermer puis rouvrir suffit — l'échec n'a rien verrouillé.
  enPanne = false;
  await page.locator('.iti-feuille summary').click();
  await page.locator('.iti-feuille summary').click();
  await expect(page.locator('.feuille-etapes li')).toHaveCount(2, { timeout: 10_000 });
});

test('les POI se chargent À LA DEMANDE : zoom respecté, prix en popup, choix persisté', async ({ page }) => {
  let appelsCarbu = 0;
  await page.route('**/data.economie.gouv.fr/**', (route) => {
    appelsCarbu += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      total_count: 2, results: [
        { geom: { lon: 2.3522, lat: 48.8566 }, adresse: '1 Rue de Rivoli', ville: 'Paris',
          gazole_prix: 2.25, e10_prix: 1.99 },
        { geom: { lon: 2.36, lat: 48.86 }, adresse: '2 Avenue X', ville: 'Paris', sp98_prix: 2.05 },
      ] }) });
  });
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ total_count: 11_950, results: [
      { point_geo: { lon: 2.355, lat: 48.857 }, nom_station: 'Bercy Village',
        puissance_nominale: 7, nbre_pdc: 30, gratuit: '1' },
    ] }),
  }));
  await page.route('**/data.geopf.fr/wfs/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ type: 'FeatureCollection', numberMatched: 1, features: [
      { type: 'Feature', properties: { surfm2: 1327, nomcom: 'Paris' },
        geometry: { type: 'Polygon', coordinates: [[[2.353, 48.855], [2.354, 48.855], [2.354, 48.856], [2.353, 48.855]]] } },
    ] }),
  }));

  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.locator('.poi summary').click();
  await page.getByRole('checkbox', { name: 'Carburants' }).check();
  // Au zoom initial (5,4 : la France entière), AUCUN appel — on demande de zoomer.
  await expect(page.locator('.poi-etat')).toContainText('Zoomez', { timeout: 5_000 });
  expect(appelsCarbu, 'appel parti sous le zoom minimal').toBe(0);

  // Zoom sur Paris : l'appel part (débounce 500 ms), les points se posent.
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3522, 48.8566], zoom: 13 });
  });
  await expect(page.locator('.poi-etat')).toContainText('Carburants : 2', { timeout: 10_000 });
  expect(appelsCarbu).toBe(1);

  // Clic sur la station : la popup parle français, prix à la virgule.
  // On attend que le CERCLE SOIT RENDU au pixel visé — l'état textuel arrive
  // une frame avant le rendu, et un clic trop tôt tombe dans le vide.
  await expect.poll(() => page.evaluate(() => {
    const carte = (window as unknown as { __carte: {
      project(c: [number, number]): { x: number; y: number };
      queryRenderedFeatures(p: { x: number; y: number }, o: object): unknown[];
    } }).__carte;
    return carte.queryRenderedFeatures(carte.project([2.3522, 48.8566]), { layers: ['poi-carburants'] }).length;
  }), { timeout: 10_000 }).toBeGreaterThan(0);
  const point = await page.evaluate(() => {
    const carte = (window as unknown as { __carte: { project(c: [number, number]): { x: number; y: number } } }).__carte;
    return carte.project([2.3522, 48.8566]);
  });
  const canevas = page.locator('#carte canvas.maplibregl-canvas');
  const cadre = await canevas.boundingBox();
  await page.mouse.click(cadre!.x + point.x, cadre!.y + point.y);
  await expect(page.locator('.poi-popup')).toContainText('1 Rue de Rivoli, Paris', { timeout: 5_000 });
  await expect(page.locator('.poi-popup')).toContainText('2,25 €/L');

  // Les deux autres couches se posent aussi, l'état est honnête (« 1 sur 11 950 »).
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
  await page.getByRole('checkbox', { name: 'Parkings' }).check();
  await expect(page.locator('.poi-etat')).toContainText('Bornes électriques : 1 sur 11 950', { timeout: 10_000 });
  await expect(page.locator('.poi-etat')).toContainText('Parkings : 1');

  // Le choix survit au rechargement (IndexedDB), et se recharge tout seul.
  await page.reload();
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.locator('.poi summary').click();
  await expect(page.getByRole('checkbox', { name: 'Carburants' })).toBeChecked();
});

test('l’export GPX télécharge un fichier nommé, sans aucune requête', async ({ page }) => {
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }),
  }));
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await page.locator('.iti-actions').waitFor({ state: 'visible', timeout: 15_000 });
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'GPX' }).click();
  const fichier = await telechargement;
  expect(fichier.suggestedFilename()).toBe('itineraire-infonovice.gpx');
});
