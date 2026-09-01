import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE GUIDAGE VOCAL (VOIX-1, demande d'Armelin du 30/08).
 *
 * COMMENT ON MESURE UNE VOIX. On remplace `speechSynthesis` par un mouchard
 * qui NOTE ce qu'on lui demande de dire, avant que la page ne charge. On
 * vérifie donc les phrases RÉELLEMENT prononcées — pas un état interne qui
 * pourrait mentir.
 *
 * CE QUE CES PARCOURS DÉFENDENT : que rien ne se dise sans que l'usager l'ait
 * demandé, que rien ne se répète, et que la voix se taise à l'arrêt. */

const GEOMETRIE = {
  type: 'LineString',
  coordinates: [[2.3522, 48.8566], [2.3560, 48.8500], [2.3600, 48.8400]],
};

/** Le mouchard : il enregistre, il ne parle pas. */
async function espionnerLaVoix(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const dites: string[] = [];
    (window as unknown as { ditesVoix: string[] }).ditesVoix = dites;
    let annulations = 0;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [
          { lang: 'fr-FR', name: 'Locale', localService: true },
          { lang: 'fr-FR', name: 'Serveur', localService: false },
        ],
        speak: (m: { text: string }) => { dites.push(m.text); },
        cancel: () => { annulations += 1; },
        addEventListener: () => {},
        get annulations() { return annulations; },
      },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class { text: string; lang = ''; rate = 1; voice: unknown = null;

        constructor(t: string) { this.text = t; } },
    });
  });
}

const dites = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { ditesVoix: string[] }).ditesVoix);

/**
 * Un suivi dont la manœuvre est à `distance` mètres — c'est elle qui décide
 * du palier atteint, donc de ce qui se dit.
 */
async function suivre(
  page: Page, distance: number, trafic = false, voie?: string,
): Promise<void> {
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  /* BISON FUTÉ : le suivi relève les événements du corridor au démarrage.
     Sans bouchon, la ligne reste vide — c'est le cas des autres parcours. */
  if (trafic) {
    await page.route('**/www.bison-fute.gouv.fr/data/iteration/date.json',
      (route) => route.fulfill({ contentType: 'application/json', body: '[1787353503716]' }));
    await page.route('**/www1.bison-fute.gouv.fr/data/**/evenementsOL6.json',
      (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          /* EN LAMBERT-93, comme le service : ce point tombe SUR le tracé, à
             sept cents mètres du départ. Un événement EFFECTIF — les
             prévisionnels sont tus par lib/trafic.ts. */
          geometry: { type: 'Point', coordinates: [652685.0, 6861522.0] },
          properties: { type: 'TRAVAUX', etat_evenement: 'EFFECTIF', urlcpc: '' },
        }],
      }) }));
  }
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    const url = route.request().url();
    if (/resource=bdtopo-pgr/.test(url)) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    if (/getSteps=true/i.test(url)) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          geometry: GEOMETRIE, distance: 2_000, duration: 200,
          portions: [{ steps: [
            { instruction: { type: 'depart' }, distance,
              attributes: { name: { cpx_numero: 'D606' } } },
            { instruction: { type: 'turn', modifier: 'right' }, distance: 1_600,
              attributes: {
                name: voie === undefined
                  ? { cpx_numero: 'A7' }
                  : { nom_1_gauche: voie },
              } },
          ] }],
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ geometry: GEOMETRIE, distance: 2_000, duration: 200 }),
    });
  });
  await page.goto('/#iti=2.35220,48.85660;2.36000,48.84000;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('.bg-cartouche')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Afficher les commandes du suivi' }).click();
}

test.beforeEach(async ({ page, context }) => {
  await espionnerLaVoix(page);
  await simulerTuiles(page);
  await simulerCommunes(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
});

test('LA VOIX PARLE DÈS LE PREMIER TRAJET, et dit comment la couper', async ({ page }) => {
  /* CE PARCOURS DISAIT L'INVERSE HIER, ET C'EST ARMELIN QUI L'A RENVERSÉ
     (VOIX-3, 01/09). Il défendait le silence par défaut, au motif qu'« une
     application qui se met à parler toute seule au premier trajet est une
     application qu'on désinstalle ». L'argument valait ; il en a rencontré le
     revers au premier essai réel : « pas de guidage vocal. Je ne sais pas si
     c'était parce que j'étais à pied ». Ce n'était pas la marche — c'était un
     bouton qu'il n'avait pas trouvé, sur un GPS dont on attend qu'il parle.
     LA CRAINTE D'HIER EST TRAITÉE AUTREMENT, et ce parcours le garde : la
     voix se présente UNE FOIS et dit comment la couper. Elle ne surprend donc
     personne deux fois, et un silence choisi est respecté pour toujours. */
  await suivre(page, 400);
  await page.waitForTimeout(1_200);
  const phrases = await dites(page);
  expect(phrases.some((p) => p.startsWith('Guidage vocal activé')),
    'la voix ne s’est pas présentée au premier trajet').toBe(true);
  expect(phrases.some((p) => p.includes('pour le couper')),
    'elle ne dit pas comment la faire taire').toBe(true);
});

test('ET ELLE NE SE PRÉSENTE PLUS AU TRAJET SUIVANT', async ({ page }) => {
  /* La présentation est une politesse d'accueil, pas une rengaine : le choix
     est écrit dès le premier trajet, et l'on ne redemande rien. */
  await suivre(page, 400);
  await page.waitForTimeout(1_200);
  await page.getByRole('button', { name: 'Arrêter le suivi' }).click();
  await page.waitForTimeout(400);
  await page.reload();
  await suivre(page, 400);
  await page.waitForTimeout(1_200);
  expect((await dites(page)).some((p) => p.startsWith('Guidage vocal activé')),
    'elle se présente à chaque trajet').toBe(false);
});

test('elle RÉPOND en s’allumant — on ne découvre pas au premier virage', async ({ page }) => {
  /* Loin de toute manœuvre, il n'y a rien à annoncer : elle se présente,
     pour qu'on sache qu'elle marche. C'est aussi le geste d'usager qu'exigent
     les navigateurs avant de laisser une page parler.
     ON LA COUPE D'ABORD, depuis VOIX-3 : elle parle désormais par défaut, et
     c'est bien le RALLUMAGE qu'il faut éprouver ici. */
  await suivre(page, 8_000);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Couper le guidage vocal' }).click();
  /* ON COMPTE AVANT ET APRÈS : la présentation de VOIX-3 occupe déjà la
     liste, et y chercher une phrase qui s'y trouve déjà ne prouverait rien du
     rallumage. */
  const avant = (await dites(page))
    .filter((p) => p.startsWith('Guidage vocal activé')).length;
  await page.getByRole('button', { name: 'Activer le guidage vocal' }).click();
  await expect.poll(async () => (await dites(page))
    .filter((p) => p.startsWith('Guidage vocal activé')).length,
  { timeout: 5_000, message: 'le rallumage ne répond pas' }).toBe(avant + 1);
  // Le bouton dit son état, et change de dessin.
  await expect(page.getByRole('button', { name: 'Couper le guidage vocal' }))
    .toHaveAttribute('aria-pressed', 'true');
});

test('elle annonce la manœuvre avec sa distance et la route visée', async ({ page }) => {
  /* ANNONCER VAUT MIEUX QUE SE PRÉSENTER : s'il y a une manœuvre à dire, on
     la dit dès l'allumage — c'est une démonstration ET une information. */
  await suivre(page, 400);
  await page.waitForTimeout(1_200);
  expect(await dites(page), 'la manœuvre remplace la présentation')
    .not.toContain('Guidage vocal activé');
  const phrases = await dites(page);
  expect(phrases.some((p) => p.startsWith('Dans 400 mètres, tournez à droite'))).toBe(true);
  expect(phrases.some((p) => p.includes('vers A7'))).toBe(true);
});

test('AU MOMENT de la manœuvre, elle dit la manœuvre seule', async ({ page }) => {
  await suivre(page, 40);
  await page.waitForTimeout(1_200);
  expect(await dites(page)).toContain('Tournez à droite, vers A7');
});

test('elle NE SE RÉPÈTE PAS : un GPS qu’on coupe ne prévient plus de rien', async ({ page }) => {
  await suivre(page, 400);
  await page.waitForTimeout(2_000);
  const phrases = (await dites(page)).filter((p) => p.includes('tournez à droite'));
  expect(phrases, 'un palier ne se dit qu’une fois par manœuvre').toHaveLength(1);
});

test('la COUPER la fait taire, et le choix survit au rechargement', async ({ page }) => {
  await suivre(page, 400);
  // Elle parle déjà (VOIX-3) : il n'y a plus qu'à la couper.
  await page.getByRole('button', { name: 'Couper le guidage vocal' }).click();
  await expect(page.getByRole('button', { name: 'Activer le guidage vocal' }))
    .toHaveAttribute('aria-pressed', 'false');

  /* LE CHOIX EST UNE PRÉFÉRENCE, pas un réglage de session : on ne redemande
     pas à chaque trajet. Elle vit dans IndexedDB, sur l'appareil.
     ON LAISSE L'ÉCRITURE ABOUTIR avant de recharger : recharger cinquante
     millisecondes après un clic est une course que ce parcours crée et
     qu'aucun usager ne court. */
  await page.waitForTimeout(400);
  await page.reload();
  await suivre(page, 400);
  await expect(page.getByRole('button', { name: 'Activer le guidage vocal' }))
    .toHaveAttribute('aria-pressed', 'false');
});

test('elle se TAIT à l’arrêt du suivi', async ({ page }) => {
  /* Une phrase qui continue après l'arrêt annoncerait un virage qu'on ne
     prend plus. */
  await suivre(page, 400);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Arrêter le suivi' }).click();
  const avant = (await dites(page)).length;
  await page.waitForTimeout(800);
  expect(await dites(page)).toHaveLength(avant);
});

test('LE TRAFIC PARLE DANS LES BLANCS, jamais par-dessus une manœuvre', async ({ page }) => {
  /* TRAFIC-1 (30/08). La règle qui manquait quand la fonctionnalité a été
     proposée : on n'interrompt pas, on attend. Ici la manœuvre est à huit
     kilomètres — la voie est libre pour annoncer les travaux. */
  await suivre(page, 8_000, true);
  await page.waitForTimeout(1_500);
  const phrases = await dites(page);
  expect(phrases.some((p) => p.includes('signalé')), JSON.stringify(phrases)).toBe(true);
});

test('IL SE TAIT quand une manœuvre approche', async ({ page }) => {
  /* Manœuvre à quatre cents mètres : l'annonce de travaux couperait
     l'instruction, ou pire, la remplacerait dans l'oreille de qui conduit. */
  await suivre(page, 400, true);
  await page.waitForTimeout(1_500);
  expect((await dites(page)).some((p) => p.includes('signalé'))).toBe(false);
});

test('LA VOIX PRONONCE LES ACCENTS que la source a perdus', async ({ page }) => {
  /* Armelin, 31/08 : « mon adresse "Avenue du prophète" est écrite "Avenue du
     Prophete" sans accent. Du coup, la lecture vocale prononce le nom tel
     quel et phonétiquement, ça fait tache d'entendre "Avenue du
     Proph[eu]te". »
     ON MESURE CE QUI EST RÉELLEMENT DIT, pas ce qui est affiché : c'est la
     prononciation qui était en cause, et la synthèse ne sait lire que ce
     qu'on lui donne. La source rend « AV DU PROPHETE » ; ce qui part à la
     voix doit porter l'accent. */
  await suivre(page, 400, false, 'AV DU PROPHETE');
  await page.waitForTimeout(1_200);
  const phrases = (await dites(page)).join(' | ');
  expect(phrases, 'la voix doit prononcer l’accent').toContain('Prophète');
  expect(phrases, 'plus aucune forme sans accent ne part à la voix')
    .not.toContain('Prophete');
});
