// SIGNALER UNE ERREUR DE CARTE (SENS-1, 05/09/2026).
//
// LE TERRAIN. Armelin, avenue Daumesnil : « le GPS m'a demandé de tourner à
// droite sur l'avenue du Général-Michel-Bizot. Sauf que cette rue vient de
// passer en sens unique et je me suis retrouvé face à un panneau de sens
// interdit. La cartographie ne l'avait pas vue. » MESURÉ le 05/09 :
// OpenStreetMap porte déjà `oneway=yes` sur ces tronçons ; la BD TOPO de la
// Géoplateforme — qui nourrit l'itinéraire — pas encore. Ce n'est pas une
// erreur de code, c'est une donnée en retard chez le producteur : la seule
// chose utile est de la lui DIRE, à l'endroit exact, avec deux gestes.
//
// DEUX LIENS, AUCUNE DONNÉE ENVOYÉE D'OFFICE : ils s'ouvrent dans un onglet,
// à la position courante ; c'est l'usager qui écrit et qui envoie. Note OSM :
// sans compte. cartes.gouv.fr (le visualiseur de l'IGN, successeur du
// Géoportail) : son outil de signalement remonte à l'espace collaboratif IGN.

export interface LiensSignalement {
  osm: string;
  ign: string;
}

/** Les deux adresses de signalement, centrées sur la position — PURE. */
export function liensSignalement(lon: number, lat: number): LiensSignalement {
  const la = lat.toFixed(5);
  const lo = lon.toFixed(5);
  return {
    osm: `https://www.openstreetmap.org/note/new#map=18/${la}/${lo}`,
    ign: `https://cartes.gouv.fr/cartes?c=${lo},${la}&z=18`,
  };
}
