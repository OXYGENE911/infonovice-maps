// L'ESSAI DE DIVERGENCE — le contrôle servi/dist mord-il sur LE fichier qui
// porte la mesure ? (SONDE-VRAIE-1, 13/09/2026, défaut n° 3 de la contre-mesure.)
//
// Le contrôle tournait après `page.goto(..., {waitUntil:'load'})` mais AVANT le
// déclenchement du calcul. Or le panneau d'itinéraire arrive par import
// DYNAMIQUE : il n'est cité ni dans `dist/index.html` ni dans ses
// `modulepreload`. Le fichier qui compte n'était donc jamais empreinté, et
// « conforme » ne voulait rien dire.
//
// POURQUOI CET ESSAI NE PASSE PAS PAR UN NAVIGATEUR : sur ce poste la garde de
// charge refuse toute campagne (37 processus résidents relevés le 13/09 pour un
// plafond de 20), et le CEO a interdit d'en lancer une. L'essai se fait donc
// avec `fetch`, par le VRAI serveur de la sonde.
//
// DEUX BLOCS, ET LA SÉPARATION VIENT DE LA REVUE CODEX (2ᵉ passage : « le
// contrôle de divergence reste sauté dans la CI »). En CI, `npm test` tourne
// avant `npm run build`, donc `dist/` est absent — et un bloc entièrement sauté
// ne protège rien. On sépare donc deux questions :
//   — « le serveur et la comparaison d'empreintes mordent-ils ? » s'éprouve sur
//     une arborescence d'essai bâtie ici même, sans build : ce bloc tourne
//     TOUJOURS, CI comprise ;
//   — « le vrai chunk d'import dynamique est-il absent d'index.html ? » est une
//     question sur le BUILD, et ne peut se poser qu'avec un build.
// Ce que le second bloc affirme est de toute façon établi en CI par
// `tests-e2e/sonde-chrono.spec.ts`, qui relève l'instant de la requête du chunk
// contre le build réel.
import {
  describe, it, expect, beforeAll, afterAll,
} from 'vitest';
import {
  existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { servirDist, empreinte } from '../scripts/serveur-dist.mjs';
import { comparerEmpreintes, exigerFichiersAttendus } from '../scripts/chrono-sonde.mjs';

/** Les empreintes de référence d'une arborescence, comme la sonde les prend. */
function empreintesDe(racine: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of readdirSync(join(racine, 'assets'))) {
    m.set(`/assets/${f}`, empreinte(readFileSync(join(racine, 'assets', f))));
  }
  return m;
}

describe('le contrôle servi/dist mord — éprouvé sans build, donc en CI aussi', () => {
  const racine = join(tmpdir(), `sonde-essai-${process.pid}`);
  const CHUNK = '/assets/panneau-itineraire-ESSAI01.js';

  beforeAll(() => {
    mkdirSync(join(racine, 'assets'), { recursive: true });
    writeFileSync(join(racine, 'index.html'),
      '<!doctype html><script type="module" src="/assets/index-ESSAI01.js"></script>', 'utf8');
    writeFileSync(join(racine, 'assets', 'index-ESSAI01.js'), 'export const a = 1;', 'utf8');
    writeFileSync(join(racine, 'assets', 'panneau-itineraire-ESSAI01.js'),
      'export const panneau = 1;', 'utf8');
  });
  afterAll(() => { rmSync(racine, { recursive: true, force: true }); });

  it('un octet changé sur le chunk visé, et le contrôle sort une divergence', async () => {
    const attendues = empreintesDe(racine);
    const s = await servirDist(racine, 'panneau-itineraire');
    try {
      await fetch(`http://127.0.0.1:${s.port}/`);
      await fetch(`http://127.0.0.1:${s.port}${CHUNK}`);
      const r = comparerEmpreintes(s.servi, attendues);
      expect(r.conforme, 'le contrôle n’a rien vu alors qu’un octet a changé').toBe(false);
      expect(r.divergences).toContain(CHUNK);
    } finally { await s.fermer(); }
  });

  it('sans altération, le même contrôle dit conforme — une garde qui refuse tout ne garde rien', async () => {
    const attendues = empreintesDe(racine);
    const s = await servirDist(racine, null);
    try {
      await fetch(`http://127.0.0.1:${s.port}/`);
      await fetch(`http://127.0.0.1:${s.port}${CHUNK}`);
      const r = comparerEmpreintes(s.servi, attendues);
      expect(r.conforme, `divergences : ${r.divergences.join(', ')}`).toBe(true);
      expect(r.verifies).toContain(CHUNK);
    } finally { await s.fermer(); }
  });

  it('si le chunk n’a jamais été servi, la sonde REFUSE au lieu de se féliciter', async () => {
    // LE CAS EXACT D'AVANT LA CORRECTION : on ne demande que la page, comme le
    // faisait le contrôle placé après `waitUntil:'load'`. Tout est « conforme »
    // — et pourtant le fichier qui porte la mesure n'a pas été regardé.
    const attendues = empreintesDe(racine);
    const s = await servirDist(racine, null);
    try {
      await fetch(`http://127.0.0.1:${s.port}/`);
      expect(comparerEmpreintes(s.servi, attendues).conforme).toBe(true);
      const e = exigerFichiersAttendus([...s.servi.keys()], ['panneau-itineraire']);
      expect(e.ok, 'le contrôle se déclare bon sans avoir vu le chunk dynamique').toBe(false);
      expect(e.motif).toMatch(/n’a donc pas regardé le code qui porte la mesure/);
    } finally { await s.fermer(); }
  });
});

/* CE SECOND BLOC PORTE SUR LE VRAI BUILD, et ne peut donc pas se poser sans lui.
   Il se déclare sauté avec sa raison plutôt que de passer au vert sur une
   absence — un test qui réussit sans avoir rien regardé est exactement ce que
   cette PR corrige ailleurs. */
const DIST = join(process.cwd(), 'dist');
const construit = existsSync(join(DIST, 'assets'));

describe.skipIf(!construit)('le vrai build : le chunk qui porte la mesure arrive en import dynamique', () => {
  let chunkItineraire: string;

  beforeAll(() => {
    const trouve = readdirSync(join(DIST, 'assets'))
      .find((f) => f.startsWith('panneau-itineraire-') && f.endsWith('.js'));
    expect(trouve, 'aucun chunk panneau-itineraire dans dist/assets').toBeTruthy();
    chunkItineraire = `/assets/${trouve}`;
  });

  it('le chunk du panneau d’itinéraire n’est PAS chargé par index.html — c’est tout le défaut', () => {
    // LA PRÉMISSE DU DÉFAUT, MESURÉE : si ce fichier était cité dans index.html
    // ou préchargé, le contrôle d'avant aurait pu le voir. Il ne l'est pas.
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    expect(html).not.toContain('panneau-itineraire');
  });

  it('sur les vrais octets de dist/, une divergence sur ce chunk est attrapée', async () => {
    const attendues = empreintesDe(DIST);
    const s = await servirDist(DIST, 'panneau-itineraire');
    try {
      await fetch(`http://127.0.0.1:${s.port}/`);
      await fetch(`http://127.0.0.1:${s.port}${chunkItineraire}`);
      const r = comparerEmpreintes(s.servi, attendues);
      expect(r.conforme).toBe(false);
      expect(r.divergences).toContain(chunkItineraire);
    } finally { await s.fermer(); }
  });
});

/* CE QUE CES ESSAIS NE COUVRENT PAS, et qu'il ne faut pas leur faire dire :
   ils montrent que le CONTRÔLE mord. Ils ne montrent pas qu'un NAVIGATEUR
   demande bien ce chunk après le déclenchement du calcul — cette moitié-là est
   établie par `tests-e2e/sonde-chrono.spec.ts`, qui relève l'instant de la
   requête. Les deux moitiés ensemble font la preuve ; ni l'une ni l'autre seule. */
