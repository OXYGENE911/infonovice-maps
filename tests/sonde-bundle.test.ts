// L'ESSAI DE DIVERGENCE — le contrôle servi/dist mord-il sur LE fichier qui
// porte la mesure ? (SONDE-VRAIE-1, 13/09/2026, défaut n° 3 de la contre-mesure.)
//
// Le contrôle tournait après `page.goto(..., {waitUntil:'load'})` mais AVANT le
// déclenchement du calcul. Or le panneau d'itinéraire arrive par import
// DYNAMIQUE : il n'est cité ni dans `dist/index.html` ni dans ses
// `modulepreload` — ce parcours le vérifie plutôt que de le supposer. Le
// fichier qui compte n'était donc jamais empreinté, et « conforme » ne voulait
// rien dire.
//
// POURQUOI CET ESSAI NE PASSE PAS PAR UN NAVIGATEUR : sur ce poste la garde de
// charge refuse toute campagne (37 processus résidents relevés le 13/09 pour un
// plafond de 20), et le CEO a interdit d'en lancer une. L'essai se fait donc
// avec `fetch`, sur les VRAIS octets de `dist/`, par le VRAI serveur de la
// sonde. Ce qu'il ne couvre pas est dit en fin de fichier.
import {
  describe, it, expect, beforeAll,
} from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { servirDist, empreinte } from '../scripts/serveur-dist.mjs';
import { comparerEmpreintes, exigerFichiersAttendus } from '../scripts/chrono-sonde.mjs';

const DIST = join(process.cwd(), 'dist');
const present = existsSync(join(DIST, 'assets'));

/** Les empreintes de référence, comme la sonde les prend. */
function empreintesDist(): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of readdirSync(join(DIST, 'assets'))) {
    m.set(`/assets/${f}`, empreinte(readFileSync(join(DIST, 'assets', f))));
  }
  return m;
}

/* CE PARCOURS A BESOIN D'UN BUILD. Sans `dist/`, il ne peut RIEN dire : on le
   déclare sauté avec sa raison, plutôt que de le laisser passer au vert sur
   une absence — un test qui réussit sans avoir rien regardé est exactement ce
   que cette PR corrige ailleurs. En CI, `npm test` tourne avant `npm run
   build` : ce parcours y est donc sauté, et c'est l'essai local (documenté
   dans docs/mesure-seuil-porte.md §11) qui fait foi. */
describe.skipIf(!present)('le contrôle servi/dist attrape une divergence sur le chunk dynamique', () => {
  let chunkItineraire: string;

  beforeAll(() => {
    const trouve = readdirSync(join(DIST, 'assets'))
      .find((f) => f.startsWith('panneau-itineraire-') && f.endsWith('.js'));
    expect(trouve, 'aucun chunk panneau-itineraire dans dist/assets').toBeTruthy();
    chunkItineraire = `/assets/${trouve}`;
  });

  it('le chunk du panneau d’itinéraire n’est PAS chargé par index.html — c’est tout le défaut', () => {
    // LA PRÉMISSE DU DÉFAUT, MESURÉE : si ce fichier était cité dans
    // index.html ou préchargé, le contrôle d'avant aurait pu le voir. Il ne
    // l'est pas. Le contrôle placé avant le déclenchement du calcul ne pouvait
    // donc pas le regarder.
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    expect(html).not.toContain('panneau-itineraire');
  });

  it('un octet changé sur CE fichier-là, et le contrôle sort une divergence', async () => {
    const attendues = empreintesDist();
    const s = await servirDist(DIST, 'panneau-itineraire');
    try {
      // On sert la page puis le chunk, comme le navigateur le ferait.
      await fetch(`http://127.0.0.1:${s.port}/`);
      await fetch(`http://127.0.0.1:${s.port}${chunkItineraire}`);

      const r = comparerEmpreintes(s.servi, attendues);
      expect(r.conforme, 'le contrôle n’a rien vu alors qu’un octet a changé').toBe(false);
      expect(r.divergences).toContain(chunkItineraire);
    } finally {
      await s.fermer();
    }
  });

  it('sans altération, le même contrôle dit conforme — une garde qui refuse tout ne garde rien', async () => {
    const attendues = empreintesDist();
    const s = await servirDist(DIST, null);
    try {
      await fetch(`http://127.0.0.1:${s.port}/`);
      await fetch(`http://127.0.0.1:${s.port}${chunkItineraire}`);
      const r = comparerEmpreintes(s.servi, attendues);
      expect(r.conforme, `divergences: ${r.divergences.join(', ')} ; `
        + `inconnus: ${r.inconnus.join(', ')}`).toBe(true);
      expect(r.verifies).toContain(chunkItineraire);
    } finally {
      await s.fermer();
    }
  });

  it('si le chunk n’a jamais été servi, la sonde REFUSE au lieu de se féliciter', async () => {
    // LE CAS EXACT D'AVANT LA CORRECTION : on ne demande que la page, comme
    // le faisait le contrôle placé après `waitUntil:'load'`. Tout est
    // « conforme » — et pourtant le fichier qui porte la mesure n'a pas été
    // regardé. `exigerFichiersAttendus` est ce qui transforme ce faux vert en
    // sortie en erreur.
    const attendues = empreintesDist();
    const s = await servirDist(DIST, null);
    try {
      await fetch(`http://127.0.0.1:${s.port}/`);
      expect(comparerEmpreintes(s.servi, attendues).conforme).toBe(true);
      const e = exigerFichiersAttendus([...s.servi.keys()], ['panneau-itineraire']);
      expect(e.ok, 'le contrôle se déclare bon sans avoir vu le chunk dynamique').toBe(false);
      expect(e.motif).toMatch(/n’a donc pas regardé le code qui porte la mesure/);
    } finally {
      await s.fermer();
    }
  });
});

/* CE QUE CET ESSAI NE COUVRE PAS, et qu'il ne faut pas lui faire dire :
   il montre que le CONTRÔLE mord sur ce fichier, avec les vrais octets et le
   vrai serveur. Il ne montre pas qu'un NAVIGATEUR demande bien ce chunk après
   le déclenchement du calcul — cette moitié-là est établie par
   `tests-e2e/sonde-chrono.spec.ts`, qui relève l'instant de la requête. Les
   deux moitiés ensemble font la preuve ; ni l'une ni l'autre seule. */
