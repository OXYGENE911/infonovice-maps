import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* DEUX MENUS RENDUS INUTILISABLES PAR ERGO-5, ET LEUR RÉPARATION
 * (ERGO-6, 02/09).
 *
 * LE TERRAIN, capture d'écran à l'appui. Armelin :
 *   1. « bug d'affichage quand on ouvre les filtres de carte […] le bouton
 *      "tout afficher" dépasse du cadre et casse toute la mise en place
 *      obligeant à scroller de haut en bas ou défiler de gauche à droite […]
 *      le menu de recharge est devenu inutilisable, on ne comprend pas où
 *      cliquer » ;
 *   2. « quand on clic sur le bouton "Trajets habituels" il ne se passe
 *      rien » et « le menu n'est pas affiché en entier à l'écran, il faut
 *      scroller vers le bas ».
 *
 * DEUX CAUSES, ET AUCUNE N'ÉTAIT VISIBLE DANS UN TEST D'ATTRIBUT :
 *   1. le rappel ambre était resté À L'INTÉRIEUR du conteneur flex de la
 *      ligne des bornes : troisième élément d'une rangée, il se réduisait à
 *      une colonne de quelques caractères et son bouton débordait ;
 *   2. `.iti-routines` portait `display: flex`, qui bat la règle par défaut
 *      de l'attribut `hidden` : la liste était TOUJOURS ouverte, le bouton
 *      qui devait la replier ne changeait rien, et les deux lignes qu'ERGO-5
 *      devait ranger poussaient toujours le menu hors de l'écran.
 *
 * CES PARCOURS MESURENT LA GÉOMÉTRIE, pas les attributs : c'est précisément
 * ce que les tests d'ERGO-5 ne faisaient pas. */

const MOBILE = { width: 412, height: 915 };

/* ON SÈME UN VRAI TRAJET HABITUEL, on n'en injecte pas un dans le DOM.
   Injecter marchait par hasard : le planificateur relit ses raccourcis de
   façon ASYNCHRONE et remet la ligne à `hidden` quand il ne trouve aucune
   habitude — écrasant l'injection une fraction de seconde plus tard. Le
   parcours dépendait donc de l'ordre d'arrivée de deux promesses. */
const MARDI_MATIN = new Date(2026, 7, 25, 8, 15);

async function semerTravail(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((ok, non) => {
      const d = indexedDB.open('infonovice-maps', 2);
      d.onsuccess = () => ok(d.result);
      d.onerror = () => non(d.error);
    });
    await new Promise<void>((ok) => {
      const t = db.transaction('preferences', 'readwrite');
      t.objectStore('preferences').put({
        lon: 2.2945, lat: 48.8584, libelle: '5 avenue Anatole France, Paris',
        defini: '2026-08-25T07:00:00.000Z',
      }, 'repere-travail');
      t.oncomplete = () => ok();
    });
  });
}


async function ouvrirCarte(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

/* ON OUVRE L'ENTONNOIR LUI-MÊME, pas un volet qu'il héberge : `ouvrirVolet`
   avec « .poi » désigne le panneau de RECHARGE, qui vit dedans, et mène donc
   à sa page. Ces parcours-ci veulent la première page. */
async function ouvrirEntonnoir(page: Page): Promise<void> {
  await page.locator('.poi-bulle').click();
  await expect(page.locator('.poi-panneau')).toBeVisible();
}

test('LE PANNEAU DE RECHARGE NE DÉBORDE PAS, rappel compris', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await ouvrirCarte(page);
  await ouvrirEntonnoir(page);

  /* ON SÈME UN RAPPEL LONG, celui de la capture d'écran : c'est sa longueur
     qui faisait éclater la rangée, et un rappel court n'aurait rien prouvé. */
  await page.evaluate(() => {
    const boite = document.querySelector<HTMLElement>('.poi-rappel-bornes');
    const texte = document.querySelector<HTMLElement>('.poi-rappel-texte');
    if (!boite || !texte) throw new Error('rappel introuvable');
    texte.textContent = 'Bornes filtrées : 6 réseaux cochés · nom « Zunder »'
      + ' · 150 kW et plus · prises CCS Combo';
    boite.hidden = false;
  });

  const rappel = page.locator('.poi-rappel-bornes');
  await expect(rappel).toBeVisible();

  /* LE RAPPEL EST SOUS LA RANGÉE, PAS DEDANS : s'il en était un élément, sa
     boîte partagerait le haut de celle des boutons. */
  const ligne = await page.locator('.poi-ligne-bornes').boundingBox();
  const boite = await rappel.boundingBox();
  const bouton = await page.locator('.poi-rappel-tout').boundingBox();
  expect(ligne && boite && bouton, 'géométrie illisible').toBeTruthy();
  expect(boite!.y, 'le rappel est resté DANS la rangée des boutons')
    .toBeGreaterThanOrEqual(ligne!.y + ligne!.height - 1);

  /* ET « TOUT AFFICHER » TIENT DANS SON CADRE — c'est le débordement de la
     capture d'écran, au pixel près. */
  expect(bouton!.x + bouton!.width,
    'le bouton « Tout afficher » déborde du rappel')
    .toBeLessThanOrEqual(boite!.x + boite!.width + 1);

  /* LE PANNEAU ENTIER TIENT DANS LA LARGEUR DE L'ÉCRAN : c'est le « défiler
     de gauche à droite » qu'Armelin décrit. */
  const panneau = await page.locator('.poi-panneau').boundingBox();
  expect(panneau!.x + panneau!.width,
    'le panneau des filtres dépasse la largeur de l’écran')
    .toBeLessThanOrEqual(MOBILE.width + 1);

  /* LA ROUE CRANTÉE EST UNE ROUE, PAS UN SOLEIL : ses dents tiennent à la
     couronne, donc son tracé est un contour FERMÉ (« Z »), là où le premier
     dessin n'était qu'un cercle et huit rayons détachés. */
  const roue = await page.locator('.poi-reglages-bornes svg').innerHTML();
  expect(roue.toLowerCase()).toContain('z"');
  expect(roue).toContain('<circle');
});

test('LA LISTE DES TRAJETS HABITUELS SE REPLIE VRAIMENT', async ({ page }) => {
  await page.clock.install({ time: MARDI_MATIN });
  await page.setViewportSize(MOBILE);
  await ouvrirCarte(page);
  await semerTravail(page);
  /* LE VOLET RELIT SES RACCOURCIS À L'OUVERTURE — on l'ouvre, on le ferme,
     on le rouvre, comme l'usager qui revient. Trois gestes, et le troisième
     laisse le volet OUVERT : c'est la même séquence que le parcours des
     routines, et le nombre impair n'est pas un détail. */
  await page.locator('.iti > summary').click();
  await page.locator('.iti > summary').click();
  await page.locator('.iti > summary').click();

  const liste = page.locator('.iti-routines');
  const ouvrir = page.getByRole('button', { name: 'Trajets habituels récents' });

  /* REPLIÉE AU DÉPART — c'est toute la promesse d'ERGO-5, et elle n'a jamais
     tenu : `display: flex` battait l'attribut `hidden`. */
  await expect(liste, 'la liste s’affiche alors qu’elle est marquée hidden')
    .toBeHidden();

  await ouvrir.click();
  await expect(liste, 'le clic n’a rien ouvert').toBeVisible();
  await expect(ouvrir).toHaveAttribute('aria-expanded', 'true');

  await ouvrir.click();
  await expect(liste, 'le clic n’a rien refermé').toBeHidden();
});

test('LE MENU ITINÉRAIRE TIENT À L’ÉCRAN, sans défilement', async ({ page }) => {
  await page.clock.install({ time: MARDI_MATIN });
  await page.setViewportSize(MOBILE);
  await ouvrirCarte(page);
  /* MÊME AVEC UN TRAJET HABITUEL À PROPOSER : c'est le cas d'Armelin, et
     c'est celui où le menu débordait. */
  await semerTravail(page);
  await page.locator('.iti > summary').click();
  await page.locator('.iti > summary').click();
  await page.locator('.iti > summary').click();
  await expect(page.locator('.iti-routines-ligne')).toBeVisible();

  /* « OPTIONS DU TRAJET » EST LA DERNIÈRE ENTRÉE PERMANENTE : si elle est
     visible sans défiler, le menu tient. Armelin : « il faut absolument que
     le menu Itinéraire s'affiche en entier au complet quand on clic dessus,
     sans avoir à scroller ». */
  const derniere = page.locator('.iti-vers[data-vers="options"]');
  await expect(derniere).toBeVisible();
  /* ON SONDE, ON NE MESURE PAS UNE FOIS : la feuille se redimensionne quand
     le contenu arrive, et le contenu arrive de lectures asynchrones. Une
     mesure unique attraperait parfois l'instant d'avant — c'est ce qui a fait
     passer ce parcours seul et échouer dans la suite complète. */
  await expect.poll(async () => {
    const b = await derniere.boundingBox();
    return b ? Math.round(b.y + b.height) : Number.POSITIVE_INFINITY;
  }, { timeout: 5_000, message: 'la dernière entrée du menu tombe sous le bas de l’écran' })
    .toBeLessThanOrEqual(MOBILE.height);
});

/* LES RÉGLAGES DE BORNES ONT LEUR PROPRE PAGE (ERGO-7, 02/09).
 *
 * Armelin : « quand la configuration du filtre de borne de recharge s'ouvre,
 * il devrait s'ouvrir dans une fenêtre dédiée et pas afficher un menu
 * interminable à scroller en plus des POI à afficher. Seulement le menu de
 * charge avec une flèche retour pour revenir aux POI sera peut-être plus
 * adapté et ergonomique ? »
 *
 * C'EST LA MÊME LEÇON QUE LE PLANIFICATEUR avait apprise le 26/08 : deux
 * réglages dépliés l'un sous l'autre forment un couloir, pas une interface. */

test('LA ROUE MÈNE À UNE PAGE, la flèche en revient', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await ouvrirCarte(page);
  await ouvrirEntonnoir(page);

  const familles = page.locator('.poi-vue-familles');
  const reglages = page.locator('.poi-vue-recharge');
  await expect(familles).toBeVisible();
  await expect(reglages).toBeHidden();

  await page.locator('.poi-reglages-bornes').click();

  /* UNE SEULE PAGE À L'ÉCRAN : c'est tout le sens de la demande. Les quatorze
     pastilles ne doivent PLUS être là pendant qu'on règle les bornes. */
  await expect(reglages).toBeVisible();
  await expect(familles, 'les familles de POI sont restées sous les réglages')
    .toBeHidden();
  await expect(page.locator('.poi-vue-titre')).toHaveText('Bornes de recharge');

  /* ET LE VOLET DES RÉGLAGES EST OUVERT : sur sa propre page, un `<details>`
     fermé demanderait un geste de plus pour atteindre ce qu'on vient
     chercher. */
  await expect(page.locator('.poi-hote-recharge .poi')).toHaveAttribute('open', '');

  await page.getByRole('button', { name: 'Revenir aux lieux à afficher' }).click();
  await expect(familles).toBeVisible();
  await expect(reglages).toBeHidden();
});

test('REFERMER L’ENTONNOIR RAMÈNE À LA PREMIÈRE PAGE', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await ouvrirCarte(page);
  await ouvrirEntonnoir(page);
  await page.locator('.poi-reglages-bornes').click();
  await expect(page.locator('.poi-vue-recharge')).toBeVisible();

  /* ON REFERME PAR L'ENTONNOIR, puis on rouvre : l'entonnoir s'ouvre pour
     choisir ce qui s'affiche, et retomber sur les réglages des bornes parce
     qu'on y était la dernière fois surprendrait. */
  await page.locator('.poi-bulle').click();
  await expect(page.locator('.poi-panneau')).toBeHidden();
  await page.locator('.poi-bulle').click();
  await expect(page.locator('.poi-vue-familles')).toBeVisible();
  await expect(page.locator('.poi-vue-recharge')).toBeHidden();
});
