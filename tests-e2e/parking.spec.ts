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
