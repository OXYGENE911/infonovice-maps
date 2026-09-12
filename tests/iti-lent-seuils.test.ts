// Les deux seuils de lenteur de l'itinéraire (ITI-LENT-1, 12/09/2026) sont
// des constantes NOMMÉES ET EXPORTÉES (critère d'acceptation, point 4) — ce
// test les lit dans le fichier source (comme decoupage-demarrage.test.ts le
// fait déjà pour ce même fichier) plutôt que d'importer `panneau-itineraire`
// à l'exécution : ce module définit un élément personnalisé et charge
// maplibre-gl au chargement, ce que la suite unitaire du projet évite
// délibérément (voir la note de decoupage-demarrage.test.ts).
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const SOURCE = readFileSync(
  new URL('../src/carte/panneau-itineraire.ts', import.meta.url), 'utf-8',
);

describe('les seuils de lenteur de l’itinéraire', () => {
  it('sont exportés, et valent ce que service-lent.test.ts vérifie', () => {
    expect(SOURCE).toMatch(/export const SEUIL_LENTEUR_ITINERAIRE_MS = 2500;/);
    expect(SOURCE).toMatch(/export const SEUIL_ABANDON_ITINERAIRE_MS = 15000;/);
  });

  it('le seuil d’abandon reste SOUS le plafond dur de calculerItineraire — sinon l’usager ne verrait jamais le bouton Réessayer avant l’échec naturel', () => {
    const ITINERAIRE = readFileSync(
      new URL('../src/lib/itineraire.ts', import.meta.url), 'utf-8',
    );
    const delaiParEssai = /const DELAI_MS = (\d+);/.exec(ITINERAIRE);
    expect(delaiParEssai, 'DELAI_MS introuvable dans lib/itineraire.ts').not.toBeNull();
    // Deux essais, 500 ms d'attente entre les deux (voir calculerItineraire).
    const plafondDur = Number(delaiParEssai![1]) * 2 + 500;
    const seuilAbandon = Number(/export const SEUIL_ABANDON_ITINERAIRE_MS = (\d+);/
      .exec(SOURCE)![1]);
    expect(seuilAbandon).toBeLessThan(plafondDur);
  });

  it('le calcul de l’itinéraire passe bien par signalerLenteur, jamais par avecDelaiDeGarde — le mécanisme est différent, la donnée n’est pas facultative', () => {
    expect(SOURCE).toMatch(/import \{ signalerLenteur \} from '\.\.\/lib\/service-lent';/);
    expect(SOURCE).toMatch(/signalerLenteur\(\s*calculerItineraire\(depart, arrivee, profil, options\),/);
    expect(SOURCE).not.toMatch(/avecDelaiDeGarde\(calculerItineraire/);
  });

  it('« Effacer le trajet » masque les deux bandeaux (revue Codex du 12/09, régression réelle avant correction) : #effacer() incrémente le jeton de séquence, donc le succès ou l’échec tardif de #calculer ne les nettoiera jamais lui-même', () => {
    const debutEffacer = SOURCE.indexOf('#effacer(): void {');
    expect(debutEffacer, '#effacer() introuvable').toBeGreaterThan(-1);
    const finEffacer = SOURCE.indexOf('\n  }', debutEffacer);
    const corpsEffacer = SOURCE.slice(debutEffacer, finEffacer);
    expect(corpsEffacer).toMatch(/querySelector\('\.iti-lenteur-service'\) as HTMLElement\)\.hidden = true/);
    expect(corpsEffacer).toMatch(/querySelector\('\.iti-abandon-service'\) as HTMLElement\)\.hidden = true/);
  });
});
