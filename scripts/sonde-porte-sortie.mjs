/* SONDE — DURÉE DE VIE DE LA PORTE DE SORTIE, ET CRITÈRE DES 5 s (SEUIL-1, 13/09/2026).
 *
 * Deux mesures, une seule sonde, une seule garde :
 *   --porte     chronomètre la durée pendant laquelle « Réessayer » reste
 *               RÉELLEMENT utilisable, service d'itinéraire ralenti à 25 s.
 *   --campagne  six sessions froides, critère des 5 s.
 *
 * LA GARDE S'APPLIQUE AUX DEUX, SANS EXCEPTION. On aurait pu exempter
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
 *      de « dist/ » AVANT toute mesure ; à la moindre divergence, on sort.
 *
 * ÉTAT DE CETTE SONDE AU 13/09/2026, à lire avant de se fier à un chiffre
 * qu'elle produirait : sur ce poste, la garde REFUSE (30 processus résidents
 * pour un plafond de 20). Le chemin de mesure situé APRÈS la garde n'a donc
 * jamais été exercé ici — il est écrit, il n'est pas éprouvé. Le dire est le
 * but de cette note ; publier un chiffre qui en sortirait sans l'avoir vu
 * tourner serait exactement la faute que la mission interdit.
 */
import { createServer } from 'node:http';
import {
  readFileSync, existsSync, writeFileSync, readdirSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exigerMachineAuRepos, compterProcessus, jugerDerive,
} from './garde-processus.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RACINE, 'dist');
const mode = process.argv.includes('--campagne') ? 'campagne' : 'porte';
const ITERATIONS = mode === 'campagne' ? 6 : 1;
const empreinte = (octets) => createHash('sha256').update(octets).digest('hex').slice(0, 16);

/* ─── 1. LA GARDE, AVANT TOUT LE RESTE ─────────────────────────────────────
   Rien n'est servi, aucun navigateur n'est lancé tant que la machine n'a pas
   été jugée au repos. L'ORDRE COMPTE : démarrer le serveur ou le navigateur
   d'abord ajouterait des processus au compte qu'on est en train de prendre. */
console.error(`=== SONDE ${mode.toUpperCase()} — ${new Date().toISOString()} ===`);
const compteDebut = exigerMachineAuRepos();

/* ─── 2. LE BUNDLE SERVI EST BIEN CELUI DE dist/ ──────────────────────────── */
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
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
const serviCeTour = new Map();
const serveur = createServer((req, res) => {
  const chemin = decodeURIComponent(req.url.split('?')[0]);
  const fichier = chemin === '/' ? join(DIST, 'index.html') : join(DIST, chemin);
  if (!fichier.startsWith(DIST) || !existsSync(fichier)) {
    res.writeHead(404); res.end('non trouvé'); return;
  }
  const octets = readFileSync(fichier);
  if (chemin.startsWith('/assets/')) serviCeTour.set(chemin, empreinte(octets));
  /* AUCUN CACHE : le contexte est déjà neuf, mais on ne laisse pas un en-tête
     décider à notre place de ce que le navigateur relit. */
  res.writeHead(200, {
    'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream',
    'cache-control': 'no-store, max-age=0',
  });
  res.end(octets);
});
const PORT = 41000 + Math.floor(Math.random() * 3000);
await new Promise((ok, ko) => { serveur.once('error', ko); serveur.listen(PORT, '127.0.0.1', ok); });
console.error(`[port] port dédié ${PORT}`);

const { chromium } = await import('playwright');
const URL_ITI = /data\.geopf\.fr\/navigation\/itineraire/;
const releves = [];

for (let i = 1; i <= ITERATIONS; i += 1) {
  /* CONTEXTE NEUF — c'est lui qui vide le cache HTTP ET IndexedDB : un contexte
     Playwright neuf part d'un profil vierge. Rejouer dans le même onglet
     mesurerait le cache chaud (piège n° 1, déjà payé). */
  const navigateur = await chromium.launch({ headless: true });
  const contexte = await navigateur.newContext({ serviceWorkers: 'block' });
  const page = await contexte.newPage();
  serviCeTour.clear();

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

  /* EMPREINTE DU SERVI CONTRE dist/ (piège n° 3). */
  const divergences = [...serviCeTour.entries()]
    .filter(([c, e]) => empreintesDist.get(c) !== e).map(([c]) => c);
  if (divergences.length) {
    console.error(`[bundle] DIVERGENCE servi/dist : ${divergences.join(', ')}`);
    await navigateur.close(); serveur.close(); process.exit(4);
  }

  if (mode === 'porte') {
    const releve = await mesurerPorte(page);
    releves.push({ iteration: i, ...releve, fichiersVerifies: serviCeTour.size });
  } else {
    const pret = await page.evaluate(() => performance.now());
    releves.push({
      iteration: i,
      chargementMs: Math.round(pret),
      murMs: Date.now() - t0,
      fichiersVerifies: serviCeTour.size,
    });
  }
  console.error(`[${mode}] itération ${i} : ${JSON.stringify(releves.at(-1))}`);
  await navigateur.close();
}
serveur.close();

/* ─── 4. COMPTE DE FIN ET DÉRIVE ──────────────────────────────────────────── */
const compteFin = compterProcessus();
const derive = jugerDerive(compteDebut.total, compteFin.total);
const releve = {
  mode,
  horodatageFin: new Date().toISOString(),
  port: PORT,
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
 */
async function mesurerPorte(page) {
  await page.evaluate(() => {
    const w = window;
    w.__porte = { ouverte: null, fermee: null, dernierRegard: performance.now() };
    const utilisable = () => {
      const b = document.querySelector('.iti-abandon-reessayer');
      if (!b || b.disabled || b.hidden) return false;
      const bloc = b.closest('.iti-abandon-service');
      if (bloc && bloc.hidden) return false;
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!dessus && (dessus === b || b.contains(dessus));
    };
    const boucle = () => {
      const ok = utilisable();
      const t = performance.now();
      if (ok && w.__porte.ouverte === null) w.__porte.ouverte = t;
      if (!ok && w.__porte.ouverte !== null && w.__porte.fermee === null) w.__porte.fermee = t;
      w.__porte.dernierRegard = t;
      requestAnimationFrame(boucle);
    };
    requestAnimationFrame(boucle);
  });

  await declencherCalcul(page);

  /* On observe bien au-delà du plafond dur (16 500 ms) : assez pour voir la
     porte se refermer si elle se referme, et pour publier une durée MINIMALE
     observée si elle ne se referme pas. Une porte qui ne se referme pas n'a pas
     de « durée de vie » au sens ancien : on publie alors la durée observée et
     le fait qu'aucune fermeture n'a eu lieu. */
  const FIN_OBSERVATION = 46_000;
  await page.waitForTimeout(FIN_OBSERVATION);
  return page.evaluate(() => {
    const p = window.__porte;
    return {
      ouverteA: p.ouverte === null ? null : Math.round(p.ouverte),
      fermeeA: p.fermee === null ? null : Math.round(p.fermee),
      dureeDeVieMs: p.ouverte === null ? null
        : Math.round((p.fermee ?? p.dernierRegard) - p.ouverte),
      refermee: p.fermee !== null,
      observationArreteeA: Math.round(p.dernierRegard),
    };
  });
}

/**
 * Ouvre le panneau d'itinéraire et lance un calcul.
 *
 * CE CHEMIN N'A JAMAIS ÉTÉ EXERCÉ SUR CE POSTE (garde en refus) : les
 * sélecteurs viennent de la lecture de `src/carte/panneau-itineraire.ts`, pas
 * d'une exécution réussie. Le premier qui fera tourner cette sonde sur une
 * machine au repos doit s'attendre à les ajuster, et ne doit surtout pas
 * prendre l'absence d'erreur ici pour une preuve que le calcul est parti :
 * `mesurerPorte` rend `ouverteA: null` dans ce cas, ce qui se lit.
 */
async function declencherCalcul(page) {
  const champDepart = page.locator('.iti-depart input, input.iti-depart').first();
  const champArrivee = page.locator('.iti-arrivee input, input.iti-arrivee').first();
  await champDepart.fill('2.3522, 48.8566');
  await champDepart.press('Enter');
  await champArrivee.fill('4.8357, 45.7640');
  await champArrivee.press('Enter');
  await page.locator('.iti-calculer, button.iti-calculer').first().click();
}
