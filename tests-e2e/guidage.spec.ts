import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE SUIVI D'ITINÉRAIRE — « il n'y a pas de bouton pour démarrer l'itinéraire »
 * (Armelin, 25/08/2026).
 *
 * CE QUE CES PARCOURS DÉFENDENT AVANT TOUT : que l'application n'appelle
 * jamais « navigation » ce qui n'en est pas une. Le bandeau dit qu'il n'a ni
 * voix ni recalcul, et il le dit AVANT qu'on en ait besoin — on ne découvre
 * pas l'absence de recalcul à la sortie d'autoroute.
 */

const PARIS_LYON = '/#iti=2.35220,48.85660;4.83570,45.76400;car';

/** Le tracé simulé : une ligne droite, deux points, et une feuille de route. */
const GEOMETRIE = {
  type: 'LineString',
  coordinates: [[2.3522, 48.8566], [4.8357, 45.764]],
};

test.beforeEach(async ({ page, context }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = route.request().url();
    /* LA FEUILLE DE ROUTE ET LE CALCUL PARTAGENT LEUR URL, à un paramètre
       près : c'est le même service, interrogé avec ou sans les instructions.
       Les distinguer est nécessaire, sans quoi le tracé arriverait sans
       géométrie. */
    if (/getSteps=true/i.test(url)) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          geometry: GEOMETRIE, distance: 390_000, duration: 13_000,
          /* LA FORME DU SERVICE EST PROFONDE : le nom de la voie vit sous
             `attributes.name.cpx_numero`, pas dans un champ `name` à plat.
             Une fixture à plat rendait des étapes sans voie — et le parcours
             accusait le code d'un défaut qui était dans la simulation. */
          portions: [{ steps: [
            { instruction: { type: 'depart' }, distance: 200_000,
              attributes: { name: { cpx_numero: 'A6' } } },
            { instruction: { type: 'turn', modifier: 'right' }, distance: 190_000,
              attributes: { name: { cpx_numero: 'A7' } } },
          ] }],
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ geometry: GEOMETRIE, distance: 390_000, duration: 13_000 }),
    });
  });
  // La géolocalisation est un GESTE : on l'autorise, on ne la déclenche pas.
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
});

async function ouvrirTrajet(page: Page): Promise<void> {
  await page.goto(PARIS_LYON);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 15_000 });
}

test('sans trajet, proposer de le suivre n’aurait aucun sens', async ({ page }) => {
  /* CE TEST EST SÉPARÉ DU SUIVANT, ET CE N'EST PAS UN DÉCOUPAGE DE CONFORT :
     aller de « / » vers « /#iti=… » ne change que le FRAGMENT, donc ne
     recharge pas la page — et le trajet porté par le lien n'est rejoué qu'au
     démarrage. Les deux gestes dans un même parcours mesuraient donc un
     itinéraire qui n'avait jamais été calculé. */
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Itinéraire' }).click();
  await expect(page.locator('.iti-demarrer')).toBeHidden();
});

test('le bouton « Démarrer » lance le suivi, instructions comprises', async ({ page }) => {
  await ouvrirTrajet(page);
  const demarrer = page.getByRole('button', { name: 'Démarrer le suivi' });
  await expect(demarrer).toBeVisible();

  await demarrer.click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau).toBeVisible({ timeout: 15_000 });

  // L'instruction vient de la feuille de route, et elle est en FRANÇAIS.
  await expect(bandeau.locator('.bg-instruction')).toContainText('A6', { timeout: 15_000 });
  await expect(bandeau.locator('.bg-restant')).toContainText('restants');
  await expect(bandeau.locator('.bg-restant')).toContainText('arrivée vers');
});

test('le bandeau DIT qu’il n’est pas une navigation guidée', async ({ page }) => {
  /* Une application qui annonce « navigation » et rend un suivi trompe au
     moment précis où l'on ne peut pas regarder l'écran pour vérifier. */
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau).toBeVisible({ timeout: 15_000 });
  await expect(bandeau.locator('.bg-limite')).toContainText('pas navigation guidée');
  await expect(bandeau.locator('.bg-limite')).toContainText('aucun recalcul');
});

test('quitter la route se DIT, l’instruction ne continue pas comme si de rien', async ({ page, context }) => {
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau.locator('.bg-instruction')).toContainText('A6', { timeout: 15_000 });

  // Cinquante kilomètres à l'ouest du tracé : on n'est plus dessus.
  await context.setGeolocation({ longitude: 1.6, latitude: 48.5 });

  await expect(bandeau.locator('.bg-instruction'), 'le suivi a continué à guider hors route')
    .toContainText('quitté l’itinéraire', { timeout: 20_000 });
  await expect(bandeau.locator('.bg-alerte')).toContainText('Recalculez');
});

test('un geste sur la carte SUSPEND la caméra, « Recentrer » la rend', async ({ page, context }) => {
  /* « Quand la navigation est démarrée, je ne peux plus dézoomer sur la carte
     car le zoom sur ma position se force automatiquement » (Armelin,
     27/08/2026). Le geste de l'usager suspend le suivi de caméra ; le bouton
     — ou vingt secondes d'immobilité — le rend. */
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau).toBeVisible({ timeout: 15_000 });

  // La caméra suit d'abord la voiture : le centre rejoint la position.
  await expect.poll(() => page.evaluate(() => {
    const c = (window as unknown as { __carte: { getCenter(): { lng: number } } }).__carte;
    return Math.abs(c.getCenter().lng - 2.3522) < 0.01;
  }), { timeout: 10_000 }).toBe(true);

  /* LE GESTE : une molette sur la carte. Il porte un originalEvent — c'est ce
     qui le distingue de nos propres easeTo. */
  const cadre = await page.locator('#carte canvas.maplibregl-canvas').boundingBox();
  await page.mouse.move(cadre!.x + cadre!.width / 2, cadre!.y + 200);
  await page.mouse.wheel(0, 600);
  const recentrer = page.getByRole('button', { name: 'Recentrer' });
  await expect(recentrer).toBeVisible();

  /* LA POSITION AVANCE, LA CARTE NE BOUGE PLUS : c'est toute la demande. */
  await context.setGeolocation({ longitude: 2.8, latitude: 48.3 });
  await page.waitForTimeout(1500);
  const centreSuspendu = await page.evaluate(() =>
    (window as unknown as { __carte: { getCenter(): { lng: number } } }).__carte.getCenter().lng);
  expect(Math.abs(centreSuspendu - 2.8), 'la caméra a repris la main malgré le geste')
    .toBeGreaterThan(0.05);

  // « Recentrer » rend la caméra au suivi, et se range.
  await recentrer.click();
  await expect.poll(() => page.evaluate(() => {
    const c = (window as unknown as { __carte: { getCenter(): { lng: number } } }).__carte;
    return Math.abs(c.getCenter().lng - 2.8) < 0.01;
  }), { timeout: 10_000 }).toBe(true);
  await expect(recentrer).toBeHidden();
});

test('l’écran reste allumé pendant le suivi, et le verrou se REND à l’arrêt', async ({ page }) => {
  /* Screen Wake Lock : un téléphone qui se verrouille au premier feu rouge
     n'est pas un suivi — et un verrou gardé après l'arrêt viderait la
     batterie de celui qui est arrivé. On instrumente l'API du navigateur et
     l'on compte. */
  await page.addInitScript(() => {
    const compte = { demandes: 0, rendus: 0 };
    (window as unknown as { __verrous: typeof compte }).__verrous = compte;
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: () => {
          compte.demandes += 1;
          return Promise.resolve({ release: () => { compte.rendus += 1; return Promise.resolve(); } });
        },
      },
    });
  });
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });

  /* DIX SECONDES ET NON CINQ : en local, plusieurs workers Playwright se
     partagent la machine et affament les timers (le phénomène documenté dans
     playwright.config.ts) — mesuré : 1 échec sur 4 en répétition parallèle,
     0 sur 6 à un seul worker. La CI, elle, tourne à un worker. */
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __verrous: { demandes: number } }).__verrous.demandes),
  { timeout: 10_000 }).toBeGreaterThanOrEqual(1);

  await page.getByRole('button', { name: 'Arrêter le suivi' }).click();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __verrous: { rendus: number } }).__verrous.rendus),
  { message: 'le verrou n’a pas été rendu à l’arrêt', timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
});

test('le bandeau se RÉDUIT — et garde ce qu’on lit en roulant', async ({ page }) => {
  /* « Réduire la taille du cartouche en bas qui prend 1/3 de l'écran »
     (Armelin, 27/08/2026). Réduit : la manœuvre et le restant restent, la
     note de limite — lue au démarrage — se range. */
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau.locator('.bg-limite')).toBeVisible({ timeout: 15_000 });

  const avant = (await bandeau.locator('.bg').boundingBox())!.height;
  await page.getByRole('button', { name: 'Réduire le bandeau' }).click();
  await expect(bandeau.locator('.bg-limite')).toBeHidden();
  await expect(bandeau.locator('.bg-instruction')).toBeVisible();
  await expect(bandeau.locator('.bg-restant')).toBeVisible();
  const apres = (await bandeau.locator('.bg').boundingBox())!.height;
  expect(apres, 'réduit, le bandeau doit être plus petit').toBeLessThan(avant);

  await page.getByRole('button', { name: 'Agrandir le bandeau' }).click();
  await expect(bandeau.locator('.bg-limite')).toBeVisible();
});

test('le cap GPS oriente la carte, la vitesse s’affiche — et tout se rend à l’arrêt', async ({ page }) => {
  /* PR B du cadrage navigation mobile : « afficher la boussole du téléphone
     pour savoir dans quel sens on se trouve » (le cap GPS, sans permission
     nouvelle) et « un petit cercle indiquant la vitesse GPS en temps réel ».
     Playwright ne sait pas simuler cap et vitesse : on instrumente la
     géolocalisation elle-même et on POUSSE des fixes complets. */
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
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });

  /* EN MOUVEMENT (24,2 m/s ≈ 87 km/h, cap à l'est) : la carte s'oriente au
     cap, la pastille affiche la vitesse. */
  await page.evaluate(() => {
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
      longitude: 2.36, latitude: 48.85, speed: 24.2, heading: 90,
    });
  });
  const vitesse = page.locator('.bg-vitesse');
  await expect(vitesse).toBeVisible();
  await expect(vitesse.locator('.bg-vitesse-nombre')).toHaveText('87');
  await expect.poll(() => page.evaluate(() =>
    Math.round((window as unknown as { __carte: { getBearing(): number } }).__carte.getBearing())),
  { timeout: 10_000 }).toBe(90);

  /* À L'ARRÊT AU FEU (vitesse 0, cap nul) : la pastille dit 0, la carte NE
     TOURNOIE PAS — le cap d'un véhicule immobile est du bruit. */
  await page.evaluate(() => {
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
      longitude: 2.36, latitude: 48.85, speed: 0, heading: 271,
    });
  });
  await expect(vitesse.locator('.bg-vitesse-nombre')).toHaveText('0');
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() =>
    Math.round((window as unknown as { __carte: { getBearing(): number } }).__carte.getBearing())),
  ).toBe(90);

  /* SANS MESURE (speed null) : la pastille disparaît — un chiffre figé
     serait un mensonge. */
  await page.evaluate(() => {
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
      longitude: 2.36, latitude: 48.85, speed: null, heading: null,
    });
  });
  await expect(vitesse).toBeHidden();

  // L'ARRÊT REND LE NORD, et range la pastille.
  await page.getByRole('button', { name: 'Arrêter le suivi' }).click();
  await expect.poll(() => page.evaluate(() =>
    Math.round((window as unknown as { __carte: { getBearing(): number } }).__carte.getBearing())),
  { timeout: 10_000 }).toBe(0);
});

test('démarrer DÉGAGE la vue : volets refermés, recherche d’adresse effacée', async ({ page }) => {
  /* Armelin, le 26/08/2026 : « quand on est en mode navigation, il y a trop de
     cartouches affichés qui masquent la navigation, comme la recherche
     d'adresse ». Ce n'est pas un encombrement esthétique : c'est de la route
     qu'on ne voit pas, à un moment où l'on ne peut pas ranger l'écran. */
  await ouvrirTrajet(page);
  await expect(page.locator('.iti')).toHaveAttribute('open', '');
  await expect(page.locator('.entete recherche-adresse input')).toBeVisible();

  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('.iti'), 'le planificateur masque la route')
    .not.toHaveAttribute('open', '');
  await expect(page.locator('.entete recherche-adresse input')).toBeHidden();
  await expect(page.locator('.pied-carte')).toBeHidden();
});

test('« Arrêter » referme le bandeau, et la vue redevient elle-même', async ({ page }) => {
  /* Un `watchPosition` oublié viderait la batterie de celui qui est arrivé
     depuis une heure : l'arrêt doit être atteignable et évident. Et tout ce
     que le suivi a effacé doit revenir — un mode qui ne se défait pas est un
     piège. */
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau).toBeVisible({ timeout: 15_000 });

  await bandeau.getByRole('button', { name: 'Arrêter le suivi' }).click();
  await expect(bandeau).toBeHidden();
  await expect(page.locator('.entete recherche-adresse input')).toBeVisible();
  await expect(page.locator('.pied-carte')).toBeVisible();

  // Et le planificateur se rouvre sur son bouton, rendu à son nom d'origine.
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Itinéraire' }).click();
  await expect(page.getByRole('button', { name: 'Démarrer le suivi' })).toBeVisible();
});

test('effacer le trajet arrête le suivi — il ne compte pas les kilomètres d’un fantôme', async ({ page }) => {
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });

  /* Le suivi a refermé le planificateur : on le rouvre pour atteindre
     « Effacer », comme le ferait un usager qui renonce à son trajet. */
  await page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Itinéraire' }).click();
  await page.getByRole('button', { name: 'Effacer' }).click();
  await expect(page.locator('bandeau-guidage')).toBeHidden();
  await expect(page.locator('.iti-demarrer')).toBeHidden();
});

test('une feuille de route en panne n’empêche PAS le suivi', async ({ page }) => {
  /* Rouler en sachant ce qui reste vaut mieux que ne rien avoir parce qu'un
     service tiers est tombé. Le bandeau dit alors « Suivez l'itinéraire », ce
     qui est vrai — plutôt qu'une instruction inventée. */
  await page.route('**/data.geopf.fr/navigation/itineraire**', async (route) => {
    if (/getSteps=true/i.test(route.request().url())) {
      return route.fulfill({ status: 500, body: 'panne' });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ geometry: GEOMETRIE, distance: 390_000, duration: 13_000 }),
    });
  });
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();

  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau).toBeVisible({ timeout: 15_000 });
  await expect(bandeau.locator('.bg-instruction'))
    .toContainText('Suivez l’itinéraire', { timeout: 20_000 });
  await expect(bandeau.locator('.bg-restant')).toContainText('restants');
});
