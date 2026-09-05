import { describe, expect, it } from 'vitest';
import { CALQUES_TOPONYMES, CALQUES_NUMEROS_ROUTE } from '../src/carte/etiquettes-ign';
import { calquesEtiquettes } from '../src/carte/style-ign';

/* CHAQUE CALQUE D'ÉTIQUETTE NOMME SA SOURCE (RETOUR-0409b, 05/09). Mesuré en
   rejouant le scénario d'Armelin (fond photo, relief 3D) : « layers.odonyme-
   abrege: missing required property "source" » — deux calques de noms de
   rues n'entraient jamais sur le fond photo, en silence. Et à une reprise de
   contexte WebGL, c'est ce chemin que MapLibre rejoue. */
describe('les calques d’étiquettes', () => {
  it('portent tous la source etiquettes-ign', () => {
    for (const c of [...CALQUES_TOPONYMES, ...CALQUES_NUMEROS_ROUTE]) {
      expect((c as { source?: string }).source, `calque ${c.id}`).toBe('etiquettes-ign');
    }
  });
  it('sur le fond photo comme sur le plan, aucun calque sans source', () => {
    for (const fond of ['plan', 'ortho', 'ortho-routes'] as const) {
      for (const c of calquesEtiquettes(fond, true)) {
        expect((c as { source?: string }).source, `${fond} : ${c.id}`).toBeTruthy();
      }
    }
  });
});
