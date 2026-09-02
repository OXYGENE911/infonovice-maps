import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { LEGENDES, legendeDe } from '../src/lib/favoris';

/* L'EXPORT DIT CE QU'IL CONTIENT (EXPORT-1, 02/09).
 *
 * LE TERRAIN. Armelin : « fonction export : ok, ça télécharge un JSON, mais il
 * contient des repères qui ne sont pas les miens et ne font pas partie des
 * recherches que j'ai faites. »
 *
 * CE QU'IL Y AVAIT VRAIMENT DEDANS. Rien d'étranger — mais rien ne DISAIT ce
 * qu'il contenait : treize clés techniques et leurs valeurs brutes. Trois
 * portent des points géographiques, et l'une d'elles, les trajets habituels,
 * est remplie par l'application SANS geste de l'usager. De son point de vue
 * ces repères n'étaient pas les siens ; du point de vue du code ils
 * l'étaient. Les deux avaient raison, et c'est le fichier qui manquait à son
 * devoir.
 *
 * CE TEST GARDE LA COUVERTURE. Une clé de préférence ajoutée demain sans sa
 * légende repartirait dans l'export sans que rien ne l'explique — et le
 * défaut se reproduirait, exactement. */

/** Toutes les clés de préférence déclarées dans le code, lues à la source. */
function clesDeclarees(): string[] {
  const cles = new Set<string>();
  const racine = resolve(__dirname, '..', 'src');
  const parcourir = (dossier: string): void => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) { parcourir(chemin); continue; }
      if (!e.name.endsWith('.ts')) continue;
      const source = readFileSync(chemin, 'utf-8');
      for (const m of source.matchAll(/PREF_[A-Z_]+\s*=\s*'([^']+)'/g)) {
        cles.add(m[1]!);
      }
      /* LES REPÈRES N'ONT PAS DE constante `PREF_` : ils se composent
         (`repere-${nom}`). On les nomme donc explicitement, et ce test les
         garde comme les autres. */
    }
  };
  parcourir(racine);
  return [...cles];
}

describe('les légendes de l’export', () => {
  it('couvrent TOUTES les clés de préférence du code', () => {
    const manquantes = clesDeclarees().filter((c) => !(c in LEGENDES));
    expect(manquantes,
      `ces clés partiraient dans l’export sans explication : ${manquantes.join(', ')}`)
      .toEqual([]);
  });

  /* LES REPÈRES SE COMPOSENT (`repere-domicile`, `repere-travail`) et
     échappent donc au balayage ci-dessus : ils sont nommés à la main, et ce
     test dit qu'on ne les a pas oubliés. */
  it('couvrent aussi le domicile et le travail', () => {
    expect(LEGENDES['repere-domicile']).toBeDefined();
    expect(LEGENDES['repere-travail']).toBeDefined();
  });

  /* CE QUI EST APPRIS TOUT SEUL DOIT LE DIRE. C'est le cœur du malentendu :
     l'usager ne reconnaissait pas des repères qu'il n'avait jamais saisis. */
  it('avouent ce que l’application apprend sans qu’on le lui demande', () => {
    const routines = LEGENDES['routines-trajets'];
    expect(routines).toBeDefined();
    expect(routines!.origine).toContain('APPRIS AUTOMATIQUEMENT');
    /* ET DISENT COMMENT L'EFFACER : une donnée qu'on ne peut pas retirer
       serait un mouchard, et le volet Favoris sait déjà le faire. */
    expect(routines!.origine).toContain('Tout oublier');
  });

  it('disent que l’historique, lui, se garde UN PAR UN', () => {
    const hist = LEGENDES['historique-trajets'];
    expect(hist!.origine).toContain('sur votre demande');
    /* ET QUE LE TRACÉ GPS EN FAIT PARTIE : c'est la donnée la plus
       révélatrice du fichier, elle ne se découvre pas en le lisant. */
    expect(hist!.quoi).toContain('tracé GPS');
  });

  it('nomment chaque bloc en français, sans clé technique nue', () => {
    for (const [cle, l] of Object.entries(LEGENDES)) {
      expect(l.quoi.length, `${cle} : description trop courte`).toBeGreaterThan(20);
      expect(l.origine.length, `${cle} : origine non dite`).toBeGreaterThan(10);
    }
  });
});

describe('legendeDe', () => {
  it('rend la légende connue', () => {
    expect(legendeDe('vehicule').quoi).toContain('véhicule');
  });

  /* UNE CLÉ INCONNUE EST UNE CLÉ AJOUTÉE DEPUIS : on le dit franchement
     plutôt que d'inventer une description qui aurait l'air sûre. */
  it('avoue franchement ce qu’il ne connaît pas', () => {
    const l = legendeDe('clef-de-demain');
    expect(l.quoi).toContain('clef-de-demain');
    expect(l.origine).toContain('cet appareil');
  });
});
