import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* CE QUE LA FEUILLE DE STYLE DOIT GARANTIR (ERGO-6, 02/09).
 *
 * LE DÉFAUT PAYÉ. `.iti-routines` portait `display: flex`. La règle du
 * navigateur pour l'attribut `hidden` est `display: none`, mais elle vit dans
 * la feuille par DÉFAUT : n'importe quelle règle d'auteur qui pose un
 * `display` la bat. La liste des trajets habituels était donc toujours
 * visible, et le bouton censé la replier ne faisait rien — « quand on clic
 * sur le bouton "Trajets habituels" il ne se passe rien » (Armelin, 02/09).
 *
 * CE FICHIER GARDE LA RÈGLE GLOBALE. Elle ne se voit pas à l'œil nu et rien
 * d'autre ne la protège : la supprimer « parce qu'un !important, c'est
 * sale » ferait revenir sept bugs d'un coup. */

const CSS = readFileSync(
  resolve(__dirname, '..', 'src', 'styles', 'carte.css'), 'utf-8',
);

describe('l’attribut hidden', () => {
  it('est appliqué globalement, et gagne sur les règles de classe', () => {
    expect(/^\[hidden\]\s*\{[^}]*display:\s*none\s*!important/m.test(CSS),
      'la règle globale « [hidden] { display: none !important } » a disparu')
      .toBe(true);
  });

  /* SEPT CLASSES ÉTAIENT DANS CE CAS le jour où la règle a été posée. Ce test
     ne les énumère pas — il vérifie que la règle qui les couvre TOUTES est
     déclarée AVANT elles, faute de quoi une classe de même spécificité
     déclarée plus haut l'emporterait. */
  /* CE QUI POURRAIT ENCORE BATTRE LA RÈGLE. Une déclaration sans
     `!important` perd toujours contre elle, quelle que soit sa spécificité ou
     sa place. Le SEUL adversaire possible est un autre `display` marqué
     `!important` — et comme les deux auraient la même force, c'est l'ordre
     dans le fichier qui trancherait. On interdit donc le concurrent plutôt
     que de parier sur l'ordre. */
  it('n’a aucun concurrent : aucune règle ne force un display VISIBLE', () => {
    const forces = [...CSS.matchAll(/display:\s*([a-z-]+)\s*!important/g)]
      .map((m) => m[1]!)
      .filter((v) => v !== 'none');
    /* `display: none !important` n'est pas un concurrent — il masque aussi.
       La feuille en porte un pour l'impression, et c'est légitime. */
    expect(forces,
      'un display !important rend un élément VISIBLE : il peut annuler la'
      + ' règle globale selon sa place dans le fichier')
      .toEqual([]);
  });
});
