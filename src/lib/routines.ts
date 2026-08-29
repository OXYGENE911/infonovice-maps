/* LES ROUTINES LOCALES — la décision d'Armelin du 29/08.
 *
 * L'application APPREND les trajets qu'on refait — et propose le bon au bon
 * moment : « Au travail » un mardi matin, « À la maison » le soir, « Chez ma
 * sœur » le samedi si c'est l'habitude. RGPD BY DESIGN, comme tout le
 * reste : les habitudes vivent dans IndexedDB, ne quittent JAMAIS le
 * navigateur, se voient (le volet Favoris dit combien) et s'effacent d'un
 * bouton. Une routine qu'on ne peut ni voir ni effacer serait un mouchard.
 *
 * LE CHOIX EST PUR ET TESTÉ À SEC : l'heure et le jour entrent en
 * paramètres, jamais lus d'une horloge cachée.
 */
import type { PointGeo } from './coordonnees';
import { lirePreference, ecrirePreference } from './stockage';

/** Une destination apprise : où, comment elle s'appelle, quand et combien. */
export interface Habitude extends PointGeo {
  nom: string;
  /** Nombre de trajets calculés vers elle, par tranche de la journée. */
  matin: number;
  apresMidi: number;
  soir: number;
  /** Dernier trajet, ISO 8601 — les habitudes mortes s'oublient. */
  dernier: string;
}

export const PREF_ROUTINES = 'routines-trajets';

/* Au-delà, la liste n'est plus une habitude, c'est un historique — et un
   historique n'a rien à faire ici. Les moins utilisées tombent. */
const MAX_HABITUDES = 40;

/** La tranche d'une heure donnée. La nuit ne suggère rien : à 3 h du matin,
    on sait où l'on va. */
export type Tranche = 'matin' | 'apresMidi' | 'soir' | 'nuit';

export function trancheDe(quand: Date): Tranche {
  const h = quand.getHours();
  if (h >= 5 && h < 11) return 'matin';
  if (h >= 11 && h < 16) return 'apresMidi';
  if (h >= 16 && h < 22) return 'soir';
  return 'nuit';
}

const cleDe = (p: PointGeo): string => `${p.lon.toFixed(4)},${p.lat.toFixed(4)}`;

/** Lit les habitudes — défensif : la préférence vient d'un stockage versionné. */
export async function lireHabitudes(): Promise<Habitude[]> {
  const brut = await lirePreference<unknown>(PREF_ROUTINES);
  if (!Array.isArray(brut)) return [];
  return brut.filter((h): h is Habitude => {
    const x = h as Record<string, unknown>;
    return typeof x['nom'] === 'string' && typeof x['lon'] === 'number'
      && typeof x['lat'] === 'number' && Number.isFinite(x['lon']) && Number.isFinite(x['lat']);
  });
}

/**
 * Apprend un trajet calculé. UNE destination, UN moment — rien d'autre :
 * ni le départ, ni le tracé, ni la durée. Le strict nécessaire pour
 * suggérer, pas de quoi reconstituer une vie.
 */
export async function apprendreTrajet(
  nom: string, point: PointGeo, quand: Date,
): Promise<void> {
  const tranche = trancheDe(quand);
  if (tranche === 'nuit') return;
  const habitudes = await lireHabitudes();
  const cle = cleDe(point);
  const existante = habitudes.find((h) => cleDe(h) === cle);
  if (existante) {
    existante[tranche] += 1;
    existante.dernier = quand.toISOString();
    existante.nom = nom; // le dernier nom employé gagne : on renomme ses lieux
  } else {
    habitudes.push({
      nom, lon: point.lon, lat: point.lat,
      matin: 0, apresMidi: 0, soir: 0,
      [tranche]: 1,
      dernier: quand.toISOString(),
    } as Habitude);
  }
  habitudes.sort((a, b) =>
    (b.matin + b.apresMidi + b.soir) - (a.matin + a.apresMidi + a.soir));
  await ecrirePreference(PREF_ROUTINES, habitudes.slice(0, MAX_HABITUDES));
}

/** Tout oublier — le bouton du volet Favoris. */
export async function oublierHabitudes(): Promise<void> {
  await ecrirePreference(PREF_ROUTINES, []);
}

export interface Suggestion {
  nom: string;
  point: PointGeo;
  /** Pourquoi elle est proposée — l'interface le dit, jamais de magie muette. */
  motif: string;
}

/**
 * Les suggestions du moment — PURE.
 *
 * Les REPÈRES d'abord, parce qu'ils sont déclarés, pas devinés : le travail
 * un matin de semaine, le domicile un soir. Puis les habitudes de la
 * tranche courante — TROIS trajets au moins : deux allers chez le dentiste
 * ne font pas une routine. Trois suggestions au plus : au-delà, c'est un
 * menu de plus.
 */
export function suggerer(
  habitudes: readonly Habitude[],
  reperes: { domicile?: PointGeo & { libelle: string }; travail?: PointGeo & { libelle: string } },
  quand: Date,
): Suggestion[] {
  const tranche = trancheDe(quand);
  if (tranche === 'nuit') return [];
  const jour = quand.getDay();
  const semaine = jour >= 1 && jour <= 5;
  const rendu: Suggestion[] = [];

  if (semaine && tranche === 'matin' && reperes.travail) {
    rendu.push({ nom: 'Au travail', point: reperes.travail, motif: 'un matin de semaine' });
  }
  if (semaine && tranche === 'soir' && reperes.domicile) {
    rendu.push({ nom: 'À la maison', point: reperes.domicile, motif: 'un soir de semaine' });
  }

  const dejaLa = (p: PointGeo): boolean =>
    rendu.some((r) => cleDe(r.point) === cleDe(p));
  const habituelles = habitudes
    .filter((h) => h[tranche] >= 3 && !dejaLa(h))
    .sort((a, b) => b[tranche] - a[tranche]);
  for (const h of habituelles) {
    if (rendu.length >= 3) break;
    rendu.push({
      nom: h.nom, point: { lon: h.lon, lat: h.lat },
      motif: `habituel le ${tranche === 'apresMidi' ? 'après-midi' : tranche}`,
    });
  }
  return rendu;
}
