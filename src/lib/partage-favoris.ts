/* PARTAGE DE FAVORIS PAR LIEN — la demande d'Armelin du 28/08 : « une option
 * pour exporter les favoris si on change de téléphone ou d'ordinateur. Et
 * même un partage de favoris. »
 *
 * AUCUN SERVEUR, comme le partage d'itinéraire : tout vit dans le fragment
 * (#…), qui n'est JAMAIS envoyé au serveur HTTP — les lieux enregistrés ne
 * quittent pas plus le navigateur qu'avant, ils voyagent de la main à la
 * main. L'export/import JSON existant reste l'outil du DÉMÉNAGEMENT complet
 * (favoris ET préférences) ; le lien, lui, transporte les favoris seuls.
 *
 * LES REPÈRES (domicile, travail) N'Y ENTRENT PAS, et c'est délibéré :
 * partager « chez moi » d'un geste distrait est exactement le genre
 * d'accident qu'un format doit rendre impossible — pas improbable.
 *
 * Forme : #favs=nom~lon~lat|nom~lon~lat|…   (nom en encodeURIComponent ;
 * cinq décimales ≈ 1 m, la précision de la BAN, comme le partage de trajet.)
 */
import type { Favori } from './favoris';
import type { PointGeo } from './coordonnees';

/** Un lieu tel qu'il voyage : le nom et la position, rien d'autre. */
export interface LieuPartage extends PointGeo { nom: string }

/* Au-delà, l'URL devient déraisonnable (≈ 40 octets par lieu) et le fichier
   d'export est le bon outil — le refus le dira avec ce remède. */
export const MAX_LIEUX_PARTAGES = 100;

const f = (n: number): string => n.toFixed(5);

/**
 * Le fragment d'un lot de favoris. Lève si le lot déborde : l'appelant
 * affiche le motif et le remède (l'export), il ne tronque pas en silence.
 */
export function versFragmentFavoris(favoris: readonly Pick<Favori, 'nom' | 'lon' | 'lat'>[]): string {
  if (favoris.length === 0) throw new ErreurPartageFavoris('Aucun favori à partager.');
  if (favoris.length > MAX_LIEUX_PARTAGES) {
    throw new ErreurPartageFavoris(
      `Un lien porte au plus ${MAX_LIEUX_PARTAGES} favoris (vous en avez ${favoris.length}).`
      + ' Pour tout transporter, utilisez « Exporter mes données ».');
  }
  const lieux = favoris
    .map((x) => `${encodeURIComponent(x.nom)}~${f(x.lon)}~${f(x.lat)}`)
    .join('|');
  return `#favs=${lieux}`;
}

export class ErreurPartageFavoris extends Error {}

/**
 * Analyse DÉFENSIVE d'un fragment reçu : un lien forgé rend null, jamais une
 * exception — et jamais un lot partiel, qui ferait croire à un import réussi.
 */
export function depuisFragmentFavoris(fragment: string): LieuPartage[] | null {
  const m = /^#favs=(.+)$/.exec(fragment);
  if (!m) return null;
  const lieux: LieuPartage[] = [];
  for (const seg of m[1]!.split('|')) {
    const parts = seg.split('~');
    if (parts.length !== 3) return null;
    const [brutNom, brutLon, brutLat] = parts;
    let nom: string;
    try { nom = decodeURIComponent(brutNom!).trim(); } catch { return null; }
    const lon = Number(brutLon); const lat = Number(brutLat);
    if (nom === '' || nom.length > 120) return null;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)
      || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
    lieux.push({ nom, lon, lat });
  }
  if (lieux.length === 0 || lieux.length > MAX_LIEUX_PARTAGES) return null;
  return lieux;
}

/**
 * Écarte les lieux DÉJÀ enregistrés — même position à cinq décimales (≈ 1 m).
 * La position, pas le nom : le même endroit renommé reste le même endroit,
 * et l'importer en double ferait deux pastilles l'une sur l'autre.
 */
export function sansDejaConnus(
  lieux: readonly LieuPartage[], existants: readonly Pick<Favori, 'lon' | 'lat'>[],
): LieuPartage[] {
  const connus = new Set(existants.map((x) => `${f(x.lon)},${f(x.lat)}`));
  return lieux.filter((l) => !connus.has(`${f(l.lon)},${f(l.lat)}`));
}
