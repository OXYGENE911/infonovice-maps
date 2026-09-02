// CHOISIR SA LISTE EN GARDANT UN LIEU (FAVORIS-4, 03/09).
//
// LE TERRAIN. Armelin, rapportant ses usagers, deux fois dans le même retour :
//  1. « Quand on clique sur un POI et qu'on clique sur "Ajouter aux favoris",
//     on n'a pas la possibilité de choisir directement dans quelle catégorie
//     l'enregistrer (Listes de favoris). »
//  2. « Quand on clique sur une borne de recharge, on peut y aller, mais on ne
//     peut pas l'ajouter en favoris dans une liste qu'on aurait créée pour
//     retrouver plus facilement ses bornes de recharge favorites. »
//
// LES LISTES EXISTENT DEPUIS FAVORIS-2, ET LE STOCKAGE LES PORTE DÉJÀ :
// `ajouterFavori(nom, point, liste)` accepte l'identifiant d'une liste depuis
// le 31/08. Seule l'interface ne le demandait jamais — tout ce qu'on gardait
// depuis une fiche tombait dans « Lieux favoris ». Ranger après coup, depuis
// le volet, demande de retrouver ce qu'on vient d'ajouter : c'est le geste que
// personne ne fait.
//
// ON NE DEMANDE RIEN QUAND IL N'Y A RIEN À DEMANDER. Poser une question dont
// la réponse est forcée fait perdre du temps en ayant l'air d'offrir quelque
// chose. AUJOURD'HUI LA QUESTION SE POSE TOUJOURS : `versListes` remet les
// trois listes livrées en tête quoi qu'il arrive, donc `listerListes` en rend
// au moins trois. Le garde n'est donc pas une promesse d'interface — c'est un
// filet : si un jour le stockage n'en rend qu'une, on garde dans celle-là au
// lieu d'ouvrir une rangée à un seul bouton. Il se mesure sur la fonction
// pure `demanderLaListe`, faute de pouvoir l'atteindre depuis un parcours.
//
// ET LE CHOIX RESTE EN PLACE, sans fenêtre par-dessus. Les fiches de lieu et
// de borne occupent déjà un bord de l'écran, et la règle « une seule surface à
// la fois » (lib/panneaux) les fermerait l'une l'autre. Les listes paraissent
// donc SOUS le bouton, comme une seconde ligne du même geste.

import { ajouterFavori, listerListes } from '../lib/favoris';
import type { PointGeo } from '../lib/coordonnees';
import type { ListeFavoris } from '../lib/listes-favoris';

/** Ce que le bouton dit une fois le lieu gardé. */
export const DIT_GARDE = 'Ajouté aux favoris';

/* LE VOLET DES FAVORIS DOIT L'APPRENDRE, et aucune fiche ne le connaît.
   Le cartouche d'une borne vit dans son propre composant, la fiche d'un lieu
   dans le filtre des POI : leur passer une référence au panneau reviendrait à
   coudre ensemble quatre modules pour un rafraîchissement. On ANNONCE donc
   l'ajout sur le document, et le panneau écoute — c'est le seul à devoir se
   redessiner, et il est le seul à savoir comment.

   SANS CELA, le défaut est réel et non pas théorique : on garde une borne,
   on ouvre le volet, et il est vide jusqu'au rechargement de la page. */
export const AJOUT_FAVORI = 'favori-ajoute';

/**
 * Le libellé d'une liste, tel qu'on le presse — PURE.
 *
 * L'émoji d'abord : c'est lui qu'on reconnaît d'un coup d'œil dans une rangée
 * de six.
 */
export function libelleListe(l: ListeFavoris): string {
  return `${l.emoji} ${l.nom}`;
}

/**
 * Faut-il poser la question ? — PURE.
 *
 * En dessous de deux listes, il n'y a pas de choix : la rangée n'apprendrait
 * rien et coûterait un clic.
 */
export function demanderLaListe(listes: readonly ListeFavoris[]): boolean {
  return listes.length > 1;
}

/**
 * Installe le geste « garder, dans la liste que je choisis ».
 *
 * @param bouton   le bouton « Ajouter aux favoris » déjà posé par l'appelant
 * @param hote     l'élément sous lequel les listes paraissent
 * @param quoi     le nom et le point du lieu à garder
 */
export function brancherAjoutFavori(
  bouton: HTMLButtonElement,
  hote: HTMLElement,
  quoi: () => { nom: string; point: PointGeo },
): void {
  let choix: HTMLElement | null = null;

  const garder = (liste?: string, nomListe?: string): void => {
    const { nom, point } = quoi();
    bouton.disabled = true;
    void ajouterFavori(nom, point, liste)
      .then(() => {
        choix?.remove();
        choix = null;
        /* ON DIT DANS QUELLE LISTE : sans le nom, l'usager qui vient de
           choisir ne sait pas si son choix a porté, et ira vérifier. */
        bouton.textContent = nomListe ? `${DIT_GARDE} — ${nomListe}` : DIT_GARDE;
        document.dispatchEvent(new CustomEvent(AJOUT_FAVORI));
      })
      .catch(() => {
        bouton.disabled = false;
        bouton.textContent = 'Ajout impossible (stockage local indisponible)';
      });
  };

  bouton.addEventListener('click', () => {
    /* UN SECOND CLIC REFERME LE CHOIX : on a changé d'avis, et laisser la
       rangée ouverte obligerait à choisir pour s'en débarrasser. */
    if (choix !== null) { choix.remove(); choix = null; return; }
    void listerListes()
      .then((listes) => {
        if (!demanderLaListe(listes)) { garder(listes[0]?.id, listes[0]?.nom); return; }
        choix = document.createElement('div');
        choix.className = 'choix-liste';
        choix.setAttribute('role', 'group');
        choix.setAttribute('aria-label', 'Choisir une liste de favoris');
        const titre = document.createElement('p');
        titre.className = 'choix-liste-titre';
        titre.textContent = 'Dans quelle liste ?';
        choix.append(titre);
        for (const l of listes) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'choix-liste-bouton';
          b.style.setProperty('--teinte', l.couleur);
          b.textContent = libelleListe(l);
          b.addEventListener('click', () => { garder(l.id, l.nom); });
          choix.append(b);
        }
        hote.append(choix);
        /* LE FOCUS ENTRE DANS LA RANGÉE : au clavier, une liste qui paraît
           sans recevoir le focus est une liste qu'on ne trouve pas. */
        choix.querySelector('button')?.focus({ preventScroll: true });
      })
      .catch(() => {
        /* SANS LISTES LISIBLES, ON GARDE QUAND MÊME : perdre l'ajout parce
           qu'on n'a pas su lire les catégories serait le pire des deux. */
        garder();
      });
  });
}
