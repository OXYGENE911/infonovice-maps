import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE PANNEAU DE GUIDAGE SE LIT (TERRAIN-2, retour du CEO du 11/09).
 *
 * ARMELIN, SON TÉLÉPHONE EN MAIN, DEUX DÉFAUTS D'UN COUP :
 *   (a) « un identifiant brut s'affiche à l'écran » ;
 *   (b) « un texte long déborde du cadre ».
 *
 * CE FICHIER MESURE, IL NE REGARDE PAS. Les boîtes englobantes sont relevées
 * dans le navigateur, à 360 px de large — la largeur d'un téléphone d'entrée
 * de gamme, et celle que la tâche nomme. « Ça a l'air de tenir » n'est pas un
 * résultat : la maison a déjà payé pour l'avoir cru (13/09).
 */

test.use({ viewport: { width: 360, height: 740 } });

/* La phrase du critère, mot pour mot. Elle est longue EXPRÈS : c'est le pire
   cas réel d'un embranchement d'autoroute annoncé avec ses deux numéros. */
const PHRASE = 'À l’embranchement, restez légèrement à droite vers A4/E54';

/* UN IDENTIFIANT DE LA BD TOPO, tel que le service le rend quand le nom de
   voie manque : `cleabs` au lieu de `nom_1_gauche`. C'est exactement la forme
   qu'Armelin a vue à l'écran — une référence technique, jamais écrite pour
   être lue au volant. */
const IDENTIFIANT_BRUT = 'TRONROUT0000000352788241';

/* Un trajet court et plein est : 2 km le long du 48,85e parallèle. */
const TRACE: [number, number][] = Array.from({ length: 21 }, (_, i) =>
  [2.3400 + i * 0.0014, 48.8500]);

/** Démarre un suivi dont la manœuvre à venir est un embranchement. */
async function suivre(page: Page, nomDeVoie: string,
  nomCourant = 'R DE RIVOLI'): Promise<void> {
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
    if (/getSteps=true/i.test(url) || /resource=bdtopo-pgr/.test(url)) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          geometry: { type: 'LineString', coordinates: TRACE },
          distance: 2_050, duration: 240,
          /* LA FORME DU SERVICE EST PROFONDE : le nom de voie vit sous
             `attributes.name`, pas à plat. Une fixture à plat rendrait des
             étapes sans voie, et le parcours accuserait le code. */
          portions: [{ steps: [
            { instruction: { type: 'depart' }, distance: 1_500,
              attributes: { name: { nom_1_gauche: nomCourant } } },
            { instruction: { type: 'fork', modifier: 'slight right' }, distance: 550,
              attributes: { name: { nom_1_gauche: nomDeVoie } } },
          ] }],
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: TRACE },
        distance: 2_050, duration: 240,
      }),
    });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};${TRACE[20]![0]},${TRACE[20]![1]};car`);
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
}

/** Pousse un fixe et laisse le bandeau le digérer. */
async function rouler(page: Page, lon: number, lat: number): Promise<void> {
  await page.evaluate(([lo, la]) => {
    (window as unknown as { __pousserFixe: (c: object) => void })
      .__pousserFixe({ longitude: lo, latitude: la, speed: 14, heading: 90 });
  }, [lon, lat]);
  await page.waitForTimeout(900);
}

/** Ce que le navigateur mesure vraiment sur un élément de texte. */
interface Mesure {
  /** Les lignes PEINTES — la hauteur de la boîte que l'œil voit. */
  lignes: number;
  /** Les lignes que le CONTENU occuperait sans plafond. */
  lignesContenu: number;
  coupe: boolean;
  /** Du contenu hors de la boîte SANS que la coupe l'ait décidé. */
  deborde: boolean;
  /** Le `display` CALCULÉ : une règle CSS écrite n'est pas une règle active. */
  display: string;
  /** Le `display` calculé du PARENT — c'est lui qui blockifie l'item flex. */
  displayParent: string;
  /** Le plafond de hauteur réellement posé, ou `none`. */
  hauteurMax: string;
  interligne: number;
  texte: string; boite: { x: number; y: number; largeur: number; hauteur: number };
}

/* ON MESURE LA BOÎTE PEINTE, PAS LE CONTENU (13/09).
 *
 * LA PASSE PRÉCÉDENTE COMPTAIT LES LIGNES SUR `scrollHeight`, qui décrit le
 * CONTENU et non la boîte : dès qu'un texte est coupé — ce que la règle
 * prévoit en dernier recours — `scrollHeight` garde la hauteur du texte
 * entier, et la mesure rendait trois lignes pour une boîte de deux. C'est ce
 * qui a fait rougir la CI.
 * LES DEUX SONT DONC RELEVÉES, ET AUCUNE N'EST LÂCHÉE : la boîte peinte doit
 * tenir en deux lignes, ET tout écart entre les deux doit être une COUPE
 * VOULUE — jamais un débordement qu'on n'aurait pas vu.
 */
async function mesurer(page: Page, selecteur: string): Promise<Mesure> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`introuvable : ${sel}`);
    const style = getComputedStyle(el);
    const inter = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
    const r = el.getBoundingClientRect();
    const coupe = el.classList.contains('texte-coupe');
    const parent = el.parentElement;
    return {
      lignes: Math.max(1, Math.round(el.clientHeight / inter)),
      lignesContenu: Math.max(1, Math.round(el.scrollHeight / inter)),
      coupe,
      /* DÉBORDER, C'EST AVOIR DU CONTENU HORS DE SA BOÎTE SANS L'AVOIR
         DÉCIDÉ. En largeur, jamais — rien ne l'autorise. En hauteur, la
         coupe l'autorise ET SEULE la coupe : sans elle, c'est le défaut
         qu'Armelin a vu. Un pixel de tolérance pour les sous-pixels. */
      deborde: el.scrollWidth > el.clientWidth + 1
        || (!coupe && el.scrollHeight > el.clientHeight + 1),
      display: style.display,
      displayParent: parent ? getComputedStyle(parent).display : '',
      hauteurMax: style.maxHeight,
      interligne: inter,
      texte: el.textContent ?? '',
      boite: { x: r.x, y: r.y, largeur: r.width, hauteur: r.height },
    };
  }, selecteur);
}

test('LA PHRASE DU CRITÈRE TIENT ENTIÈREMENT SUR 360 px, EN DEUX LIGNES AU PLUS', async ({ page }) => {
  /* LE TEST QUI FAIT FOI. « À l'embranchement, restez légèrement à droite
     vers A4/E54 » est écrite dans le cartouche, et c'est le MÉCANISME DE
     PRODUCTION qui la met en forme — l'observateur de `tenir-en-lignes` voit
     l'écriture et réduit la police par paliers. On mesure ensuite. */
  await suivre(page, 'R DE RIVOLI');
  await rouler(page, TRACE[7]![0], TRACE[7]![1]);
  const cartouche = page.locator('.bg-cartouche');
  await expect(cartouche).toBeVisible({ timeout: 15_000 });

  await page.evaluate((phrase) => {
    const el = document.querySelector<HTMLElement>('.bg-cartouche .bg-instruction');
    if (el) el.textContent = phrase;
  }, PHRASE);
  /* L'observateur travaille sur la file des micro-tâches : on attend le
     RÉSULTAT, jamais une durée arbitraire. */
  await expect.poll(async () => (await mesurer(page, '.bg-cartouche .bg-instruction')).lignes,
    { timeout: 5_000 }).toBeLessThanOrEqual(2);

  const m = await mesurer(page, '.bg-cartouche .bg-instruction');
  expect(m.texte, 'la phrase doit être rendue ENTIÈREMENT').toBe(PHRASE);
  expect(m.coupe, 'aucune ellipse : la phrase tient par réduction de police').toBe(false);
  expect(m.deborde, 'le texte déborde de sa propre boîte').toBe(false);
  expect(m.lignes, 'jamais une troisième ligne').toBeLessThanOrEqual(2);

  /* ET IL NE SORT PAS DU PANNEAU : la boîte du texte tient dans celle du
     cartouche, qui est la tôle. */
  const c = await page.locator('.bg-cartouche').boundingBox();
  expect(c).not.toBeNull();
  const cadre = c as { x: number; y: number; width: number; height: number };
  expect(m.boite.x).toBeGreaterThanOrEqual(cadre.x - 1);
  expect(m.boite.x + m.boite.largeur).toBeLessThanOrEqual(cadre.x + cadre.width + 1);
  expect(m.boite.y).toBeGreaterThanOrEqual(cadre.y - 1);
  expect(m.boite.y + m.boite.hauteur).toBeLessThanOrEqual(cadre.y + cadre.height + 1);
  /* ET LE PANNEAU LUI-MÊME RESTE DANS L'ÉCRAN DE 360 px. */
  expect(cadre.x).toBeGreaterThanOrEqual(0);
  expect(cadre.x + cadre.width).toBeLessThanOrEqual(360);
});

test('UNE LIGNE SECONDAIRE INTERMINABLE S’ARRÊTE À DEUX LIGNES, SANS CHEVAUCHER L’INSTRUCTION', async ({ page }) => {
  await suivre(page, 'R DE RIVOLI');
  await rouler(page, TRACE[7]![0], TRACE[7]![1]);
  await expect(page.locator('.bg-cartouche')).toBeVisible({ timeout: 15_000 });

  await page.evaluate(() => {
    const inst = document.querySelector<HTMLElement>('.bg-cartouche .bg-instruction');
    if (inst) inst.textContent = 'À l’embranchement, restez légèrement à droite';
    const dest = document.querySelector<HTMLElement>('.bg-destination');
    if (dest) {
      dest.hidden = false;
      dest.textContent = 'Corbeil-Essonnes · Marne-la-Vallée · Saint-Étienne-du-Rouvray'
        + ' · Villeneuve-Saint-Georges · Boulogne-Billancourt';
    }
  });
  await expect.poll(async () => (await mesurer(page, '.bg-destination')).lignes,
    { timeout: 5_000 }).toBeLessThanOrEqual(2);

  const d = await mesurer(page, '.bg-destination');
  expect(d.lignes, 'jamais une troisième ligne PEINTE').toBeLessThanOrEqual(2);
  expect(d.deborde, 'la ligne secondaire déborde de sa boîte').toBe(false);
  /* ET LA BOÎTE EST MESURÉE EN PIXELS, pas seulement en lignes arrondies. */
  expect(d.boite.hauteur, 'la boîte peinte tient en deux interlignes')
    .toBeLessThanOrEqual(2 * d.interligne + 1);

  /* LE MÉCANISME S'APPLIQUE-T-IL VRAIMENT ? C'est la question que la passe
     précédente n'a pas posée, et elle a coûté un cycle.
     `.texte-coupe` déclare `display:-webkit-box` pour obtenir
     `-webkit-line-clamp`. Mais `.bg-destination` est un ITEM FLEX de
     `.bg-cartouche` : le mode de boîte d'un item flex est BLOCKIFIÉ, et le
     `display` calculé ne vaut donc jamais `-webkit-box`. On l'affirme ici,
     dans le navigateur, pour que personne ne rebâtisse la garantie dessus. */
  if (d.coupe) {
    expect(d.displayParent, 'le cartouche est bien un conteneur flex').toBe('flex');
    expect(d.display,
      'un item flex ne rend pas un -webkit-box : le clamp seul ne garantit rien')
      .not.toBe('-webkit-box');
    /* CE QUI GARANTIT LES DEUX LIGNES : un plafond de hauteur MESURÉ, posé
       en pixels par `tenir-en-lignes.ts`. Sans lui, la boîte dépassait. */
    expect(d.hauteurMax, 'aucun plafond de hauteur n’est posé').not.toBe('none');
    const plafond = Number.parseFloat(d.hauteurMax);
    expect(Number.isFinite(plafond), `plafond illisible : ${d.hauteurMax}`).toBe(true);
    expect(plafond, 'le plafond vaut deux interlignes au plus')
      .toBeLessThanOrEqual(2 * d.interligne + 0.5);
    /* ET LA COUPE COUPE VRAIMENT : du contenu est retenu hors de la boîte.
       Sans cette ligne, un plafond posé sur un texte qui tenait déjà
       passerait pour une réparation. */
    expect(d.lignesContenu,
      'la coupe est posée alors que rien ne dépassait').toBeGreaterThan(d.lignes);
  }
  /* ICI L'ELLIPSE EST LÉGITIME : cinq villes ne tiennent pas, et un nom de
     ville tronqué vaut mieux qu'un panneau crevé. C'est le DERNIER recours,
     et on vérifie qu'il n'arrive qu'après les paliers de police. */
  const taille = await page.locator('.bg-destination')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(taille, 'les paliers de police ont bien été essayés avant de couper')
    .toBeLessThan(15);

  /* AUCUN CHEVAUCHEMENT AVEC L'INSTRUCTION : les deux boîtes ne se croisent pas. */
  const i = await mesurer(page, '.bg-cartouche .bg-instruction');
  const seCroisent = i.boite.x < d.boite.x + d.boite.largeur
    && i.boite.x + i.boite.largeur > d.boite.x
    && i.boite.y < d.boite.y + d.boite.hauteur
    && i.boite.y + i.boite.hauteur > d.boite.y;
  expect(seCroisent, 'l’instruction et la ligne secondaire se chevauchent').toBe(false);
});

test('UN IDENTIFIANT BRUT NE S’AFFICHE PAS — la ligne secondaire se tait', async ({ page }) => {
  /* LE DÉFAUT (a), PAR LE VRAI CHEMIN DE DONNÉES : le service rend un
     identifiant de la BD TOPO à la place du nom de voie, et le bandeau le
     reprenait tel quel dans la ligne secondaire. Il ne le reprend plus. */
  await suivre(page, IDENTIFIANT_BRUT);
  await rouler(page, TRACE[7]![0], TRACE[7]![1]);
  await expect(page.locator('.bg-cartouche')).toBeVisible({ timeout: 15_000 });
  /* L'INSTRUCTION EST LÀ — le panneau n'est pas vide, il se tait seulement
     sur la ligne secondaire. */
  await expect(page.locator('.bg-cartouche .bg-instruction')).not.toBeEmpty();

  /* ELLE RESTE SILENCIEUSE, ET PAS SEULEMENT « PAS ENCORE ARRIVÉE » : un
     second fixe passe, au même endroit du trajet que la contre-épreuve
     ci-dessous — qui, elle, la fait paraître en moins de dix secondes. Les
     deux parcours vont PAR PAIRE : sans le second, celui-ci serait tenu par
     une ligne qui ne paraît jamais. */
  await rouler(page, TRACE[8]![0], TRACE[8]![1]);
  await expect(page.locator('.bg-destination')).toBeHidden();
  const texte = await page.locator('bandeau-guidage').textContent();
  expect(texte ?? '').not.toContain(IDENTIFIANT_BRUT);
  expect(texte ?? '').not.toContain('Tronrout');
});

test('UN NOM DE VOIE LISIBLE, LUI, S’AFFICHE — la contre-épreuve', async ({ page }) => {
  /* Sans ce parcours, le précédent serait tenu par une ligne secondaire qui
     ne paraît JAMAIS : on aurait effacé le défaut en effaçant la fonction. */
  await suivre(page, 'R DES PYRENEES');
  await rouler(page, TRACE[7]![0], TRACE[7]![1]);
  await expect(page.locator('.bg-destination')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.bg-destination')).toContainText('Rue des Pyr');
});

test('LA VOIE COURANTE, EN BAS DU BANDEAU, NE MONTRE PAS D’IDENTIFIANT BRUT', async ({ page }) => {
  /* LA LIGNE QUE LE CEO A VUE, ET QUI N’AVAIT PAS ÉTÉ RÉPARÉE. `.bg-voie`
     affiche « le nom de la rue sur laquelle on se déplace actuellement » ;
     elle recevait `e.etape.voie` SANS AUCUN FILTRE — le champ que le service
     remplit avec `cpx_numero`, à défaut `nom_1_gauche`, à défaut
     `cpx_toponyme`. Quand les deux noms manquent, c’est la référence
     technique qui s’affichait, et elle s’affichait encore le 13/09.
     `nomsLisibles()` n’était branché qu’à UN endroit : `.bg-destination`. */
  await suivre(page, 'R DE RIVOLI', IDENTIFIANT_BRUT);
  await rouler(page, TRACE[3]![0], TRACE[3]![1]);
  await expect(page.locator('bandeau-guidage')).toBeVisible({ timeout: 15_000 });
  await rouler(page, TRACE[4]![0], TRACE[4]![1]);

  const voie = await page.locator('.bg-voie').textContent();
  expect(voie ?? '', 'la voie courante affiche un identifiant brut')
    .not.toContain(IDENTIFIANT_BRUT);
  /* ET NULLE PART AILLEURS DANS LE BANDEAU : l’écusson lit la même donnée. */
  const tout = await page.locator('bandeau-guidage').textContent();
  expect(tout ?? '').not.toContain(IDENTIFIANT_BRUT);
  expect(tout ?? '').not.toContain('TRONROUT');
});

test('LA VOIE COURANTE LISIBLE, ELLE, S’AFFICHE — la contre-épreuve', async ({ page }) => {
  /* Sans ce parcours, le précédent serait tenu par une ligne qui ne paraît
     jamais : on aurait effacé le défaut en effaçant l’information. */
  await suivre(page, 'R DE RIVOLI', 'AVENUE DE LA REPUBLIQUE');
  await rouler(page, TRACE[3]![0], TRACE[3]![1]);
  /* LE LIBELLÉ EST MIS EN FORME EN AMONT (`libelleVoie`) : le service écrit
     en capitales sans accents, le bandeau affiche « Avenue de la République ».
     On attend donc la forme RÉELLEMENT peinte — mesurée, pas supposée. */
  await expect(page.locator('.bg-voie')).toContainText('Avenue de la République',
    { timeout: 10_000 });
});

test('UN NUMÉRO DE ROUTE RESTE AFFICHÉ — « D606 » est un nom, pas un identifiant', async ({ page }) => {
  /* LE PIÈGE DE LA RÉPARATION : filtrer la voie courante avec la règle des
     NOMS DE LIEU aurait effacé « A6 », « N7 », « D606 » — ce qui est peint
     sur la tôle. La seconde règle, `voieLisible`, les garde. */
  await suivre(page, 'R DE RIVOLI', 'D606');
  await rouler(page, TRACE[3]![0], TRACE[3]![1]);
  await expect(page.locator('.bg-voie')).toContainText('D606', { timeout: 10_000 });
});

test('QUAND AUCUN PALIER NE SUFFIT, LA COUPE TIENT VRAIMENT LES DEUX LIGNES', async ({ page }) => {
  /* LE PARCOURS QUI MANQUAIT, ET C’EST LUI QUI A FAIT ROUGIR LA CI.
     Les autres parcours tiennent par la RÉDUCTION DE POLICE : sur ce poste,
     cinq villes finissent par tenir à 60 %, et le dernier recours n’est
     jamais atteint. Sur le runner Linux, la police est plus large, aucun
     palier ne suffit, la coupe est posée — et là elle ne coupait rien.
     Ce texte-ci ne tient sur AUCUNE police : la coupe est donc exercée
     partout, et ce que l’on affirme dessous est affirmé partout. */
  await suivre(page, 'R DE RIVOLI');
  await rouler(page, TRACE[7]![0], TRACE[7]![1]);
  await expect(page.locator('.bg-cartouche')).toBeVisible({ timeout: 15_000 });

  await page.evaluate(() => {
    const inst = document.querySelector<HTMLElement>('.bg-cartouche .bg-instruction');
    if (inst) inst.textContent = 'À l’embranchement, restez légèrement à droite';
    const dest = document.querySelector<HTMLElement>('.bg-destination');
    if (dest) {
      dest.hidden = false;
      dest.textContent = Array.from({ length: 14 },
        () => 'Villeneuve-Saint-Georges').join(' · ');
    }
  });
  await expect.poll(async () => (await mesurer(page, '.bg-destination')).coupe,
    { timeout: 5_000 }).toBe(true);

  const d = await mesurer(page, '.bg-destination');
  /* LA BOÎTE PEINTE : deux lignes, pas une de plus. */
  expect(d.lignes, 'jamais une troisième ligne peinte').toBeLessThanOrEqual(2);
  expect(d.boite.hauteur, 'la boîte peinte tient en deux interlignes')
    .toBeLessThanOrEqual(2 * d.interligne + 1);
  /* ET IL Y AVAIT BIEN QUELQUE CHOSE À COUPER. */
  expect(d.lignesContenu, 'le texte de contrôle doit réellement déborder')
    .toBeGreaterThan(2);

  /* LE MÉCANISME EST-IL ACTIF, ET LEQUEL ? Mesuré, pas déclaré.
     `.bg-destination` est un item flex : son `display` calculé n’est pas le
     `-webkit-box` que `.texte-coupe` déclare, donc `-webkit-line-clamp` ne
     peut rien garantir. La garantie est le plafond de hauteur, posé en
     pixels MESURÉS par `tenir-en-lignes.ts`. */
  expect(d.displayParent, 'le cartouche est bien un conteneur flex').toBe('flex');
  expect(d.display, 'un item flex ne rend pas un -webkit-box').not.toBe('-webkit-box');
  expect(d.hauteurMax, 'aucun plafond de hauteur n’est posé').not.toBe('none');
  const plafond = Number.parseFloat(d.hauteurMax);
  expect(Number.isFinite(plafond), `plafond illisible : ${d.hauteurMax}`).toBe(true);
  expect(plafond, 'le plafond vaut deux interlignes au plus')
    .toBeLessThanOrEqual(2 * d.interligne + 0.5);

  /* ET LE PANNEAU RESTE UN PANNEAU : rien ne sort de la tôle, rien ne
     chevauche l’instruction. */
  const c = await page.locator('.bg-cartouche').boundingBox();
  expect(c).not.toBeNull();
  const cadre = c as { x: number; y: number; width: number; height: number };
  expect(d.boite.y + d.boite.hauteur).toBeLessThanOrEqual(cadre.y + cadre.height + 1);
  expect(cadre.x + cadre.width).toBeLessThanOrEqual(360);
  const i = await mesurer(page, '.bg-cartouche .bg-instruction');
  const seCroisent = i.boite.x < d.boite.x + d.boite.largeur
    && i.boite.x + i.boite.largeur > d.boite.x
    && i.boite.y < d.boite.y + d.boite.hauteur
    && i.boite.y + i.boite.hauteur > d.boite.y;
  expect(seCroisent, 'l’instruction et la ligne secondaire se chevauchent').toBe(false);
});
