import { test, expect, type Request } from '@playwright/test';
import { ouvrirVolet } from './volets';
import { retour } from './planificateur';

/* LE BANC PARIS→LYON EN VF8 PLUS — T3, recDF5ZaSt7nXSM0I (11/09/2026).
 * CORRIGÉ le 11/09/2026 (mission Ingénierie 21h, sur les 4 biais relevés par
 * Codex dans handoffs/2026-09-11-0110-codex-mesure-pr305.md) : voir
 * docs/mesure-paris-lyon.md, section « Le piège du chronomètre » et
 * « Ce que corrige cette version », pour le détail des quatre corrections.
 *
 * CE QUE CE PARCOURS MESURE, PAS CE QU'IL DÉMONTRE. Dix calculs de suite du
 * même trajet, plan de recharge automatique inclus (PR #84 : il se déclenche
 * au calcul dès qu'un véhicule électrique est renseigné). Chaque exécution
 * chronomètre du clic sur la suggestion d'arrivée — le geste qui déclenche
 * `#calculer()`, il n'existe pas de bouton « Calculer » séparé, voir
 * panneau-itineraire.ts — jusqu'à ce que le plan de recharge soit RÉELLEMENT
 * là : arrêts posés, ou refus explicite.
 *
 * LE CHRONOMÈTRE NE VIT PLUS CÔTÉ PLAYWRIGHT (correction du biais n°1). Un
 * `expect.poll` ou un `waitForFunction` détecte une mutation avec SON propre
 * délai de scrutation (jusqu'à 1 s pour `expect.poll`) : ce délai s'ajoutait
 * au temps de calcul mesuré, côté Node, alors qu'il ne dit rien du calcul
 * lui-même. On mesure maintenant depuis deux signaux DATÉS PAR LE NAVIGATEUR,
 * capturés en `performance.now()` au moment exact où ils se produisent :
 *   - le départ : l'événement DOM `itineraire-lance`, déjà émis par
 *     `#calculer()` — la toute première ligne de la méthode, dispatché AVANT
 *     tout appel réseau ou attente, et donc indépendant de l'attente
 *     d'actionnabilité que Playwright insère avant son propre `.click()` ;
 *   - la fin : un `MutationObserver` posé une fois pour toutes (au premier
 *     chargement, via `addInitScript`) sur `.iti-recharge-corps`, qui note
 *     l'instant où ce bloc reçoit un enfant `.recharge-resume` OU
 *     `.recharge-refus` — LA PRÉSENCE DES ARRÊTS (ou d'un refus motivé),
 *     jamais un texte transitoire (correction du biais n°2 : la version
 *     précédente guettait la phrase précise « … calcul des arrêts de
 *     recharge… » avant sa disparition, un texte qui peut ne jamais
 *     apparaître à cache chaud si le calcul synchrone qui suit est assez
 *     rapide pour sauter directement au résultat final entre deux
 *     scrutations). `.iti-resultat` a déjà son texte définitif à cet instant
 *     — `#majResume` s'exécute avant la pose des enfants, dans le même bloc
 *     synchrone — donc le relire ensuite via Playwright reste fiable pour le
 *     rapport, seul le CHRONOMÈTRE change de source.
 *
 * UNE PANNE RÉSEAU PENDANT LA FENÊTRE MESURÉE FAIT ÉCHOUER LE TEST,
 * EXPLICITEMENT (correction des biais n°3 et 4). `page.on('requestfailed')`
 * est écouté en plus de `'requestfinished'` — un échec réseau réel (DNS,
 * timeout, abandon) n'émet jamais `'requestfinished'`, et sans cette écoute
 * son attente disparaissait purement et simplement du découpage, retombant
 * dans le calcul local (biais n°4). Une réponse HTTP en erreur (IRVE à 503,
 * par exemple) EST comptée par `'requestfinished'` côté Playwright — c'est
 * une transaction réseau réussie, seule l'application a échoué — donc on
 * vérifie aussi le code de statut : au-delà de 400, c'est un échec (biais
 * n°3 : `#planifierRecharge` retombe alors sur « hors recharge », sans
 * ellipse, et ce cul-de-sac passait pour une mesure aboutie). IRVE ou météo
 * en échec dans la fenêtre d'une itération = itération en échec, avec le
 * détail du poste en cause dans le message — pas une mesure silencieusement
 * faussée.
 *
 * CONTRE LES VRAIES API, DÉLIBÉRÉMENT (mission du 11/09, correction du chef) :
 * aucune tuile simulée, aucune route Playwright interceptée. Les quatre
 * familles de trajet (`itinéraire` Géoplateforme, `altimétrie` Géoplateforme,
 * `météo` Open-Meteo, `IRVE` l'index national des bornes rapides) sont
 * chronométrées par leurs événements réseau réels (`page.on('request'` /
 * `'requestfinished'` / `'requestfailed'`), catégorisées par IP... par URL.
 * L'IRVE ne se télécharge qu'UNE fois (cache IndexedDB, 30 jours, voir
 * lib/index-bornes.ts) : la première exécution paie ~700 Ko, les neuf
 * suivantes le lisent en local — c'est un résultat de la mesure, pas un
 * artefact à corriger ici (« ne corrige rien dans ce cycle »).
 *
 * PAS DANS LA CI PAR DÉFAUT. `test.skip` conditionné à la variable
 * d'environnement `MESURE=1` : exécuter avec
 *   `MESURE=1 npx playwright test tests-e2e/mesure-paris-lyon.spec.ts`
 * (après `npm run build && npm run preview` dans un autre terminal, ou en
 * laissant le `webServer` de playwright.config.ts s'en charger).
 */

test.skip(process.env['MESURE'] !== '1',
  'Banc de mesure réel (réseau IGN/Open-Meteo/IRVE) : réservé à MESURE=1, jamais à la CI.');
// Dix appels réseau réels, IRVE compris au premier tour : largement plus que
// les 30 s par défaut de playwright.config.ts.
test.setTimeout(6 * 60_000);

const DEPART_REQUETE = 'Paris 15e';
const DEPART_ATTENDU = /Paris 15e Arrondissement/;
const ARRIVEE_REQUETE = 'Place Charles Béraudier';
const ARRIVEE_ATTENDUE = /Place Charles B.raudier/;

type Categorie = 'itineraire' | 'altimetrie' | 'meteo' | 'irve';

function categoriser(url: string): Categorie | null {
  if (url.includes('data.geopf.fr/navigation/itineraire')) return 'itineraire';
  if (url.includes('data.geopf.fr/altimetrie')) return 'altimetrie';
  if (url.includes('api.open-meteo.com')) return 'meteo';
  if (url.includes('public.opendatasoft.com')) return 'irve';
  return null;
}

interface AppelReseau {
  iteration: number;
  categorie: Categorie;
  debutMs: number;
  finMs: number;
  dureeMs: number;
  /** Échec réseau réel (`requestfailed`) OU réponse HTTP ≥ 400 : les deux
      comptent comme un échec de ce poste, voir l'en-tête du fichier. */
  echoue: boolean;
  motif?: string;
}

/** Ce que le navigateur date lui-même, en `performance.now()` — voir
    l'en-tête du fichier. `__margeLancements[i]` : l'instant de l'événement
    `itineraire-lance` du i-ème calcul. `__margeFinitions[i]` : l'instant où
    `.iti-recharge-corps` a reçu son enfant `.recharge-resume`/`.recharge-refus`
    du i-ème calcul, et le texte de cet enfant. */
interface FenetreMesure {
  __margeLancements: number[];
  __margeFinitions: { t: number; texte: string }[];
}

interface MesureIteration {
  iteration: number;
  totalMs: number;
  resultatTexte: string;
  itineraireMs: number;
  /** Le plus lent des appels du bloc parallèle (altimétrie, météo×2, IRVE si présent). */
  blocParalleleMs: number;
  /** L'écart mesuré entre la fin de l'itinéraire et le début du bloc parallèle —
      le débounce fixe posé par `#minuteurPlanAuto`, plus l'attente
      (courte) de la lecture du véhicule en IndexedDB. */
  attenteMs: number;
  irveTelecharge: boolean;
  irveMs: number | null;
  meteoMs: number[];
  calculLocalMs: number;
  /** Le poste ajouté par la correction du biais n°4 : les requêtes échouées
      (réseau ou HTTP) de cette itération, sorties du calcul local. Vide dans
      un passage sain — non vide, l'itération a déjà fait échouer le test. */
  echecs: string[];
}

test('Paris 15e → Lyon Part-Dieu, VF8 Plus, 80 % : dix calculs réels, plan de recharge inclus', async ({ page }) => {
  const appels: AppelReseau[] = [];
  const debutsRequetes = new Map<Request, number>();
  let iterationCourante = 0;

  page.on('request', (req) => {
    if (categoriser(req.url())) debutsRequetes.set(req, Date.now());
  });
  page.on('requestfinished', (req) => {
    // L'ITÉRATION SE FIGE ICI, synchrone, avant tout `await` : `response()`
    // est une promesse, et l'attendre pourrait déborder sur l'itération
    // suivante — l'appel doit rester attribué à celle qui l'a lancé.
    const iterationDeCetAppel = iterationCourante;
    const categorie = categoriser(req.url());
    const debut = debutsRequetes.get(req);
    if (!categorie || debut === undefined) return;
    debutsRequetes.delete(req);
    const fin = Date.now();
    void req.response().then((reponse) => {
      const statut = reponse?.status();
      const enErreur = statut !== undefined && statut >= 400;
      appels.push({
        iteration: iterationDeCetAppel, categorie, debutMs: debut, finMs: fin, dureeMs: fin - debut,
        echoue: enErreur, ...(enErreur ? { motif: `HTTP ${statut}` } : {}),
      });
    });
  });
  // BIAIS N°4 — sans cette écoute, une requête qui échoue au sens réseau
  // (jamais de `requestfinished`) disparaissait purement et simplement du
  // découpage, et son attente retombait dans le calcul local.
  page.on('requestfailed', (req) => {
    const categorie = categoriser(req.url());
    const debut = debutsRequetes.get(req);
    if (!categorie || debut === undefined) return;
    debutsRequetes.delete(req);
    const fin = Date.now();
    appels.push({
      iteration: iterationCourante, categorie, debutMs: debut, finMs: fin, dureeMs: fin - debut,
      echoue: true, motif: req.failure()?.errorText ?? 'échec réseau',
    });
  });

  // BIAIS N°1 ET N°2 — posé une seule fois, avant tout chargement de page :
  // voir l'en-tête du fichier pour ce que ces deux signaux mesurent et
  // pourquoi ils remplacent la scrutation Playwright.
  await page.addInitScript(() => {
    const w = window as unknown as FenetreMesure;
    w.__margeLancements = [];
    w.__margeFinitions = [];
    document.addEventListener('itineraire-lance', () => {
      w.__margeLancements.push(performance.now());
    });
    const armer = (): void => {
      const corps = document.querySelector('.iti-recharge-corps');
      if (!corps) { requestAnimationFrame(armer); return; }
      new MutationObserver(() => {
        const fin = corps.querySelector('.recharge-resume, .recharge-refus');
        if (fin) w.__margeFinitions.push({ t: performance.now(), texte: fin.textContent ?? '' });
      }).observe(corps, { childList: true, subtree: true });
    };
    armer();
  });

  await test.step('Véhicule : VinFast VF8 Plus, 80 % de batterie', async () => {
    await page.goto('/');
    await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
    await ouvrirVolet(page, '.vehicule');
    // « VF 8 Plus » ne matcherait pas : la recherche compare la CHAÎNE ENTIÈRE
    // au libellé réduit, et « (Plus) » porte une parenthèse — chercher la
    // marque ouvre tout le groupe VinFast, d'où l'on choisit le bon bouton.
    await page.locator('.veh-recherche').fill('VinFast');
    await page.getByRole('button', { name: 'Choisir VinFast VF 8 (Plus)' }).click();
    await expect(page.getByLabel('Batterie', { exact: true })).toHaveValue('87.7');
    await page.getByLabel('Charge (SOC)').fill('80');
    // ON ATTEND L'ÉCRITURE EN INDEXEDDB (asynchrone), pas le DOM : c'est elle
    // que `#lireVehicule` du planificateur lit avant de déclencher le plan.
    await expect.poll(() => page.evaluate(() => new Promise((ok) => {
      const d = indexedDB.open('infonovice-maps');
      d.onsuccess = () => {
        try {
          const r = d.result.transaction('preferences', 'readonly')
            .objectStore('preferences').get('vehicule');
          r.onsuccess = () => {
            const m = (r.result ?? {}) as {
              vehicule?: { soc?: number; capaciteNominale?: number;
                consommations?: { autoroute?: number } };
            };
            ok({
              soc: m.vehicule?.soc ?? null,
              capacite: m.vehicule?.capaciteNominale ?? null,
              autorouteOk: (m.vehicule?.consommations?.autoroute ?? 0) > 0,
            });
          };
          r.onerror = () => ok('illisible');
        } catch { ok('magasin absent'); }
      };
      d.onerror = () => ok('base illisible');
    })), { timeout: 10_000 }).toEqual({ soc: 80, capacite: 87.7, autorouteOk: true });
  });

  await retour(page);

  const mesures: MesureIteration[] = [];

  for (let i = 1; i <= 10; i += 1) {
    iterationCourante = i;
    await test.step(`Calcul n°${i}`, async () => {
      // DÉPART — « Paris 15e » : la Base Adresse Nationale rend
      // « Paris 15e Arrondissement » en premier résultat (vérifié par appel
      // réel le 11/09/2026, score 0,87).
      const champDepart = page.locator('[data-role="depart"] input');
      await champDepart.fill(DEPART_REQUETE);
      await page.locator('[data-role="depart"] [role="option"]').first().click();
      await expect(champDepart).toHaveValue(DEPART_ATTENDU, { timeout: 10_000 });

      // ARRIVÉE — « Place Charles Béraudier » : l'adresse du parvis de la
      // gare de Lyon Part-Dieu (vérifié par appel réel, score 0,97). LE CLIC
      // SUR LA SUGGESTION DÉCLENCHE `void this.#calculer()`, l'équivalent du
      // bouton « Calculer » qui n'existe pas dans cette interface — mais le
      // CHRONOMÈTRE ne part pas d'ici (biais n°1) : il part de l'événement
      // `itineraire-lance`, daté par le navigateur à l'intérieur de
      // `#calculer()` elle-même.
      const champArrivee = page.locator('[data-role="arrivee"] input');
      await champArrivee.fill(ARRIVEE_REQUETE);
      const optionArrivee = page.locator('[data-role="arrivee"] [role="option"]').first();
      await expect(optionArrivee).toBeVisible({ timeout: 10_000 });

      const { nLanc: nLancAvant, nFin: nFinAvant } = await page.evaluate(() => {
        const w = window as unknown as FenetreMesure;
        return { nLanc: w.__margeLancements.length, nFin: w.__margeFinitions.length };
      });
      await optionArrivee.click();

      // LA FIN DU CALCUL SE RECONNAÎT À LA PRÉSENCE DES ARRÊTS (biais n°2),
      // jamais à un texte transitoire : `.iti-recharge-corps` reçoit un
      // enfant `.recharge-resume` (arrêts posés, ou aucun nécessaire) ou
      // `.recharge-refus` (le plan a été réellement tenté et refusé) —
      // capturé par le `MutationObserver` posé plus haut, en
      // `performance.now()`, indépendamment de la cadence de scrutation de
      // Playwright.
      try {
        await page.waitForFunction(
          ({ nLanc, nFin }) => {
            const w = window as unknown as FenetreMesure;
            return w.__margeLancements.length > nLanc && w.__margeFinitions.length > nFin;
          },
          { nLanc: nLancAvant, nFin: nFinAvant },
          { timeout: 30_000, polling: 'raf' },
        );
      } catch (e) {
        // BIAIS N°3 — si le plan n'arrive jamais, ce n'est presque toujours
        // pas un hasard : l'IRVE (ou la météo, silencieusement, voir plus
        // bas) a échoué et `#planifierRecharge` est retombé sur
        // « hors recharge » sans jamais écrire `.recharge-resume`/`-refus`.
        // Le dire au lieu de laisser le délai nu parler à sa place.
        const enCause = appels.filter((a) => a.iteration === i && a.echoue
          && (a.categorie === 'irve' || a.categorie === 'meteo'));
        if (enCause.length > 0) {
          throw new Error(`itération ${i} : le plan de recharge n'est jamais arrivé — `
            + `requête(s) IRVE/météo en échec : ${enCause.map((a) => `${a.categorie} (${a.motif})`).join(', ')}`);
        }
        throw e;
      }

      const { t0, t1, resultatFinTexte } = await page.evaluate(
        ({ nLanc, nFin }) => {
          const w = window as unknown as FenetreMesure;
          const origine = performance.timeOrigin;
          return {
            t0: origine + w.__margeLancements[nLanc]!,
            t1: origine + w.__margeFinitions[nFin]!.t,
            resultatFinTexte: w.__margeFinitions[nFin]!.texte,
          };
        },
        { nLanc: nLancAvant, nFin: nFinAvant },
      );
      void resultatFinTexte; // conservé pour diagnostic ; le rapport lit `.iti-resultat`, écrit plus tôt (voir en-tête).

      // Vérifié APRÈS le chronométrage : ça ne coûte rien à la mesure, et ça
      // garantit que chaque tour a bien calculé LE MÊME trajet.
      await expect(champArrivee).toHaveValue(ARRIVEE_ATTENDUE);

      const resultat = page.locator('.iti-resultat');
      const resultatTexte = (await resultat.textContent()) ?? '';
      const totalMs = t1 - t0;

      const appelsIteration = appels.filter((a) => a.iteration === i);
      // BIAIS N°3, suite — un échec IRVE/météo qui n'a PAS empêché
      // `.recharge-resume`/`-refus` d'apparaître (la météo, en particulier,
      // se rattrape en silence sur 20 °C par défaut : `#chargerConditions`
      // avale son erreur et le plan sort quand même) fausse tout de même la
      // mesure — le test échoue explicitement plutôt que de publier un
      // chiffre qui ne correspond pas aux conditions réelles du trajet.
      const echecsIrveMeteo = appelsIteration.filter((a) => a.echoue
        && (a.categorie === 'irve' || a.categorie === 'meteo'));
      expect(echecsIrveMeteo,
        `itération ${i} : requête IRVE ou météo en échec pendant la fenêtre mesurée — `
        + echecsIrveMeteo.map((a) => `${a.categorie} (${a.motif})`).join(', ')).toEqual([]);

      const itineraire = appelsIteration.find((a) => a.categorie === 'itineraire' && !a.echoue);
      const meteoMs = appelsIteration.filter((a) => a.categorie === 'meteo' && !a.echoue).map((a) => a.dureeMs);
      const altimetrie = appelsIteration.find((a) => a.categorie === 'altimetrie' && !a.echoue);
      const irve = appelsIteration.find((a) => a.categorie === 'irve' && !a.echoue);
      const echecs = appelsIteration.filter((a) => a.echoue).map((a) => `${a.categorie} (${a.motif})`);

      const itineraireMs = itineraire?.dureeMs ?? 0;
      const finItineraire = itineraire?.finMs ?? t0;
      const blocDebuts = appelsIteration
        .filter((a) => a.categorie !== 'itineraire')
        .map((a) => a.debutMs);
      const blocDebut = blocDebuts.length > 0 ? Math.min(...blocDebuts) : finItineraire;
      const blocFins = appelsIteration
        .filter((a) => a.categorie !== 'itineraire')
        .map((a) => a.finMs);
      const blocFin = blocFins.length > 0 ? Math.max(...blocFins) : blocDebut;
      const blocParalleleMs = blocFin - blocDebut;
      const attenteMs = Math.max(0, blocDebut - finItineraire);
      const calculLocalMs = Math.max(0, totalMs - itineraireMs - attenteMs - blocParalleleMs);

      mesures.push({
        iteration: i,
        totalMs,
        resultatTexte,
        itineraireMs,
        blocParalleleMs,
        attenteMs,
        irveTelecharge: irve !== undefined,
        irveMs: irve?.dureeMs ?? null,
        meteoMs,
        calculLocalMs,
        echecs,
      });

      test.info().annotations.push({
        type: `mesure-${i}`,
        description: `${totalMs} ms — itinéraire ${itineraireMs} ms, attente ${attenteMs} ms,`
          + ` bloc parallèle ${blocParalleleMs} ms (altimétrie ${altimetrie?.dureeMs ?? '—'} ms,`
          + ` météo ${meteoMs.join('/')} ms, IRVE ${irve?.dureeMs ?? 'cache'} ms),`
          + ` local ${calculLocalMs} ms${echecs.length > 0 ? `, échecs [${echecs.join(', ')}]` : ''}`
          + ` — « ${resultatTexte} »`,
      });
    });

    if (i < 10) {
      await page.locator('.iti-effacer').click();
      await expect(page.locator('[data-role="depart"] input')).toHaveValue('');
    }
  }

  // ---- Le rapport chiffré, dans la sortie du test (et repris dans
  // docs/mesure-paris-lyon.md par la mission). ----
  const tries = [...mesures].sort((a, b) => a.totalMs - b.totalMs);
  const total = tries.map((m) => m.totalMs);
  const min = total[0]!;
  const mediane = (total[4]! + total[5]!) / 2;
  // p95 sur 10 valeurs, rang au plus proche (méthode « nearest-rank ») :
  // ceil(0.95 × 10) = 10 — c'est le maximum.
  const p95 = total[9]!;

  const tableau = mesures.map((m) => (
    `${m.iteration}. ${m.totalMs} ms — itinéraire ${m.itineraireMs} ms, attente ${m.attenteMs} ms,`
    + ` bloc parallèle ${m.blocParalleleMs} ms, local ${m.calculLocalMs} ms,`
    + ` IRVE ${m.irveTelecharge ? `téléchargé (${m.irveMs} ms)` : 'cache'}`
    + (m.echecs.length > 0 ? `, échecs [${m.echecs.join(', ')}]` : '')
  )).join('\n');

  test.info().annotations.push({
    type: 'resultat-final',
    description: `min ${min} ms · médiane ${mediane} ms · p95 ${p95} ms\n${tableau}`,
  });

  // eslint-disable-next-line no-console
  console.log(
    '\n=== MESURE PARIS→LYON VF8 PLUS (T3) ===\n'
    + `min ${min} ms · médiane ${mediane} ms · p95 ${p95} ms\n${tableau}\n`,
  );

  // LE BANC PROUVE QU'IL A TOURNÉ, PAS UN SEUIL DE PERFORMANCE PAR DÉFAUT :
  // cette tâche mesure. L'assertion garde le parcours honnête : dix calculs
  // aboutis, un plan de recharge réellement tenté à chaque fois (VF8 Plus en
  // voiture électrique), et aucune requête IRVE/météo en échec pendant la
  // fenêtre mesurée (vérifié itération par itération, plus haut).
  expect(mesures).toHaveLength(10);
  for (const m of mesures) {
    expect(m.resultatTexte, `itération ${m.iteration}`).not.toContain('…');
    expect(m.itineraireMs, `itération ${m.iteration} : pas de réponse itinéraire IGN captée`)
      .toBeGreaterThan(0);
  }
});
