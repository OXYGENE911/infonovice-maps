import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LOCALE_FR } from '../src/carte/style-ign';

/* NOS CLÉS DE TRADUCTION DOIVENT EXISTER CHEZ MapLibre (LOCALE-FR-2, 07/09).
 *
 * POURQUOI CE TEST EXISTE. Trois clés traduites depuis des mois —
 * `ScrollZoomBlocker.CtrlMessage`, `ScrollZoomBlocker.CmdMessage`,
 * `TouchPanBlocker.Message` — ne correspondaient à RIEN dans MapLibre 6 :
 * elles nommaient une API disparue. La bibliothèque ne s'en plaint pas, elle
 * garde simplement l'anglais. Une traduction morte est pire qu'une
 * traduction absente : elle donne l'impression que le travail est fait.
 *
 * ON LIT LA TABLE DE LA BIBLIOTHÈQUE plutôt que d'en tenir une copie ici —
 * une copie se périmerait au premier `npm update`, en silence. Si MapLibre
 * change la forme de sa table, ce test ROUGIT : c'est exactement le moment où
 * quelqu'un doit revérifier les libellés, pas les croire sur parole.
 */

const BUNDLE = new URL('../node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs', import.meta.url);

function clesConnues(): Set<string> {
  const source = readFileSync(BUNDLE, 'utf-8');
  const cles = new Set<string>();
  for (const m of source.matchAll(/["']([A-Z][A-Za-z]+\.[A-Za-z]+)["']\s*:\s*["'][^"']{2,60}["']/g)) {
    cles.add(m[1]!);
  }
  return cles;
}

describe('les libellés français de la carte', () => {
  it('ne traduit que des clés que MapLibre connaît vraiment', () => {
    const connues = clesConnues();
    expect(connues.size, 'la table de MapLibre n’a pas été retrouvée — sa forme a changé')
      .toBeGreaterThan(15);
    const inconnues = Object.keys(LOCALE_FR).filter((c) => !connues.has(c));
    expect(inconnues, `clés traduites dans le vide : ${inconnues.join(', ')}`).toEqual([]);
  });

  it('couvre ce qu’un lecteur d’écran rencontre : la carte, les repères, les fiches', () => {
    /* Les trois trouvés en tabulant l'application au clavier : le canevas se
       présentait comme « Map », la croix d'une fiche comme « Close popup ». */
    expect(LOCALE_FR['Map.Title']).toBe('Carte');
    expect(LOCALE_FR['Marker.Title']).toBeTruthy();
    expect(LOCALE_FR['Popup.Close']).toBeTruthy();
  });

  it('ne laisse aucun libellé en anglais', () => {
    /* Un mot anglais courant suffit à trahir un oubli de traduction. */
    const anglais = /\b(map|zoom|close|popup|location|fullscreen|toggle|enable|disable|marker)\b/i;
    const fautifs = Object.entries(LOCALE_FR)
      .filter(([, v]) => anglais.test(v) && !/MapLibre/.test(v));
    expect(fautifs, `libellés restés anglais : ${fautifs.map(([k]) => k).join(', ')}`).toEqual([]);
  });
});
