/* REPÈRES — le domicile et le travail.
 *
 * Ce ne sont PAS des favoris, et la distinction n'est pas cosmétique : un
 * favori est une collection ouverte que l'usager nomme, un repère est un rôle
 * UNIQUE que l'application connaît. « Rentrer chez moi » doit être un geste,
 * pas une recherche dans une liste.
 *
 * Ils vivent dans les préférences locales, donc dans l'export/import JSON de
 * la PR #10 : ils suivent l'usager d'un appareil à l'autre sans qu'aucun
 * serveur n'apprenne où il habite. C'est précisément la donnée qu'on ne
 * confierait à personne.
 */
import type { PointGeo } from './coordonnees';
import { lirePreference, ecrirePreference } from './stockage';

export type CleRepere = 'domicile' | 'travail';

export const REPERES: readonly { cle: CleRepere; libelle: string; verbe: string }[] = [
  { cle: 'domicile', libelle: 'Domicile', verbe: 'Rentrer' },
  { cle: 'travail', libelle: 'Travail', verbe: 'Aller au travail' },
] as const;

export interface Repere extends PointGeo {
  /** L'adresse telle qu'elle a été trouvée, pour que l'usager la reconnaisse. */
  libelle: string;
  /** Date de définition, ISO 8601. */
  defini: string;
}

const cleStockage = (cle: CleRepere): string => `repere-${cle}`;

/* LA VALIDATION EST PURE ET DÉFENSIVE, comme celle des favoris : la valeur
   relue vient d'IndexedDB, éventuellement d'un fichier d'import forgé. On ne
   la croit pas — un repère mal formé rend `null`, jamais une surprise. */
export function validerRepere(brut: unknown): Repere | null {
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) return null;
  const r = brut as Record<string, unknown>;
  /* PROPRIÉTÉS PROPRES SEULEMENT. `r['lon']` remonte la chaîne de prototypes :
     un objet forgé par `Object.create({ lon, lat })` passait pour un repère
     valide. C'est le défaut exact attrapé à la revue du 22/08 sur les
     préférences POI, et il se reproduit partout où l'on lit une valeur venue
     du dehors sans se demander d'où elle vient vraiment. */
  const propre = (cle: string): unknown =>
    (Object.hasOwn(r, cle) ? r[cle] : undefined);
  const lon = propre('lon');
  const lat = propre('lat');
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  const brutLibelle = propre('libelle');
  const libelle = typeof brutLibelle === 'string' && brutLibelle.trim() !== ''
    ? brutLibelle.trim() : 'Lieu sans nom';
  const brutDefini = propre('defini');
  const defini = typeof brutDefini === 'string' ? brutDefini : '';
  return { lon, lat, libelle, defini };
}

export async function lireRepere(cle: CleRepere): Promise<Repere | null> {
  return validerRepere(await lirePreference<unknown>(cleStockage(cle)));
}

export async function ecrireRepere(
  cle: CleRepere, point: PointGeo, libelle: string,
): Promise<Repere> {
  const repere: Repere = {
    lon: point.lon, lat: point.lat,
    libelle: libelle.trim() || 'Lieu sans nom',
    defini: new Date().toISOString(),
  };
  await ecrirePreference(cleStockage(cle), repere);
  return repere;
}

export async function effacerRepere(cle: CleRepere): Promise<void> {
  await ecrirePreference(cleStockage(cle), null);
}
