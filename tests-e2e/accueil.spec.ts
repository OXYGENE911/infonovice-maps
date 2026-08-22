import { test, expect } from '@playwright/test';
import { PNG_1PX, simulerTuiles, simulerCommunes } from './tuiles-simulees';

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
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

  // Un MICRO-déplacement (fixe GPS, molette hésitante) ne recharge PAS :
  // le seuil de vue protège les quotas, pas seulement le débounce.
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3532, 48.8570], zoom: 13 });
  });
  await page.waitForTimeout(900);
  expect(appelsCarbu, 'un micro-déplacement a rechargé').toBe(1);

  // Les deux autres couches se posent aussi, l'état est honnête (« 1 sur 11 950 »).
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
  await page.getByRole('checkbox', { name: 'Parkings' }).check();
  await expect(page.locator('.poi-etat')).toContainText('Bornes électriques : 1 sur 11 950', { timeout: 10_000 });
  await expect(page.locator('.poi-etat')).toContainText('Parkings : 1');

  // LES COUCHES SURVIVENT AU CHANGEMENT DE FOND — pixels à l'appui, le même
  // contrat que le tracé d'itinéraire.
  await page.locator('.fonds summary').click();
  await page.getByRole('radio', { name: 'Satellite', exact: true }).check();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { queryRenderedFeatures(o: object): unknown[] } })
      .__carte.queryRenderedFeatures({ layers: ['poi-carburants'] }).length,
  ), { timeout: 15_000 }).toBeGreaterThan(0);

  // Le choix survit au rechargement (IndexedDB). La carte revient au zoom
  // France entière : l'application prévient et NE demande rien — puis un
  // zoom suffisant recharge tout seul.
  const appelsAvantReload = appelsCarbu;
  await page.reload();
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.locator('.poi summary').click();
  await expect(page.getByRole('checkbox', { name: 'Carburants' })).toBeChecked();
  await expect(page.locator('.poi-etat')).toContainText('Zoomez', { timeout: 10_000 });
  expect(appelsCarbu, 'appel parti au zoom France entière après reload').toBe(appelsAvantReload);
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3522, 48.8566], zoom: 13 });
  });
  await expect.poll(() => appelsCarbu, { timeout: 10_000 }).toBeGreaterThan(appelsAvantReload);
  await expect(page.locator('.poi-etat')).toContainText('Carburants : 2', { timeout: 10_000 });
});

test('POI : décocher vide la carte, la panne s’affiche par couche, le zoom arrière prévient', async ({ page }) => {
  let panneBornes = true;
  let appelsCarbu = 0;
  await page.route('**/data.economie.gouv.fr/**', (route) => {
    appelsCarbu += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      total_count: 1, results: [
        { geom: { lon: 2.3522, lat: 48.8566 }, adresse: '1 Rue de Rivoli', ville: 'Paris', gazole_prix: 2.25 },
      ] }) });
  });
  await page.route('**/public.opendatasoft.com/**', (route) => {
    if (panneBornes) return route.abort('failed');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      total_count: 1, results: [
        { point_geo: { lon: 2.356, lat: 48.858 }, nom_station: 'Bercy Village',
          puissance_nominale: 7, nbre_pdc: 30, gratuit: '1' },
      ] }) });
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3540, 48.8570], zoom: 13 });
  });
  await page.locator('.poi summary').click();

  // La panne d'UNE couche s'affiche pour elle, sans gêner les autres.
  await page.getByRole('checkbox', { name: 'Carburants' }).check();
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
  await expect(page.locator('.poi-etat')).toContainText('Bornes électriques : indisponibles', { timeout: 15_000 });
  await expect(page.locator('.poi-etat')).toContainText('Carburants : 1');

  // Le service revient : un VRAI déplacement suffit, l'échec n'a rien verrouillé.
  panneBornes = false;
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.30, 48.83], zoom: 13 });
  });
  await expect(page.locator('.poi-etat')).toContainText('Bornes électriques : 1', { timeout: 15_000 });

  // Clic sur la borne : puissance, points de charge, gratuité — en français.
  // On CENTRE d'abord la borne : queryRenderedFeatures répond même hors du
  // cadre (tampon de tuiles), mais un clic physique, non (vu à la sonde :
  // point projeté à x=1292 pour un canevas de 1280).
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.356, 48.858], zoom: 14 });
  });
  await expect.poll(() => page.evaluate(() => {
    const carte = (window as unknown as { __carte: {
      project(c: [number, number]): { x: number; y: number };
      queryRenderedFeatures(p: { x: number; y: number }, o: object): unknown[];
    } }).__carte;
    return carte.queryRenderedFeatures(carte.project([2.356, 48.858]), { layers: ['poi-bornes'] }).length;
  }), { timeout: 10_000 }).toBeGreaterThan(0);
  const point = await page.evaluate(() => {
    const carte = (window as unknown as { __carte: { project(c: [number, number]): { x: number; y: number } } }).__carte;
    return carte.project([2.356, 48.858]);
  });
  const cadre = await page.locator('#carte canvas.maplibregl-canvas').boundingBox();
  await page.mouse.click(cadre!.x + point.x, cadre!.y + point.y);
  await expect(page.locator('.poi-popup')).toContainText('Bercy Village', { timeout: 5_000 });
  await expect(page.locator('.poi-popup')).toContainText('7 kW · 30 points de charge · gratuit');

  // DÉCOCHER vide réellement la carte — pixels à l'appui.
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).uncheck();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { queryRenderedFeatures(o: object): unknown[] } })
      .__carte.queryRenderedFeatures({ layers: ['poi-bornes'] }).length,
  ), { timeout: 10_000 }).toBe(0);

  // Repartir sous le zoom 12 : on prévient, et on ne demande PLUS rien.
  const appelsAvant = appelsCarbu;
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.4, 46.6], zoom: 5.4 });
  });
  await expect(page.locator('.poi-etat')).toContainText('Zoomez', { timeout: 10_000 });
  expect(appelsCarbu, 'appel parti sous le zoom minimal').toBe(appelsAvant);
});

test('FAVORIS : appui long → ajout, persistance, export JSON, retrait, import', async ({ page }) => {
  await page.route('**/api-adresse.data.gouv.fr/reverse/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { coordinates: [2.330992, 48.868831] },
      properties: { label: '8 Rue de la Paix 75002 Paris', type: 'housenumber', postcode: '75002', city: 'Paris' },
    }] }),
  }));
  await page.goto('/');
  const canevas = page.locator('#carte canvas.maplibregl-canvas');
  await canevas.waitFor({ timeout: 15_000 });

  // L'APPUI LONG (600 ms) ouvre la popup d'adresse, qui sait ajouter un favori.
  const cadre = await canevas.boundingBox();
  await page.mouse.move(cadre!.x + 640, cadre!.y + 360);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('.pa-libelle')).toContainText('8 Rue de la Paix', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
  await expect(page.getByRole('button', { name: /Ajouté aux favoris/ })).toBeVisible();

  // Le volet Favoris le liste, avec la promesse en toutes lettres.
  await page.locator('.favoris summary').click();
  await expect(page.locator('.favori-aller')).toHaveText('8 Rue de la Paix 75002 Paris');
  await expect(page.locator('.favoris-promesse')).toContainText('ne quittent jamais ce navigateur');

  // Il SURVIT au rechargement (IndexedDB).
  await page.reload();
  await canevas.waitFor({ timeout: 15_000 });
  await page.locator('.favoris summary').click();
  await expect(page.locator('.favori-aller')).toHaveText('8 Rue de la Paix 75002 Paris');

  // Cliquer le favori Y VOLE (zoom 16).
  await page.locator('.favori-aller').click();
  await expect.poll(() => page.evaluate(() =>
    Math.round((window as unknown as { __carte: { getZoom(): number } }).__carte.getZoom()),
  ), { timeout: 10_000 }).toBe(16);

  // L'EXPORT télécharge un JSON qui contient tout.
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter mes données' }).click();
  const fichier = await telechargement;
  expect(fichier.suggestedFilename()).toBe('infonovice-maps-donnees.json');
  const chemin = await fichier.path();
  const contenu = JSON.parse(String(await (await import('node:fs/promises')).readFile(chemin!, 'utf8')));
  expect(contenu.application).toBe('infonovice-maps');
  expect(contenu.favoris).toHaveLength(1);
  expect(contenu.favoris[0].nom).toBe('8 Rue de la Paix 75002 Paris');

  // LE RETRAIT vide la liste, ANNONCE ce qu'il a fait, et rend le focus —
  // sans quoi l'usager clavier repart du haut du document.
  await page.getByRole('button', { name: /Retirer 8 Rue de la Paix/ }).click();
  await expect(page.locator('.favoris-vide')).toBeVisible();
  await expect(page.locator('.favoris-etat')).toContainText('retiré des favoris');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('SUMMARY');

  // L'IMPORT restaure — et recharge la page pour appliquer les préférences.
  await page.locator('.favoris input[type="file"]').setInputFiles(chemin!);
  await expect(page.locator('.favoris-etat')).toContainText('Importé : 1 favori', { timeout: 10_000 });
  await page.waitForLoadState('load');
  await canevas.waitFor({ timeout: 15_000 });
  await page.locator('.favoris summary').click();
  await expect(page.locator('.favori-aller')).toHaveText('8 Rue de la Paix 75002 Paris', { timeout: 10_000 });

  // UN FICHIER QUI N'EST PAS UNE SAUVEGARDE : message français, et le champ
  // se nettoie pour qu'un second essai reparte (le même fichier compris).
  const intrus = test.info().outputPath('intrus.json');
  await (await import('node:fs/promises')).writeFile(intrus, '{"application":"autre-app"}');
  await page.locator('.favoris input[type="file"]').setInputFiles(intrus);
  await expect(page.locator('.favoris-etat')).toContainText('pas une sauvegarde Infonovice Maps', { timeout: 10_000 });
  expect(await page.locator('.favoris input[type="file"]').inputValue()).toBe('');
  // L'échec n'a rien détruit : le favori est toujours là.
  await expect(page.locator('.favori-aller')).toHaveText('8 Rue de la Paix 75002 Paris');
});

test('FAVORIS : le bouton d’ajout attend que l’adresse soit tranchée', async ({ page }) => {
  // La BAN traîne : tant qu'elle n'a pas répondu, on ne peut pas figer un
  // favori sous des coordonnées (revue du 22/08).
  await page.route('**/api-adresse.data.gouv.fr/reverse/**', async (route) => {
    await new Promise((s) => setTimeout(s, 1500));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{
      geometry: { coordinates: [2.330992, 48.868831] },
      properties: { label: '8 Rue de la Paix 75002 Paris', type: 'housenumber', postcode: '75002', city: 'Paris' },
    }] }) });
  });
  await page.goto('/');
  const canevas = page.locator('#carte canvas.maplibregl-canvas');
  await canevas.waitFor({ timeout: 15_000 });
  const cadre = await canevas.boundingBox();
  await page.mouse.move(cadre!.x + 640, cadre!.y + 360);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();

  const ajouter = page.getByRole('button', { name: 'Ajouter aux favoris' });
  await expect(ajouter).toBeVisible({ timeout: 10_000 });
  await expect(ajouter).toBeDisabled();
  // L'adresse arrive : le bouton s'ouvre, et le favori porte L'ADRESSE.
  await expect(ajouter).toBeEnabled({ timeout: 10_000 });
  await ajouter.click();
  await page.locator('.favoris summary').click();
  await expect(page.locator('.favori-aller')).toHaveText('8 Rue de la Paix 75002 Paris');
});

test('HORS LIGNE : la carte s’ouvre sans réseau, et le dit honnêtement', async ({ page, context }) => {
  // On note les URL que la carte demande vraiment : ce sont elles qu'on
  // réclamera une fois le réseau coupé, plutôt qu'une tuile choisie au hasard.
  const demandesReseau: string[] = [];
  context.on('request', (r) => demandesReseau.push(r.url()));
  // Le service worker doit être ACTIF avant de couper : c'est lui qui sert
  // la coquille et les tuiles déjà vues.
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 20_000 });
  /* RECHARGER UNE FOIS LE SERVICE WORKER AUX COMMANDES : au tout premier
     chargement, les tuiles partent AVANT qu'il ait pris le contrôle, donc
     elles ne passent pas par lui et n'entrent pas en cache. C'est aussi ce
     que vit un vrai visiteur : sa première visite prépare la seconde. */
  await page.reload();
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  /* ON OUBLIE LES TUILES DU PREMIER CHARGEMENT. Elles sont parties avant que
     le service worker ne prenne les commandes : elles ne sont donc jamais
     passées par lui, et ne sont en réserve que si le second chargement les
     redemande — ce que rien ne garantit quand la machine est chargée et que
     l'animation d'ouverture s'arrête sur d'autres tuiles. Les réclamer plus
     bas faisait rougir ce test une fois sur trois, sans qu'aucun défaut du
     mode hors ligne soit en cause (mesuré le 22/08). On ne garde donc que ce
     que le worker a réellement vu passer. */
  demandesReseau.length = 0;
  await expect.poll(async () => page.evaluate(async () => {
    const c = await caches.open('tuiles-plan');
    return (await c.keys()).length;
  }), { timeout: 20_000 }).toBeGreaterThan(0);

  const tuilesEnCache = await page.evaluate(async () => {
    const c = await caches.open('tuiles-plan');
    return (await c.keys()).length;
  });
  expect(tuilesEnCache, 'aucune tuile mise en cache').toBeGreaterThan(0);

  /* La région live existe EN PERMANENCE et se remplit à la coupure. Un
     `role="status"` dont le texte est écrit au montage et qu'on se contente
     de démasquer n'annonce RIEN : les lecteurs d'écran guettent les
     changements de contenu, pas ceux de visibilité. */
  await expect(page.locator('.hors-ligne')).toHaveCount(1);
  await expect(page.locator('.hors-ligne')).toBeEmpty();

  // COUPURE : le bandeau apparaît et DIT ce qui marche, ce qui attend.
  await context.setOffline(true);
  await expect(page.locator('.hors-ligne')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.hors-ligne')).toContainText('Hors ligne');
  await expect(page.locator('.hors-ligne')).toContainText('favoris restent accessibles');
  await expect(page.locator('.hors-ligne')).toContainText('attend le réseau');
  // La liste nomme AUSSI ce que la première écriture passait sous silence.
  await expect(page.locator('.hors-ligne')).toContainText('points d’intérêt');
  await expect(page.locator('.hors-ligne')).toContainText('photos de rue');

  // RETOUR DU RÉSEAU : le bandeau s'efface de lui-même.
  await context.setOffline(false);
  await expect(page.locator('.hors-ligne')).toBeHidden({ timeout: 10_000 });

  /* CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS. Il faut le dire net,
     parce que la version précédente prétendait davantage qu'elle ne tenait.

     AUCUN outil de Playwright ni de CDP ne coupe le réseau du SERVICE WORKER
     en laissant la page demander — quatre sondes, le 22/08, toutes mesurées :
     `context.setOffline()` ne coupe que la page (cache des tuiles vidé puis
     rechargement : il se REPEUPLAIT depuis data.geopf.fr) ;
     `context.route(..., abort)` n'intercepte pas les requêtes du worker, et
     `context.on('requestfailed')` ne les rapporte pas ;
     `Network.setBlockedURLs` bloque EN AMONT du worker — la requête n'arrive
     même pas jusqu'à lui, donc un succès ne dirait rien de sa réserve ;
     `Network.clearBrowserCache`, enfin, efface AUSSI le Cache Storage, de
     façon différée — il détruirait justement ce qu'on veut observer.

     On prouve donc les deux moitiés séparément, chacune par ce qui la
     démontre vraiment : (1) la coquille se recharge alors que la PAGE n'a
     plus de réseau — elle ne peut venir que du précache ; (2) les tuiles que
     la carte a affichées sont dans la réserve du service worker, relisibles,
     et ce sont de vraies images PNG. Le service, lui, est le travail de
     workbox, exercé à chaque visite. */
  const tuilesVues = [...new Set(demandesReseau.filter((u) => u.includes('data.geopf.fr')))];
  expect(tuilesVues.length, 'aucune tuile demandée pendant la navigation').toBeGreaterThan(0);
  await context.setOffline(true);

  /* Ce rechargement vient EN DERNIER : l'émulation hors ligne de Playwright
     remet `navigator.onLine` à true dans la page nouvellement chargée, alors
     que le réseau reste coupé (artefact de l'outil mesuré le 22/08, pas du
     composant) — le bandeau ne s'y vérifie donc plus. */
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.entete-marque')).toBeVisible();

  /* LES TUILES DÉJÀ VUES SONT EN RÉSERVE, ET CE SONT DES IMAGES. On relit les
     URL exactes que la carte avait demandées, et on vérifie les huit premiers
     octets : la signature PNG. Sans ce contrôle du contenu, une page de
     blocage rendue en « 200 text/html » par un portail captif passerait pour
     une tuile — c'est arrivé, reproduit en navigateur. Le canevas, lui,
     s'affiche même sans une seule tuile : il ne prouve rien tout seul. */
  /* On SONDE : le service worker écrit dans sa réserve de façon asynchrone,
     après la réponse. Lire une seule fois transformerait ce délai en échec.
     Le sondage attend, il ne pardonne pas : une tuile jamais mise en réserve
     fait toujours échouer le test au bout du délai. */
  await expect.poll(async () => page.evaluate(async (urls) => {
    const etats = await Promise.all(urls.map(async (u) => {
      const rep = await caches.match(u);
      if (!rep) return 'absente';
      const octets = new Uint8Array((await rep.arrayBuffer()).slice(0, 8));
      const png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
      return png.every((o, i) => octets[i] === o) ? 'png' : `contenu ${rep.headers.get('content-type')}`;
    }));
    return etats.filter((t) => t !== 'png');
  }, tuilesVues.slice(0, 6)), {
    message: 'des tuiles déjà vues ne sont pas en réserve, ou ne sont pas des images',
    timeout: 15_000,
  }).toEqual([]);
});

test('HORS LIGNE : l’en-tête ne pousse rien hors de l’écran, ni ne couvre les volets', async ({ page }) => {
  /* La régression que ce test empêche : le bandeau et le bouton
     d'installation vivent DANS l'en-tête flottant. Sans enroulement ni
     largeur maximale, il grandissait vers la droite sans fin — mesuré à
     375 px, le champ de recherche partait 88 px hors du viewport avec le seul
     bouton d'installation, qui apparaît EN LIGNE sur tout Chromium. Et le
     décalage des volets, codé en dur à 62 px, laissait l'en-tête grandi
     recouvrir « Itinéraire » et intercepter ses clics. */
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });

  // On force les deux éléments à s'afficher, sans dépendre du réseau ni de
  // `beforeinstallprompt` : c'est la GÉOMÉTRIE qu'on mesure, pas leur logique.
  await page.evaluate(() => {
    const bandeau = document.querySelector('.hors-ligne') as HTMLElement;
    const titre = document.createElement('strong');
    titre.textContent = 'Hors ligne.';
    const detail = document.createElement('span');
    detail.textContent = 'La carte déjà consultée et vos favoris restent accessibles. '
      + 'Tout ce qui interroge un service — recherche, itinéraire, trafic, météo, '
      + 'points d’intérêt, photos de rue — attend le réseau.';
    bandeau.replaceChildren(titre, detail);
    (document.querySelector('.installer') as HTMLElement).hidden = false;
  });

  const debords = await page.evaluate(() => {
    const large = document.documentElement.clientWidth;
    const cibles = ['.entete', '.recherche input', '.installer', '.hors-ligne'];
    return cibles
      .map((s) => ({ s, r: document.querySelector(s)?.getBoundingClientRect() }))
      .filter((x) => x.r && (x.r.right > large + 1 || x.r.left < -1))
      .map((x) => `${x.s} déborde de ${Math.round(x.r!.right - large)} px`);
  });
  expect(debords, 'un élément de l’en-tête sort de l’écran').toEqual([]);

  // Et les volets restent ATTEIGNABLES : c'est bien eux, pas l'en-tête, qui
  // reçoivent le clic à leur sommet.
  const recouverts = await page.evaluate(() => {
    const entete = document.querySelector('.entete')!;
    return [...document.querySelectorAll('#carte .maplibregl-ctrl-top-left summary')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const dessus = document.elementFromPoint(r.left + 8, r.top + 4);
        return { nom: el.textContent?.trim().slice(0, 20), couvert: entete.contains(dessus) };
      })
      .filter((x) => x.couvert)
      .map((x) => x.nom);
  });
  expect(recouverts, 'l’en-tête recouvre des volets de la carte').toEqual([]);
});

test('HORS LIGNE : une page de texte reste elle-même, même avec un paramètre', async ({ page }) => {
  /* Le repli de navigation du service worker rendait l'application carte à la
     place des mentions légales dès qu'un lien portait « ?ref=… » : la clé de
     précache ne correspondait plus, et la liste d'exclusion, ancrée sur
     « .html$ », ne reconnaissait plus le chemin une fois la requête ajoutée. */
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 20_000 });

  for (const chemin of ['/vie-privee.html?ref=cnil', '/mentions-legales.html?partage=1',
    '/a-propos.html?utm_source=test']) {
    await page.goto(chemin);
    await expect(page.locator('#carte'), `${chemin} a rendu la carte`).toHaveCount(0);
    await expect(page.locator('h1')).toBeVisible();
  }
});

test('TRAFIC : couche nationale à la demande, popup au clic, détail assaini', async ({ page }) => {
  let appelsHorodate = 0;
  let appelsEvenements = 0;
  let appelsDetail = 0;
  await page.route('**/www.bison-fute.gouv.fr/data/iteration/date.json', (route) => {
    appelsHorodate += 1;
    // 22 août 2026 01:05:03 à Paris.
    return route.fulfill({ contentType: 'application/json', body: '[1787353503716]' });
  });
  await page.route('**/www1.bison-fute.gouv.fr/data/**/evenementsOL6.json', (route) => {
    appelsEvenements += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      type: 'FeatureCollection',
      features: [
        // Coordonnées Lambert-93 réelles (A5 en Seine-et-Marne).
        { geometry: { type: 'Point', coordinates: [695546.6, 6813337.5] },
          properties: { type: 'COUPURE', etat_evenement: 'EFFECTIF',
            urlcpc: '/data/x/evenementsOL6/maintenant/cpc/1.json',
            dateCreation: '21/08/2026 05:48:17' } },
        // Un événement TERMINÉ : ne doit PAS apparaître.
        { geometry: { type: 'Point', coordinates: [700000, 6600000] },
          properties: { type: 'ACCIDENT', etat_evenement: 'TERMINE', urlcpc: '' } },
      ],
    }) });
  });
  await page.route('**/www1.bison-fute.gouv.fr/data/**/cpc/**', (route) => {
    appelsDetail += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify([[
      'A5 (77) Route fermée', 'coupure', [],
      ['Route fermée', '<br/>jusqu&#39;au 30/03/2028<br/> A5 (deux sens)<br/><script>alert(1)</script>'],
      '', 'EFFECTIF',
    ]]) });
  });

  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  // RIEN tant que la couche n'est pas demandée.
  expect(appelsHorodate + appelsEvenements, 'trafic chargé sans être demandé').toBe(0);

  await page.locator('.trafic summary').click();
  await page.getByRole('checkbox', { name: /Événements routiers/ }).check();
  // Un seul événement retenu : le TERMINÉ est écarté.
  await expect(page.locator('.trafic-etat')).toContainText('1 événement en cours', { timeout: 15_000 });
  expect(appelsHorodate).toBe(1);
  expect(appelsEvenements).toBe(1);

  // La pastille est RENDUE au bon endroit (reprojection Lambert-93 → WGS84).
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.9398, 48.4203], zoom: 12 });
  });
  await expect.poll(() => page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      project(p: [number, number]): { x: number; y: number };
      queryRenderedFeatures(p: { x: number; y: number }, o: object): unknown[];
    } }).__carte;
    return c.queryRenderedFeatures(c.project([2.9398, 48.4203]), { layers: ['trafic-points'] }).length;
  }), { timeout: 15_000 }).toBeGreaterThan(0);

  // Clic : le détail est demandé, et arrive ASSAINI (aucune balise).
  const point = await page.evaluate(() => {
    const c = (window as unknown as { __carte: { project(p: [number, number]): { x: number; y: number } } }).__carte;
    return c.project([2.9398, 48.4203]);
  });
  const cadre = await page.locator('#carte canvas.maplibregl-canvas').boundingBox();
  await page.mouse.click(cadre!.x + point.x, cadre!.y + point.y);
  await expect(page.locator('.trafic-popup')).toContainText('A5 (77) Route fermée', { timeout: 10_000 });
  await expect(page.locator('.trafic-detail')).toContainText('A5 (deux sens)');
  await expect(page.locator('.trafic-detail')).toContainText("jusqu'au 30/03/2028");
  expect(appelsDetail).toBe(1);
  // Le script du détail n'a pas été exécuté ni injecté comme balise.
  expect(await page.locator('.trafic-popup script').count()).toBe(0);
  await expect(page.locator('.trafic-popup')).toContainText('alert(1)'); // en TEXTE

  // Décocher éteint la couche pour de bon (le volet est resté ouvert).
  await page.getByRole('checkbox', { name: /Événements routiers/ }).uncheck();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __carte: { queryRenderedFeatures(o: object): unknown[] } })
      .__carte.queryRenderedFeatures({ layers: ['trafic-points'] }).length,
  ), { timeout: 10_000 }).toBe(0);
});

test('MÉTÉO : prévision à l’HEURE D’ARRIVÉE, à la demande, écart de source assumé', async ({ page }) => {
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 4 * 3600, // quatre heures pile
    }),
  }));
  let appelsMeteo = 0;
  let urlMeteo = '';
  await page.route('**/api.open-meteo.com/**', (route) => {
    appelsMeteo += 1;
    urlMeteo = route.request().url();
    // Le service rend des heures LOCALES sans fuseau : on en fabrique une
    // série centrée sur l'heure d'arrivée réelle, calculée dans le test.
    const arrivee = new Date(Date.now() + 4 * 3600 * 1000);
    // Heures fabriquées EN UTC avec un décalage déclaré à zéro : la fixture
    // dit la même chose que le vrai service, qui rend toujours son décalage.
    const heure = (decalage: number) => {
      const d = new Date(arrivee.getTime() + decalage * 3600 * 1000);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:00`;
    };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ utc_offset_seconds: 0, hourly: {
      time: [heure(-2), heure(0), heure(2)],
      temperature_2m: [12.1, 23.8, 15.5],
      precipitation: [0, 1.8, 0],
      weather_code: [3, 95, 2],
      wind_speed_10m: [5, 32, 7],
    } }) });
  });

  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await page.locator('.iti-actions').waitFor({ state: 'visible', timeout: 15_000 });
  // Rien tant que la section est fermée.
  expect(appelsMeteo, 'météo demandée sans ouvrir la section').toBe(0);

  await page.locator('.iti-meteo summary').click();
  await expect(page.locator('.meteo-ligne')).toContainText('24 °C', { timeout: 15_000 });
  await expect(page.locator('.meteo-ligne')).toContainText('orage');
  await expect(page.locator('.meteo-ligne')).toContainText('1,8 mm de pluie');
  await expect(page.locator('.meteo-ligne')).toContainText('vent 32 km/h');
  // C'est bien l'heure d'ARRIVÉE (maintenant + 4 h) qui est annoncée.
  const dans4h = new Date(Date.now() + 4 * 3600 * 1000);
  // Le décalage déclaré vaut 0 : l'heure « locale au lieu » est donc UTC.
  await expect(page.locator('.meteo-ligne')).toContainText(`${dans4h.getUTCHours()} h`);
  await expect(page.locator('.meteo-ligne')).toContainText('heure locale');
  expect(appelsMeteo).toBe(1);

  // La prévision est demandée pour l'ARRIVÉE, pas pour le départ.
  const u = new URL(urlMeteo);
  expect(Number(u.searchParams.get('latitude'))).toBeCloseTo(45.764, 3);
  expect(Number(u.searchParams.get('longitude'))).toBeCloseTo(4.8357, 3);

  // L'ÉCART DE SOUVERAINETÉ EST DIT LÀ OÙ IL SE PRODUIT.
  await expect(page.locator('.meteo-source')).toContainText('Open-Meteo');
  await expect(page.locator('.meteo-source')).toContainText('européen');

  // …et les pages publiques le disent AUSSI, sans se contredire.
  await page.goto('/a-propos.html');
  await expect(page.locator('.page-corps')).toContainText('L’exception : la météo');
  await expect(page.locator('.page-corps')).toContainText('Open-Meteo, un service européen (allemand)');
  await expect(page.locator('.page-corps')).toContainText('seules les coordonnées de votre');
  // Le chapô ne promet plus « rien d'autre » que le français.
  await expect(page.locator('.page-chapo')).toContainText('à une exception près');
  await page.goto('/mentions-legales.html');
  await expect(page.locator('.page-corps')).toContainText('Open-Meteo, service européen');
});

test('MÉTÉO : une arrivée hors horizon ne se déguise PAS en prévision', async ({ page }) => {
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 6 * 24 * 3600, // six jours à pied
    }),
  }));
  await page.route('**/api.open-meteo.com/**', (route) => {
    // Le service ne prévoit que trois jours : la dernière case est très loin
    // de l'arrivée. Elle ne doit surtout pas être présentée comme le bulletin.
    const base = new Date();
    const case_ = (h: number) => {
      const d = new Date(base.getTime() + h * 3600 * 1000);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:00`;
    };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      utc_offset_seconds: 0,
      hourly: {
        time: [case_(0), case_(24), case_(48)],
        temperature_2m: [20, 21, 22], precipitation: [0, 0, 0],
        weather_code: [0, 0, 0], wind_speed_10m: [5, 5, 5],
      },
    }) });
  });
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await page.locator('.iti-actions').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('.iti-meteo summary').click();
  await expect(page.locator('.iti-meteo-corps')).toContainText('trop lointaine', { timeout: 15_000 });
  await expect(page.locator('.meteo-ligne')).toHaveCount(0);
});

test('MÉTÉO : le bulletin se REJOUE quand l’horloge a tourné', async ({ page }) => {
  await page.clock.install();
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 3600,
    }),
  }));
  let appels = 0;
  await page.route('**/api.open-meteo.com/**', (route) => {
    appels += 1;
    const d = new Date(Date.now() + 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    const heure = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:00`;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      utc_offset_seconds: 0,
      hourly: { time: [heure], temperature_2m: [20], precipitation: [0], weather_code: [0], wind_speed_10m: [5] },
    }) });
  });
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await page.locator('.iti-actions').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('.iti-meteo summary').click();
  await expect(page.locator('.meteo-ligne')).toBeVisible({ timeout: 15_000 });
  expect(appels).toBe(1);

  // Refermer/rouvrir tout de suite : inutile de redemander.
  await page.locator('.iti-meteo summary').click();
  await page.locator('.iti-meteo summary').click();
  await page.waitForTimeout(400);
  expect(appels, 'redemandé alors que rien n’a changé').toBe(1);

  // MAIS si l'horloge tourne pour de bon, rouvrir doit REJOUER — sinon on
  // afficherait une arrivée déjà passée. L'horloge simulée de Playwright
  // avance le temps DU NAVIGATEUR, ce qu'une redéfinition de Date.now ne fait
  // pas (new Date() lit l'horloge système, pas Date.now).
  await page.locator('.iti-meteo summary').click();
  await page.clock.fastForward('20:00');
  await page.locator('.iti-meteo summary').click();
  await expect.poll(() => appels, { timeout: 15_000 }).toBe(2);
});

test('PHOTOS DE RUE : à la demande seulement, avec attribution, fermeture au clavier', async ({ page }) => {
  await page.route('**/api-adresse.data.gouv.fr/reverse/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [{
      geometry: { coordinates: [2.3364, 48.8611] },
      properties: { label: 'Rue de Rivoli 75001 Paris', type: 'street', postcode: '75001', city: 'Paris' },
    }] }),
  }));
  let appelsPhotos = 0;
  await page.route('**/api.panoramax.xyz/**', (route) => {
    appelsPhotos += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{
      id: 'photo-1',
      geometry: { type: 'Point', coordinates: [2.3364, 48.8611] },
      properties: {
        datetime: '2015-07-30T17:10:04+00:00',
        license: 'CC-BY-SA-4.0',
        'geovisio:producer': 'Contributeur OSM',
      },
      assets: {
        sd: { href: 'https://panoramax.openstreetmap.fr/derivates/photo-1/sd.jpg', type: 'image/jpeg' },
        thumb: { href: 'https://panoramax.openstreetmap.fr/derivates/photo-1/thumb.jpg', type: 'image/jpeg' },
      },
    }] }) });
  });
  // L'image elle-même est simulée : la CI ne télécharge pas de photo réelle.
  await page.route('**/panoramax.openstreetmap.fr/**', (route) => route.fulfill({
    contentType: 'image/png', body: PNG_1PX,
  }));

  await page.goto('/');
  const canevas = page.locator('#carte canvas.maplibregl-canvas');
  await canevas.waitFor({ timeout: 15_000 });
  const cadre = await canevas.boundingBox();
  await page.mouse.move(cadre!.x + 640, cadre!.y + 360);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('.pa-libelle')).toContainText('Rue de Rivoli', { timeout: 10_000 });

  // RIEN n'est demandé à Panoramax tant qu'on ne le demande pas.
  expect(appelsPhotos, 'photo demandée sans clic').toBe(0);

  await page.getByRole('button', { name: 'Photos de rue' }).click();
  const modale = page.getByRole('dialog', { name: 'Photo de rue' });
  await expect(modale).toBeVisible({ timeout: 10_000 });
  expect(appelsPhotos).toBe(1);
  // L'ATTRIBUTION est obligatoire (CC-BY-SA) : producteur, licence, date, source.
  await expect(page.locator('.photo-legende')).toContainText('Contributeur OSM');
  await expect(page.locator('.photo-legende')).toContainText('CC-BY-SA-4.0');
  await expect(page.locator('.photo-legende')).toContainText('juillet 2015');
  await expect(page.locator('.photo-legende')).toContainText('Panoramax');
  await expect(page.locator('.photo-image')).toHaveAttribute('src', /panoramax\.openstreetmap\.fr/);

  // Échap ferme, et l'image est libérée.
  await page.keyboard.press('Escape');
  await expect(modale).toBeHidden();
  expect(await page.locator('.photo-image').getAttribute('src')).toBeNull();
});

test('SUR LE TRAJET : stations trouvées le long de l’itinéraire, appels PLAFONNÉS', async ({ page }) => {
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      // Un trajet plein est le long du parallèle 48, sur ~74 km.
      geometry: { type: 'LineString', coordinates: [[2, 48], [2.25, 48], [2.5, 48], [2.75, 48], [3, 48]] },
      distance: 74_000, duration: 3_600,
    }),
  }));
  let appels = 0;
  await page.route('**/data.economie.gouv.fr/**', (route) => {
    appels += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      total_count: 3, results: [
        // Sur la route, au tiers du trajet.
        { geom: { lon: 2.3, lat: 48.002 }, adresse: '2 Route Nationale', ville: 'Melun', gazole_prix: 1.89 },
        // Bien plus loin que le rayon : doit être écartée par le calcul local.
        { geom: { lon: 2.5, lat: 48.6 }, adresse: 'Trop au nord', ville: 'Ailleurs', gazole_prix: 1.79 },
        // Doublon d'un tronçon à l'autre : ne doit apparaître qu'une fois.
        { geom: { lon: 2.3, lat: 48.002 }, adresse: '2 Route Nationale', ville: 'Melun', gazole_prix: 1.89 },
      ] }) });
  });

  await page.goto('/#iti=2.00000,48.00000;3.00000,48.00000;car');
  await page.locator('.iti-actions').waitFor({ state: 'visible', timeout: 15_000 });
  // Tant que la section est fermée : AUCUN appel.
  expect(appels, 'appel parti sans ouvrir la section').toBe(0);

  await page.locator('.iti-trajet summary').click();
  await expect(page.locator('.trajet-resume')).toContainText('1 station', { timeout: 15_000 });
  await expect(page.locator('.trajet-liste li')).toHaveCount(1);
  await expect(page.locator('.trajet-aller')).toHaveText('2 Route Nationale, Melun');
  // L'avancement et le prix sont dits en français.
  await expect(page.locator('.trajet-detail')).toContainText('km 22');
  await expect(page.locator('.trajet-detail')).toContainText('Gazole 1,89 €');
  // LE PLAFOND : au plus six appels, quel que soit le trajet.
  expect(appels, `appels au service : ${appels}`).toBeLessThanOrEqual(6);
  expect(appels).toBeGreaterThan(0);

  // Changer de rayon relance UNE recherche, toujours sous le plafond.
  const avant = appels;
  await page.locator('.trajet-rayon').selectOption('1000');
  await expect.poll(() => appels, { timeout: 15_000 }).toBeGreaterThan(avant);
  expect(appels - avant).toBeLessThanOrEqual(6);
});

test('VITRINE : les pages de texte s’ouvrent depuis la carte, SANS JavaScript', async ({ page }) => {
  // Les pages promettent « aucun traceur » : la meilleure preuve est qu'elles
  // ne chargent AUCUN script et ne contactent AUCUNE origine tierce.
  const scripts: string[] = [];
  const origines = new Set<string>();
  page.on('request', (r) => {
    origines.add(new URL(r.url()).hostname);
    if (r.resourceType() === 'script') scripts.push(r.url());
  });

  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  // Le pied de carte donne accès aux trois pages.
  await page.locator('.pied-carte a[href="/a-propos.html"]').click();
  await expect(page).toHaveTitle(/À propos/);
  await expect(page.locator('h1')).toHaveText('Une carte qui ne vous suit pas');
  await expect(page.locator('.page-promesses li').first()).toContainText('Aucun traceur');

  scripts.length = 0;
  origines.clear();
  await page.locator('.page-pied a[href="/vie-privee.html"]').click();
  await expect(page).toHaveTitle(/Vie privée/);
  await expect(page.locator('h1')).toHaveText('Vos données ne quittent jamais ce navigateur');
  // Le cœur de la promesse : la page dit « aucun cookie » ET n'en pose aucun.
  await expect(page.getByText('Non — aucun.')).toBeVisible();
  expect(await page.context().cookies()).toHaveLength(0);

  await page.locator('.page-pied a[href="/mentions-legales.html"]').click();
  await expect(page).toHaveTitle(/Mentions légales/);
  // Les mentions obligatoires sont présentes et exactes.
  await expect(page.locator('.page-corps')).toContainText('Armelin ASIMANE');
  await expect(page.locator('.page-corps')).toContainText('815 190 038');
  await expect(page.locator('.page-corps')).toContainText('GitHub, Inc.');
  await expect(page.locator('.page-corps')).toContainText('AGPL');
  await expect(page.locator('.page-corps')).toContainText('IGN-F / Géoplateforme');

  // AUCUN script, AUCUNE origine tierce sur les pages de texte.
  expect(scripts, `scripts chargés : ${scripts.join(', ')}`).toHaveLength(0);
  expect([...origines].filter((h) => h !== 'localhost'),
    'origine tierce contactée par une page de texte').toHaveLength(0);

  // Et le retour à la carte fonctionne.
  await page.locator('.page-retour').click();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
});

test('RÉFÉRENCEMENT : sitemap, robots et image de partage sont réellement servis', async ({ page }) => {
  // Les tests unitaires vérifient le CONTENU de ces fichiers ; ici on prouve
  // qu'ils sortent bien du build et arrivent au bon type MIME — un fichier
  // parfait qui n'est pas publié ne référence rien.
  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toContain('xml');
  expect(await sitemap.text()).toContain('https://maps.infonovice.fr/a-propos.html');

  const robots = await page.request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Sitemap: https://maps.infonovice.fr/sitemap.xml');

  const image = await page.request.get('/partage-social.png');
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/png');
  // 1200 × 630 : les dimensions vivent dans l'en-tête IHDR du PNG.
  const octets = await image.body();
  expect(octets.readUInt32BE(16)).toBe(1200);
  expect(octets.readUInt32BE(20)).toBe(630);
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

test('PROFESSIONNELS : la page dit ce qu’elle ne fait pas, et contacte SANS serveur', async ({ page }) => {
  /* Cette page vend quelque chose : c'est précisément celle où l'on peut être
     tenté de poser un formulaire, un traceur de conversion, un chat. Le test
     vérifie qu'il n'y a rien de tout cela — et que le contact passe par la
     messagerie de l'usager, pas par un serveur. */
  const scripts: string[] = [];
  const origines = new Set<string>();
  page.on('request', (r) => {
    origines.add(new URL(r.url()).hostname);
    if (r.resourceType() === 'script') scripts.push(r.url());
  });

  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.locator('.pied-carte a[href="/offre-flottes.html"]').click();
  await expect(page).toHaveTitle(/Flottes et professionnels/);

  scripts.length = 0;
  origines.clear();
  await page.reload();

  // CE QU'ELLE PROMET, et surtout ce qu'elle refuse de promettre.
  await expect(page.locator('h1')).toHaveText('Pour ceux dont le métier est sur la route');
  const limites = page.locator('.page-promesses');
  await expect(limites).toContainText('Aucun suivi de véhicule');
  await expect(limites).toContainText('Aucune optimisation de tournée');

  /* LE CONTACT EST UN mailto:, PAS UN FORMULAIRE. Un formulaire enverrait la
     saisie à un serveur — le nôtre ou celui d'un tiers —, ce que ce site
     n'a pas et ne veut pas. La page ne doit donc contenir AUCUN <form>. */
  await expect(page.locator('form')).toHaveCount(0);
  const contact = page.locator('.page-action');
  await expect(contact).toBeVisible();
  const lien = await contact.getAttribute('href');
  expect(lien, 'le contact doit ouvrir la messagerie de l’usager')
    .toMatch(/^mailto:contact@infonovice\.fr\?/);

  // AUCUN script, AUCUNE origine tierce — comme les autres pages de texte.
  expect(scripts, `scripts chargés : ${scripts.join(', ')}`).toHaveLength(0);
  expect([...origines].filter((h) => h !== 'localhost'),
    'origine tierce contactée par la page professionnels').toHaveLength(0);
  expect(await page.context().cookies()).toHaveLength(0);

  // La cible tactile du contact tient les 44 px exigés, doigt compris.
  const cadre = await contact.boundingBox();
  expect(cadre!.height, 'cible tactile trop courte').toBeGreaterThanOrEqual(44);

  await page.locator('.page-retour').click();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
});
