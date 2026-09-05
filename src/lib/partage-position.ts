/* PARTAGER SA POSITION (OUTILS-2, 06/09/2026) — le calcul PUR.
 *
 * Armelin : « une icône pour partager sa géolocalisation ». Le lien est celui
 * que l'application sait déjà lire (#lieu=lon,lat,nom — lib/partage-favoris) :
 * qui l'ouvre voit le point sur la carte, sans compte, sans serveur. Rien ne
 * part de chez nous : c'est l'usager qui envoie le lien, par le partage du
 * téléphone ou le presse-papiers. */
import { formaterCoordonnees } from './coordonnees';

export const NOM_POSITION = 'Ma position';

/** L'adresse de la page (origine + chemin), sans fragment ni requête. */
export function baseDuLien(href: string): string {
  const u = new URL(href);
  return `${u.origin}${u.pathname}`;
}

/** Le lien à partager — cinq décimales : un mètre, pas plus que le GPS ne sait. */
export function lienPosition(base: string, lon: number, lat: number, nom = NOM_POSITION): string {
  return `${base}#lieu=${lon.toFixed(5)},${lat.toFixed(5)},${encodeURIComponent(nom)}`;
}

/** Le texte qui accompagne le lien : l'adresse quand on la connaît, sinon les coordonnées. */
export function textePartage(lon: number, lat: number, adresse: string | null): string {
  const ou = adresse ? `${adresse} (${formaterCoordonnees({ lon, lat })})` : formaterCoordonnees({ lon, lat });
  return `Ma position : ${ou}`;
}
