import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* SE GARER PRÈS DE L'ARRIVÉE (PARK-1, 31/08).
 *
 * Armelin : « un petit panneau rond P lorsqu'on arrive presque à destination,
 * afin de proposer une liste de parkings publics […] du plus près au plus
 * éloigné de la destination finale, car la fin du trajet se fera logiquement
 * à pied. Avec un bouton "Se garer" pour replanifier automatiquement. » Et le
 * point 9 : « une fois garé au parking, proposer de finir le parcours à pied ».
 *
 * CE QUE CES PARCOURS DÉFENDENT AUSSI : qu'Overpass ne soit interrogé QU'AU
 * CLIC du P — jamais parce qu'on approche. Un commun bénévole ne paie pas nos
 * suggestions non demandées. */

/* Un trajet court plein est : 2 km le long du 48.85e parallèle. */
const TRACE: [number, number][] = Array.from({ length: 21 }, (_, i) =>
  [2.3400 + i * 0.0014, 48.8500]);
const DEST = { lon: 2.3680, lat: 48.8503 };

async function suivre(page: Page): Promise<{ urls: string[]; overpass: string[] }> {
  const urls: string[] = [];
  const overpass: string[] = [];
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ longitude: TRACE[0]![0], latitude: TRACE[0]![1] });
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe = (c) => {
      rappel?.({ coords: { accuracy: 5, altitude: null, altitudeAccuracy: null, ...c } });
    };
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: (ok: (p: unknown) => void) => { rappel = ok; return 1; },
        clearWatch: () => { rappel = null; },
        getCurrentPosition: (ok: (p: unknown) => void) => { rappel = ok; },
      },
    });
  });
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = decodeURIComponent(route.request().url());
    urls.push(url);
    if (/resource=bdtopo-pgr/.test(url)) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: TRACE },
        distance: 2_050, duration: 240,
      }),
    });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    overpass.push(decodeURIComponent(route.request().postData() ?? route.request().url()));
    const corps = overpass[overpass.length - 1]!;
    if (/barrier|maxspeed|traffic_signals|roundabout/.test(corps)) {
      return route.fulfill({
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json', body: '{"elements":[]}',
      });
    }
    // La requête des parkings : deux publics, à des distances différentes.
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ elements: [
        { type: 'way', id: 1, center: { lon: 2.3700, lat: 48.8500 },
          tags: { name: 'Parking des Halles', capacity: '320', fee: 'yes' } },
        { type: 'way', id: 2, center: { lon: 2.3685, lat: 48.8503 },
          tags: { name: 'Parking du Marché', fee: 'no' } },
      ] }),
    });
  });
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};${DEST.lon},${DEST.lat};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
  return { urls, overpass };
}

/** Pousse un fixe et laisse le bandeau le digérer. */
async function rouler(page: Page, lon: number, lat: number): Promise<void> {
  await page.evaluate(([lo, la]) => {
    (window as unknown as { __pousserFixe: (c: object) => void })
      .__pousserFixe({ longitude: lo, latitude: la, speed: 12, heading: 90 });
  }, [lon, lat]);
  await page.waitForTimeout(900);
}

test('LES PARKINGS SE MONTRENT SEULS À L’APPROCHE — en UN appel', async ({ page }) => {
  /* CETTE RÈGLE A CHANGÉ, ET C'EST ARMELIN QUI L'A CHANGÉE (PARK-2, 01/09).
     PARK-1 ne demandait rien tant qu'on n'avait pas pressé le « P » — par
     frugalité envers Overpass, tenu par des bénévoles. Après son essai à
     pied : « il faudrait que les places de parking s'affichent toutes seules
     à proximité de la destination avant même que je clique sur le rond
     parking ». Il a raison sur l'usage : à l'approche, on cherche déjà des
     yeux où se garer, et un bouton de plus à trouver au volant est un bouton
     de trop.
     LA FRUGALITÉ EST PRÉSERVÉE AUTREMENT, et ce parcours la garde : l'appel
     automatique est EXACTEMENT celui que le clic aurait fait — un seul, gardé
     en mémoire pour tout le reste du trajet. */
  const { overpass } = await suivre(page);
  const boutonP = page.locator('.bg-parking-p');
  const demandes = (): number =>
    overpass.filter((u) => u.includes('amenity"="parking')).length;

  // Loin de l'arrivée : pas de P, et personne n'est dérangé.
  await rouler(page, 2.3450, 48.8500);
  await expect(boutonP).toBeHidden();
  expect(demandes(), 'les parkings ont été demandés trop tôt').toBe(0);

  // À moins de 1 200 m : le P paraît, ET la liste s'ouvre d'elle-même.
  await rouler(page, 2.3600, 48.8500);
  await expect(boutonP).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.bg-parkings')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bg-parkings-liste li')).toHaveCount(2, { timeout: 15_000 });

  /* UN SEUL APPEL, ET IL LE RESTE : on continue de rouler vers l'arrivée,
     chaque fixe repassant par le même chemin. Sans la garde, c'est une
     requête par fixe qui partirait vers un service bénévole. */
  await rouler(page, 2.3610, 48.8500);
  await rouler(page, 2.3615, 48.8500);
  expect(demandes(), 'un appel par fixe part vers Overpass').toBe(1);
});

test('REFERMÉE, LA LISTE NE SE ROUVRE PAS TOUTE SEULE', async ({ page }) => {
  /* Une feuille qui revient à chaque fixe serait un harcèlement — c'est le
     bouton « P » qui la rappelle, et lui seul. */
  await suivre(page);
  await rouler(page, 2.3600, 48.8500);
  await expect(page.locator('.bg-parkings')).toBeVisible({ timeout: 15_000 });

  await page.locator('.bg-parking-p').click();
  await expect(page.locator('.bg-parkings')).toBeHidden();

  await rouler(page, 2.3610, 48.8500);
  await rouler(page, 2.3615, 48.8500);
  await expect(page.locator('.bg-parkings')).toBeHidden();
});

test('LA LISTE VA DU PLUS PRÈS AU PLUS LOIN, et « Se garer » replanifie', async ({ page }) => {
  const { urls } = await suivre(page);
  /* PLUS DE CLIC : depuis PARK-2 la feuille s'ouvre d'elle-même à l'approche.
     Presser le « P » ici la REFERMERAIT — c'est un interrupteur. */
  await rouler(page, 2.3600, 48.8500);

  const items = page.locator('.bg-parkings-liste li');
  await expect(items).toHaveCount(2, { timeout: 15_000 });
  /* DU PLUS PRÈS AU PLUS LOIN DE LA DESTINATION : le Marché (~45 m) avant
     les Halles (~150 m) — la fin se fera à pied. */
  await expect(items.nth(0)).toContainText('Parking du Marché');
  await expect(items.nth(0)).toContainText('gratuit');
  await expect(items.nth(1)).toContainText('Parking des Halles');
  await expect(items.nth(1)).toContainText('320 places');
  await expect(items.nth(1)).toContainText('payant');
  /* « PLACES », JAMAIS « PLACES LIBRES » : la capacité est cartographiée, la
     disponibilité n'a aucune source nationale gratuite — le panneau le DIT. */
  await expect(page.locator('.bg-parkings-etat')).toContainText('pas les places libres');

  const avant = urls.length;
  await items.nth(0).getByRole('button', { name: /Se garer/ }).click();
  // LE RECALCUL PART : nouvelle destination = le parking choisi.
  await expect.poll(() => urls.length, { timeout: 15_000 }).toBeGreaterThan(avant);
  expect(urls[urls.length - 1]).toContain('2.3685');
  // Et la feuille se referme : la décision est prise.
  await expect(page.locator('.bg-parkings')).toBeHidden();
  /* ET ELLE NE SE ROUVRE PAS (RETOURS-0609). Armelin : « quand je cliquais sur
     l'un des parkings, je n'ai eu aucune navigation replanifiée mais je
     revenais au menu de suggestions ». Le suivi repartait vers le parking, à
     moins de 1,2 km — et la liste se rouvrait d'elle-même. */
  await rouler(page, 2.3620, 48.8501);
  await page.waitForTimeout(800);
  await expect(page.locator('.bg-parkings')).toBeHidden();
  await expect(page.locator('.bg-parking-p')).toBeHidden();
});

test('« JE ME GARE ICI : FINIR À PIED » depuis la feuille, sans choisir de parking (RETOURS-0609)', async ({ page }) => {
  const { urls } = await suivre(page);
  await rouler(page, 2.3600, 48.8500);
  await expect(page.locator('.bg-parkings-liste li')).toHaveCount(2, { timeout: 15_000 });
  await page.locator('.bg-parkings-a-pied').click();
  await expect(page.locator('.bg-parkings')).toBeHidden();
  // Le profil bascule piéton depuis ICI vers la destination d'origine.
  await expect.poll(() => urls.some((u) =>
    u.includes('profile=pedestrian') && u.includes('start=2.36')), { timeout: 15_000 }).toBe(true);
});

test('UNE FOIS GARÉ, « Finir à pied » bascule le profil piéton', async ({ page }) => {
  /* Le point 9 : « une fois garé au parking, proposer de finir le parcours à
     pied en basculant le mode de trajet de voiture à piéton ». PROPOSER : le
     bouton paraît à l'arrivée au parking, il ne bascule rien tout seul. */
  const { urls } = await suivre(page);
  // La feuille s'ouvre seule à l'approche (PARK-2) : rien à presser.
  await rouler(page, 2.3600, 48.8500);
  await expect(page.locator('.bg-parkings-liste li')).toHaveCount(2, { timeout: 15_000 });
  await page.locator('.bg-parkings-liste li').nth(0)
    .getByRole('button', { name: /Se garer/ }).click();
  await page.waitForTimeout(1_200);

  const aPied = page.locator('.bg-a-pied');
  await expect(aPied).toBeHidden();
  // On arrive au parking : la proposition paraît, avec la destination NOMMÉE.
  await rouler(page, 2.3684, 48.8503);
  await expect(aPied).toBeVisible({ timeout: 10_000 });
  await expect(aPied).toContainText('Finir à pied');

  await aPied.click();
  /* LE RECALCUL PIÉTON PART, vers la destination D'ORIGINE. */
  await expect.poll(() => urls.some((u) =>
    u.includes('profile=pedestrian') && u.includes('2.368')), { timeout: 15_000 })
    .toBe(true);
});

test('L’ARRIVÉE ATTEND D’ÊTRE VRAIE — et dit le côté de la chaussée', async ({ page }) => {
  /* ARRIVEE-2 (31/08). Armelin : « ne pas indiquer l'arrivée trop tôt, car
     hier ça m'indiquait que j'étais arrivé 40 m avant. Pourquoi pas indiquer
     en vocal : "Vous êtes arrivé à destination. Votre destination se situe
     sur la gauche (ou la droite) de la chaussée." »
     ON MESURE CE QUI EST DIT : à 45 m, PAS de constat ; à 15 m, le constat
     avec son côté. La destination (48.8503) est au NORD d'une route roulée
     vers l'EST : elle est à GAUCHE. */
  /* Le mouchard de voix.spec.ts, à l'identique : il lui faut AUSSI le
     constructeur SpeechSynthesisUtterance — sans lui, la voix jette avant de
     parler et le mouchard reste vide. */
  await page.addInitScript(() => {
    const dites: string[] = [];
    (window as unknown as { ditesVoix: string[] }).ditesVoix = dites;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [{ lang: 'fr-FR', name: 'Locale', localService: true }],
        speak: (u: { text: string }) => { dites.push(u.text); },
        cancel: () => {}, addEventListener: () => {},
      },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class { text: string; lang = ''; rate = 1; voice: unknown = null;

        constructor(txt: string) { this.text = txt; } },
    });
  });
  await suivre(page);
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  // La voix parle par défaut depuis VOIX-3 : plus rien à allumer.

  // À ~45 m de la fin : PAS de « vous êtes arrivé ».
  await rouler(page, 2.36740, 48.8500);
  const avant = await page.evaluate(() =>
    (window as unknown as { ditesVoix: string[] }).ditesVoix.join(' | '));
  expect(avant, 'le constat est parti trop tôt — le défaut exact du terrain')
    .not.toContain('Vous êtes arrivé');

  // À ~14 m : le constat, avec le côté — et l'animation sur la carte.
  await rouler(page, 2.36781, 48.8500);
  const apres = await page.evaluate(() =>
    (window as unknown as { ditesVoix: string[] }).ditesVoix.join(' | '));
  expect(apres).toContain('Vous êtes arrivé à destination.');
  /* La destination est au nord, on roule vers l'est : GAUCHE. Un côté deviné
     enverrait traverser pour rien — celui-ci est calculé. */
  expect(apres).toContain('sur la gauche de la chaussée');
  await expect(page.locator('.bg-instruction')).toContainText('Vous êtes arrivé');
  await expect(page.locator('.bg-arrivee-pulse')).toBeVisible();
});

test('LE « P » NE COUPE PLUS LA BOUSSOLE, et respire à côté de la vitesse', async ({ page }) => {
  /* PARK-2 (01/09). Armelin, capture à l'appui : « le panneau de parking bleu
     s'affiche en bas à droite et vient couper la boussole. Je préfère déplacer
     ce panneau à droite du rond d'indication de la vitesse GPS, mais pas tout
     collé. Avec un léger espace entre les deux. » */
  await suivre(page);
  await rouler(page, 2.3600, 48.8500);
  const p = page.locator('.bg-parking-p');
  await expect(p).toBeVisible({ timeout: 10_000 });

  const rond = (await p.boundingBox())!;
  const boussole = await page.locator('.maplibregl-ctrl-compass').boundingBox();
  if (boussole) {
    /* AUCUN RECOUVREMENT AVEC LA BOUSSOLE : deux rectangles qui ne se croisent
       ni en largeur ni en hauteur. */
    const croise = rond.x < boussole.x + boussole.width
      && boussole.x < rond.x + rond.width
      && rond.y < boussole.y + boussole.height
      && boussole.y < rond.y + rond.height;
    expect(croise, 'le rond « P » recouvre encore la boussole').toBe(false);
  }

  const vitesse = await page.locator('.bg-vitesse').boundingBox();
  if (vitesse) {
    // À DROITE DE LA VITESSE, et pas dessus.
    expect(rond.x, 'le « P » n’est pas à droite du rond de vitesse')
      .toBeGreaterThanOrEqual(vitesse.x + vitesse.width);
    /* ET DÉCOLLÉ : « pas tout collé », dit-il. Le blanc entre deux objets est
       ce qui les rend lisibles séparément — la règle d'ERGO-2. */
    const espace = rond.x - (vitesse.x + vitesse.width);
    expect(espace, 'le « P » est collé au rond de vitesse').toBeGreaterThanOrEqual(8);
    // …SANS PARTIR À L'AUTRE BOUT : ils forment une paire, pas deux îlots.
    expect(espace, 'le « P » est trop loin du rond de vitesse').toBeLessThanOrEqual(40);
  }
});

test('LA FEUILLE S’OUVRE AU-DESSUS DU ROND « P », qui reste cliquable', async ({ page }) => {
  /* PARK-3 (02/09). Armelin : « la fenêtre s'ouvre en masquant le bouton de
     parking ce qui rend difficile l'appui pour refermer la fenêtre. Il
     faudrait que la fenêtre de parking s'ouvre un peu plus haut. »
     LE BOUTON EST L'INTERRUPTEUR DE CETTE FEUILLE : le recouvrir enferme
     l'usager dans ce qu'il vient d'ouvrir. */
  await suivre(page);
  await rouler(page, 2.3600, 48.8500);
  const feuille = page.locator('.bg-parkings');
  await expect(feuille).toBeVisible({ timeout: 15_000 });

  const boite = (await feuille.boundingBox())!;
  const rond = (await page.locator('.bg-parking-p').boundingBox())!;
  expect(boite.y + boite.height, 'la feuille recouvre le rond « P »')
    .toBeLessThanOrEqual(rond.y + 1);

  /* ET ON LE PRESSE VRAIMENT : la géométrie ne prouve pas l'atteignabilité —
     un autre calque pourrait encore intercepter le doigt. */
  await page.locator('.bg-parking-p').click();
  await expect(feuille).toBeHidden();
});

/* ================== LES PLACES LIBRES EN DIRECT (PARK-4) ==================
 *
 * Armelin : « certaines villes exposent des API permettant de consulter en
 * live le taux d'occupation et disponibilité des places de parking […] pour
 * qu'il ne galère pas à stationner, notamment dans Paris ».
 *
 * DEUX SOURCES MESURÉES VIVANTES le 02/09 (Aix-Marseille à la minute, Nantes
 * à l'heure) ; deux autres écartées après mesure — Issy annonce « temps
 * réel » sur un relevé d'avril 2025, et Paris publie ses parkings sans leur
 * occupation. */

/** Un trajet court qui arrive au Vieux-Port : la source d'Aix-Marseille y répond. */
const TRACE_MARSEILLE: [number, number][] = Array.from({ length: 21 }, (_, i) =>
  [5.3600 + i * 0.00055, 43.2950]);
const DEST_MARSEILLE = { lon: 5.3710, lat: 43.2952 };

/** Le même décor que `suivre`, mais à Marseille, avec sa source de places. */
async function suivreAMarseille(page: Page, live: unknown[]): Promise<string[]> {
  const appels: string[] = [];
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({
    longitude: TRACE_MARSEILLE[0]![0], latitude: TRACE_MARSEILLE[0]![1],
  });
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe = (c) => {
      rappel?.({ coords: { accuracy: 5, altitude: null, altitudeAccuracy: null, ...c } });
    };
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: (ok: (p: unknown) => void) => { rappel = ok; return 1; },
        clearWatch: () => { rappel = null; },
        getCurrentPosition: (ok: (p: unknown) => void) => { rappel = ok; },
      },
    });
  });
  await page.route('**/data.ampmetropole.fr/**', (route) => {
    appels.push(decodeURIComponent(route.request().url()));
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ total_count: live.length, results: live }),
    });
  });
  /* LES PARKINGS CARTOGRAPHIÉS RESTENT LÀ : ce parcours juge l'ORDRE, et il
     faut donc quelque chose derrière quoi passer devant. */
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ elements: [{
      type: 'node', id: 1, lat: 43.2949, lon: 5.3705,
      tags: { amenity: 'parking', name: 'Parking cartographié', capacity: '120' },
    }] }),
  }));
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: TRACE_MARSEILLE },
      distance: 1_000, duration: 300,
    }),
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  const d = TRACE_MARSEILLE[0]!;
  await page.goto(`/#iti=${d[0].toFixed(5)},${d[1].toFixed(5)};`
    + `${DEST_MARSEILLE.lon.toFixed(5)},${DEST_MARSEILLE.lat.toFixed(5)};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
  return appels;
}

/** Avance jusqu'à l'arrivée, où la feuille de parkings s'ouvre d'elle-même. */
async function approcher(page: Page): Promise<void> {
  await expect.poll(async () => {
    await page.evaluate(() => {
      (window as unknown as { __pousserFixe: (c: object) => void })
        .__pousserFixe({ longitude: 5.3705, latitude: 43.2951, speed: 4, heading: 90 });
    });
    return page.locator('.bg-parkings').isVisible();
  }, { timeout: 20_000 }).toBe(true);
}

test('LES PLACES LIBRES PASSENT DEVANT, avec l’âge du relevé', async ({ page }) => {
  /* Un relevé de maintenant, écrit en heure de PARIS comme le fait le
     portail — c'est le piège que ce parcours garde fermé : lu comme de
     l'UTC, il tomberait deux heures dans le futur. */
  const parisMaintenant = new Date(Date.now() + 2 * 3600_000)
    .toISOString().replace('T', ' ').slice(0, 19);
  const appels = await suivreAMarseille(page, [{
    nom: 'Charles de Gaulle', voitureplacesdisponibles: 56,
    voitureplacescapacite: 520, longitude: 5.3709, latitude: 43.2953,
    datemajpy: parisMaintenant,
  }]);
  await approcher(page);

  const premier = page.locator('.bg-parkings-liste li').first();
  await expect(premier).toHaveClass(/bg-parking-live/);
  await expect(premier).toContainText('56 places libres sur 520');
  await expect(premier).toContainText('relevé il y a');
  // ET LE PARKING CARTOGRAPHIÉ RESTE, DERRIÈRE : on n'a rien perdu.
  await expect(page.locator('.bg-parkings-liste li')).toHaveCount(2);
  // ON CITE QUI PUBLIE.
  await expect(page.locator('.bg-parkings-etat')).toContainText('Aix-Marseille');
  expect(appels.length, 'un appel par fixe part vers la collectivité').toBe(1);
});

test('UN RELEVÉ PÉRIMÉ NE S’AFFICHE PAS — le cas d’Issy', async ({ page }) => {
  /* Le jeu d'Issy s'appelle « disponibilité temps réel » et n'a pas bougé
     depuis avril 2025, tous parkings pleins. Afficher ce zéro aurait envoyé
     les gens ailleurs pour rien. */
  await suivreAMarseille(page, [{
    nom: 'Vieux-Port', voitureplacesdisponibles: 0, voitureplacescapacite: 545,
    longitude: 5.3709, latitude: 43.2953, datemajpy: '2025-04-06 02:12:00',
  }]);
  await approcher(page);

  await expect(page.locator('.bg-parking-live')).toHaveCount(0);
  /* ET LA PHRASE REDEVIENT CELLE D'AVANT : on ne promet pas des places libres
     qu'on n'a pas. */
  await expect(page.locator('.bg-parkings-etat'))
    .toContainText('pas les places libres');
});

test('LA FEUILLE DES PARKINGS NE PASSE PAS SOUS LE DISQUE DE LIMITATION (RETOUR-0409)', async ({ page }) => {
  /* Armelin, capture à l'appui : « quand la liste des suggestions de parkings
     apparaît, la liste est masquée par le panneau de vitesse dans les
     derniers résultats ». Le disque de limitation (56 px, left: 0, 68 px
     au-dessus du repère) recouvrait le coin bas-gauche de la feuille, qui
     partait de 8 px. On MESURE les boîtes sur un écran de téléphone : aucune
     intersection, ni avec la limitation, ni avec la vitesse. */
  await page.setViewportSize({ width: 390, height: 844 });
  await suivre(page);
  await rouler(page, 2.3600, 48.8500);
  const feuille = page.locator('.bg-parkings');
  await expect(feuille).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bg-parkings-liste li')).toHaveCount(2, { timeout: 15_000 });
  /* Le disque de limitation ne paraît qu'avec un relevé de vitesse connu :
     on le MONTRE — c'est sa géométrie qu'on juge, pas la donnée. */
  await page.evaluate(() => {
    const d = document.querySelector<HTMLElement>('.bg-limite-vitesse');
    if (d) { d.hidden = false; d.querySelector('.bg-limite-nombre')!.textContent = '50'; }
    const v = document.querySelector<HTMLElement>('.bg-vitesse');
    if (v) v.hidden = false;
  });
  const boite = async (sel: string) => {
    const b = await page.locator(sel).boundingBox();
    expect(b, `${sel} doit avoir une boîte`).not.toBeNull();
    return b as { x: number; y: number; width: number; height: number };
  };
  const f = await boite('.bg-parkings');
  for (const sel of ['.bg-limite-vitesse', '.bg-vitesse']) {
    const d = await boite(sel);
    const seCroisent = d.x < f.x + f.width && d.x + d.width > f.x
      && d.y < f.y + f.height && d.y + d.height > f.y;
    expect(seCroisent, `${sel} ne doit pas recouvrir la feuille des parkings`).toBe(false);
  }
  /* Et la feuille garde une largeur utile : un nom et le bouton « Se garer ». */
  expect(f.width).toBeGreaterThan(280);
});
