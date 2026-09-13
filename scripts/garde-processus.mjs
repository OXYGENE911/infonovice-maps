/* LA GARDE DE CHARGE D'UNE CAMPAGNE DE MESURE (SEUIL-1, 13/09/2026).
 *
 * Règle posée par le CEO le 13/09 et inscrite dans CLAUDE.md : « Une campagne
 * démarrée avec plus de 20 processus résidents est INVALIDE : la sonde refuse
 * de mesurer, l'écrit, et sort en erreur. » Ce n'est pas un avertissement
 * qu'on peut ignorer, et le seuil ne se relâche pas pour faire passer une
 * mesure.
 *
 * POURQUOI CE MODULE EXISTE PLUTÔT QU'UNE CONSIGNE À RESPECTER DE TÊTE : deux
 * campagnes se sont déjà contredites d'un soir à l'autre, mesurées sous la
 * charge de nos propres agents. Une règle qu'on applique de mémoire est une
 * règle qu'on oublie la nuit où elle gêne. Celle-ci sort en erreur.
 *
 * LA DÉCISION EST UNE FONCTION PURE (`deciderValidite`), séparée du comptage :
 * c'est ce qui permet de la tester dans les deux sens — refus ET acceptation —
 * sans dépendre de l'état de la machine au moment du test. Une garde qu'on
 * n'a jamais vue se déclencher n'est pas une garde ; une garde qu'on ne peut
 * pas voir NE PAS se déclencher n'en est pas une non plus.
 *
 * PRINCIPE QUI REVIENT TROIS FOIS ICI : **ne pas savoir n'est jamais un feu
 * vert.** Un comptage impossible n'est pas un comptage à zéro, et une dérive
 * incalculable n'est pas une dérive nulle. Les deux cas refusent.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, readlinkSync } from 'node:fs';

/** Au-delà de ce nombre de processus résidents, aucune mesure n'est valide. */
export const PLAFOND_PROCESSUS = 20;

/** Au-delà de cette hausse entre le début et la fin, la campagne est suspecte. */
export const HAUSSE_SUSPECTE = 3;

/**
 * Compte les processus `node` et `chrome` résidents.
 *
 * DEUX SYSTÈMES, PARCE QUE LA SUITE TOURNE SUR LES DEUX (revue Codex du 13/09,
 * constat BLOQUANT) : `tasklist` n'existe pas sur la CI Ubuntu du projet, et un
 * comptage qui y rendait NaN faisait échouer le test de comptage réel à chaque
 * exécution. Windows : `tasklist`. Ailleurs : `ps`. Dans les deux cas on évite
 * de démarrer un interpréteur (PowerShell, shell) — en démarrer un fausserait
 * le compte qu'on est justement en train de prendre.
 */
/* LES DEUX FAMILLES COMPTÉES, ET POURQUOI CE N'EST PAS UNE ÉGALITÉ SIMPLE
   (revue Codex du 13/09, second passage, constat SÉRIEUX).
   La version précédente comparait le nom de base à l'égalité (`nom === 'chrome'`)
   pour éviter de compter `chrome_crashpad_handler`. Elle ratait du même coup
   TOUT le Chromium de Playwright, qui ne s'appelle pas `chrome` : selon la
   plateforme et la version, c'est `chrome-headless`, `headless_shell` ou
   `chromium`. Sortie `ps` simulée par la revue : 1 `node` + 24
   `chrome-headless` donnait un total de 1, et la campagne repartait — une garde
   qui sous-compte est pire que pas de garde, parce qu'elle rassure.
   La règle est donc : un préfixe de famille, moins les processus auxiliaires
   qui ne sont pas des navigateurs (crashpad, sandbox, GPU helper). */
/* DES NOMS EXACTS, PAS DES PRÉFIXES — et c'est la troisième version de ce
   comptage, chacune corrigeant une faute que la revue a trouvée :
     v1  `nom === 'chrome'` : ratait tout le Chromium de Playwright, qui ne
         s'appelle jamais « chrome » (24 navigateurs comptés pour zéro) ;
     v2  préfixe `chrome` moins quelques exclusions : reconnaissait bien
         Playwright, mais comptait AUSSI `chromedriver` — et, du côté node,
         `nodemon` : une garde qui sur-compte refuse des machines pourtant au
         repos, ce qui pousse à relâcher le seuil, c'est-à-dire exactement ce
         que la règle interdit ;
     v3  une LISTE EXPLICITE de noms exacts. Elle se lit, se revoit, et ne
         surprend personne : ni `chromedriver`, ni `nodemon`, ni
         `chrome_crashpad_handler`, ni `chrome-sandbox` n'y sont, et aucun ne
         peut y entrer par accident de préfixe.
   Si un binaire nouveau doit compter, on l'ajoute ici, et la revue le voit. */
const FAMILLES = {
  node: ['node'],
  chrome: [
    'chrome', 'chromium', 'chromium-browser',
    /* Les noms sous lesquels Playwright lance Chromium selon la version et la
       plateforme — c'est CE processus-là qui charge la machine pendant une
       campagne, donc celui qu'il est vital de compter. */
    'chrome-headless', 'chrome-headless-shell', 'headless_shell',
    /* macOS : le navigateur lance un processus par onglet et par service, tous
       nommés « … Helper (Renderer) », « … Helper (GPU) »… Le rôle entre
       parenthèses est retiré avant la comparaison (voir `estDeLaFamille`), donc
       ces deux noms-là suffisent à couvrir toute la famille — et c'est elle qui
       charge la machine : 24 onglets, 24 processus (revue Codex, 4ᵉ passage). */
    'Google Chrome', 'Google Chrome Helper',
    'Chromium', 'Chromium Helper',
  ],
};

/**
 * Ce nom de processus compte-t-il dans la famille demandée ? Fonction PURE,
 * exportée pour être éprouvée sur des noms réels sans dépendre de la machine —
 * c'est elle qui porte toute la logique de comptage, et donc tout le risque.
 */
export function estDeLaFamille(nom, famille) {
  const noms = FAMILLES[famille];
  if (!noms || typeof nom !== 'string') return false;
  /* On retient le nom de base : `ps` peut rendre un chemin, `tasklist` rend
     toujours un nom d'image avec son extension. Puis on retire le RÔLE entre
     parenthèses que macOS accole aux processus auxiliaires du navigateur
     (« Google Chrome Helper (Renderer) ») : sans cela, les 24 processus d'un
     navigateur à 24 onglets ne se comptaient pas du tout. Le retrait ne peut
     pas faire entrer d'intrus, la comparaison restant une égalité exacte. */
  const base = nom.trim()
    .split(/[/\\]/).pop()
    .replace(/\.exe$/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase();
  if (!base) return false;
  return noms.some((n) => n.toLowerCase() === base);
}

/* ─── D'OÙ VIENT LE NOM D'UN PROCESSUS, ET POURQUOI CE N'EST PAS ANODIN ──────
   (défaut n° 5 de la contre-mesure du 13/09, trouvé par la CI elle-même.)

   v4 de ce comptage. Les trois premières discutaient QUELS noms compter ; la
   CI Ubuntu a montré que le problème était en amont : D'OÙ on lit le nom.

   `ps -o comm=` lit `/proc/<pid>/comm` sous Linux. Node y écrit `process.title`
   — et Vitest renomme ses processus. La CI a donc compté **0 processus node
   alors que node l'exécutait**. Un processus qui se renomme échappait au
   comptage : notre garde de validité était adossée à un compteur aveugle, et
   « sous 20 » ne prouvait rien.

   LA SOURCE QUI NE MENT PAS, PAR SYSTÈME :
     Linux  `/proc/<pid>/exe` — un lien symbolique posé par le NOYAU vers
            l'exécutable réel. Un processus ne peut pas le réécrire, quoi qu'il
            fasse de son titre. C'est la source de vérité.
     Windows `tasklist` rend le NOM D'IMAGE, lu du noyau lui aussi.
            `process.title` y change le titre de la console, jamais l'image.
     Autres POSIX (macOS, BSD) : `ps -o comm=` rend le chemin de l'exécutable,
            que `uv_set_process_title` ne réécrit pas sur ces systèmes.

   CE QUE LA SOURCE FIABLE NE PEUT PAS FAIRE : lire `/proc/<pid>/exe` d'un
   processus d'un AUTRE utilisateur rend EACCES. On retombe alors sur `comm`
   pour ce pid-là — et on COMPTE ces retombées dans `nonResolus`, au lieu de
   faire comme si de rien n'était. Un relevé qui annonce 12 processus dont 40
   non résolus ne se lit pas comme un relevé qui en annonce 12 tout court. */

/** Le nom d'un processus lu à sa source FIABLE. `null` si le pid a disparu. */
export function nomFiable(pid) {
  if (process.platform === 'linux') {
    try {
      return { nom: readlinkSync(`/proc/${pid}/exe`).replace(/ \(deleted\)$/, ''), source: 'exe' };
    } catch {
      /* EACCES (autre utilisateur) ou ESRCH (processus fini) : on retombe sur
         `comm`, en le DISANT. Ne pas savoir n'est jamais un feu vert — ici,
         c'est un compte déclaré non résolu, pas un compte silencieusement nul. */
      try {
        return { nom: readFileSync(`/proc/${pid}/comm`, 'utf8').trim(), source: 'comm' };
      } catch { return null; }
    }
  }
  if (process.platform === 'win32') {
    /* `tasklist /FI "PID eq <pid>"` rend le NOM D'IMAGE du noyau : `process.title`
       n'y touche pas — sous Windows il ne change que le titre de la console. */
    try {
      const sortie = execFileSync('tasklist', ['/NH', '/FO', 'CSV', '/FI', `PID eq ${pid}`],
        { encoding: 'utf8', windowsHide: true });
      const ligne = sortie.split(/\r?\n/).find((l) => l.trim().startsWith('"'));
      if (!ligne) return null;
      return { nom: ligne.slice(1, ligne.indexOf('","')), source: 'image' };
    } catch { return null; }
  }
  /* macOS, BSD : `ps -o comm=` rend le chemin de l'exécutable. */
  try {
    const sortie = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' });
    const nom = sortie.trim();
    return nom ? { nom, source: 'comm' } : null;
  } catch { return null; }
}

/**
 * Le nom d'un processus lu à la source NOMINATIVE — celle que ce comptage
 * employait jusqu'au 13/09, et qu'un processus peut réécrire en changeant son
 * titre. Exportée POUR ÊTRE COMPARÉE à `nomFiable` sur le même pid au même
 * instant : c'est la seule façon de montrer ce que l'ancien compteur ratait,
 * au lieu de l'affirmer.
 */
export function nomNominatif(pid) {
  if (process.platform === 'linux') {
    /* C'EST ICI QUE L'ANCIEN COMPTEUR ÉTAIT AVEUGLE : `/proc/<pid>/comm` est
       alimenté par `process.title`, et Vitest renomme ses processus. */
    try { return readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { return null; }
  }
  if (process.platform === 'win32') {
    /* Sous Windows, l'ancien comptage lisait DÉJÀ le nom d'image : cette
       plateforme-là n'a jamais été aveugle, et il faut le dire plutôt que de
       laisser croire que la correction y change quelque chose. */
    return nomFiable(pid)?.nom ?? null;
  }
  try {
    const sortie = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' });
    return sortie.trim() || null;
  } catch { return null; }
}

/**
 * Compte les processus `node` et `chrome` résidents, à la source fiable.
 *
 * @returns {{node:number, chrome:number, total:number, horodatage:string,
 *            source:string, nonResolus:number}}
 */
export function compterProcessus() {
  /* UNE SEULE LECTURE DE LA TABLE DES PROCESSUS, filtrée ensuite en mémoire.
     Windows v2 interrogeait `tasklist` par nom exact, image par image : les
     noms absents de la requête (`chrome-headless.exe`) n'étaient jamais rendus,
     et le sous-comptage survivait à la correction censée le supprimer (revue
     Codex, 3ᵉ passage). On liste tout, on filtre avec `estDeLaFamille` — la
     MÊME fonction sur les trois chemins, donc un seul comportement à éprouver. */
  const lireNoms = () => {
    if (process.platform === 'win32') {
      const sortie = execFileSync('tasklist', ['/NH', '/FO', 'CSV'],
        { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
      const noms = sortie.split(/\r?\n/)
        .filter((l) => l.trim().startsWith('"'))
        /* CSV de tasklist : "image","pid","session",… — le nom est le 1er champ. */
        .map((l) => l.slice(1, l.indexOf('","')));
      return { noms, source: 'tasklist (nom d’image, noyau)', nonResolus: 0 };
    }
    if (process.platform === 'linux') {
      /* LA SOURCE DE VÉRITÉ : le lien `exe` de chaque pid. C'est CE chemin qui
         voit les processus Vitest que `comm` ratait. */
      const pids = readdirSync('/proc').filter((e) => /^\d+$/.test(e));
      const noms = [];
      let nonResolus = 0;
      for (const pid of pids) {
        const lu = nomFiable(pid);
        if (!lu) continue;              // processus disparu entre-temps
        if (lu.source !== 'exe') nonResolus += 1;
        noms.push(lu.nom);
      }
      return { noms, source: '/proc/<pid>/exe (lien du noyau)', nonResolus };
    }
    /* macOS, BSD : `ps -A -o comm=` rend le chemin de l'exécutable, que
       `uv_set_process_title` ne réécrit pas sur ces systèmes. */
    const noms = execFileSync('ps', ['-A', '-o', 'comm='],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split(/\r?\n/);
    return { noms, source: 'ps -o comm= (chemin de l’exécutable)', nonResolus: 0 };
  };
  let lu;
  try {
    lu = lireNoms();
  } catch {
    /* Un comptage impossible n'est PAS un comptage à zéro : on ne laisse jamais
       une panne d'outil ouvrir la porte à une campagne non gardée. */
    return {
      node: Number.NaN, chrome: Number.NaN, total: Number.NaN,
      horodatage: new Date().toISOString(),
      source: 'comptage impossible', nonResolus: Number.NaN,
    };
  }
  const node = lu.noms.filter((n) => estDeLaFamille(n, 'node')).length;
  const chrome = lu.noms.filter((n) => estDeLaFamille(n, 'chrome')).length;
  return {
    node,
    chrome,
    total: node + chrome,
    horodatage: new Date().toISOString(),
    source: lu.source,
    nonResolus: lu.nonResolus,
  };
}

/**
 * Décide si une campagne peut démarrer. Fonction pure : elle ne lit rien, elle
 * ne fait que trancher — d'où sa testabilité dans les deux sens.
 * @returns {{valide: boolean, motif: string}}
 */
export function deciderValidite(compteDebut, plafond = PLAFOND_PROCESSUS) {
  if (!Number.isFinite(compteDebut)) {
    return {
      valide: false,
      motif: `comptage de processus impossible (${compteDebut}) — une campagne `
        + 'non comptée est une campagne non gardée, donc invalide.',
    };
  }
  if (compteDebut > plafond) {
    return {
      valide: false,
      motif: `${compteDebut} processus résidents au démarrage, plafond ${plafond}. `
        + 'Campagne REJETÉE : la mesure ne part pas. Le seuil ne se relâche pas '
        + 'pour faire passer une mesure (CLAUDE.md, « Validité d’une campagne '
        + 'de mesure », CEO 13/09/2026).',
    };
  }
  return { valide: true, motif: `${compteDebut} processus résidents, sous le plafond ${plafond}.` };
}

/**
 * Juge l'écart entre le compte de fin et celui de début. Une campagne qui finit
 * nettement plus chargée qu'elle n'a commencé a mesuré autre chose que ce
 * qu'elle croyait : quelque chose a démarré pendant qu'on mesurait.
 */
export function jugerDerive(compteDebut, compteFin, hausseSuspecte = HAUSSE_SUSPECTE) {
  const hausse = compteFin - compteDebut;
  /* UNE DÉRIVE INCALCULABLE EST SUSPECTE, PAS TOLÉRABLE (revue Codex du 13/09).
     `NaN > 3` vaut false : sans ce garde, l'échec du comptage de fin rendait
     « Dérive NaN processus, dans le tolérable » et la campagne repartait
     blanchie. Même principe que dans `deciderValidite` : ne pas savoir n'est
     jamais un feu vert. */
  if (!Number.isFinite(hausse)) {
    return {
      hausse,
      suspecte: true,
      motif: `SUSPECTE : dérive incalculable (début ${compteDebut}, fin ${compteFin}). `
        + 'Un comptage de fin impossible ne vaut pas une campagne propre.',
    };
  }
  return {
    hausse,
    suspecte: hausse > hausseSuspecte,
    motif: hausse > hausseSuspecte
      ? `SUSPECTE : ${compteDebut} processus au début, ${compteFin} à la fin `
        + `(+${hausse}). Quelque chose a démarré pendant la mesure ; les relevés `
        + 'ne décrivent pas une machine au repos.'
      : `Dérive ${hausse >= 0 ? '+' : ''}${hausse} processus, dans le tolérable.`,
  };
}

/**
 * La porte elle-même : compte, tranche, et SORT EN ERREUR si le compte est
 * dépassé. Rendue séparément de `deciderValidite` parce que celle-ci doit
 * rester pure ; c'est ici, et seulement ici, que le processus meurt.
 */
export function exigerMachineAuRepos(journaliser = console.error) {
  const compte = compterProcessus();
  const verdict = deciderValidite(compte.total);
  journaliser(`[garde] node=${compte.node} chrome=${compte.chrome} `
    + `total=${compte.total} plafond=${PLAFOND_PROCESSUS} (${compte.horodatage})`);
  if (!verdict.valide) {
    journaliser('');
    journaliser('CAMPAGNE REJETÉE AUTOMATIQUEMENT.');
    journaliser(verdict.motif);
    journaliser('');
    journaliser('Aucune mesure n’a été prise. Ce n’est pas un avertissement.');
    /* SORTIE EN ERREUR, CODE 2, ET PAS UNE EXCEPTION LAISSÉE LIBRE : mesuré le
       13/09, une exception non rattrapée sort avec le code 1 de Node et la
       trace d'appel — le code de refus voulu (2) était écrasé, et un appelant
       qui distingue « refus de la garde » d'« erreur de la sonde » se serait
       trompé. On sort donc ici, explicitement. */
    process.exit(2);
  }
  journaliser(`[garde] ${verdict.motif} La campagne peut démarrer.`);
  return compte;
}
