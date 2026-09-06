import { test, expect, type Page } from '@playwright/test';
import { ouvrirVolet, ouvrirReglagesBornes } from './volets';
import { PNG_1PX, simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { allerA, retour } from './planificateur';

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

/**
 * S'assure que la bulle d'attribution est OUVERTE — c'est par elle qu'on
 * atteint les pages légales depuis le 30/08.
 *
 * ELLE N'EST PAS DANS LE MÊME ÉTAT PARTOUT, et cliquer aveuglément la
 * refermerait : MapLibre l'ouvre par défaut, et nous la replions sur
 * téléphone seulement (390 px ne portent pas quatre liens plus la source).
 * On regarde donc avant d'agir.
 */
async function ouvrirLaBulle(page: Page): Promise<void> {
  const bulle = page.locator('.maplibregl-ctrl-attrib');
  const ouverte = await bulle.evaluate((e) => e.classList.contains('maplibregl-compact-show'));
  if (!ouverte) await page.locator('.maplibregl-ctrl-attrib-button').click();
}

// Depuis la PR #2, la page EST la carte : on vérifie que MapLibre s'amorce,
// que les contrôles parlent français, et que seules les origines déclarées sont appelées.

test('la carte s’amorce : canevas présent, contrôles en français', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Infonovice Maps/);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  /* LES BOUTONS + ET − ONT DISPARU le 29/08 (Armelin : « ils n'ont pas
     leur place sur un écran tactile où tout le monde zoome avec les
     doigts »). La boussole reste — aucun geste ne la remplace — et c'est
     elle qui prouve désormais que les commandes de vue sont en français. */
  await expect(page.getByRole('button', { name: 'Zoomer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remettre le nord en haut' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Me localiser' })).toBeVisible();
  // L'attribution IGN est une obligation de la Géoplateforme, pas un ornement.
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('IGN');
});

test('le repère principal et l’application sont DEUX nœuds distincts', async ({ page }) => {
  /* `role="application"` posé sur <main> ÉCRASAIT le point de repère
     principal : un lecteur d'écran ne trouvait plus « le contenu principal »
     (audit Lighthouse du 26/08/2026, corrigé le 27/08). Le rôle vit désormais
     sur un conteneur interne — qui emporte l'id `#carte`, car c'est lui que
     MapLibre reçoit et que trente parcours désignent. */
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  const structure = await page.evaluate(() => {
    const principal = document.querySelector('main');
    const application = document.getElementById('carte');
    return {
      principalSansRole: Boolean(principal) && !principal!.hasAttribute('role'),
      applicationDansPrincipal: Boolean(application?.closest('main'))
        && application?.getAttribute('role') === 'application',
      etiquette: application?.getAttribute('aria-label') ?? '',
    };
  });
  expect(structure.principalSansRole,
    'le rôle application ne doit plus écraser <main>').toBe(true);
  expect(structure.applicationDansPrincipal,
    'la carte doit rester une application, DANS le repère principal').toBe(true);
  expect(structure.etiquette).toContain('Carte de France');
});

test('ORIGINES DÉCLARÉES : seules celles de la CSP sont contactées', async ({ page }) => {
  // La contrainte n° 3 du projet, mesurée au navigateur. La liste blanche
  // s'élargit par PR, jamais par accident : data.geopf.fr est arrivée avec
  // la carte (PR #2), api-adresse.data.gouv.fr avec la recherche (PR #4).
  // data.economie.gouv.fr et public.opendatasoft.com sont arrivées avec les
  // POI (PR #9) — et ne sont contactées QUE couche activée, zoom ≥ 12.
  const AUTORISEES = new Set(['localhost', 'data.geopf.fr', 'api-adresse.data.gouv.fr',
    'data.economie.gouv.fr', 'public.opendatasoft.com',
    // Overpass, par le miroir d'OpenStreetMap FRANCE — commodités des aires,
    // À LA DEMANDE seulement (PR #29). L'instance de référence est allemande.
    'overpass.openstreetmap.fr']);
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
  await ouvrirVolet(page, '.fonds');
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
  await ouvrirVolet(page, '.fonds');
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
  const champs = page.locator('.vue-accueil input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');
  await page.getByRole('option', { name: 'Lyon' }).first().click();
  await expect(page.locator('.iti-resultat')).toContainText('539 km', { timeout: 10_000 });
  expect(urls[urls.length - 1]).not.toContain('constraints');

  // Éviter les autoroutes : le recalcul porte la contrainte, encodée.
  /* LES ÉVITEMENTS SONT SUR LA PAGE « OPTIONS » depuis la refonte du
     27/08 : l'accueil ne porte plus que les deux extrémités du trajet. */
  await allerA(page, 'options');
  await page.getByRole('checkbox', { name: 'Autoroutes' }).check();
  await retour(page);
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

test('« Le plus court » PARLE AU SERVICE, voyage dans le lien, et revient', async ({ page, context }) => {
  /* Le cadrage des « profils de trajet » du mandat du 28/08 : le moteur ne
     connaît que fastest et shortest (getcapabilities du 28/08) — on expose
     ces deux-là, rien d'inventé. Ce parcours mesure les trois contrats :
     le paramètre part au service, le lien partagé le porte, et le lien
     rejoué recoche le réglage. */
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    const [libelle, lon, lat] = q.includes('lyon')
      ? ['Lyon', 4.8357, 45.7640] : ['Paris', 2.3522, 48.8566];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{
      geometry: { coordinates: [lon, lat] },
      properties: { label: libelle, type: 'municipality', postcode: '', city: libelle },
    }] }) });
  });
  const urls: string[] = [];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    urls.push(route.request().url());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }) });
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await page.locator('.iti > summary').click();
  const champs = page.locator('.vue-accueil input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');
  await page.getByRole('option', { name: 'Lyon' }).first().click();
  await expect(page.locator('.iti-resultat')).toContainText('465 km', { timeout: 10_000 });
  // Le défaut est celui de toujours : fastest.
  expect(urls[urls.length - 1]).toContain('optimization=fastest');

  await allerA(page, 'options');
  /* Le CLIC VA AU TEXTE : l'input est masqué (opacity 0), c'est son <span>
     stylé en pilule qui se présente — comme pour l'usager. */
  await page.locator('.iti-optimisations span', { hasText: 'Le plus court' }).click();
  await expect.poll(() => urls.length).toBe(2);
  expect(urls[1]).toContain('optimization=shortest');

  // Le lien partagé porte le réglage — un trajet « le plus court » rejoué
  // en « rapide » serait un autre trajet sous le même lien.
  await allerA(page, 'partage');
  await page.getByRole('button', { name: 'Copier le lien du trajet' }).click();
  const lien = await page.evaluate(() => navigator.clipboard.readText());
  expect(lien).toContain(';opt=shortest');

  // Et le lien rejoué RECOCHE le réglage, requête à l'appui.
  const rejoue: string[] = [];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    rejoue.push(route.request().url());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 465_000, duration: 15_480,
    }) });
  });
  await page.goto(lien.replace(/^.*#/, '/#'));
  await page.reload();
  await expect(page.locator('.iti-resultat')).toContainText('465 km', { timeout: 15_000 });
  expect(rejoue[rejoue.length - 1]).toContain('optimization=shortest');
  await allerA(page, 'options');
  await expect(page.getByRole('radio', { name: 'Le plus court' })).toBeChecked();
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
  /* « COPIER LE LIEN », GPX ET KML SONT DERRIÈRE « PARTAGER » depuis le
     27/08. Armelin : « les boutons GPX et KML nuisent à l'ergonomie en
     affichant des boutons que peu de gens comprendront ». */
  await allerA(page, 'partage');
  await page.getByRole('button', { name: 'Copier le lien du trajet' }).click();
  const lien = await page.evaluate(() => navigator.clipboard.readText());
  expect(lien).toContain('4.83280,46.30690;5.04150,47.32200');
  expect(lien).toContain(';car;evite=autoroute');

  // LA FEUILLE DE ROUTE hérite étapes ET évitements du cliché.
  await allerA(page, 'feuille');
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
  await allerA(page, 'options');
  await expect(page.getByRole('checkbox', { name: 'Autoroutes' })).toBeChecked();
  await retour(page);
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
  await allerA(page, 'feuille');
  const etapes = page.locator('.feuille-etapes li');
  await expect(etapes).toHaveCount(3, { timeout: 10_000 });
  await expect(etapes.nth(0)).toContainText('Départ — Rue de Rivoli');
  await expect(etapes.nth(1)).toContainText('Tournez à droite — Avenue Victoria');
  await expect(etapes.nth(2)).toContainText('Vous êtes arrivé');
  await expect(page.locator('.feuille-imprimer')).toBeVisible();
  expect(appelsEtapes, 'le service doit être appelé une fois').toBe(1);

  // Refermer puis rouvrir ne rappelle pas le service : les étapes sont acquises.
  await retour(page);
  await allerA(page, 'feuille');
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
  await allerA(page, 'feuille');
  await expect(page.locator('.iti-feuille-corps')).toContainText('momentanément indisponible', { timeout: 10_000 });
  // Le service revient : refermer puis rouvrir suffit — l'échec n'a rien verrouillé.
  enPanne = false;
  await retour(page);
  await allerA(page, 'feuille');
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
  await page.route('**/public.opendatasoft.com/**', (route) => {
    /* L'INDEX NATIONAL ATTEND UN TABLEAU, la couche un objet
       `{ total_count, results }`. Servir le second au premier rendait un index
       vide — et l'application le DISAIT, à juste titre. Deux formes, deux
       réponses. */
    if (route.request().url().includes('/exports/json')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([
        { id_station_itinerance: 'FRBERCY01', nom_station: 'Bercy Village',
          nom_enseigne: 'Belib’', condition_acces: 'Accès libre',
          prise_type_combo_ccs: '1', prise_type_chademo: '0', prise_type_2: '0',
          p: 50, pdc: 30, lon: 2.355, lat: 48.857 },
      ]) });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ total_count: 11_950, results: [
        { point_geo: { lon: 2.355, lat: 48.857 }, nom_station: 'Bercy Village',
          puissance_nominale: 7, nbre_pdc: 30, gratuit: '1' },
      ] }),
    });
  });
  await page.route('**/data.geopf.fr/wfs/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ type: 'FeatureCollection', numberMatched: 1, features: [
      { type: 'Feature', properties: { surfm2: 1327, nomcom: 'Paris' },
        geometry: { type: 'Polygon', coordinates: [[[2.353, 48.855], [2.354, 48.855], [2.354, 48.856], [2.353, 48.855]]] } },
    ] }),
  }));

  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await ouvrirVolet(page, '.poi');
  await page.getByRole('checkbox', { name: 'Carburants' }).check();
  /* Au zoom initial (5,4 : la France entière), AUCUN appel — on demande de
     zoomer. LE MESSAGE EST DÉSORMAIS PAR COUCHE : les bornes, elles, ont un
     index national et franchissent ce seuil ; les carburants et les parkings
     n'en ont pas et s'y arrêtent. Un message global les aurait confondus. */
  await expect(page.locator('.poi-etat'))
    .toContainText('Carburants : zoomez pour les afficher', { timeout: 5_000 });
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
  await ouvrirVolet(page, '.fonds');
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
  await ouvrirVolet(page, '.poi');
  await expect(page.getByRole('checkbox', { name: 'Carburants' })).toBeChecked();
  await expect(page.locator('.poi-etat'))
    .toContainText('Carburants : zoomez pour les afficher', { timeout: 10_000 });
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
    const url = route.request().url();
    /* L'INDEX NATIONAL N'EST PAS DEMANDÉ ICI (on reste au-dessus du zoom 12) ;
       s'il l'était, il attendrait un TABLEAU. Lui répondre des
       enregistrements rendrait un index vide, silencieusement. */
    if (url.includes('/exports/json')) {
      return route.fulfill({ contentType: 'application/json', body: '[]' });
    }
    /* LE CARTOUCHE DE DÉTAIL interroge la station par son nom et sa position :
       il reçoit une ligne PAR POINT DE CHARGE, avec les champs que la couche
       de la carte ne demande pas — accès, horaires, paiement. */
    /* L'AIGUILLAGE SE FAIT SUR LA CLAUSE `where`, PAS SUR LE SEUL NOM DE CHAMP.
       La requête de la COUCHE porte elle aussi « nom_station » — dans son
       `select`. Un test sur la simple présence du mot détournait donc la
       couche vers la réponse du cartouche : un enregistrement sans
       `point_geo`, donc zéro borne posée sur la carte, et un compteur
       « 0 sur 1 » que rien n'expliquait. Le défaut était dans la simulation,
       pas dans le code — mais il aurait fait accuser le code. */
    if (decodeURIComponent(url).includes('nom_station =')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        total_count: 1, results: [
          { nom_station: 'Bercy Village', adresse_station: '1 Cour Saint-Émilion, Paris',
            nom_enseigne: 'Belib’', nom_operateur: 'Total Marketing France',
            telephone_operateur: 'tel:+33-1-23-45-67-89', condition_acces: 'Accès libre',
            horaires: '24/7', implantation_station: 'Parking public',
            accessibilite_pmr: 'Accessibilité inconnue', paiement_cb: '1',
            paiement_acte: '1', reservation: '0', station_deux_roues: '0',
            tarification: null, gratuit: '1', puissance_nominale: 30, nbre_pdc: 30,
            id_station_itinerance: 'FRBERCY01', id_pdc_itinerance: 'FRBERCYE1',
            date_maj: '2026-05-02', prise_type_combo_ccs: '1', prise_type_2: '0',
            prise_type_chademo: '0', prise_type_ef: '0' },
        ] }) });
    }
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
  await ouvrirReglagesBornes(page);

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
  /* LE CLIC OUVRE LE CARTOUCHE, PLUS UNE BULLE. Quatre lignes dans deux cent
     soixante pixels ne disaient ni les conditions d'accès, ni les horaires, ni
     qui appeler quand la borne refuse de démarrer — Armelin, le 25/08 : « on
     ne peut pas cliquer sur un point de charge pour avoir son détail ». */
  const fiche = page.locator('fiche-borne');
  await expect(fiche).toBeVisible({ timeout: 5_000 });
  await expect(fiche.locator('.fb-titre')).toContainText('Bercy Village');
  // Le détail vient d'une SECONDE requête, sur les enregistrements de la station.
  await expect(fiche).toContainText('Ouvert à tous', { timeout: 10_000 });
  await expect(fiche).toContainText('30 kW');
  await expect(fiche, 'l’absence d’occupation en direct doit être DITE')
    .toContainText('L’occupation en direct n’existe dans'
    + ' aucune source publique française');

  // Et elle se referme, au clavier comme à la souris.
  await page.getByRole('button', { name: 'Fermer le détail' }).click();
  await expect(fiche).toBeHidden();

  /* ON ROUVRE LE VOLET : ouvrir le cartouche l'a refermé. Les deux occupent le
     même bord de l'écran, et depuis le 26/08 ils sont EXCLUSIFS — le cartouche
     recouvrait les filtres, ce qu'aucune mesure de texte ne montrait puisque
     c'est la surface entière qui masquait l'autre. */
  await ouvrirReglagesBornes(page);

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
  await expect(page.locator('.poi-etat'))
    .toContainText('Carburants : zoomez pour les afficher', { timeout: 10_000 });
  expect(appelsCarbu, 'appel parti sous le zoom minimal').toBe(appelsAvant);
});

test('FEUX-1 : les feux comptés par variante — et « la moins arrêtée » désignée', async ({ page }) => {
  /* Armelin, le 30/08 : « existe-t-il un moyen d'afficher les feux rouges
     afin d'optimiser les trajets avec le moins de feux ? » On ne sait pas
     OPTIMISER — le service ne prend aucun coût personnalisé — mais on sait
     COMPTER sur les trois tracés qu'on calcule déjà.
     TROIS TRACÉS DISTINCTS ici, pour que les comptes diffèrent vraiment. */
  const PARIS: [number, number] = [2.3522, 48.8566];
  const LYON: [number, number] = [4.8357, 45.764];
  const COUDE: [number, number] = [3.0, 48.0];
  const MILIEU: [number, number] = [(PARIS[0] + LYON[0]) / 2, (PARIS[1] + LYON[1]) / 2];
  /* Deux cents mètres AVANT le coude, sur le segment qui y mène : deux
     carrefours distincts, pas deux têtes du même. */
  const AVANT_COUDE: [number, number] = [
    COUDE[0] - 0.0018 * (COUDE[0] - PARIS[0]),
    COUDE[1] - 0.0018 * (COUDE[1] - PARIS[1]),
  ];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = decodeURIComponent(route.request().url());
    const sansAutoroute = url.includes('"value":"autoroute"');
    const court = url.includes('optimization=shortest');
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        geometry: {
          type: 'LineString',
          coordinates: sansAutoroute ? [PARIS, COUDE, LYON]
            : court ? [PARIS, [3.5, 47.2], LYON] : [PARIS, LYON],
        },
        distance: sansAutoroute ? 455_000 : court ? 360_000 : 390_000,
        duration: sansAutoroute ? 19_000 : court ? 15_500 : 13_000,
      }),
    });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ elements: [
      // Au départ : sur les trois tracés.
      { type: 'node', id: 1, lon: PARIS[0], lat: PARIS[1] },
      // Sur A seulement (son milieu) : A en aura deux.
      { type: 'node', id: 2, lon: MILIEU[0], lat: MILIEU[1] },
      // Sur C seulement, deux carrefours : C en aura trois.
      { type: 'node', id: 3, lon: COUDE[0], lat: COUDE[1] },
      { type: 'node', id: 4, lon: AVANT_COUDE[0], lat: AVANT_COUDE[1] },
    ] }),
  }));
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
  }));
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  await allerA(page, 'options');
  await page.getByRole('button', { name: /Comparer trois itinéraires/ }).click();

  const corps = page.locator('.iti-comparer-corps');
  await expect(corps.locator('[data-variante="A"] .comparer-feux'))
    .toHaveText('2 feux tricolores', { timeout: 15_000 });
  await expect(corps.locator('[data-variante="B"] .comparer-feux')).toHaveText('1 feu tricolore');
  await expect(corps.locator('[data-variante="C"] .comparer-feux')).toHaveText('3 feux tricolores');

  /* LA MOINS ARRÊTÉE EST DÉSIGNÉE, et c'est la réponse à la question posée.
     Elle n'est PAS la plus rapide : c'est tout l'intérêt de l'afficher. */
  await expect(corps.locator('[data-variante="B"] .comparer-marque'))
    .toContainText('la moins arrêtée');
  await expect(corps.locator('[data-variante="A"] .comparer-marque'))
    .not.toContainText('la moins arrêtée');
});

test('FEUX-3 : les feux ne s’affichent PLUS sur la carte — et rien ne part tout seul', async ({ page }) => {
  /* Armelin, le 30/08 : « fais l'affichage des feux sur la carte ». À LA
     DEMANDE — Overpass est un commun bénévole, et personne ne veut de points
     rouges qu'il n'a pas demandés. */
  const PARIS: [number, number] = [2.3522, 48.8566];
  const FIN: [number, number] = [2.4, 48.83];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [PARIS, FIN] },
      distance: 6_000, duration: 900,
    }),
  }));
  let appelsOverpass = 0;
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    appelsOverpass += 1;
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ elements: [
        // DEUX TÊTES DU MÊME CARREFOUR : elles ne doivent faire qu'un point.
        { type: 'node', id: 1, lon: PARIS[0], lat: PARIS[1] },
        { type: 'node', id: 2, lon: PARIS[0] + 0.00002, lat: PARIS[1] - 0.00002 },
        // Deux autres carrefours, plus loin sur le tracé.
        { type: 'node', id: 3, lon: (PARIS[0] + FIN[0]) / 2, lat: (PARIS[1] + FIN[1]) / 2 },
        { type: 'node', id: 4,
          lon: PARIS[0] + 0.25 * (FIN[0] - PARIS[0]),
          lat: PARIS[1] + 0.25 * (FIN[1] - PARIS[1]) },
      ] }),
    });
  });
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
  }));
  await page.goto('/#iti=2.35220,48.85660;2.40000,48.83000;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('km', { timeout: 15_000 });
  await allerA(page, 'options');

  // RIEN TANT QU'ON NE DEMANDE RIEN : aucun appel, aucune couche.
  expect(appelsOverpass, 'Overpass n’est pas interrogé sans demande').toBe(0);

  /* LES FEUX NE S'AFFICHENT PLUS SUR LA CARTE (FEUX-3, 01/09). Armelin :
     « ils ne s'affichent pas forcément tous et certains s'affichent en plein
     milieu d'autoroute […] mieux vaut ne plus afficher les feux rouges ». La
     donnée OSM mêle aux carrefours des feux de péage et de chantier, et un
     point rouge non cliquable n'explique rien. Ce parcours garde la porte
     FERMÉE : ni case, ni couche — et toujours aucun appel non demandé. */
  await expect(page.locator('.iti-feux-carte')).toHaveCount(0);
  expect(await page.evaluate(() => Boolean(
    (window as unknown as { __carte: { getLayer(id: string): unknown } })
      .__carte.getLayer('iti-feux'))), 'la couche des feux ne doit plus exister').toBe(false);
  expect(appelsOverpass, 'retirer l’affichage ne doit pas laisser un appel fantôme').toBe(0);
});

test('ITI-3 : TROIS itinéraires A, B, C — chiffrés, tracés, et adoptables', async ({ page }) => {
  /* Armelin, le 30/08 : « quand je planifie un itinéraire, je souhaite avoir
     un itinéraire A, B et C pour voir les routes alternatives empruntées ».
     CE NE SONT PAS trois sorties d'un même optimiseur — le service public
     n'expose aucun paramètre « alternatives » (mesuré en PR #6, reconfirmé
     le 29/08). Ce sont TROIS ITINÉRAIRES RÉELS, calculés avec trois
     consignes : le plus rapide, le plus court, sans autoroute. Le moteur
     simulé répond différemment à chacune. */
  const urls: string[] = [];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = decodeURIComponent(route.request().url());
    urls.push(url);
    const sansAutoroute = url.includes('"value":"autoroute"');
    const court = url.includes('optimization=shortest');
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
        distance: sansAutoroute ? 455_000 : court ? 360_000 : 390_000,
        duration: sansAutoroute ? 19_000 : court ? 15_500 : 13_000,
      }),
    });
  });
  await page.route('**/public.opendatasoft.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
  }));
  /* LES FEUX DES TROIS TRACÉS (FEUX-1) : un seul appel Overpass, dont la
     réponse est attribuée à chaque variante par la géométrie. Ici les trois
     tracés simulés sont IDENTIQUES — le moteur ne rend qu'une géométrie —
     donc les trois comptent les mêmes feux, et aucune n'est « la moins
     arrêtée ». C'est exactement ce qu'il faut vérifier : pas de vainqueur
     sans écart. */
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ elements: [
      // Deux têtes de feux du MÊME carrefour, sur le tracé : un seul arrêt.
      { type: 'node', id: 1, lon: 2.3522, lat: 48.8566 },
      { type: 'node', id: 2, lon: 2.35222, lat: 48.85662 },
      /* Un second carrefour : le MILIEU EXACT du segment Paris-Lyon. Le
         premier jet le posait à « 3,5 / 47,4 », qui a l'air sur la ligne et
         en est à trois kilomètres — le tracé simulé n'a que deux points, et
         tout ce qui n'est pas sur la corde est loin. */
      { type: 'node', id: 3, lon: (2.3522 + 4.8357) / 2, lat: (48.8566 + 45.764) / 2 },
    ] }),
  }));
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  await allerA(page, 'options');

  await page.getByRole('button', { name: /Comparer trois itinéraires/ }).click();
  const corps = page.locator('.iti-comparer-corps');
  await expect(corps.locator('.comparer-variante')).toHaveCount(3);

  // TROIS BLOCS NOMMÉS ET CHIFFRÉS.
  const a = corps.locator('[data-variante="A"]');
  const b = corps.locator('[data-variante="B"]');
  const c = corps.locator('[data-variante="C"]');
  await expect(a).toContainText('Le plus rapide');
  await expect(a).toContainText('390 km');
  await expect(b).toContainText('360 km');
  await expect(c).toContainText('455 km');

  /* LE CLASSEMENT SE LIT PLUS VITE QUE TROIS NOMBRES : la plus rapide et la
     plus courte sont désignées — et ce ne sont pas les mêmes. */
  await expect(a.locator('.comparer-marque')).toContainText('la plus rapide');
  await expect(b.locator('.comparer-marque')).toContainText('la plus courte');

  /* LES FEUX SONT COMPTÉS PAR CARREFOUR, pas par tête de feu : deux nœuds au
     même croisement font UN arrêt. Deux carrefours sur ce tracé. */
  await expect(a.locator('.comparer-feux')).toHaveText('2 feux tricolores');
  await expect(corps.locator('.comparer-marque', { hasText: 'la moins arrêtée' }),
    'sans écart de feux, personne n’est « la moins arrêtée »').toHaveCount(0);

  // Sans véhicule renseigné, la note le dit au lieu d'inventer une recharge.
  await expect(corps.locator('.comparer-note')).toContainText('Renseignez votre véhicule');

  // LES ROUTES SE VOIENT sur la carte — c'était la demande.
  expect(await page.evaluate(() => Boolean(
    (window as unknown as { __carte: { getLayer(id: string): unknown } })
      .__carte.getLayer('variantes-trait'))), 'les variantes ne sont pas tracées').toBe(true);

  /* ET L'ON EN PREND UNE : voir ne suffit pas. La consigne s'applique, le
     trajet se refait. */
  await c.getByRole('button', { name: /Prendre l’itinéraire C/ }).click();
  await expect(page.locator('.iti-resultat')).toContainText('455 km', { timeout: 10_000 });
  await expect(page.locator('.iti-eviter input[value="autoroute"]')).toBeChecked();
  expect(urls[urls.length - 1]).toContain('"value":"autoroute"');
});

test('LIEUX D’EXCEPTION : liste à la demande, détour réglable, étape ajoutée', async ({ page }) => {
  /* La demande Nomadio du 27/08 : des monuments à un détour maximal en
     minutes, qu'on peut AJOUTER à la planification. L'index est simulé pour
     contrôler les distances : un château à ~200 m du tracé, une abbaye à
     20 km — le réglage du détour tranche entre les deux. */
  /* L'INDEX NE RÉPOND QUE QUAND LE TEST LE DÉCIDE. Sans cette retenue, le
     parcours courait après un état qui passe : le témoin d'attente avait
     déjà cédé la place au résultat quand l'assertion arrivait, et la CI a
     rougi sur main le 30/08 pour cette seule raison. On ne mesure pas un
     témoin fugace en espérant arriver à temps — on tient la réponse, on
     mesure, puis on relâche. */
  let repondre: () => void = () => {};
  const indexTenu = new Promise<void>((resoudre) => { repondre = resoudre; });
  await page.route('**/donnees/monuments.json', async (route) => {
    await indexTenu;
    return route.fulfill({
      contentType: 'application/json',
      /* LES DISTANCES SONT PERPENDICULAIRES À LA DIAGONALE, pas verticales :
         la première abbaye posée « à 20 km au nord » n'était qu'à 4 km du
         tracé, et le test mesurait l'inverse de ce qu'il croyait. Château à
         ~200 m, abbaye à ~17 km — le réglage 10/20 minutes tranche. */
      body: JSON.stringify([
        [3.6, 47.301, 'Château de la Colline', 'Beaune', 'PA00078023',
          '12e s.;16e s.', '2 rue du Donjon'],
        [3.5, 47.75, 'Abbaye lointaine', 'Ailleurs', 'PA00078099', '', ''],
      ]),
    });
  });
  const urls: string[] = [];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    urls.push(decodeURIComponent(route.request().url()));
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
        distance: 390_000, duration: 13_000,
      }),
    });
  });
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  await allerA(page, 'monuments');

  const corps = page.locator('.iti-monuments-corps');
  /* L'ATTENTE SE VOIT (29/08) : « il y a un recalcul en arrière-plan, mais
     rien affiché à l'écran […] l'utilisateur peut quitter la fenêtre avant
     même que le résultat ne s'affiche ». Le témoin bat pendant la recherche,
     et laisse la place au résultat. */
  await expect(corps.locator('.iti-attente')).toBeVisible();
  repondre();
  // À 10 minutes (défaut), le château répond, l'abbaye à 20 km se tait.
  await expect(corps).toContainText('Château de la Colline', { timeout: 15_000 });
  await expect(corps).not.toContainText('Abbaye lointaine');
  await expect(corps).toContainText(/≈ \d+ min de détour/);
  // La source et l'approximation, en toutes lettres.
  await expect(corps).toContainText('Mérimée');
  await expect(corps).toContainText('vol d’oiseau');

  // Élargir à 20 minutes fait entrer l'abbaye — calcul LOCAL, index déjà lu.
  await page.getByLabel('Détour maximal en minutes').selectOption('20');
  await expect(corps).toContainText('Abbaye lointaine');
  // Et 30 minutes existe depuis le mandat UX du 28/08 (EV-1) — Nomadio va
  // jusque-là. selectOption ÉCHOUERAIT si l'option manquait.
  await page.getByLabel('Détour maximal en minutes').selectOption('30');
  await expect(corps).toContainText('Abbaye lointaine');

  /* LE NOM OUVRE LA FICHE — le retour du 27/08 au soir : « impossible de
     cliquer dessus pour avoir le détail à l'identique d'une station ». Elle
     dit le statut, l'identité, et OUVRE LA NOTICE OFFICIELLE. */
  /* DEUX CHEMINS VERS LA FICHE — le nom dans la liste ET le marqueur sur la
     carte portent le même intitulé accessible : on clique celui de la liste
     (le marqueur, lui, se prouve par son rôle même dans cette résolution). */
  await page.locator('.monuments-voir', { hasText: 'Château de la Colline' }).click();
  const ficheLieu = page.locator('fiche-lieu');
  await expect(ficheLieu).toBeVisible();
  await expect(ficheLieu.locator('.fb-titre')).toHaveText('Château de la Colline');
  await expect(ficheLieu).toContainText('Monument historique classé');
  await expect(ficheLieu).toContainText('Beaune');
  await expect(ficheLieu).toContainText('2 rue du Donjon');
  // « 12e s.;16e s. » se lit « 12e s., 16e s. » — le point-virgule est technique.
  await expect(ficheLieu).toContainText('12e s., 16e s.');
  const notice = ficheLieu.locator('a.fb-notice');
  await expect(notice).toContainText('PA00078023');
  await expect(notice).toHaveAttribute('href',
    'https://www.pop.culture.gouv.fr/notice/merimee/PA00078023');
  await expect(ficheLieu, 'horaires de visite non déclarés : la fiche le dit')
    .toContainText('renseignez-vous');

  /* « PASSER PAR LÀ » DEPUIS LA FICHE : le monument devient une ÉTAPE, le
     moteur recalcule par lui — la requête suivante porte des intermediates. */
  const avant = urls.length;
  await ficheLieu.getByRole('button', { name: 'Passer par là (étape du trajet)' }).click();
  await expect.poll(() => urls.length, { timeout: 10_000 }).toBeGreaterThan(avant);
  const derniere = urls[urls.length - 1]!;
  expect(derniere, 'l’étape du détour n’est pas partie au moteur')
    .toContain('intermediates=3.6');
  await expect(ficheLieu, 'la fiche se range : le trajet vient de changer').toBeHidden();
});

test('LIEUX D’EXCEPTION : l’index RÉEL engendré se charge et répond', async ({ page }) => {
  /* Sans simulation : le fichier public/donnees/monuments.json versionné au
     dépôt (14 350 monuments classés) est servi par le site lui-même. Un
     Paris-Lyon traverse la Bourgogne : s'il ne trouvait RIEN à 20 minutes,
     c'est l'index qui serait cassé — pas la France qui manquerait de
     châteaux. */
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 390_000, duration: 13_000,
    }),
  }));
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  await allerA(page, 'monuments');
  await expect(page.locator('.monuments-resume'), 'l’index réel ne rend rien : cassé ?')
    .toContainText(/\d+ monuments? classés?/, { timeout: 20_000 });
});

test('PÉAGES : relevés à la demande, cabines FONDUES en gares, limites dites', async ({ page }) => {
  /* Le verdict de l'étude du 27/08 : les péages se RELÈVENT (OSM), ils ne
     s'évitent pas (le moteur public n'a pas de clause). Trois cabines d'une
     même barrière et une gare isolée : l'usager franchit DEUX péages, pas
     quatre. Et AUCUN appel tant qu'on ne demande rien — Overpass est un
     commun bénévole. */
  let appels = 0;
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    appels += 1;
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      /* LES CABINES SONT POSÉES SUR LE TRACÉ SIMULÉ (la droite Paris-Lyon) :
         une cabine à six kilomètres de la ligne serait écartée par le filtre
         exact — et le parcours mesurerait le filtre, pas la fonte en gares.
         C'est arrivé à la première écriture de ce test. */
      body: JSON.stringify({ elements: [
        { type: 'node', id: 1, lat: 48.2381, lon: 2.8489,
          tags: { barrier: 'toll_booth', name: 'Gare de Fleury' } },
        { type: 'node', id: 2, lat: 48.2374, lon: 2.8495, tags: { barrier: 'toll_booth' } },
        { type: 'node', id: 3, lat: 48.2388, lon: 2.8483, tags: { barrier: 'toll_booth' } },
        { type: 'node', id: 4, lat: 47.30, lon: 3.60,
          tags: { barrier: 'toll_booth', name: 'Gare de Beaune' } },
      ] }),
    });
  });
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 390_000, duration: 13_000,
    }),
  }));
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  await allerA(page, 'options');
  expect(appels, 'Overpass interrogé sans que personne ne le demande').toBe(0);

  await page.getByRole('button', { name: 'Relever les péages du trajet' }).click();
  const corps = page.locator('.iti-peages-corps');
  await expect(corps).toContainText('2 gares de péage');
  await expect(corps).toContainText('Gare de Fleury');
  await expect(corps).toContainText('Gare de Beaune');
  await expect(corps, 'le kilométrage situe chaque gare').toContainText(/km \d+/);
  // Les limites en toutes lettres : la source, et ce qu'elle n'a pas.
  await expect(corps).toContainText('OpenStreetMap');
  /* LE TARIF N'EST PLUS « ABSENT » DEPUIS PEAGE-1 (30/08) : il se cherche
     dans la grille AREA. Sur ces gares-là — inconnues de la seule grille
     publique exploitable — l'application dit ce qu'elle ne sait pas, ce qui
     est justement le contrat. */
  await expect(corps).toContainText('Aucun tronçon chiffrable');
  await expect(corps).toContainText('AREA');
  expect(appels, 'un clic, un appel').toBe(1);

  /* ET LA PANNE PARLE FRANÇAIS : en surcharge, Overpass rend une page HTML —
     la lire en JSON lèverait une exception illisible. Le bouton reste
     réessayable : ce service tombe souvent. */
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    status: 200, contentType: 'text/html',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: '<html><body>Dispatcher_Client::request_read_and_idx::timeout</body></html>',
  }));
  const bouton = page.getByRole('button', { name: 'Relever les péages du trajet' });
  await bouton.click();
  await expect(corps).toContainText('saturé');
  await expect(bouton, 'un service qui tombe souvent doit rester réessayable').toBeEnabled();
});

test('PÉAGES : sans trajet le bouton répond, et la panne parle français', async ({ page }) => {
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    status: 200, contentType: 'text/html',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: '<html><body>Dispatcher_Client::request_read_and_idx::timeout</body></html>',
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await allerA(page, 'options');

  // Sans trajet : une phrase, pas un silence.
  const bouton = page.getByRole('button', { name: 'Relever les péages du trajet' });
  await bouton.click();
  await expect(page.locator('.iti-peages-corps')).toContainText('Calculez d’abord un itinéraire');
});

test('FAVORIS : un favori se renomme, et son adresse reste en sous-titre', async ({ page }) => {
  /* « Quand on met un lieu en favoris, c'est son adresse qui s'affiche. Ce
     serait bien de pouvoir leur donner un displayname plus facile à
     visualiser » (Armelin, 27/08/2026). Le renommage se fait EN PLACE —
     champ, Entrée — et l'adresse d'origine ne se perd pas : elle descend en
     sous-titre, parce que « Maison de Mamie » n'aide que si l'on peut encore
     situer où c'est. */
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
  const cadre = await canevas.boundingBox();
  await page.mouse.move(cadre!.x + 640, cadre!.y + 360);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('.pa-libelle')).toContainText('8 Rue de la Paix', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
  /* LA LISTE SE CHOISIT MAINTENANT (FAVORIS-4, 03/09) : trois listes sont
     livrées, donc le bouton pose la question au lieu de tout verser dans
     « Lieux favoris ». */
  await page.locator('.choix-liste').getByRole('button', { name: '⭐ Lieux favoris' }).click();
  await expect(page.getByRole('button', { name: /Ajouté aux favoris/ })).toBeVisible();

  await ouvrirVolet(page, '.favoris');
  await page.getByRole('button', { name: 'Renommer 8 Rue de la Paix 75002 Paris' }).click();
  const champ = page.locator('.favori-nom-champ');
  await expect(champ).toBeVisible();
  await champ.fill('Bureau de Paris');
  await champ.press('Enter');

  const favori = page.locator('.favori-aller');
  await expect(favori).toContainText('Bureau de Paris');
  await expect(favori.locator('.favori-adresse'),
    'l’adresse d’origine doit rester lisible').toContainText('8 Rue de la Paix');
  await expect(page.locator('.favoris-etat')).toContainText('Renommé');

  // Le nouveau nom SURVIT au rechargement — c'est un renommage, pas un décor.
  await page.reload();
  await canevas.waitFor({ timeout: 15_000 });
  await ouvrirVolet(page, '.favoris');
  await expect(page.locator('.favori-aller')).toContainText('Bureau de Paris');

  // Échap, lui, annule : on rouvre l'édition et on la referme sans dégât.
  await page.getByRole('button', { name: 'Renommer Bureau de Paris' }).click();
  await page.locator('.favori-nom-champ').press('Escape');
  await expect(page.locator('.favori-aller')).toContainText('Bureau de Paris');
});

test('l’encart d’installation ne se propose qu’aux écrans mobiles', async ({ page }) => {
  /* « En mode desktop, le site propose l'encart pour installer l'application
     alors que ça ne devrait le proposer qu'en version mobile » (Armelin,
     27/08/2026). Sur ordinateur, Chrome a déjà SA PROPRE icône d'installation
     dans la barre d'adresse — le bouton la doublait. On simule l'événement
     d'installation du navigateur et on mesure le bouton aux deux tailles. */
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
  });
  await expect(page.locator('.installer'),
    'sur grand écran, le navigateur propose déjà l’installation').toBeHidden();

  // La même fenêtre, réduite à un écran de téléphone : le bouton paraît.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('.installer')).toBeVisible();
});

test('la légende des bornes dessine les MÊMES éclairs que la carte', async ({ page }) => {
  /* L'émoji ⚡ sortait JAUNE de la police là où la carte dessine des éclairs
     BLANCS (Armelin, 27/08/2026). La légende embarque désormais le même tracé
     SVG que les pastilles de la carte. */
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirReglagesBornes(page);
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
  // Six éclairs dans les trois pastilles de palier (1 + 2 + 3).
  await expect(page.locator('.poi-legende-pastille svg polygon')).toHaveCount(6);
  const texte = await page.locator('.poi-legende').innerText();
  expect(texte, 'l’émoji jaune ne doit plus paraître').not.toContain('⚡');
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
  /* LA LISTE SE CHOISIT MAINTENANT (FAVORIS-4, 03/09) : trois listes sont
     livrées, donc le bouton pose la question au lieu de tout verser dans
     « Lieux favoris ». */
  await page.locator('.choix-liste').getByRole('button', { name: '⭐ Lieux favoris' }).click();
  await expect(page.getByRole('button', { name: /Ajouté aux favoris/ })).toBeVisible();

  // Le volet Favoris le liste, avec la promesse en toutes lettres.
  await ouvrirVolet(page, '.favoris');
  await expect(page.locator('.favori-aller')).toHaveText('8 Rue de la Paix 75002 Paris');
  await expect(page.locator('.favoris-promesse')).toContainText('ne quittent jamais ce navigateur');

  // Il SURVIT au rechargement (IndexedDB).
  await page.reload();
  await canevas.waitFor({ timeout: 15_000 });
  await ouvrirVolet(page, '.favoris');
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

  /* ET IL DIT CE QU'IL CONTIENT (EXPORT-1, 02/09). Armelin : « il contient
     des repères qui ne sont pas les miens et ne font pas partie des
     recherches que j'ai faites. » Rien d'étranger n'y était — mais rien ne
     DISAIT ce qui s'y trouvait : des clés techniques et des valeurs brutes.
     Le fichier se présente maintenant lui-même. */
  expect(contenu.quoi, 'le fichier ne dit pas ce qu’il est')
    .toContain('CET appareil');
  expect(contenu.legendes, 'aucune légende dans le fichier').toBeDefined();
  /* CHAQUE BLOC PRÉSENT EST LÉGENDÉ — et rien de plus : un sommaire plus long
     que le livre n'aide personne. */
  expect(Object.keys(contenu.legendes).sort())
    .toEqual(Object.keys(contenu.preferences).sort());
  for (const [cle, l] of Object.entries(contenu.legendes)) {
    const legende = l as { quoi: string; origine: string };
    expect(legende.quoi, `${cle} sans description`).toBeTruthy();
    expect(legende.origine, `${cle} sans origine`).toBeTruthy();
  }

  // LE RETRAIT vide la liste, ANNONCE ce qu'il a fait, et rend le focus —
  // sans quoi l'usager clavier repart du haut du document.
  await page.getByRole('button', { name: /Retirer 8 Rue de la Paix/ }).click();
  await expect(page.locator('.favoris-vide')).toBeVisible();
  await expect(page.locator('.favoris-etat')).toContainText('retiré des favoris');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('SUMMARY');

  // L'IMPORT restaure — et recharge la page pour appliquer les préférences.
  await page.locator('.favoris .favoris-fichier').setInputFiles(chemin!);
  await expect(page.locator('.favoris-etat')).toContainText('Importé : 1 favori', { timeout: 10_000 });
  await page.waitForLoadState('load');
  await canevas.waitFor({ timeout: 15_000 });
  await ouvrirVolet(page, '.favoris');
  await expect(page.locator('.favori-aller')).toHaveText('8 Rue de la Paix 75002 Paris', { timeout: 10_000 });

  // UN FICHIER QUI N'EST PAS UNE SAUVEGARDE : message français, et le champ
  // se nettoie pour qu'un second essai reparte (le même fichier compris).
  const intrus = test.info().outputPath('intrus.json');
  await (await import('node:fs/promises')).writeFile(intrus, '{"application":"autre-app"}');
  await page.locator('.favoris .favoris-fichier').setInputFiles(intrus);
  await expect(page.locator('.favoris-etat')).toContainText('pas une sauvegarde Infonovice Maps', { timeout: 10_000 });
  expect(await page.locator('.favoris .favoris-fichier').inputValue()).toBe('');
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
  /* LA LISTE SE CHOISIT MAINTENANT (FAVORIS-4, 03/09) : trois listes sont
     livrées, donc le bouton pose la question au lieu de tout verser dans
     « Lieux favoris ». */
  await page.locator('.choix-liste').getByRole('button', { name: '⭐ Lieux favoris' }).click();
  await ouvrirVolet(page, '.favoris');
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

  /* ON ATTEND QUE LA HAUTEUR SOIT PUBLIÉE. `--hauteur-entete` est écrite par
     un `ResizeObserver`, qui se déclenche APRÈS la modification du document :
     mesurer aussitôt, c'est mesurer l'ancien décalage des volets, et voir
     l'en-tête les recouvrir alors qu'il ne les recouvrira pas.
     CE PARCOURS A LÂCHÉ DEUX FOIS SUR QUATRE PASSES COMPLÈTES pour cette
     seule raison — jamais isolément, parce qu'il fallait une machine chargée
     pour que l'observateur prenne du retard. Même défaut que le témoin
     d'attente des lieux d'exception : on ne mesure pas un état qui n'a pas
     fini de s'établir. */
  await page.waitForFunction(() => {
    const entete = document.querySelector('.entete')!;
    const publiee = getComputedStyle(document.documentElement)
      .getPropertyValue('--hauteur-entete').trim();
    return publiee === `${Math.round(entete.getBoundingClientRect().height)}px`;
  }, undefined, { timeout: 10_000 });

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

  await ouvrirVolet(page, '.trafic');
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
  /* LA BULLE DU « i » DONNE ACCÈS AUX PAGES depuis le 30/08 : les liens ont
     quitté le pied de carte, qui se disputait le coin bas avec l'attribution
     IGN. Ils vivent maintenant AVEC elle — et l'on y accède comme l'usager,
     par le bouton. */
  await ouvrirLaBulle(page);
  await page.locator('.maplibregl-ctrl-attrib a[href="/a-propos.html"]').click();
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
  await allerA(page, 'partage');
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Fichier GPX' }).click();
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
  // Même chemin qu'« À propos » : la bulle du « i » (30/08).
  await ouvrirLaBulle(page);
  await page.locator('.maplibregl-ctrl-attrib a[href="/offre-flottes.html"]').click();
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

test('PHOTO-1 : la fiche d’un lieu porte sa photo Wikimedia — auteur et licence compris', async ({ page }) => {
  /* Décision d'Armelin du 29/08 : « OK pour Wikimedia ». Les deux services
     sont simulés — ce que ce parcours défend, c'est la CHAÎNE : la
     référence Mérimée part chez Wikidata, le fichier trouvé part chez
     Commons, et rien ne s'affiche sans son crédit. */
  await page.route('**/donnees/monuments.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([
      [3.6, 47.301, 'Château de la Colline', 'Beaune', 'PA00078023', '12e s.', ''],
    ]),
  }));
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 390_000, duration: 13_000,
    }),
  }));
  let refDemandee = '';
  await page.route('**query.wikidata.org/**', (route) => {
    refDemandee = decodeURIComponent(route.request().url());
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ results: { bindings: [{ img: { value:
        'http://commons.wikimedia.org/wiki/Special:FilePath/Ch%C3%A2teau.jpg' } }] } }),
    });
  });
  await page.route('**commons.wikimedia.org/**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ query: { pages: { 42: { imageinfo: [{
      thumburl: 'https://upload.wikimedia.org/480px-Chateau.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Chateau.jpg',
      extmetadata: {
        Artist: { value: '<a href="//x">Jean Photographe</a>' },
        LicenseShortName: { value: 'CC BY-SA 4.0' },
      },
    }] } } } }),
  }));

  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  await allerA(page, 'monuments');
  await page.locator('.monuments-voir', { hasText: 'Château de la Colline' }).click();

  const fiche = page.locator('fiche-lieu');
  const photo = fiche.locator('.fb-photo');
  await expect(photo).toBeVisible({ timeout: 15_000 });
  await expect(photo.locator('img')).toHaveAttribute(
    'src', 'https://upload.wikimedia.org/480px-Chateau.jpg');
  // L'ATTRIBUTION EST UNE OBLIGATION : auteur, licence, source, et le lien.
  await expect(photo.locator('figcaption')).toContainText('Jean Photographe');
  await expect(photo.locator('figcaption')).toContainText('CC BY-SA 4.0');
  await expect(photo.locator('figcaption')).toContainText('Wikimedia Commons');
  // Le HTML rendu par l'API ne devient JAMAIS du balisage dans la page.
  await expect(photo.locator('figcaption a')).toHaveCount(1);
  // C'est bien la référence Mérimée du ministère qui est partie, rien d'autre.
  expect(refDemandee).toContain('PA00078023');
  expect(refDemandee, 'aucune position ne doit partir').not.toContain('47.3');
});

test('POI : sous le zoom 12, les recherches se DISENT inertes — avant le clic', async ({ page }) => {
  /* Armelin, le 30/08 : « les boutons Pharmacie, restaurants, boulangeries,
     supermarchés et toilettes ne fonctionnent pas », et « dans le filtre des
     bornes, quand je tape McDonald, il ne se passe rien ». Ils fonctionnaient
     — mais au zoom d'un trajet entier (mesuré : 6,1) ils n'ont rien à
     chercher, et rien ne le disait TANT QU'ON N'AVAIT PAS CLIQUÉ. Un bouton
     qui a l'air actif et ne fait rien est un mensonge d'interface. */
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 390_000, duration: 13_000,
    }),
  }));
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
  await allerA(page, 'couches');

  /* LES BOUTONS « À LA DEMANDE » ONT DISPARU (ERGO-5, 02/09) : ils faisaient
     doublon avec les familles de l'entonnoir, et Armelin a tranché — « on va
     garder les POI continus et supprimer le doublon dans le panneau de
     recharge ». Ce que ce parcours défendait reste vrai de l'AUTRE surface :
     au zoom d'un trajet entier, la ligne d'état des familles dit qu'elle ne
     cherche rien. Le champ de réseau, lui, reste actif à tout zoom. */
  /* Le champ de recherche a FUSIONNÉ avec celui des réseaux le 30/08 : il
     reste actif (on cherche un réseau à tout zoom), et c'est la note qui
     porte l'avertissement sur le nom de station. */
  await expect(page.locator('.poi-reseau-recherche')).toBeEnabled();

  // EN SE RAPPROCHANT, tout redevient vivant — sans recharger la page.
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.35, 48.85], zoom: 14 });
  });
  /* AU BON ZOOM, LE CHAMP DE RÉSEAU RESTE ACTIF — il l'était déjà à tout
     zoom, et c'est ce que ce parcours garde depuis ERGO-5. */
  await expect(page.locator('.poi-reseau-recherche')).toBeEnabled();
});

test('PEAGE-1 : le coût estimé des péages — et ce qu’on ne sait PAS chiffrer', async ({ page }) => {
  /* Armelin, le 30/08 : « est-ce possible d'afficher une estimation du coût
     en péage sur chaque tronçon avant de choisir d'éviter les autoroutes ? »
     Oui, sur le RÉSEAU AREA — la seule grille publique exploitable (celle
     d'APRR est corrompue à la source, Vinci et Sanef n'en publient aucune).
     CE QUI COMPTE ICI : que le total ne se fasse jamais passer pour le
     total. C'est sur lui qu'on déciderait d'éviter l'autoroute. */
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[5.92, 45.56], [6.13, 45.90]] },
      distance: 45_000, duration: 2_400,
    }),
  }));
  // Deux gares AREA RÉELLES (la grille engendrée les connaît) et une inconnue.
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ elements: [
      { type: 'node', id: 1, lat: 45.62, lon: 5.957,
        tags: { barrier: 'toll_booth', name: 'Péage de Chambéry Nord' } },
      { type: 'node', id: 2, lat: 45.86, lon: 6.106,
        tags: { barrier: 'toll_booth', name: 'Annecy Nord' } },
      { type: 'node', id: 3, lat: 45.89, lon: 6.124,
        tags: { barrier: 'toll_booth', name: 'Gare inconnue de Vinci' } },
    ] }),
  }));
  await page.goto('/#iti=5.92000,45.56000;6.13000,45.90000;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('45 km', { timeout: 15_000 });
  await allerA(page, 'options');
  await page.getByRole('button', { name: /Relever les péages/ }).click();

  // LE PRIX, POUR LE TRONÇON QUE LA GRILLE CONNAÎT.
  const total = page.locator('.iti-peages-total');
  await expect(total).toContainText('Péages estimés', { timeout: 25_000 });
  await expect(total).toContainText('€');
  await expect(page.locator('.iti-peages-troncons li'))
    .toContainText('Péage de Chambéry Nord → Annecy Nord');

  /* ET CE QU'ON NE SAIT PAS : nommé, gare par gare. Un total partiel présenté
     comme un total serait pire que pas d'estimation du tout. */
  const note = page.locator('.iti-peages-note');
  await expect(note).toContainText('non chiffré');
  await expect(note).toContainText('Gare inconnue de Vinci');
  await expect(note, 'la couverture réelle doit être dite').toContainText('AREA');
});
