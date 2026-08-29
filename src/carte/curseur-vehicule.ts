/* LE CURSEUR DU VÉHICULE — où l'on est, et vers où l'on va.
 *
 * LA DEMANDE. Armelin, le 29/08/2026, après un essai au volant : « pendant
 * la navigation, il n'y a pas d'icône représentant ma voiture au milieu de
 * la carte sur le trajet. Actuellement, c'est un objet fantôme qui se
 * déplace et on ne peut pas savoir où on est ». Le point bleu de MapLibre
 * n'existe que si l'on a pressé « Me localiser » : en suivi, personne ne le
 * fait — la carte glissait sous un curseur absent.
 *
 * TROIS FORMES, AU CHOIX DE L'USAGER (« comme une flèche, une voiture etc. »),
 * gardées sur l'appareil comme le reste. Elles sont DESSINÉES ICI, au trait,
 * dans le même esprit que les éclairs et les pictos de menu : rien de binaire
 * au dépôt, tout se relit. Armelin envisage de faire produire des images
 * plus travaillées : le jour où elles arriveront, seule la table `FORMES`
 * changera — le reste du module ne connaît que « un markup, une taille ».
 *
 * L'ORIENTATION EST CELLE DE LA ROUTE, pas celle de l'écran :
 * `rotationAlignment: 'map'` fait tourner le curseur AVEC la carte. En mode
 * « cap en haut », la flèche pointe donc toujours vers le haut de l'écran —
 * ce qui est exact, et non pas figé : c'est la carte qui a tourné.
 */
import { Marker, type Map as CarteMapLibre } from 'maplibre-gl';

/** Les formes proposées. `point` est le repli sobre : aucune direction. */
export type FormeCurseur = 'fleche' | 'voiture' | 'point';

export const FORMES: { cle: FormeCurseur; libelle: string; markup: string }[] = [
  {
    cle: 'fleche', libelle: 'Flèche',
    /* Une ogive qui montre où l'on va — la forme la plus lisible en
       mouvement, et celle qui ment le moins : elle ne prétend pas être une
       voiture vue du ciel. */
    markup: '<path d="M16 3.4 26.6 27 16 21.4 5.4 27Z"/>',
  },
  {
    cle: 'voiture', libelle: 'Voiture',
    // Une silhouette vue de dessus : capot en haut, quatre roues, un toit.
    markup: '<path d="M10.6 6.2h10.8l1.6 6.4v13.2a1.6 1.6 0 0 1-1.6 1.6h-1.4'
      + 'a1.6 1.6 0 0 1-1.6-1.6H14a1.6 1.6 0 0 1-1.6 1.6H11a1.6 1.6 0 0 1-1.6-1.6'
      + 'V12.6Z"/><path class="curseur-creux" d="M12.4 12.4h7.2l.9 4.6h-9Z"/>',
  },
  {
    cle: 'point', libelle: 'Point',
    markup: '<circle cx="16" cy="16" r="8.4"/>',
  },
];

/* SUR LA CARTE, PLUS GRAND QUE DANS LE CHOIX : le curseur se lit à bout de
   bras, au volant, sur un fond chargé. 26 px suffisent à une vignette qu'on
   regarde de près ; 38 px sont le minimum pour être vu sans chercher. */
const TAILLE_CARTE = 38;

/** La forme par défaut : elle dit la direction sans rien prétendre d'autre. */
export const FORME_DEFAUT: FormeCurseur = 'fleche';

/** La clé de préférence — locale, comme tout le reste (contrainte 4). */
export const PREF_CURSEUR = 'curseur-vehicule';

/** Rend la forme demandée, ou celle par défaut si la valeur est inconnue. */
export function formeValide(brut: unknown): FormeCurseur {
  return FORMES.some((f) => f.cle === brut) ? brut as FormeCurseur : FORME_DEFAUT;
}

/**
 * Le markup SVG d'une forme, à la taille voulue.
 *
 * Le liseré blanc n'est pas décoratif : sur un fond satellite ou une
 * autoroute grise, un aplat bleu sans contour disparaît.
 */
export function curseurSVG(forme: FormeCurseur, taille = 32): string {
  const { markup } = FORMES.find((f) => f.cle === forme) ?? FORMES[0]!;
  return `<svg class="curseur-vehicule curseur-${forme}" width="${taille}" height="${taille}"`
    + ` viewBox="0 0 32 32" aria-hidden="true" focusable="false">${markup}</svg>`;
}

/**
 * Le curseur posé sur la carte, et suivi de fixe en fixe.
 *
 * Il ne s'attache QUE pendant le suivi : hors navigation, la position vit
 * dans le contrôle de MapLibre, et deux repères pour une seule voiture
 * seraient un mensonge de plus.
 */
export class CurseurVehicule {
  #marqueur: Marker | null = null;
  #carte: CarteMapLibre | null = null;
  #forme: FormeCurseur = FORME_DEFAUT;
  /** Le dernier cap tenu : à l'arrêt, on garde celui de la dernière route. */
  #cap = 0;

  get forme(): FormeCurseur { return this.#forme; }

  /** Change la forme à chaud — le curseur posé se redessine sans clignoter. */
  set forme(f: FormeCurseur) {
    this.#forme = formeValide(f);
    const element = this.#marqueur?.getElement();
    if (element) element.innerHTML = curseurSVG(this.#forme, TAILLE_CARTE);
  }

  /** Pose (ou déplace) le curseur. `cap` en degrés, `null` = on garde l'acquis. */
  poser(carte: CarteMapLibre, lon: number, lat: number, cap: number | null): void {
    this.#carte = carte;
    if (cap !== null && Number.isFinite(cap)) this.#cap = cap;
    if (!this.#marqueur) {
      const element = document.createElement('div');
      element.className = 'curseur-porte';
      element.innerHTML = curseurSVG(this.#forme, TAILLE_CARTE);
      this.#marqueur = new Marker({
        element,
        // Le curseur tourne AVEC la carte : c'est la route qu'il montre.
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      });
      this.#marqueur.setLngLat([lon, lat]).addTo(carte);
    } else {
      this.#marqueur.setLngLat([lon, lat]);
    }
    // Le point n'a pas de nez : le faire tourner ne ferait que scintiller.
    this.#marqueur.setRotation(this.#forme === 'point' ? 0 : this.#cap);
  }

  /** Retire le curseur — fin du suivi, ou navigation interrompue. */
  retirer(): void {
    this.#marqueur?.remove();
    this.#marqueur = null;
    this.#carte = null;
  }
}

/**
 * Le cap d'un déplacement, en degrés depuis le nord — PURE.
 *
 * LE RECOURS QUAND LE GPS SE TAIT : `coords.heading` est souvent nul (à
 * l'arrêt, sur un récepteur d'ordinateur, dans un tunnel qui vient de
 * rendre la main). Deux points suffisent alors à dire vers où l'on va.
 * Rend `null` sous le seuil : deux fixes au même endroit ne décrivent
 * aucune direction, ils décrivent du bruit.
 */
export function capEntre(
  de: [number, number], vers: [number, number], seuilM = 3,
): number | null {
  const rad = Math.PI / 180;
  const dLon = (vers[0] - de[0]) * rad;
  const lat1 = de[1] * rad;
  const lat2 = vers[1] * rad;
  /* Sous le seuil, on se tait. La conversion en mètres est celle du reste du
     projet : un degré de latitude vaut 111 320 m, la longitude se resserre
     avec le cosinus de la latitude. */
  const dx = (vers[0] - de[0]) * 111_320 * Math.cos(((de[1] + vers[1]) / 2) * rad);
  const dy = (vers[1] - de[1]) * 111_320;
  if (Math.hypot(dx, dy) < seuilM) return null;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}
