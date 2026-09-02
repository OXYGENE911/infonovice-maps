import { describe, it, expect } from 'vitest';
import {
  flouterTrajet, texteDuPartage, nomDuFichier, CONTACT,
  CE_QUI_PART, CE_QUI_RESTE, couperLesBouts, COUPE_BOUTS_M,
} from '../src/lib/partage-trajet';
import type { TrajetEnregistre } from '../src/lib/historique-trajets';

/* CONTRIBUER UN PARCOURS SANS SE LIVRER (PARTAGE-1, 01/09).
 *
 * Armelin : « un bouton dédié pour améliorer l'algorithme en indiquant aux
 * gens qu'on floute les adresses de départ et d'arrivée. D'exposer le fichier
 * à l'utilisateur qui pourra vérifier le contenu avant de nous l'envoyer. »
 *
 * Ces tests défendent la promesse elle-même : ce qui doit disparaître du
 * fichier n'y est plus, et ce qui sert à l'algorithme y reste. */

const TRAJET: TrajetEnregistre = {
  id: 't1756700000000',
  departMs: Date.parse('2026-09-01T07:43:29.517Z'),
  titre: 'Le Plessis-Trévise → 12 rue de la Paix, Paris',
  resume: {
    dureeMs: 2_700_000, vitesseMaxKmh: 131, vitesseMoyenneKmh: 62,
    arrets: 3, arretMs: 240_000,
  },
  releves: [
    { tMs: 0, vitesseMs: 0, altitudeM: 92 },
    { tMs: 30_000, vitesseMs: 12.4, altitudeM: 95 },
  ],
};

describe('flouterTrajet', () => {
  it('LE TITRE DISPARAÎT — c’est lui qui porte les deux adresses', () => {
    const f = flouterTrajet(TRAJET);
    expect(JSON.stringify(f)).not.toContain('Plessis');
    expect(JSON.stringify(f)).not.toContain('rue de la Paix');
    expect(f).not.toHaveProperty('titre');
  });

  it('L’IDENTIFIANT LOCAL DISPARAÎT AUSSI : il est fait de l’instant du départ', () => {
    /* `t1756700000000` rendrait la milliseconde qu'on vient d'arrondir — un
       floutage qu'un autre champ défait n'en est pas un. */
    expect(JSON.stringify(flouterTrajet(TRAJET))).not.toContain('1756700000000');
  });

  it('l’heure du départ est arrondie à l’heure pleine', () => {
    /* À la minute près, deux fichiers d'une même personne se recollent ; à
       l'heure, ils ne disent plus qu'« un matin ». */
    expect(flouterTrajet(TRAJET).departHeure).toBe('2026-09-01T07:00Z');
  });

  it('la DATE reste : sans elle, on ne compare plus août à décembre', () => {
    expect(flouterTrajet(TRAJET).departHeure).toContain('2026-09-01');
  });

  it('ce qui sert à l’algorithme reste entier', () => {
    const f = flouterTrajet(TRAJET);
    expect(f.resume).toEqual(TRAJET.resume);
    expect(f.releves).toEqual(TRAJET.releves);
  });

  it('les relevés ne portent AUCUN point — c’est le jeu qui est ainsi fait', () => {
    /* Ce n'est pas un floutage de ma part : un parcours enregistré n'a jamais
       contenu de coordonnée. Ce test le CONSTATE, pour qu'une évolution qui en
       ajouterait un jour ne passe pas ici sans qu'on s'en aperçoive. */
    for (const r of flouterTrajet(TRAJET).releves) {
      expect(Object.keys(r).sort()).toEqual(['altitudeM', 'tMs', 'vitesseMs']);
    }
  });

  it('le format est versionné', () => {
    expect(flouterTrajet(TRAJET).version).toBe(1);
  });
});

describe('texteDuPartage', () => {
  it('LE FICHIER EST LISIBLE : on ne peut pas vérifier une ligne compacte', () => {
    const t = texteDuPartage([TRAJET]);
    expect(t.split('\n').length).toBeGreaterThan(10);
  });

  it('il dit ce qu’il est, pour qui le relira dans six mois', () => {
    const t = texteDuPartage([TRAJET]);
    expect(t).toContain('Infonovice Maps');
    expect(t).toContain('"adressesRetirees": true');
  });

  it('et aucune adresse n’y survit, même sur plusieurs trajets', () => {
    const t = texteDuPartage([TRAJET, { ...TRAJET, titre: 'Domicile → Travail' }]);
    expect(t).not.toContain('Plessis');
    expect(t).not.toContain('Domicile');
    expect(t).not.toContain('Travail');
  });

  it('c’est du JSON valide', () => {
    expect(() => JSON.parse(texteDuPartage([TRAJET]))).not.toThrow();
  });
});

describe('nomDuFichier', () => {
  it('dit combien de parcours il contient', () => {
    expect(nomDuFichier([TRAJET])).toBe('infonovice-parcours-1.json');
  });
});

describe('ce qu’on annonce', () => {
  it('les deux listes sont écrites, et parlent des adresses', () => {
    /* La promesse doit être LUE avant l'envoi : une annonce vide vaudrait
       moins que pas d'annonce du tout. */
    expect(CE_QUI_PART.length).toBeGreaterThan(2);
    expect(CE_QUI_RESTE.join(' ')).toContain('adresses');
  });

  it('l’adresse de contact n’existe qu’à un seul endroit', () => {
    expect(CONTACT).toBe('contact@infonovice.fr');
  });
});

/* LE TRACÉ PART, MAIS AMPUTÉ (HIST-2, 02/09).
 *
 * Armelin voulait un fichier moins pauvre : « l'historique ne conserve pas le
 * tracé […] donc contribuer à l'algorithme envoie trop peu ». Mais un tracé
 * entier commence devant une porte. Ces tests défendent les deux moitiés de
 * la réponse : le milieu part, les bouts non. */

/* UNE LIGNE DROITE VERS L'EST, un point tous les ~100 m, sur 3 km. La latitude
   de Paris fait 1° ≈ 73,3 km en longitude ; 0,00137° valent donc ~100 m. */
const LIGNE = Array.from({ length: 31 }, (_, i) => ({
  tMs: i * 30_000,
  vitesseMs: 12,
  altitudeM: 40,
  lon: Number((2.35 + i * 0.00137).toFixed(5)),
  lat: 48.85,
}));

describe('couperLesBouts', () => {
  it('retire la position des 500 premiers et 500 derniers mètres', () => {
    const coupe = couperLesBouts(LIGNE);
    expect(coupe).toHaveLength(LIGNE.length);
    /* LES CINQ PREMIERS ET LES CINQ DERNIERS points sont dans les 500 m. */
    expect(coupe[0]?.lon, 'le tout premier point est devant une porte').toBeUndefined();
    expect(coupe[4]?.lon).toBeUndefined();
    expect(coupe.at(-1)?.lon).toBeUndefined();
    /* LE MILIEU SURVIT : c'est lui qui apprend quelque chose. */
    expect(coupe[15]?.lon).toBe(LIGNE[15]!.lon);
    expect(coupe[15]?.lat).toBe(48.85);
  });

  /* LE RELEVÉ RESTE, IL PERD SEULEMENT SA POSITION : un trou dans la
     chronologie se comble par interpolation, donc ne protège rien — et il
     fausserait la durée qu'on cherche justement à comparer. */
  it('garde la vitesse et l’altitude des bouts coupés', () => {
    const coupe = couperLesBouts(LIGNE);
    expect(coupe[0]).toEqual({ tMs: 0, vitesseMs: 12, altitudeM: 40 });
  });

  /* UN TRAJET PLUS COURT QUE LES DEUX AMPUTATIONS NE CONTRIBUE RIEN, et c'est
     correct : il n'avait rien à apprendre à personne. */
  it('ne laisse aucun point sur un trajet plus court que la coupe', () => {
    const court = LIGNE.slice(0, 6);
    expect(couperLesBouts(court).some((r) => r.lon !== undefined)).toBe(false);
  });

  /* LES FICHIERS D'AVANT HIST-2 TRAVERSENT INTACTS : leurs relevés n'ont
     jamais porté de position, et il n'y a rien à leur retirer. */
  it('laisse passer des relevés sans position', () => {
    const vieux = [{ tMs: 0, vitesseMs: 10, altitudeM: null }];
    expect(couperLesBouts(vieux)).toEqual(vieux);
  });

  it('coupe bien 500 mètres, la constante et le code disant la même chose', () => {
    expect(COUPE_BOUTS_M).toBe(500);
  });
});

describe('flouterTrajet — le tracé', () => {
  it('n’envoie aucun point des bouts, même en passant par le fichier', () => {
    const texte = texteDuPartage([{ ...TRAJET, releves: LIGNE }]);
    const lu = JSON.parse(texte) as { trajets: { releves: { lon?: number }[] }[] };
    const points = lu.trajets[0]!.releves.filter((r) => r.lon !== undefined);
    expect(points.length, 'le milieu doit partir').toBeGreaterThan(0);
    expect(points.length, 'les bouts ne doivent pas partir')
      .toBeLessThan(LIGNE.length);
    /* ET LE PREMIER POINT ENVOYÉ EST BIEN À PLUS DE 500 M DU DÉPART RÉEL. */
    expect(points[0]!.lon).toBeGreaterThan(LIGNE[4]!.lon);
  });

  /* LES DEUX EXTRÉMITÉS ENREGISTRÉES NE PARTENT PAS DU TOUT : elles portent
     le libellé de l'adresse, c'est-à-dire exactement ce que le floutage
     promet de retirer. */
  it('n’emporte ni le départ ni l’arrivée enregistrés', () => {
    const partage = flouterTrajet({
      ...TRAJET,
      depart: { lon: 2.57, lat: 48.81 },
      arrivee: { lon: 2.3316, lat: 48.8687, libelle: '12 rue de la Paix, Paris' },
    }) as unknown as Record<string, unknown>;
    expect(partage['depart']).toBeUndefined();
    expect(partage['arrivee']).toBeUndefined();
    expect(JSON.stringify(partage)).not.toContain('rue de la Paix');
  });
});
