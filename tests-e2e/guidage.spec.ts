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
  /* LE RELEVÉ DES LIMITES part au démarrage du suivi : sans ce bouchon, les
     parcours frapperaient le VRAI Overpass — un commun bénévole — à chaque
     exécution. Les tests qui mesurent ce relevé posent leur propre route
     AVANT celle-ci, et Playwright donne priorité à la dernière posée. */
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ elements: [] }),
  }));
  /* MÊME RÈGLE POUR BISON FUTÉ : le suivi relève les événements du corridor
     à son démarrage — sans bouchon, chaque parcours frapperait le service
     réel. L'horodate absente suffit : l'appel échoue proprement, la ligne
     trafic reste vide, et le test qui veut des événements pose sa route. */
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
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

  /* L'INSTRUCTION EST CELLE QUI ARRIVE, PAS CELLE QU'ON VIENT DE FAIRE.
     Au départ sur l'A6, ce qui vient est le virage à droite vers l'A7 :
     afficher « Départ » serait nommer l'instant qu'on quitte. Le défaut a
     été relevé au volant par Armelin le 29/08 (« le GPS confond sa gauche
     et sa droite ») : il avait UNE MANŒUVRE DE RETARD — le service rend
     l'instruction du DÉBUT d'étape et la longueur qui suit.
     ET DEUX VOIES, QUI NE SONT PAS LA MÊME : le cartouche annonce celle où
     l'on VA (A7), la barre du bas nomme celle où l'on EST (A6). */
  await expect(bandeau.locator('.bg-instruction'))
    .toContainText('Tournez à droite', { timeout: 15_000 });
  await expect(bandeau.locator('.bg-cartouche')).toBeVisible();
  await expect(bandeau.locator('.bg-ecusson'), 'l’écusson porte la voie VISÉE')
    .toHaveText('A7');
  await expect(bandeau.locator('.bg-cartouche'),
    'le cartouche prend la couleur de la route').toHaveAttribute('data-classe', 'autoroute');
  await expect(bandeau.locator('.bg-voie'), 'la barre du bas nomme la voie COURANTE')
    .toHaveText('A6');
  await expect(bandeau.locator('.bg-restant')).toContainText('restants');
  await expect(bandeau.locator('.bg-restant')).toContainText('arrivée vers');
  /* ET LA FLÈCHE DE MANŒUVRE, DESSINÉE — « indiquer les flèches de direction
     à chaque intersection » (27/08/2026). Au départ : tout droit, jamais le
     côté d'engagement du moteur. */
  await expect(bandeau.locator('.bg-fleche svg'),
    'la manœuvre doit se dessiner, pas seulement se dire').toHaveCount(1);
});

test('le bandeau DIT qu’il n’est pas une navigation guidée', async ({ page }) => {
  /* Une application qui annonce « navigation » et rend un suivi trompe au
     moment précis où l'on ne peut pas regarder l'écran pour vérifier. */
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau).toBeVisible({ timeout: 15_000 });
  await expect(bandeau.locator('.bg-limite')).toContainText('pas navigation guidée');
  // Depuis le 29/08, le recalcul hors-route EST automatique — et c'est écrit.
  await expect(bandeau.locator('.bg-limite')).toContainText('se recalcule tout seul');
});

test('quitter la route se DIT, l’instruction ne continue pas comme si de rien', async ({ page, context }) => {
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau.locator('.bg-instruction'))
    .toContainText('Tournez à droite', { timeout: 15_000 });

  // Cinquante kilomètres à l'ouest du tracé : on n'est plus dessus.
  await context.setGeolocation({ longitude: 1.6, latitude: 48.5 });

  await expect(bandeau.locator('.bg-instruction'), 'le suivi a continué à guider hors route')
    .toContainText('quitté l’itinéraire', { timeout: 20_000 });
  await expect(bandeau.locator('.bg-alerte')).toContainText('Nouvel itinéraire depuis votre position');
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

test('NAV-3 : la barre est REPLIÉE — trois chiffres, une croix — et se déplie d’un appui', async ({ page }) => {
  /* Armelin, le 29/08 : « la barre de navigation en bas sur mobile est
     beaucoup trop grande et les informations les plus indispensables sont
     écrites en trop petit […] les seules informations qui doivent
     apparaître, c'est le nombre de kilomètres restants, le temps restant,
     l'heure d'arrivée estimée, et un bouton pour arrêter ». Le bouton
     « Réduire » n'existe plus : la barre EST repliée, et se déplie. */
  await page.setViewportSize({ width: 390, height: 844 });
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau.locator('.bg-chiffres')).toBeVisible({ timeout: 15_000 });

  // LES TROIS CHIFFRES SONT LÀ, ET ILS SONT GROS : 22 px, pas 13.
  await expect(bandeau.locator('.bg-km')).toContainText('km');
  await expect(bandeau.locator('.bg-eta')).toContainText(':');
  const taille = await bandeau.locator('.bg-km').evaluate(
    (el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(taille, 'les chiffres du volant doivent être gros').toBeGreaterThanOrEqual(20);

  /* ELLE DIT QU'ELLE S'OUVRE (30/08) : « il n'y a aucune indication
     visuelle laissant penser à l'utilisateur qu'il peut appuyer sur la
     barre ». Une poignée et un chevron — deux signes déjà vus partout. */
  await expect(bandeau.locator('.bg-poignee')).toBeVisible();
  await expect(bandeau.locator('.bg-deplier')).toHaveAttribute('aria-expanded', 'false');

  // REPLIÉE : les commandes secondaires ne prennent pas de place.
  await expect(bandeau.locator('.bg-boutons')).toBeHidden();
  const replie = (await bandeau.locator('.bg').boundingBox())!.height;

  // UN APPUI SUR LA BARRE la déplie — c'est le premier des deux gestes.
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  await expect(bandeau.locator('.bg-boutons')).toBeVisible();
  const deplie = (await bandeau.locator('.bg').boundingBox())!.height;
  expect(deplie, 'dépliée, la barre doit être plus haute').toBeGreaterThan(replie);

  // Et un second appui la referme.
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  await expect(bandeau.locator('.bg-boutons')).toBeHidden();

  /* LA CROIX ROUGE ARRÊTE LE SUIVI — « une grosse icône en forme de croix
     rouge » à la place du bouton large. Grosse : on la cherche parfois
     dans l'urgence. */
  const croix = (await bandeau.locator('.bg-arreter').boundingBox())!;
  expect(Math.min(croix.width, croix.height),
    'la croix doit rester une grosse cible').toBeGreaterThanOrEqual(44);
  await bandeau.locator('.bg-arreter').click();
  await expect(bandeau).toBeHidden();
});

test('le prochain événement trafic du corridor s’ANNONCE — et se tait derrière soi', async ({ page }) => {
  /* La seconde candidate de l'étude : la barre de fluidité est écartée
     (Bison Futé ne publie que des événements ponctuels), on ANNONCE le
     prochain devant soi. La fixture pose des TRAVAUX en Lambert-93 sur la
     diagonale simulée, à ~20 % du trajet (point calculé par inversion
     numérique de la reprojection du projet). */
  await page.route('**/www.bison-fute.gouv.fr/data/iteration/date.json',
    (route) => route.fulfill({ contentType: 'application/json', body: '[1787353503716]' }));
  await page.route('**/www1.bison-fute.gouv.fr/data/**/evenementsOL6.json',
    (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { geometry: { type: 'Point', coordinates: [688781.7, 6793094.7] },
          properties: { type: 'TRAVAUX', etat_evenement: 'EFFECTIF', urlcpc: '' } },
        // Un PRÉVISIONNEL au même endroit : il ne doit PAS s'annoncer.
        { geometry: { type: 'Point', coordinates: [688781.7, 6793094.7] },
          properties: { type: 'ACCIDENT', etat_evenement: 'PREVISIONNEL', urlcpc: '' } },
      ],
    }) }));
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe = (c) => {
      rappel?.({ coords: { accuracy: 5, altitude: null, altitudeAccuracy: null,
        speed: null, heading: null, ...c } });
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

  /* À 10 % du trajet, les travaux de 20 % sont DEVANT : annonce, distance,
     source. Le fixe est repoussé en boucle — les événements arrivent après
     le démarrage. */
  const trafic = page.locator('.bg-trafic');
  await expect.poll(async () => {
    await page.evaluate(() => {
      (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
        longitude: 2.3522 + 2.4835 * 0.10, latitude: 48.8566 - 3.0926 * 0.10,
      });
    });
    return trafic.textContent();
  }, { timeout: 10_000 }).toContain('Travaux dans');
  await expect(trafic).toContainText('Bison Futé');
  await expect(trafic, 'le prévisionnel de mardi ne concerne pas le volant')
    .not.toContainText('Accident');

  // À 40 % du trajet, les travaux sont DERRIÈRE : la ligne se tait.
  await page.evaluate(() => {
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
      longitude: 2.3522 + 2.4835 * 0.40, latitude: 48.8566 - 3.0926 * 0.40,
    });
  });
  await expect(trafic).toBeEmpty({ timeout: 10_000 });
});

test('la FRISE du trajet : événements posés à leur kilomètre, curseur qui avance', async ({ page }) => {
  /* La « barre verticale » du mandat du 28/08, rendue avec ce que la donnée
     permet : des ÉVÉNEMENTS ponctuels, jamais une fluidité en dégradé que
     Bison Futé ne publie pas. Les TRAVAUX de la fixture sont à ~20 % du
     trajet : le losange doit être posé LÀ, et le curseur doit suivre la
     voiture. (Les pastilles d'arrêts empruntent la même boucle et la même
     échelle que les losanges ; monter ici un plan EV complet dupliquerait
     toute la fixture de recharge.spec.ts pour la même ligne de code.) */
  await page.route('**/www.bison-fute.gouv.fr/data/iteration/date.json',
    (route) => route.fulfill({ contentType: 'application/json', body: '[1787353503716]' }));
  await page.route('**/www1.bison-fute.gouv.fr/data/**/evenementsOL6.json',
    (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { geometry: { type: 'Point', coordinates: [688781.7, 6793094.7] },
          properties: { type: 'TRAVAUX', etat_evenement: 'EFFECTIF', urlcpc: '' } },
      ],
    }) }));
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe = (c) => {
      rappel?.({ coords: { accuracy: 5, altitude: null, altitudeAccuracy: null,
        speed: null, heading: null, ...c } });
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

  const frise = page.locator('.bg-frise');
  const hauteurDe = async (sel: string): Promise<number> =>
    Number.parseFloat(await page.locator(sel).evaluate(
      (el) => (el as HTMLElement).style.bottom));

  /* AU DÉPART : la frise paraît au premier fixe, le curseur est en bas, et
     les travaux COLORENT la piste à leur kilomètre — autour de 20 %.
     Depuis FRISE-2 (29/08), les événements ne sont plus des losanges posés
     par-dessus : ils SONT la couleur du segment, ce qui les explique au
     lieu de les juxtaposer (Armelin : « on ne devrait afficher sur cette
     barre que les éléments planifiés »). L'événement arrive de façon
     asynchrone : on REJOUE un fixe jusqu'à ce qu'il soit peint. */
  await expect.poll(async () => {
    await page.evaluate(() => {
      (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
        longitude: 2.3522, latitude: 48.8566 });
    });
    return page.locator('.bg-frise-ralenti').count();
  }, { timeout: 15_000 }).toBe(1);
  await expect(frise).toBeVisible();
  expect(await hauteurDe('.bg-frise-curseur')).toBeLessThan(3);
  const evt = await hauteurDe('.bg-frise-ralenti');
  expect(evt, 'les travaux ne colorent pas leur kilomètre').toBeGreaterThan(12);
  expect(evt).toBeLessThan(30);
  // Le reste de la route reste vert : aucun incident n'y est signalé.
  expect(await page.locator('.bg-frise-libre').count()).toBe(2);
  // Et le sommet porte le drapeau à damier de l'arrivée.
  await expect(page.locator('.bg-frise-arrivee')).toBeVisible();

  // À MI-ROUTE : le curseur a avancé — il est la voiture, pas une décoration.
  await page.evaluate(() => {
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
      longitude: 3.5939, latitude: 47.31 });
  });
  await expect.poll(() => hauteurDe('.bg-frise-curseur'), { timeout: 10_000 })
    .toBeGreaterThan(40);
});

test('la limite CARTOGRAPHIÉE s’affiche sur son tronçon, et SE TAIT ailleurs', async ({ page }) => {
  /* La candidate issue de l'étude maxspeed (97-100 % de couverture mesurée).
     Overpass est simulé : une route à 110 le long du premier tiers du tracé.
     Le panneau paraît sur le tronçon, disparaît au-delà — jamais la limite
     d'il y a trois kilomètres. Et UN SEUL appel, au démarrage. */
  let appels = 0;
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    appels += 1;
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ elements: [{
        type: 'way', id: 1, tags: { highway: 'trunk', maxspeed: '110' },
        /* Huit nœuds posés SUR la diagonale Paris-Lyon simulée, du départ au
           premier tiers (~130 km). */
        geometry: Array.from({ length: 8 }, (_, i) => ({
          lat: 48.8566 - (i * 3.0926 * 0.33) / 7,
          lon: 2.3522 + (i * 2.4835 * 0.33) / 7,
        })),
      }] }),
    });
  });
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe = (c) => {
      rappel?.({ coords: { accuracy: 5, altitude: null, altitudeAccuracy: null,
        speed: null, heading: null, ...c } });
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
  expect(appels, 'Overpass interrogé avant tout suivi').toBe(0);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });

  /* Sur le tronçon (à ~15 % du trajet) : le panneau dit 110. LE FIXE EST
     REPOUSSÉ EN BOUCLE : les limites arrivent APRÈS le démarrage (Overpass ne
     bloque pas le bouton), et le panneau ne se rafraîchit qu'au fixe suivant
     — un fixe unique pouvait précéder la livraison. */
  const panneau = page.locator('.bg-limite-vitesse');
  await expect.poll(async () => {
    await page.evaluate(() => {
      (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
        longitude: 2.3522 + 2.4835 * 0.15, latitude: 48.8566 - 3.0926 * 0.15,
      });
    });
    return panneau.isVisible();
  }, { timeout: 10_000 }).toBe(true);
  await expect(panneau.locator('.bg-limite-nombre')).toHaveText('110');
  await expect(panneau, 'le panneau doit dire sa nature cartographiée')
    .toHaveAttribute('title', /cartographiée/);

  // Aux deux tiers du trajet : plus aucun tronçon connu — le panneau SE TAIT.
  await page.evaluate(() => {
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
      longitude: 2.3522 + 2.4835 * 0.66, latitude: 48.8566 - 3.0926 * 0.66,
    });
  });
  await expect(panneau).toBeHidden({ timeout: 10_000 });
  expect(appels, 'un suivi, un appel — le GPS bat chaque seconde').toBe(1);
});

test('la vue s’incline en suivi, se refuse d’un bouton, se redresse à l’arrêt', async ({ page }) => {
  /* PR D du cadrage : la « vue 3D » — essayée sur capture AVANT d'être
     promise (fond Plan IGN incliné : champ proche net, lointain qui
     rapetisse, limite du raster assumée). L'inclinaison n'a de sens qu'en
     suivi : elle arrive avec lui, se refuse d'un bouton, et repart avec lui. */
  await ouvrirTrajet(page);
  const inclinaison = (): Promise<number> => page.evaluate(() =>
    Math.round((window as unknown as { __carte: { getPitch(): number } }).__carte.getPitch()));
  expect(await inclinaison()).toBe(0);

  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
  await expect.poll(inclinaison, { timeout: 10_000 }).toBe(55);

  /* Certains lisent mieux à plat : le bouton rend la carte, et se souvient.
     Depuis NAV-3 il vit dans la barre DÉPLIÉE, et porte une icône — son
     nom accessible reste la phrase. */
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  await page.getByRole('button', { name: 'Passer la carte à plat' }).click();
  await expect.poll(inclinaison, { timeout: 10_000 }).toBe(0);
  await page.getByRole('button', { name: 'Incliner la carte' }).click();
  await expect.poll(inclinaison, { timeout: 10_000 }).toBe(55);

  // L'arrêt redresse : l'inclinaison n'a de sens qu'en suivi.
  await page.getByRole('button', { name: 'Arrêter le suivi' }).click();
  await expect.poll(inclinaison, { timeout: 10_000 }).toBe(0);
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

test('l’orientation à TROIS ÉTATS — cap, nord, vue libre — et le cap se LISSE', async ({ page }) => {
  /* Mandat UX du 28/08 (NAV-1). Cap en haut est le défaut ; « Nord en haut »
     redresse et TIENT le nord sous les fixes ; « Vue libre » suit la voiture
     sans toucher à la rotation. Et le cap ne saute pas d'un fixe à l'autre :
     il se lisse — 35 % de l'écart par mesure, arc le plus court. */
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
  /* LE POINT D'ESSAI EST SUR LE TRACÉ, ET IL DOIT L'ÊTRE. Le précédent
     (2,36 / 48,85) en était à 166 m — mesuré — donc HORS ROUTE au sens de
     l'application. Le parcours ne s'en apercevait pas tant que le recalcul
     automatique attendait huit secondes ; passé à quatre le 29/08 (« le
     recalcul intervient trop tardivement »), le recalcul se déclenchait au
     milieu du test et redémarrait le suivi, ce qui remet la caméra. Ce
     parcours parle d'ORIENTATION : il roule donc sur la route. */
  const cap = (n: number) => page.evaluate((h) => {
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
      longitude: 2.3820, latitude: 48.8195, speed: 24.2, heading: h,
    });
  }, n);
  const bearing = () => page.evaluate(() =>
    Math.round((window as unknown as { __carte: { getBearing(): number } }).__carte.getBearing()));

  // CAP (défaut) : le premier cap est pris ENTIER — la carte ne part pas de travers.
  /* Depuis NAV-3, le bouton est « en mode pressoir » : une icône de
     boussole dont le DESSIN change avec l'état — et dont le nom accessible
     porte cet état en toutes lettres, pour qui écoute la page. Il vit dans
     la barre dépliée. */
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  const bouton = page.locator('.bg-orientation');
  await expect(bouton).toHaveAttribute('aria-label', /cap en haut/);
  await expect(bouton.locator('svg')).toHaveClass(/picto-orient-cap/);
  await cap(90);
  await expect.poll(bearing, { timeout: 10_000 }).toBe(90);
  /* LE LISSAGE : le fixe suivant à 100° ne tourne que de 35 % de l'écart —
     94° (arrondi), pas 100. Un récepteur qui tremble ne secoue plus la carte. */
  await cap(100);
  await expect.poll(bearing, { timeout: 10_000 }).toBe(94);

  // NORD : redressée AU CLIC, et le nord TIENT sous les fixes suivants.
  await bouton.click();
  await expect(bouton).toHaveAttribute('aria-label', /nord en haut/);
  await expect(bouton.locator('svg')).toHaveClass(/picto-orient-nord/);
  await expect.poll(bearing, { timeout: 10_000 }).toBe(0);
  await cap(120);
  await page.waitForTimeout(1000);
  expect(await bearing()).toBe(0);

  // LIBRE : la carte suit la voiture sans toucher à la rotation posée.
  await bouton.click();
  await expect(bouton).toHaveAttribute('aria-label', /vue libre/);
  await expect(bouton.locator('svg')).toHaveClass(/picto-orient-libre/);
  await page.evaluate(() => {
    (window as unknown as { __carte: { setBearing(b: number): void } }).__carte.setBearing(45);
  });
  await cap(200);
  await page.waitForTimeout(1000);
  expect(await bearing(), 'la vue libre a été tournée par un fixe').toBe(45);

  // Et le cycle revient au cap.
  await bouton.click();
  await expect(bouton).toHaveAttribute('aria-label', /cap en haut/);
});

test('à l’ARRÊT, la boussole oriente la carte — ouverte par le geste, jamais d’office', async ({ page }) => {
  /* Mandat UX du 28/08 (NAV-1) : DeviceOrientation APRÈS geste et permission.
     Le geste est ici « Démarrer le suivi » (mode cap par défaut) ; sur iOS,
     requestPermission s'y ajoute — Chromium ne l'a pas, on s'abonne direct.
     Le cap GPS n'existe qu'en mouvement : à l'arrêt, c'est la boussole qui
     sait où le téléphone regarde. */
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

  /* Une mesure boussole ABSOLUE (alpha 270 → cap 90), puis un fixe À L'ARRÊT :
     le cap GPS est muet, la boussole prend le relais. */
  await page.evaluate(() => {
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',
      { alpha: 270, absolute: true }));
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
      longitude: 2.36, latitude: 48.85, speed: 0, heading: null,
    });
  });
  await expect.poll(() => page.evaluate(() =>
    Math.round((window as unknown as { __carte: { getBearing(): number } }).__carte.getBearing())),
  { timeout: 10_000 }).toBe(90);
});

test('le COPILOTE : les événements de la route listés, la météo sur DEMANDE seulement', async ({ page }) => {
  /* Décision d'Armelin du 28/08 — le mode copilote : un panneau pour le
     PASSAGER pendant le suivi. Trois contrats : tout ce qui s'affiche est
     déjà en mémoire (les événements listés avec leur distance), rien ne part
     sur le réseau sans un BOUTON (la météo se demande), et la réponse
     obtenue SURVIT aux fixes suivants. */
  await page.route('**/www.bison-fute.gouv.fr/data/iteration/date.json',
    (route) => route.fulfill({ contentType: 'application/json', body: '[1787353503716]' }));
  await page.route('**/www1.bison-fute.gouv.fr/data/**/evenementsOL6.json',
    (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      type: 'FeatureCollection',
      features: [{ geometry: { type: 'Point', coordinates: [688781.7, 6793094.7] },
        properties: { type: 'TRAVAUX', etat_evenement: 'EFFECTIF', urlcpc: '' } }],
    }) }));
  let appelsAlti = 0;
  await page.route('**/data.geopf.fr/altimetrie/**', (route) => {
    appelsAlti += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elevations: [
      { lon: 2.3522, lat: 48.8566, z: 35, acc: 'Average value' },
      { lon: 3.5, lat: 47.3, z: 320, acc: 'Average value' },
      { lon: 4.8357, lat: 45.764, z: 168, acc: 'Average value' },
    ] }) });
  });
  let appelsMeteo = 0;
  await page.route('**/api.open-meteo.com/**', (route) => {
    appelsMeteo += 1;
    const base = new Date();
    const heure = (h: number): string => {
      const d = new Date(base.getTime() + h * 3600 * 1000);
      const p = (n: number): string => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:00`;
    };
    const heures = [-1, 0, 1, 2, 3, 4, 5];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      utc_offset_seconds: 0,
      hourly: {
        time: heures.map(heure),
        temperature_2m: heures.map(() => 21),
        precipitation: heures.map(() => 0),
        weather_code: heures.map(() => 0),
        wind_speed_10m: heures.map(() => 5),
      },
    }) });
  });
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe = (c) => {
      rappel?.({ coords: { accuracy: 5, altitude: null, altitudeAccuracy: null,
        speed: null, heading: null, ...c } });
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

  // L'événement arrive de façon asynchrone : on rejoue un fixe jusqu'à lui.
  // Le bouton du copilote vit dans la barre DÉPLIÉE depuis NAV-3.
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  await page.locator('.bg-copilote-bouton').click();
  const copilote = page.locator('.bg-copilote');
  await expect(copilote).toBeVisible();
  await expect(copilote).toContainText('Pour le passager');
  await expect.poll(async () => {
    await page.evaluate(() => {
      (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
        longitude: 2.3522, latitude: 48.8566 });
    });
    return copilote.locator('.bg-copilote-evenements li').count();
  }, { timeout: 15_000 }).toBe(1);
  await expect(copilote).toContainText(/Travaux — dans .+ km/);
  await expect(copilote).toContainText('restants');

  // La météo ne part QUE sur demande — et la réponse SURVIT au fixe suivant.
  expect(appelsMeteo).toBe(0);
  await copilote.getByRole('button', { name: 'Météo à l’arrivée' }).click();
  await expect(copilote).toContainText('(Open-Meteo)');
  expect(appelsMeteo).toBe(1);
  await page.evaluate(() => {
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
      longitude: 2.36, latitude: 48.85 });
  });
  await expect(copilote).toContainText('(Open-Meteo)');
  expect(appelsMeteo, 'un fixe a relancé la météo').toBe(1);

  /* LE RELIEF AUSSI VIT ICI depuis le 29/08 (l'ancienne page « Profil
     altimétrique » du planificateur) : un bouton, un appel, le dessin et
     les dénivelés — et la réponse survit comme les autres. */
  expect(appelsAlti).toBe(0);
  await copilote.getByRole('button', { name: 'Voir le profil altimétrique' }).click();
  await expect(copilote).toContainText('D+ 285 m');
  await expect(copilote.locator('svg')).toBeVisible();
  expect(appelsAlti).toBe(1);

  // La croix referme, le bouton dit son état.
  await copilote.getByRole('button', { name: 'Fermer le panneau du copilote' }).click();
  await expect(copilote).toBeHidden();
});

test('HORS-ROUTE : l’itinéraire se recalcule TOUT SEUL, et le suivi repart', async ({ page }) => {
  /* La demande d'Armelin du 29/08 : « un mode de recalcul automatique si on
     s'est trompé de route ». Le bandeau constate huit secondes d'écart, le
     planificateur refait l'itinéraire DEPUIS la position, le suivi repart —
     pas un geste au volant. Trente secondes de silence entre deux demandes. */
  const urls: string[] = [];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    urls.push(decodeURIComponent(route.request().url()));
    const url = route.request().url();
    const corps: Record<string, unknown> = {
      geometry: GEOMETRIE, distance: 390_000, duration: 10_800,
    };
    if (/getSteps=true/i.test(url)) {
      corps['portions'] = [{ steps: [
        { instruction: { type: 'depart' }, distance: 390_000,
          attributes: { name: { cpx_numero: 'A6' } } },
      ] }];
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(corps) });
  });
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe = (c) => {
      rappel?.({ coords: { accuracy: 5, altitude: null, altitudeAccuracy: null,
        speed: 24, heading: 90, ...c } });
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
  const appelsAvant = urls.length;

  /* Cinquante kilomètres à l'ouest, fixe après fixe : l'écart DURE — c'est
     lui qui déclenche, pas un point isolé (tunnel, GPS qui divague). */
  await expect.poll(async () => {
    await page.evaluate(() => {
      (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
        longitude: 1.6, latitude: 48.5 });
    });
    return urls.length;
  }, { timeout: 25_000, intervals: [700] }).toBeGreaterThan(appelsAvant);

  // Le NOUVEL itinéraire part de la position hors-route…
  const recalcul = urls.slice(appelsAvant).find((u) => u.includes('start=1.6'));
  expect(recalcul, 'le recalcul ne part pas de la position').toBeTruthy();
  // …le champ départ le dit, et le suivi est REPARTI tout seul.
  await expect(page.locator('[data-role="depart"] input'))
    .toHaveValue('Reprise d’itinéraire', { timeout: 15_000 });
  await expect(page.locator('bandeau-guidage')).toBeVisible();
  /* Un fixe SUR le nouveau tracé (le point de départ même) : le suivi
     guide de nouveau — plus de « quitté l'itinéraire ». Rejoué : le premier
     fixe peut partir avant que la relance ait rebranché la veille. */
  await expect.poll(async () => {
    await page.evaluate(() => {
      (window as unknown as { __pousserFixe: (c: object) => void }).__pousserFixe({
        longitude: 2.3522, latitude: 48.8566 });
    });
    return page.locator('.bg-instruction').innerText();
  }, { timeout: 15_000, intervals: [600] }).not.toContain('quitté');
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
  /* LE PIED DE PAGE AUTONOME N'EXISTE PLUS À L'ÉCRAN depuis le 30/08 : ses
     liens vivent dans la bulle du « i », avec l'attribution. Ce qui doit
     revenir après le suivi, c'est donc CELLE-CI. */
  await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible();

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

test('NAV-2 : la voiture a un CURSEUR sur la carte, orienté, et sa forme se choisit', async ({ page, context }) => {
  /* Armelin, le 29/08, après un essai au volant : « il n'y a pas d'icône
     représentant ma voiture au milieu de la carte sur le trajet. C'est un
     objet fantôme qui se déplace et on ne peut pas savoir où on est. » */
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();

  const curseur = page.locator('.curseur-porte svg.curseur-vehicule');
  await expect(curseur, 'aucun curseur sur la carte').toBeVisible({ timeout: 15_000 });
  await expect(curseur).toHaveClass(/curseur-fleche/);

  /* IL SUIT LA VOITURE. On avance vers le sud-est le long du tracé : le
     marqueur se déplace, et son cap se déduit du déplacement quand le GPS
     simulé ne donne pas de `heading`. */
  const porte = page.locator('.curseur-porte');
  const avant = (await porte.boundingBox())!;
  await context.setGeolocation({ longitude: 3.2, latitude: 47.6 });
  await expect.poll(async () => {
    const b = await porte.boundingBox();
    return b ? Math.round(Math.abs(b.x - avant.x) + Math.abs(b.y - avant.y)) : 0;
  }, { timeout: 20_000 }).toBeGreaterThan(5);
  const rotation = await porte.evaluate((e) => e.style.transform);
  expect(rotation, 'le curseur ne s’oriente pas').toMatch(/rotate/);

  /* LA FORME SE CHOISIT — « comme une flèche, une voiture etc. ». Le choix
     vit dans « Mon véhicule », se garde sur l'appareil, et le suivi suivant
     le relit. */
  await page.getByRole('button', { name: 'Arrêter le suivi' }).click();
  await page.locator('.iti > summary').click();
  await page.locator('.iti-vers[data-vers="vehicule"]').click();
  // On clique la VIGNETTE, comme l'usager : la case est masquée sous elle.
  await page.locator('.veh-curseur:has(input[value="voiture"])').click();
  await expect(page.locator('.veh-curseur input[value="voiture"]')).toBeChecked();
  await page.locator('.vue-retour').click();
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('.curseur-porte svg.curseur-vehicule'))
    .toHaveClass(/curseur-voiture/, { timeout: 15_000 });
});

test('GUID-2 : l’instruction flotte en haut à gauche, la barre du bas est minimale et NE MASQUE PLUS RIEN', async ({ page }) => {
  /* Armelin, le 29/08 : « la barre d'informations en bas n'est pas affichée
     tout en bas de l'écran. Et cette barre masque de suite les boutons de
     navigation de zoom et de géolocalisation à droite. De plus, cette barre
     affiche également les flèches et indication de navigation […] ce qui
     agrandit la fenêtre du bas qui doit rester minimaliste. » Tout se
     mesure en rectangles. */
  await page.setViewportSize({ width: 390, height: 844 });
  await ouvrirTrajet(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  const bandeau = page.locator('bandeau-guidage');
  await expect(bandeau).toBeVisible({ timeout: 15_000 });

  // LE CARTOUCHE EST EN HAUT À GAUCHE — pas dans la barre du bas.
  const cartouche = (await bandeau.locator('.bg-cartouche').boundingBox())!;
  expect(cartouche.x, 'le cartouche doit être à gauche').toBeLessThan(30);
  expect(cartouche.y, 'le cartouche doit être en haut').toBeLessThan(300);

  // LA BARRE EST COLLÉE EN BAS, et le cartouche est bien au-dessus d'elle.
  const barre = (await bandeau.locator('.bg').boundingBox())!;
  expect(Math.round(barre.y + barre.height), 'la barre ne touche pas le bas').toBe(844);
  expect(cartouche.y + cartouche.height).toBeLessThan(barre.y);

  /* ELLE NE MASQUE NI LES COMMANDES DE VUE NI L'ATTRIBUTION IGN — cette
     dernière n'est pas décorative : c'est la contrepartie de la licence. */
  /* Les boutons + et − ont disparu le 29/08 (« tout le monde est habitué à
     zoomer avec les doigts ») : c'est la BOUSSOLE, restée seule dans le
     groupe, qui doit rester dégagée. */
  const boussole = (await page.locator('.maplibregl-ctrl-compass').boundingBox())!;
  expect(boussole.y + boussole.height, 'le bandeau recouvre les commandes de vue')
    .toBeLessThan(barre.y);
  const attribution = (await page.locator('.maplibregl-ctrl-attrib').boundingBox())!;
  expect(attribution.y + attribution.height, 'le bandeau recouvre l’attribution IGN')
    .toBeLessThanOrEqual(barre.y);

  /* LA BARRE NE PORTE PLUS LA MANŒUVRE : la flèche et l'instruction vivent
     dans le cartouche, hors d'elle. */
  const fleche = (await bandeau.locator('.bg-fleche').boundingBox())!;
  expect(fleche.y, 'la flèche est restée dans la barre du bas').toBeLessThan(barre.y);
});

test('NAV-4 : travaux et recharge s’annoncent à DIX kilomètres — et se lisent en dépliant', async ({ page }) => {
  /* Armelin, le 30/08 : « la ligne pour indiquer les travaux ne devrait
     s'afficher automatiquement que 10 km avant d'arriver à la zone de
     travaux. Idem pour la prochaine arrivée à la borne de recharge ». Une
     barre qui annonce à cinquante kilomètres occupe l'écran une demi-heure
     pour rien. Rien n'est perdu : en dépliant, tout revient. */
  /* LE SERVICE PARLE EN DEUX TEMPS, et sur DEUX hôtes : l'horodate sur
     www, les événements sur www1. Le parcours voisin le fait déjà ainsi —
     s'en écarter rendait une collection vide, donc rien à annoncer. */
  await page.route('**/www.bison-fute.gouv.fr/data/iteration/date.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[1787353503716]' }));
  await page.route('**/www1.bison-fute.gouv.fr/data/**/evenementsOL6.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ type: 'FeatureCollection', features: [
      /* Des travaux à ~31 km du départ : ENTRE les deux seuils. Au-delà
         de dix kilomètres, la barre repliée se tait ; en deçà de cinquante,
         elle en parle une fois dépliée. Le point est interpolé sur la
         diagonale simulée depuis celui du parcours voisin (~78 km), lui-même
         calculé par inversion de la reprojection Lambert-93 du projet. */
      { geometry: { type: 'Point', coordinates: [667099, 6834630] },
        properties: { type: 'TRAVAUX', etat_evenement: 'EFFECTIF', urlcpc: '' } },
    ] }),
  }));
  /* ON PILOTE LES FIXES : les événements du corridor arrivent APRÈS le
     démarrage, et l'affichage se refait à chaque position. Rejouer un fixe
     est le seul rendez-vous fiable — la même mécanique que le parcours de
     la barre du trajet. */
  await page.addInitScript(() => {
    let rappel: ((p: unknown) => void) | null = null;
    (window as unknown as { __pousserFixe: () => void }).__pousserFixe = () => {
      rappel?.({ coords: { accuracy: 5, altitude: null, altitudeAccuracy: null,
        speed: null, heading: null, longitude: 2.3522, latitude: 48.8566 } });
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
  const bandeau = page.locator('bandeau-guidage');
  const fixe = (): Promise<void> => page.evaluate(() => {
    (window as unknown as { __pousserFixe: () => void }).__pousserFixe();
  });
  await fixe();
  await expect(bandeau.locator('.bg-chiffres')).toBeVisible({ timeout: 15_000 });

  // REPLIÉE, l'annonce lointaine se tait — même une fois les travaux connus.
  await expect.poll(async () => {
    await fixe();
    return bandeau.locator('.bg-trafic').textContent();
  }, { timeout: 10_000 }).toBe('');

  // DÉPLIÉE, elle revient : rangée, pas perdue.
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
  await expect.poll(async () => {
    await fixe();
    return bandeau.locator('.bg-trafic').textContent();
  }, { timeout: 15_000 }).toContain('Travaux');
});
