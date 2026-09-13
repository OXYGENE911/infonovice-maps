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
 */
import { execFileSync } from 'node:child_process';

/** Au-delà de ce nombre de processus résidents, aucune mesure n'est valide. */
export const PLAFOND_PROCESSUS = 20;

/** Au-delà de cette hausse entre le début et la fin, la campagne est suspecte. */
export const HAUSSE_SUSPECTE = 3;

/**
 * Compte les processus `node` et `chrome` résidents.
 * Windows : `tasklist` (aucune dépendance, aucun PowerShell à démarrer — en
 * démarrer un fausserait le compte qu'on est en train de prendre).
 */
export function compterProcessus() {
  const compter = (image) => {
    try {
      const sortie = execFileSync(
        'tasklist',
        ['/FI', `IMAGENAME eq ${image}`, '/NH', '/FO', 'CSV'],
        { encoding: 'utf8', windowsHide: true },
      );
      /* tasklist répond « INFO: No tasks are running… » quand il n'y en a
         aucun : cette ligne n'est pas une ligne CSV, elle ne compte pas. */
      return sortie.split(/\r?\n/)
        .filter((l) => l.trim().startsWith('"'))
        .length;
    } catch {
      /* Un comptage impossible n'est PAS un comptage à zéro : on ne laisse
         jamais une panne d'outil ouvrir la porte à une campagne non gardée. */
      return Number.NaN;
    }
  };
  const node = compter('node.exe');
  const chrome = compter('chrome.exe');
  return { node, chrome, total: node + chrome, horodatage: new Date().toISOString() };
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
        + 'pour faire passer une mesure (CLAUDE.md, « Validité d\u2019une campagne '
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
    journaliser('Aucune mesure n\u2019a été prise. Ce n\u2019est pas un avertissement.');
    /* SORTIE EN ERREUR, CODE 2, ET PAS UNE EXCEPTION LAISSÉE LIBRE : mesuré
       le 13/09, une exception non rattrapée sort avec le code 1 de Node et la
       trace d'appel — le code de refus voulu (2) était écrasé, et un appelant
       qui distingue « refus de la garde » d'« erreur de la sonde » se serait
       trompé. On sort donc ici, explicitement. */
    process.exit(2);
  }
  journaliser(`[garde] ${verdict.motif} La campagne peut démarrer.`);
  return compte;
}
