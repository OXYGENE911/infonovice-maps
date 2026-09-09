import { describe, it, expect } from 'vitest';
import {
  contratDeRoute, provenanceDe, memeOrigine, longueurDuTrace, motDeLaRupture,
  type Provenance,
} from '../src/lib/contrat-route';
import { etapeAlAvancement } from '../src/lib/guidage';
import type { EtapeRoute } from '../src/lib/feuille-de-route';

const PARIS = { lon: 2.3522, lat: 48.8566 };
const LYON = { lon: 4.8357, lat: 45.7640 };

/** Un tracé droit vers le nord, en `n` segments d'un pas donné en degrés. */
function traceDroite(n: number, pasDeg = 0.01): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => [2.35, 48 + i * pasDeg] as [number, number]);
}

function etape(distance: number, texte = 'Continuez tout droit'): EtapeRoute {
  return { texte, voie: '', distance, manoeuvre: 'straight' };
}

const PROV = (requete: string): Provenance => ({ requete, obtenuLe: 1_000 });

describe('la provenance dit ce qui est PARTI, pas ce qu’on croit avoir demandé', () => {
  it('deux demandes identiques ont la même provenance', () => {
    const o = { eviter: ['tunnel' as const], optimisation: 'fastest' as const };
    expect(memeOrigine(
      provenanceDe(PARIS, LYON, 'car', o, 1),
      provenanceDe(PARIS, LYON, 'car', o, 999_999),
    )).toBe(true);
  });

  it('L’HEURE NE DÉCIDE DE RIEN : le moteur est déterministe, deux réponses à '
    + 'des instants différents décrivent la même route', () => {
    const a = provenanceDe(PARIS, LYON, 'car', {}, 0);
    const b = provenanceDe(PARIS, LYON, 'car', {}, 86_400_000);
    expect(a.obtenuLe).not.toBe(b.obtenuLe);
    expect(memeOrigine(a, b)).toBe(true);
  });

  it('LE VIA DE L’ITINÉRAIRE BIS CHANGE LA PROVENANCE — c’est très exactement le '
    + 'bug que ce contrat existe pour voir : le tracé partait avec le via, la '
    + 'feuille de route sans lui, et les deux paraissaient plausibles', () => {
    const via = { lon: 3.1, lat: 47.2 };
    const avec = provenanceDe(PARIS, LYON, 'car', { etapes: [via] });
    const sans = provenanceDe(PARIS, LYON, 'car', { etapes: [] });
    expect(memeOrigine(avec, sans)).toBe(false);
  });

  it('l’optimisation change la provenance (fastest et shortest : 17 km d’écart mesurés)', () => {
    expect(memeOrigine(
      provenanceDe(PARIS, LYON, 'car', { optimisation: 'fastest' }),
      provenanceDe(PARIS, LYON, 'car', { optimisation: 'shortest' }),
    )).toBe(false);
  });

  it('le profil aussi', () => {
    expect(memeOrigine(
      provenanceDe(PARIS, LYON, 'car', {}),
      provenanceDe(PARIS, LYON, 'pedestrian', {}),
    )).toBe(false);
  });
});

describe('le contrat raccorde le tracé et la feuille', () => {
  const trace = traceDroite(10);
  const mesure = longueurDuTrace(trace);

  it('une feuille cohérente est retenue, et ses bornes montent jusqu’au bout du tracé', () => {
    const c = contratDeRoute({
      trace,
      distanceTotaleM: mesure,
      dureeTotaleS: 3600,
      etapes: [etape(mesure / 2), etape(mesure / 2)],
      provenanceTrace: PROV('u'),
      provenanceFeuille: PROV('u'),
    });
    expect(c.rupture).toBeNull();
    expect(c.etapes).toHaveLength(2);
    expect(c.bornesM).toHaveLength(2);
    expect(c.bornesM[0]!).toBeLessThan(c.bornesM[1]!);
    // La dernière borne est la fin du tracé, exactement.
    expect(c.bornesM[1]!).toBeCloseTo(mesure, 6);
  });

  it('LES BORNES SONT RAMENÉES SUR LA RÈGLE DU TRACÉ, ce qui est tout le sujet : '
    + 'le service compte en géodésique, l’avancement à la haversine, et le second '
    + 'est 0,028 % plus court — 131 m de retard sur Paris–Lyon', () => {
    /* On rejoue le biais mesuré : le service annonce des mètres un peu plus
       longs que ceux du tracé. Sans mise à l’échelle, la borne de mi-parcours
       tomberait à 50 % des mètres DU SERVICE, donc au-delà de la moitié du
       tracé — et l’instruction arriverait en retard. */
    const annonce = mesure / 0.99972;
    const c = contratDeRoute({
      trace,
      distanceTotaleM: annonce,
      dureeTotaleS: 3600,
      etapes: [etape(annonce / 2), etape(annonce / 2)],
      provenanceTrace: PROV('u'),
      provenanceFeuille: PROV('u'),
    });
    expect(c.rupture).toBeNull();
    expect(c.bornesM[0]!).toBeCloseTo(mesure / 2, 6);
    expect(c.bornesM[0]!).toBeLessThan(annonce / 2);
    expect(c.bornesM[1]!).toBeCloseTo(mesure, 6);
  });

  it('PAS DE FEUILLE N’EST PAS UNE RUPTURE : le service d’étapes peut échouer '
    + 'seul, et le trajet reste guidable sans instructions', () => {
    const c = contratDeRoute({
      trace, distanceTotaleM: mesure, dureeTotaleS: 3600,
      etapes: [], provenanceTrace: PROV('u'),
    });
    expect(c.rupture).toBeNull();
    expect(c.etapes).toEqual([]);
    expect(c.bornesM).toEqual([]);
  });

  it('des étapes sans provenance sont écartées sans rupture — on ne sait pas d’où elles viennent', () => {
    const c = contratDeRoute({
      trace, distanceTotaleM: mesure, dureeTotaleS: 3600,
      etapes: [etape(mesure)], provenanceTrace: PROV('u'),
    });
    expect(c.rupture).toBeNull();
    expect(c.etapes).toEqual([]);
  });
});

describe('le contrat écarte la feuille plutôt que de guider faux', () => {
  const trace = traceDroite(10);
  const mesure = longueurDuTrace(trace);

  it('UNE AUTRE ORIGINE ÉCARTE LA FEUILLE, même si les longueurs concordent : '
    + 'deux routes de même longueur ne sont pas la même route', () => {
    const c = contratDeRoute({
      trace, distanceTotaleM: mesure, dureeTotaleS: 3600,
      etapes: [etape(mesure / 2), etape(mesure / 2)],
      provenanceTrace: PROV('avec-via'),
      provenanceFeuille: PROV('sans-via'),
    });
    expect(c.rupture).toBe('origine');
    expect(c.etapes).toEqual([]);
    expect(c.bornesM).toEqual([]);
    // Le tracé, lui, reste intact : on guide toujours, sans instructions.
    expect(c.trace).toBe(trace);
    expect(c.distanceTotaleM).toBeCloseTo(mesure, 6);
  });

  it('une somme d’étapes qui ne fait pas la distance écarte la feuille', () => {
    const c = contratDeRoute({
      trace, distanceTotaleM: mesure, dureeTotaleS: 3600,
      etapes: [etape(mesure * 0.7)],
      provenanceTrace: PROV('u'), provenanceFeuille: PROV('u'),
    });
    expect(c.rupture).toBe('longueur-etapes');
  });

  it('LE PLANCHER DE CINQUANTE MÈTRES PROTÈGE LES TRAJETS COURTS : deux '
    + 'millièmes de cinq kilomètres ne feraient que dix mètres, moins que le '
    + 'bruit du service', () => {
    const petit = traceDroite(5, 0.009); // ~5 km
    const m = longueurDuTrace(petit);
    const c = contratDeRoute({
      trace: petit, distanceTotaleM: m, dureeTotaleS: 600,
      etapes: [etape(m - 40)],
      provenanceTrace: PROV('u'), provenanceFeuille: PROV('u'),
    });
    expect(c.rupture).toBeNull();
  });

  it('UN TRACÉ QUI NE MESURE PAS LA DISTANCE ANNONCÉE N’EST PAS UNE RUPTURE, et '
    + 'c’est délibéré : la géométrie et la distance viennent de la MÊME réponse. '
    + 'Les confronter jugerait le service contre lui-même ; le seul joint qui nous '
    + 'appartient est celui des deux appels. La mise à l’échelle fait le reste', () => {
    const c = contratDeRoute({
      trace, distanceTotaleM: mesure * 2, dureeTotaleS: 3600,
      etapes: [etape(mesure * 2)],
      provenanceTrace: PROV('u'), provenanceFeuille: PROV('u'),
    });
    expect(c.rupture).toBeNull();
    // Et les bornes restent sur la polyligne RÉELLE, pas sur la distance annoncée.
    expect(c.bornesM[0]!).toBeCloseTo(mesure, 6);
  });

  it('LE BIAIS DE RÈGLE NE DÉCLENCHE JAMAIS D’ALARME : 0,028 %, mesuré identique '
    + 'sur quatre trajets, doit rester très en deçà du seuil', () => {
    const c = contratDeRoute({
      trace, distanceTotaleM: mesure / 0.99972, dureeTotaleS: 3600,
      etapes: [etape(mesure / 0.99972)],
      provenanceTrace: PROV('u'), provenanceFeuille: PROV('u'),
    });
    expect(c.rupture).toBeNull();
  });

  it('des étapes toutes à zéro écartent la feuille — on ne divise pas par rien', () => {
    const c = contratDeRoute({
      trace, distanceTotaleM: mesure, dureeTotaleS: 3600,
      etapes: [etape(0), etape(0)],
      provenanceTrace: PROV('u'), provenanceFeuille: PROV('u'),
    });
    expect(c.rupture).toBe('longueur-etapes');
  });

  it('chaque motif de rupture se dit en français, et dit que les instructions sont écartées', () => {
    for (const m of ['origine', 'longueur-etapes'] as const) {
      expect(motDeLaRupture(m)).toContain('écartées');
    }
  });
});

describe('le guidage lit les bornes du contrat', () => {
  const etapes = [etape(1000), etape(2000), etape(1000)];

  it('sans bornes, le cumul brut d’avant — inchangé', () => {
    expect(etapeAlAvancement(etapes, 1500)?.index).toBe(1);
    expect(etapeAlAvancement(etapes, 500)?.index).toBe(0);
    expect(etapeAlAvancement(etapes, 3500)?.index).toBe(2);
  });

  it('AVEC LES BORNES, C’EST LA RÈGLE DU TRACÉ QUI DÉCIDE : les mêmes étapes '
    + 'raccourcies de 5 % font tomber la manœuvre plus tôt, là où la voiture est '
    + 'vraiment', () => {
    const bornes = [950, 2850, 3800];
    expect(etapeAlAvancement(etapes, 960, bornes)?.index).toBe(1);
    // Sans les bornes, 960 m serait encore dans la première étape.
    expect(etapeAlAvancement(etapes, 960)?.index).toBe(0);
    const situe = etapeAlAvancement(etapes, 3000, bornes);
    expect(situe).toEqual({ index: 2, debutM: 2850, finM: 3800 });
  });

  it('des bornes qui ne correspondent pas aux étapes sont ignorées, pas suivies', () => {
    expect(etapeAlAvancement(etapes, 1500, [100])?.index).toBe(1);
  });

  it('au-delà de la dernière borne, l’instruction reste la dernière', () => {
    expect(etapeAlAvancement(etapes, 9999, [950, 2850, 3800]))
      .toEqual({ index: 2, debutM: 3800, finM: 3800 });
  });
});
