/* LES FAVORIS DEVIENNENT DES TRAITS DE CARTE — PURE (MES-POI-1, 04/09).
 *
 * LA DEMANDE. Armelin : « lorsqu'on utilise la liste des favoris et qu'on
 * enregistre des POI avec un émoji, ce serait bien de voir apparaître les
 * émojis en question sur la carte. Il faudrait ajouter un filtre "Mes POIs"
 * pour afficher ou masquer ses propres POI. »
 *
 * CE MODULE NE FAIT QUE LA TRADUCTION : des favoris et des listes vers les
 * traits GeoJSON que la carte posera. Il est pur pour être testé à sec —
 * la carte, elle, ne se teste qu'en parcours.
 */
import type { Favori } from './favoris';
import { LISTES_LIVREES, LISTE_PAR_DEFAUT, type ListeFavoris } from './listes-favoris';

/** Un trait prêt pour la source GeoJSON de la carte. */
export interface TraitFavori {
  type: 'Feature';
  properties: {
    /** Le rang dans la liste d'origine — la fiche se retrouve par lui. */
    rang: number;
    /** La clé d'image MapLibre : une par liste, pas une par favori. */
    image: string;
    nom: string;
  };
  geometry: { type: 'Point'; coordinates: [number, number] };
}

/** La clé d'image d'une liste — UNE image par liste, réutilisée partout. */
export function cleImageListe(listeId: string): string {
  return `mes-poi-${listeId}`;
}

/**
 * La liste d'un favori, jamais nulle.
 *
 * LES FAVORIS D'AVANT FAVORIS-2 n'en portent pas ; une liste effacée peut
 * laisser un identifiant orphelin dans un export réimporté. Dans les deux
 * cas, ils rejoignent « Lieux favoris » — le même repli que partout
 * ailleurs : un favori sans pastille serait un favori invisible, le défaut
 * exact qu'on corrige.
 */
export function listeDe(
  favori: Favori, listes: readonly ListeFavoris[],
): ListeFavoris {
  const trouvee = listes.find((l) => l.id === (favori.liste ?? LISTE_PAR_DEFAUT));
  return trouvee ?? listes.find((l) => l.id === LISTE_PAR_DEFAUT)
    ?? (LISTES_LIVREES[0] as ListeFavoris);
}

/** Les traits à poser, et les listes dont il faudra l'image. */
export function traitsFavoris(
  favoris: readonly Favori[], listes: readonly ListeFavoris[],
): { traits: TraitFavori[]; listesUtiles: ListeFavoris[] } {
  const utiles = new Map<string, ListeFavoris>();
  const traits = favoris.map((f, rang): TraitFavori => {
    const liste = listeDe(f, listes);
    utiles.set(liste.id, liste);
    return {
      type: 'Feature',
      properties: { rang, image: cleImageListe(liste.id), nom: f.nom },
      geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
    };
  });
  return { traits, listesUtiles: [...utiles.values()] };
}
