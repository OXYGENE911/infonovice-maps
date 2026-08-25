/* PALIERS DE PUISSANCE DE RECHARGE — la décision, pure et testée.
 *
 * Ce que l'usager cherche des yeux sur une carte n'est pas l'enseigne de la
 * borne, c'est « puis-je recharger VITE ici ». Trois paliers y répondent d'un
 * coup d'œil, là où un logo de réseau demande de savoir ce que ce réseau
 * déploie. C'est aussi la seule façon de le dire sans republier des marques
 * déposées ni poser un binaire au dépôt.
 *
 * Les seuils sont ceux de l'usage courant du secteur :
 *   1 éclair  — jusqu'à 50 kW inclus  : charge lente à accélérée
 *   2 éclairs — de 50 à 150 kW inclus : charge rapide
 *   3 éclairs — au-delà de 150 kW     : charge très rapide
 */

export type Palier = 1 | 2 | 3;

/**
 * Le palier d'une borne, ou `null` quand la puissance est inconnue.
 *
 * `null` N'EST PAS un palier de repli : une borne dont le producteur n'a pas
 * déclaré la puissance ne doit pas se déguiser en borne lente. Elle porte une
 * pastille neutre, et l'usager sait qu'il ne sait pas.
 */
export function palierDe(puissanceKw: number | null | undefined): Palier | null {
  if (typeof puissanceKw !== 'number' || !Number.isFinite(puissanceKw) || puissanceKw <= 0) {
    return null;
  }
  if (puissanceKw <= 50) return 1;
  if (puissanceKw <= 150) return 2;
  return 3;
}

export const PALIERS: readonly { palier: Palier; libelle: string; borne: string; couleur: string }[] = [
  { palier: 1, libelle: 'Charge lente', borne: 'jusqu’à 50 kW', couleur: '#5B7A9E' },
  { palier: 2, libelle: 'Charge rapide', borne: 'de 50 à 150 kW', couleur: '#C98A16' },
  { palier: 3, libelle: 'Charge très rapide', borne: 'plus de 150 kW', couleur: '#1E9E5A' },
] as const;

/** Le libellé lisible d'une puissance, pour une popup ou un lecteur d'écran. */
export function libellePalier(puissanceKw: number | null | undefined): string {
  const p = palierDe(puissanceKw);
  if (p === null) return 'Puissance non déclarée par le producteur';
  const def = PALIERS.find((x) => x.palier === p);
  return `${def?.libelle ?? ''} (${def?.borne ?? ''})`;
}
