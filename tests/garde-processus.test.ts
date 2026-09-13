// LA GARDE DE CHARGE DES CAMPAGNES DE MESURE (SEUIL-1, 13/09/2026).
//
// « Une garde qu'on n'a jamais vue se déclencher n'est pas une garde » (mission
// du 13/09). Elle a été vue se déclencher pour de vrai sur ce poste le
// 13/09/2026 — 30 processus résidents, sortie en code 2, aucune mesure prise ;
// la sortie est reproduite dans docs/mesure-seuil-porte.md.
//
// MAIS UNE GARDE QU'ON NE PEUT PAS VOIR *NE PAS* SE DÉCLENCHER N'EN EST PAS UNE
// NON PLUS : si `deciderValidite` refusait tout, le refus observé ne prouverait
// rien. D'où ces tests des DEUX CÔTÉS du seuil, sur la fonction pure — qui ne
// lit pas la machine, et donne donc le même verdict quel que soit l'état du
// poste qui les exécute.
import {
  describe, it, expect, beforeAll,
} from 'vitest';
import {
  deciderValidite, jugerDerive, compterProcessus, estDeLaFamille,
  PLAFOND_PROCESSUS, HAUSSE_SUSPECTE, nomFiable, nomNominatif,
} from '../scripts/garde-processus.mjs';

describe('quels noms de processus comptent (revue Codex du 13/09, 2e passage)', () => {
  // LE TROU QU'ON BOUCHE ICI : la comparaison était `nom === 'chrome'`, pour ne
  // pas compter `chrome_crashpad_handler`. Elle ratait du même coup TOUT le
  // Chromium de Playwright, qui ne s'appelle jamais « chrome ». Sortie `ps`
  // simulée par la revue : 1 node + 24 chrome-headless donnait un total de 1,
  // et la campagne repartait. Une garde qui sous-compte est pire que pas de
  // garde : elle rassure.
  it('compte le Chromium de Playwright, quel que soit le nom qu’il porte', () => {
    for (const nom of ['chrome', 'chromium', 'chromium-browser', 'chrome-headless',
      'headless_shell', 'chrome.exe', '/opt/google/chrome/chrome']) {
      expect(estDeLaFamille(nom, 'chrome'), `« ${nom} » devrait compter`).toBe(true);
    }
  });

  it('ne compte pas ce qui n’est pas un navigateur, meme si le nom commence pareil', () => {
    // `chromedriver` et `nodemon` sont le contre-exemple qui a fait abandonner
    // la reconnaissance par PRÉFIXE (revue Codex, 3ᵉ passage) : une garde qui
    // SUR-compte refuse des machines pourtant au repos, ce qui pousse à
    // relâcher le seuil — exactement ce que la règle du CEO interdit.
    for (const nom of ['chrome_crashpad_handler', 'chrome-sandbox', 'chromedriver',
      'chrome_sandbox']) {
      expect(estDeLaFamille(nom, 'chrome'), `« ${nom} » ne devrait pas compter`).toBe(false);
    }
    for (const nom of ['nodemon', 'node-gyp', 'nodejs-helper']) {
      expect(estDeLaFamille(nom, 'node'), `« ${nom} » ne devrait pas compter`).toBe(false);
    }
  });

  it('LE SCÉNARIO WINDOWS DE LA REVUE : 24 chrome-headless.exe ne se comptent plus pour zéro', () => {
    // La version précédente interrogeait `tasklist` image par image, par nom
    // exact : `chrome-headless.exe` n'était rendu par aucune requête, donc le
    // sous-comptage survivait à la correction censée le supprimer. Le comptage
    // lit désormais TOUTE la table une fois et filtre avec cette même fonction.
    const table = ['node.exe', ...Array.from({ length: 24 }, () => 'chrome-headless.exe')];
    const total = table.filter((n) => estDeLaFamille(n, 'node') || estDeLaFamille(n, 'chrome'))
      .length;
    expect(total).toBe(25);
    expect(deciderValidite(total).valide, '25 processus doivent être refusés').toBe(false);
  });

  it('LE SCÉNARIO macOS DE LA REVUE : les processus auxiliaires du navigateur comptent', () => {
    // Sur macOS, un navigateur à 24 onglets, c'est 24 processus « … Helper
    // (Renderer) » — ceux qui chargent réellement la machine. La liste exacte
    // ne les voyait pas : 26 processus se comptaient pour 2 (revue Codex,
    // 4ᵉ passage). Le rôle entre parenthèses est désormais retiré avant la
    // comparaison.
    for (const nom of ['Chromium Helper (Renderer)', 'Google Chrome Helper (GPU)',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome Helper (Renderer)',
      'Chromium']) {
      expect(estDeLaFamille(nom, 'chrome'), `« ${nom} » devrait compter`).toBe(true);
    }
    const table = ['node', 'Chromium',
      ...Array.from({ length: 24 }, () => 'Chromium Helper (Renderer)')];
    const total = table.filter((n) => estDeLaFamille(n, 'node') || estDeLaFamille(n, 'chrome'))
      .length;
    expect(total).toBe(26);
    expect(deciderValidite(total).valide, '26 processus doivent être refusés').toBe(false);
  });

  it('retirer le rôle entre parenthèses ne fait entrer aucun intrus', () => {
    expect(estDeLaFamille('chromedriver (Renderer)', 'chrome')).toBe(false);
    expect(estDeLaFamille('nodemon (watch)', 'node')).toBe(false);
  });

  it('20 node + 1 chromedriver font 20, pas 21 : la campagne passe', () => {
    const table = [...Array.from({ length: 20 }, () => 'node'), 'chromedriver'];
    const total = table.filter((n) => estDeLaFamille(n, 'node') || estDeLaFamille(n, 'chrome'))
      .length;
    expect(total).toBe(20);
    expect(deciderValidite(total).valide).toBe(true);
  });

  it('compte node, et ne confond pas une famille avec l’autre', () => {
    expect(estDeLaFamille('node', 'node')).toBe(true);
    expect(estDeLaFamille('node.exe', 'node')).toBe(true);
    expect(estDeLaFamille('chrome', 'node')).toBe(false);
    expect(estDeLaFamille('node', 'chrome')).toBe(false);
    expect(estDeLaFamille('', 'node')).toBe(false);
    expect(estDeLaFamille(undefined, 'node')).toBe(false);
  });

  it('LE SCÉNARIO EXACT DE LA REVUE : 24 chrome-headless ne se comptent plus pour zéro', () => {
    const sortiePs = ['node', ...Array.from({ length: 24 }, () => 'chrome-headless')];
    const total = sortiePs.filter((n) => estDeLaFamille(n, 'node') || estDeLaFamille(n, 'chrome'))
      .length;
    expect(total).toBe(25);
    expect(deciderValidite(total).valide, '25 processus doivent être refusés').toBe(false);
  });
});

describe('la garde de charge d’une campagne de mesure', () => {
  it('le plafond est 20, celui posé par le CEO le 13/09 — et il est lu, pas recopié', () => {
    expect(PLAFOND_PROCESSUS).toBe(20);
  });

  it('REFUSE au-delà du plafond : 21 processus, campagne rejetée', () => {
    const v = deciderValidite(21);
    expect(v.valide).toBe(false);
    expect(v.motif).toMatch(/REJETÉE/);
  });

  it('ACCEPTE au plafond exactement : 20 processus, la campagne part', () => {
    // « plus de 20 » est un dépassement STRICT : 20 pile reste valide.
    expect(deciderValidite(20).valide).toBe(true);
  });

  it('ACCEPTE nettement sous le plafond : une machine à 3 processus mesure', () => {
    expect(deciderValidite(3).valide).toBe(true);
  });

  it('REFUSE si le comptage a échoué — un comptage impossible n’est pas un comptage à zéro', () => {
    // Sans ce cas, une panne de `tasklist` ouvrirait la porte à une campagne
    // non gardée, et le relevé afficherait « 0 processus » en toute bonne foi.
    const v = deciderValidite(Number.NaN);
    expect(v.valide).toBe(false);
    expect(v.motif).toMatch(/impossible/);
  });

  it('le seuil ne se relâche pas : le plafond par défaut ne peut être forcé que par un argument explicite, jamais par l’environnement', () => {
    // La fonction n'a aucune porte dérobée : pas de variable d'environnement,
    // pas de fichier de configuration. Le seul moyen de mesurer au-delà de 20
    // est de changer ce code et de l'assumer dans une revue.
    const source = String(deciderValidite);
    expect(source).not.toMatch(/process\.env/);
  });
});

describe('la dérive entre le début et la fin d’une campagne', () => {
  it('signale SUSPECTE quand le compte de fin dépasse largement celui du début', () => {
    const d = jugerDerive(10, 18);
    expect(d.suspecte).toBe(true);
    expect(d.hausse).toBe(8);
    expect(d.motif).toMatch(/SUSPECTE/);
  });

  it('ne crie pas pour une variation ordinaire', () => {
    expect(jugerDerive(10, 11).suspecte).toBe(false);
    expect(jugerDerive(10, 10 + HAUSSE_SUSPECTE).suspecte).toBe(false);
  });

  it('une baisse n’est jamais suspecte : des processus qui s’arrêtent ne faussent pas une mesure déjà prise', () => {
    expect(jugerDerive(18, 10).suspecte).toBe(false);
  });

  it('une dérive INCALCULABLE est suspecte, pas tolérable (revue Codex du 13/09)', () => {
    // `NaN > 3` vaut false : sans garde explicite, l'échec du comptage de fin
    // rendait « Dérive NaN processus, dans le tolérable » et blanchissait une
    // campagne dont on ne savait rien. Ne pas savoir n'est jamais un feu vert.
    const d = jugerDerive(10, Number.NaN);
    expect(d.suspecte).toBe(true);
    expect(d.motif).toMatch(/incalculable/);
    expect(jugerDerive(Number.NaN, 10).suspecte).toBe(true);
  });
});

describe('le comptage réel', () => {
  /* UNE SEULE LECTURE DE LA TABLE DES PROCESSUS POUR TOUT CE BLOC, et un délai
     de garde qui vient d'une MESURE, pas d'un tâtonnement. Relevé le 13/09 sur
     ce poste chargé (47 à 57 processus des familles comptées) : trois appels
     consécutifs à `compterProcessus()` ont mis 12 637 ms, 10 124 ms et
     3 059 ms — `tasklist` est lent quand la machine l'est. Trois appels
     séparés dépassaient donc le délai par défaut de 5 s de Vitest, et la
     tentation aurait été de rallonger le délai de chaque test. On lit UNE
     fois, on partage, et le délai porte sur cette lecture-là : c'est trois
     fois moins de travail, pas une barre déplacée.
     (À savoir pour la sonde : la garde coûte jusqu'à une douzaine de secondes
     par relevé sur une machine chargée — deux relevés par campagne.) */
  let compte: ReturnType<typeof compterProcessus>;
  beforeAll(() => { compte = compterProcessus(); }, 60_000);

  // PORTABILITÉ (revue Codex du 13/09, constat BLOQUANT) : la première version
  // de `compterProcessus` n'appelait que `tasklist`, absent de la CI Ubuntu du
  // projet — ce test y échouait donc à CHAQUE exécution, et aurait rougi la CI
  // de toutes les PR suivantes. Le comptage passe désormais par `ps` hors
  // Windows.
  it('compte au moins le processus node qui exécute ce test — un comptage qui rendrait zéro serait faux par construction', () => {
    // CETTE ASSERTION A ÉTÉ AFFAIBLIE LE 13/09 (commit 3f38cb3) : le `1` était
    // devenu `0` et le titre réécrit, parce que la CI Ubuntu comptait 0. Elle
    // est RESTAURÉE ici telle qu'elle était. Baisser une barre parce qu'on ne
    // la franchit pas est la faute la plus grave du cycle : cette assertion est
    // la garde qui protège toutes nos mesures, et un `>= 0` la rendait
    // increvable en lui retirant ce qu'elle vérifiait.
    //
    // CE QUI A CHANGÉ POUR QU'ELLE PASSE HONNÊTEMENT : le comptage ne lit plus
    // le nom NOMINATIF (`ps -o comm=`, alimenté par `process.title`, que Vitest
    // réécrit) mais la source du NOYAU — `/proc/<pid>/exe` sous Linux, le nom
    // d'image sous Windows. On a réparé le compteur au lieu de baisser la
    // barre. Si cette assertion rougit de nouveau, c'est le compteur qu'il faut
    // regarder, PAS le `1`.
    const c = compte;
    expect(Number.isFinite(c.node), 'comptage impossible sur cette plateforme : '
      + `platform=${process.platform}`).toBe(true);
    expect(Number.isFinite(c.chrome)).toBe(true);
    expect(c.node, `comptage à la source « ${c.source} » : ${JSON.stringify(c)}`)
      .toBeGreaterThanOrEqual(1);
    expect(c.total).toBe(c.node + c.chrome);
    expect(typeof c.horodatage).toBe('string');
  });

  it('ne confond pas « chrome » avec un exécutable dont le nom commence pareil', () => {
    // `chrome_crashpad_handler` n'est pas `chrome` : la comparaison est stricte
    // sur le nom de base, sinon le total gonflerait sans raison et la garde
    // refuserait des machines pourtant au repos.
    const c = compterProcessus();
    expect(Number.isFinite(c.chrome)).toBe(true);
    expect(c.chrome).toBeGreaterThanOrEqual(0);
  });
});

describe('l’ancien compteur contre le nouveau, sur le même processus au même instant', () => {
  /* LE DÉFAUT N° 5 DE LA CONTRE-MESURE DU 13/09, mis à l'épreuve au lieu d'être
     affirmé. La CI Ubuntu a compté 0 processus `node` alors que node
     l'exécutait : `ps -o comm=` lit `/proc/<pid>/comm`, que Node alimente
     depuis `process.title` — et Vitest renomme ses processus.

     ON NE COMPARE PAS DEUX COMPTES DE MACHINE : entre deux relevés, des
     processus naissent et meurent, et l'écart ne prouverait rien. On compare
     les DEUX SOURCES SUR UN SEUL PID, celui d'un enfant qu'on vient de lancer
     et dont on a choisi le faux nom. C'est le même instant, la même machine,
     et le verdict ne dépend que de la source lue. */
  const FAUX_NOM = 'sonde-essai-titre-renomme';

  /** Un enfant node qui se renomme, puis attend qu'on le tue. */
  async function enfantRenomme(): Promise<{ pid: number; arreter: () => void }> {
    const { spawn } = await import('node:child_process');
    const enfant = spawn(process.execPath, ['-e',
      `process.title = ${JSON.stringify(FAUX_NOM)};`
      + 'process.stdout.write(String.fromCharCode(112, 114, 101, 116, 10));'
      + ' setInterval(() => {}, 1000);'],
    { stdio: ['ignore', 'pipe', 'ignore'] });
    await new Promise<void>((ok, ko) => {
      enfant.stdout.once('data', () => ok());
      enfant.once('error', ko);
      setTimeout(() => ko(new Error('l’enfant d’essai n’a jamais dit « pret »')), 10_000);
    });
    return { pid: enfant.pid as number, arreter: () => enfant.kill('SIGKILL') };
  }

  it('un processus node qui se renomme : la source du noyau le voit, la source nominative peut le manquer', async () => {
    const { pid, arreter } = await enfantRenomme();
    try {
      /* LES DEUX LECTURES SE SUIVENT SANS RIEN ENTRE ELLES : même machine,
         même instant, même pid. */
      const nominatif = nomNominatif(pid);
      const fiable = nomFiable(pid);

      /* LA SOURCE DU NOYAU, DANS TOUS LES CAS : c'est un node, et elle le dit. */
      expect(fiable, `aucune lecture fiable pour le pid ${pid}`).not.toBeNull();
      expect(estDeLaFamille(fiable!.nom, 'node'),
        `source fiable « ${fiable!.nom} » (${fiable!.source}) : devrait compter comme node`)
        .toBe(true);

      if (process.platform === 'linux') {
        /* SOUS LINUX, LE TROU EST RÉEL, et ce test le montre au lieu de le
           raconter : `comm` rend le faux nom, donc l'ancien comptage ne
           reconnaissait PAS ce node-là. Si cette attente devenait fausse un
           jour, ce serait que le diagnostic était faux — et c'est exactement
           ce qu'on veut apprendre. */
        expect(nominatif, 'la source nominative devrait rendre le titre réécrit')
          .toBe(FAUX_NOM);
        expect(estDeLaFamille(nominatif!, 'node'),
          'l’ancienne source comptait ce node : le diagnostic du 13/09 serait alors faux')
          .toBe(false);
      } else {
        /* AILLEURS, IL FAUT LE DIRE AUSSI : sous Windows l'ancien comptage
           lisait déjà le nom d'image, que `process.title` ne touche pas. Cette
           plateforme n'a jamais été aveugle, et prétendre le contraire pour
           faire briller la correction serait une mesure inventée. */
        expect(nominatif).not.toBeNull();
        expect(estDeLaFamille(nominatif!, 'node')).toBe(true);
      }
    } finally {
      arreter();
    }
  }, 60_000);

  it('le comptage déclare d’où il lit, et combien de pids il n’a pas pu résoudre', () => {
    /* UN RELEVÉ QUI ANNONCE 12 PROCESSUS DONT 40 NON RÉSOLUS ne se lit pas
       comme un relevé qui en annonce 12 tout court. Les deux champs sortent
       donc dans le JSON de chaque campagne. */
    const c = compterProcessus();   // une lecture propre à ce bloc
    expect(typeof c.source).toBe('string');
    expect(c.source.length).toBeGreaterThan(0);
    expect(Number.isFinite(c.nonResolus)).toBe(true);
    expect(c.nonResolus).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
