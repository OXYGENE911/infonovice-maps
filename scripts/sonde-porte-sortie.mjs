/* SONDE — DURÉE DE VIE DE LA PORTE DE SORTIE, ET CRITÈRE DES 5 s (SEUIL-1, 13/09/2026).
 *
 * Deux mesures, une seule sonde, une seule garde :
 *   --porte     chronomètre la durée pendant laquelle « Réessayer » reste
 *               RÉELLEMENT utilisable, service d'itinéraire ralenti à 25 s.
 *   --campagne  six sessions froides, critère des 5 s.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ LE 13/09 APRÈS LA CONTRE-MESURE, ET POURQUOI C'EST GRAVE.
 *
 * Le vérificateur indépendant a établi que CETTE SONDE NE MESURAIT PAS CE
 * QU'ELLE ANNONÇAIT. Trois fautes, du même genre : un nombre juste
 * d'apparence, faux de sens.
 *
 *   1. `--campagne` relevait `performance.now()` juste après le chargement de
 *      la page et l'appelait `chargementMs`. Ce n'est pas la durée du calcul
 *      d'itinéraire. **Six chiffres seraient sortis, et aucun n'aurait parlé du
 *      critère des 5 s.** Nous aurions cru mesurer.
 *   2. La « durée de vie » du bouton valait `(fermee ?? dernierRegard) - ouverte` :
 *      si la porte ne se referme pas — c'est-à-dire si le correctif marche —
 *      le nombre rendu était celui de NOTRE OBSERVATION.
 *   3. L'empreinte du bundle était contrôlée après `page.goto` mais AVANT le
 *      déclenchement du calcul. Or le panneau d'itinéraire est en import
 *      dynamique : mesuré le 13/09, `panneau-itineraire-*.js` n'est cité ni
 *      dans `dist/index.html` ni dans ses `modulepreload`. Le fichier qui
 *      porte la mesure n'était jamais empreinté.
 *
 * La règle qui en sort, et qui tient cette sonde entière : **un chiffre produit
 * par un instrument qui mesure autre chose que ce qu'il annonce est une mesure
 * inventée par l'outil.** Les verdicts vivent donc dans `chrono-sonde.mjs`,
 * en fonctions PURES, et ils rendent `null` plutôt qu'un nombre qu'on ne peut
 * pas défendre.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * LA GARDE S'APPLIQUE AUX DEUX MODES, SANS EXCEPTION. On aurait pu exempter
 * « --porte » en arguant qu'une durée de minuteur souffre moins de la charge
 * qu'un temps de chargement. On ne l'a pas fait : une exception taillée pour sa
 * propre commodité est exactement le contournement que la règle du 13/09
 * interdit (CLAUDE.md, « Validité d'une campagne de mesure »).
 *
 * LES TROIS PIÈGES DÉJÀ PAYÉS, tenus ici par construction :
 *   1. cache chaud — un contexte navigateur NEUF par itération, cache HTTP et
 *      IndexedDB vides ; jamais deux mesures dans le même onglet ;
 *   2. port partagé — un port dédié, jamais celui d'un « npm run preview » qui
 *      traîne ;
 *   3. bundle périmé — l'empreinte de chaque fichier servi est comparée à celle
 *      de « dist/ » APRÈS le scénario, donc après l'import dynamique, et la
 *      sonde EXIGE d'avoir vu le chunk du panneau d'itinéraire.
 *
 * ÉTAT DE CETTE SONDE AU 13/09/2026, à lire avant de se fier à un chiffre
 * qu'elle produirait : sur ce poste, la garde REFUSE (24 à 30 processus
 * résidents pour un plafond de 20). Le chemin de mesure situé APRÈS la garde
 * n'a donc jamais été exercé ici — il est écrit, il n'est pas éprouvé en
 * navigateur sur ce poste. Ce qui EST éprouvé : les verdicts, en tests
 * unitaires (`tests/chrono-sonde.test.ts`), et le chronomètre lui-même contre
 * le vrai produit avec un retard CONNU, en CI (`tests-e2e/sonde-chrono.spec.ts`).
 */
import {
  readFileSync, existsSync, writeFileSync, readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exigerMachineAuRepos, compterProcessus, jugerDerive,
} from './garde-processus.mjs';
import {
  SCRIPT_OBSERVATEUR, jugerCalcul, jugerPorte, comparerEmpreintes,
  exigerFichiersAttendus,
} from './chrono-sonde.mjs';
import { servirDist, empreinte } from './serveur-dist.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RACINE, 'dist');
const mode = process.argv.includes('--campagne') ? 'campagne' : 'porte';
const ITERATIONS = mode === 'campagne' ? 6 : 1;

/* LES FICHIERS QUI PORTENT LA MESURE, et sans lesquels le contrôle servi/dist
   ne contrôle rien. `panneau-itineraire` est en import DYNAMIQUE : c'est tout
   le défaut n° 3 de la contre-mesure. */
const FICHIERS_QUI_COMPTENT = ['panneau-itineraire'];

/* L'ESSAI DE DIVERGENCE — « montre par un essai que le contrôle attrape bien
   une divergence sur ce fichier-là » (mission du 13/09, tâche 1c). Avec
   `--essai-divergence=<motif>`, le serveur altère UN OCTET de chaque fichier
   servi dont le chemin contient ce motif. Le contrôle doit alors sortir en
   erreur. Une garde qu'on n'a jamais vue se déclencher n'est pas une garde ;
   celle-ci se déclenche sur commande, et sur le fichier de notre choix. */
const essaiDivergence = (process.argv.find((a) => a.startsWith('--essai-divergence=')) ?? '')
  .split('=')[1] ?? null;

/* ─── 1. LA GARDE, AVANT TOUT LE RESTE ─────────────────────────────────────
   Rien n'est servi, aucun navigateur n'est lancé tant que la machine n'a pas
   été jugée au repos. L'ORDRE COMPTE : démarrer le serveur ou le navigateur
   d'abord ajouterait des processus au compte qu'on est en train de prendre. */
console.error(`=== SONDE ${mode.toUpperCase()} — ${new Date().toISOString()} ===`);
if (essaiDivergence) {
  console.error(`[essai] DIVERGENCE PROVOQUÉE sur les fichiers contenant « ${essaiDivergence} ».`
    + ' Ce n’est pas une campagne : c’est la démonstration que le contrôle servi/dist mord.');
}
const compteDebut = exigerMachineAuRepos();

/* ─── 2. LES EMPREINTES DE RÉFÉRENCE ──────────────────────────────────────── */
if (!existsSync(DIST)) {
  console.error(`dist/ absent (${DIST}) — lancer « npm run build » d'abord.`);
  process.exit(3);
}
const ACTIFS = join(DIST, 'assets');
const empreintesDist = new Map();
for (const f of readdirSync(ACTIFS)) {
  empreintesDist.set(`/assets/${f}`, empreinte(readFileSync(join(ACTIFS, f))));
}
console.error(`[bundle] ${empreintesDist.size} fichiers empreintés dans dist/assets`);

/* ─── 3. PORT DÉDIÉ ───────────────────────────────────────────────────────── */
const { port: PORT, servi: serviCeTour, fermer: fermerServeur } = await servirDist(DIST, essaiDivergence);
console.error(`[port] port dédié ${PORT}`);

const { chromium } = await import('playwright');
const URL_ITI = /data\.geopf\.fr\/navigation\/itineraire/;
/* LA FENÊTRE D'OBSERVATION. En mode porte, on regarde bien au-delà du plafond
   dur (16 500 ms) pour voir la porte se refermer SI elle se referme. En mode
   campagne, 60 s est un abandon, pas une mesure : au-delà, la sonde écrit
   qu'aucun plan n'est venu et ne publie AUCUNE durée. */
const FENETRE_MS = mode === 'porte' ? 46_000 : 60_000;
const releves = [];

for (let i = 1; i <= ITERATIONS; i += 1) {
  /* CONTEXTE NEUF — c'est lui qui vide le cache HTTP ET IndexedDB : un contexte
     Playwright neuf part d'un profil vierge. Rejouer dans le même onglet
     mesurerait le cache chaud (piège n° 1, déjà payé). */
  const navigateur = await chromium.launch({ headless: true });
  const contexte = await navigateur.newContext({ serviceWorkers: 'block' });
  const page = await contexte.newPage();
  serviCeTour.clear();

  /* L'OBSERVATEUR EST POSÉ AVANT LE PREMIER OCTET DE PAGE : il commence à
     regarder au document vierge, donc `debutObservationA` est bien le début de
     l'observation et non l'instant où nous avons pensé à l'installer. */
  await page.addInitScript(SCRIPT_OBSERVATEUR);

  if (mode === 'porte') {
    /* SERVICE D'ITINÉRAIRE RALENTI À 25 s : plus long que le plafond dur de
       calculerItineraire (16 500 ms = 2 × 8 000 + 500), donc les DEUX essais
       expirent et la promesse REJETTE — exactement le cas où l'ancien code
       refermait la porte de sortie sur l'usager. */
    await page.route(URL_ITI, async (route) => {
      await new Promise((r) => { setTimeout(r, 25_000); });
      await route.abort('timedout');
    });
  }

  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  const chargementMs = Math.round(await page.evaluate(() => performance.now()));

  const releve = mode === 'porte'
    ? await mesurerPorte(page)
    : await mesurerCalcul(page);

  /* ─── L'EMPREINTE DU SERVI CONTRE dist/ — APRÈS LE SCÉNARIO (piège n° 3) ───
     Ici, et pas plus tôt : le panneau d'itinéraire arrive par import dynamique,
     et le contrôler avant son chargement revenait à ne pas le contrôler. */
  const comparaison = comparerEmpreintes(serviCeTour, empreintesDist);
  const exigence = exigerFichiersAttendus([...serviCeTour.keys()], FICHIERS_QUI_COMPTENT);
  console.error(`[bundle] ${comparaison.verifies.length} fichiers vérifiés après le scénario`
    + ` — ${exigence.motif}`);
  if (!comparaison.conforme) {
    console.error('[bundle] DIVERGENCE SERVI/dist — LA MESURE NE PART PAS.');
    if (comparaison.divergences.length) {
      console.error(`[bundle]   empreintes différentes : ${comparaison.divergences.join(', ')}`);
    }
    if (comparaison.inconnus.length) {
      console.error(`[bundle]   servis sans référence : ${comparaison.inconnus.join(', ')}`);
    }
    await navigateur.close(); await fermerServeur(); process.exit(4);
  }
  if (!exigence.ok) {
    /* UN CONTRÔLE QUI N'A JAMAIS VU LE FICHIER N'EST PAS UN CONTRÔLE : on sort
       en erreur au lieu de publier une mesure « vérifiée » qui ne l'est pas. */
    console.error(`[bundle] ${exigence.motif}`);
    await navigateur.close(); await fermerServeur(); process.exit(5);
  }

  releves.push({
    iteration: i,
    /* NOMMÉ POUR CE QU'IL EST. Ce champ s'appelait `chargementMs` et servait
       de mesure du critère des 5 s : c'était le défaut n° 1. Il reste au
       relevé parce qu'il renseigne — mais il ne prétend plus rien d'autre. */
    chargementPageMs: chargementMs,
    murMs: Date.now() - t0,
    ...releve,
    fichiersVerifies: comparaison.verifies.length,
    fichiersQuiComptent: FICHIERS_QUI_COMPTENT.map((m) =>
      [...serviCeTour.keys()].find((c) => c.includes(m)) ?? null),
  });
  console.error(`[${mode}] itération ${i} : ${JSON.stringify(releves.at(-1))}`);
  await navigateur.close();
}
await fermerServeur();

/* ─── 4. COMPTE DE FIN ET DÉRIVE ──────────────────────────────────────────── */
const compteFin = compterProcessus();
const derive = jugerDerive(compteDebut.total, compteFin.total);
const releve = {
  mode,
  horodatageFin: new Date().toISOString(),
  port: PORT,
  fenetreObservationMs: FENETRE_MS,
  essaiDivergence,
  processusDebut: compteDebut,
  processusFin: compteFin,
  derive,
  releves,
};
console.error(`[garde] fin : node=${compteFin.node} chrome=${compteFin.chrome} total=${compteFin.total}`);
console.error(`[garde] ${derive.motif}`);
const sortie = join(RACINE, `releve-${mode}-${Date.now()}.json`);
writeFileSync(sortie, JSON.stringify(releve, null, 2), 'utf8');
console.log(JSON.stringify(releve, null, 2));
console.error(`[sortie] ${sortie}`);

/**
 * Chronomètre la durée pendant laquelle « Réessayer » est RÉELLEMENT utilisable.
 *
 * « UTILISABLE » N'EST PAS « PRÉSENT DANS LE DOM » : le bouton doit être
 * visible, non désactivé, et atteignable au clic — `elementFromPoint` en son
 * centre doit tomber sur lui. Un bouton recouvert par un voile n'est pas une
 * porte, et la leçon « un test qui clique à la souris ne prouve rien » vaut
 * aussi pour un test qui se contente de lire `hidden`.
 *
 * LE VERDICT N'EST PAS PRIS ICI mais dans `jugerPorte` : une porte qui ne se
 * referme pas n'a pas de durée de vie, et c'est la fonction pure — éprouvée
 * dans les deux sens — qui refuse d'en publier une.
 */
async function mesurerPorte(page) {
  await declencherCalcul(page);
  await page.waitForTimeout(FENETRE_MS);
  const brut = await page.evaluate(() => window.__sonde.lire());
  return { brut, porte: jugerPorte(brut) };
}

/**
 * CHRONOMÈTRE LE CALCUL D'ITINÉRAIRE — la mesure que `--campagne` prétendait
 * faire et ne faisait pas.
 *
 * DÉFINITION, reprise mot pour mot de `docs/infonovice-maps/mesure-mobile.md`
 * §1 pour que le chiffre du poste et celui du téléphone se comparent :
 *   — le chronomètre PART au geste qui lance le calcul (ici, le clic sur la
 *     suggestion de destination : le calcul part tout seul dès que les deux
 *     points sont posés) ;
 *   — il S'ARRÊTE quand le plan de recharge est lisible — pas quand
 *     l'animation d'attente disparaît, pas quand la carte bouge.
 *
 * LE VÉHICULE EST SAISI AVANT D'ARMER LE CHRONOMÈTRE. Sans profil, le produit
 * affiche « Renseignez d'abord votre véhicule » — et la sonde mesurerait alors
 * la vitesse à laquelle on refuse de calculer.
 */
async function mesurerCalcul(page) {
  await preparerVehicule(page);
  await declencherCalcul(page);

  /* ON OUVRE LA PAGE « RECHARGE » comme le ferait l'usager, pour pouvoir dire
     aussi quand le plan est VISIBLE à l'écran. Cette navigation est un geste
     d'opérateur : son coût va dans `dureeAffichageMs`, jamais dans
     `dureeCalculMs`. Si elle échoue, la mesure du critère tient quand même. */
  let navigationRecharge = null;
  try {
    await page.locator('.iti-vers[data-vers="recharge"]').click({ timeout: 20_000 });
    navigationRecharge = 'ouverte';
  } catch {
    navigationRecharge = 'impossible — dureeAffichageMs ne veut alors rien dire';
  }

  try {
    await page.waitForFunction(() => window.__sonde.planPretA !== null,
      undefined, { timeout: FENETRE_MS });
  } catch {
    /* PAS DE PLAN DANS LA FENÊTRE : on ne rallonge pas la fenêtre jusqu'à
       obtenir un chiffre. On rend le constat, et `jugerCalcul` refusera de
       publier une durée. */
    console.error(`[campagne] aucun plan de recharge après ${FENETRE_MS} ms observées.`);
  }
  const brut = await page.evaluate(() => window.__sonde.lire());
  return { brut, calcul: jugerCalcul(brut), navigationRecharge };
}

/**
 * Saisit un profil véhicule par l'INTERFACE, comme un usager.
 *
 * PAR LE FORMULAIRE, PAS PAR IndexedDB : deux versions du parcours E2E ont
 * poussé directement dans la base et couru contre l'écriture d'un profil vide
 * que l'application persiste au démarrage — « Renseignez d'abord votre
 * véhicule » une fois sur trois, en accusant le code au lieu du test.
 *
 * LES VALEURS SONT CELLES DE LA FEUILLE DE RELEVÉ MOBILE : VinFast VF 8 Plus,
 * 80 % au départ. Deux chiffres comparables doivent décrire la même voiture.
 */
async function preparerVehicule(page) {
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 20_000 });
  await page.locator('.iti > summary').click();
  await page.locator('.iti-vers[data-vers="vehicule"]').click();
  await page.getByLabel('Batterie', { exact: true }).fill('87.7');
  await page.getByLabel('Santé (SOCE)').fill('100');
  await page.getByLabel('Charge (SOC)').fill('80');
  await page.getByLabel('Charge max', { exact: true }).fill('150');
  await page.getByLabel('Sur autoroute').fill('280');
  /* LE BILAN CONFIRME QUE LE PROFIL EST PRIS EN COMPTE avant de continuer :
     une précondition qu'on n'attend pas est une course qu'on parie. */
  await page.locator('.veh-bilan-lignes').filter({ hasText: 'Sur autoroute' })
    .waitFor({ timeout: 10_000 });
  await page.locator('.vue-retour').click();
  await page.locator('.vue-accueil').waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Ouvre le panneau d'itineraire et lance un calcul Paris -> Lyon.
 *
 * LES SELECTEURS VIENNENT DU SCENARIO E2E EXISTANT (tests-e2e/accueil.spec.ts),
 * pas d'une lecture approximative du source : la premiere version de cette
 * sonde visait `.iti-depart input` et `.iti-calculer`, qui n'existent nulle
 * part dans le panneau (revue Codex du 13/09, constat SERIEUX). Le panneau se
 * pilote par ses deux champs de recherche et leurs suggestions de geocodage,
 * et le calcul part TOUT SEUL des que les deux points sont poses : il n'y a pas
 * de bouton « Calculer » a cliquer.
 *
 * LE GEOCODAGE EST SIMULE, L'ITINERAIRE NON. On mesure la porte de sortie du
 * calcul d'itineraire ; faire dependre la mesure de la latence reelle de la BAN
 * ajouterait une variable qui n'a rien a voir avec ce qu'on chronometre — et
 * sur la feuille mobile, le geocodage est DEJA fini quand le chronometre part.
 */
async function declencherCalcul(page) {
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const requete = new URL(route.request().url()).searchParams.get('q') ?? '';
    const estLyon = /lyon/i.test(requete);
    const libelle = estLyon ? 'Lyon' : 'Paris';
    const coords = estLyon ? [4.8357, 45.7640] : [2.3522, 48.8566];
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        features: [{
          geometry: { coordinates: coords },
          properties: {
            label: libelle, type: 'municipality', postcode: '', city: libelle,
          },
        }],
      }),
    });
  });

  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 20_000 });
  if (await page.locator('.iti[open]').count() === 0) {
    await page.locator('.iti > summary').click();
  }
  const champs = page.locator('.iti input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');
  /* LE CHRONOMÈTRE EST ARMÉ ICI, JUSTE AVANT LE GESTE QUI LANCE LE CALCUL —
     et pas plus tôt : armé avant le premier clic, il aurait daté le départ du
     choix de la ville de départ, qui ne lance rien. L'écoute est en phase de
     capture, donc l'horodatage précède le code de l'application. */
  await page.evaluate(() => window.__sonde.armer());
  await page.getByRole('option', { name: 'Lyon' }).first().click();
  /* LE CALCUL EST PARTI — on le verifie plutot que de le supposer : sans ce
     temoin, une sonde qui n'aurait rien declenche rendrait `ouverteA: null` et
     se lirait comme « la porte ne s'est jamais ouverte », ce qui est un tout
     autre constat. */
  await page.locator('.iti-resultat').waitFor({ state: 'visible', timeout: 10_000 });
}
