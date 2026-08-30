/* LA LISTE DES COMMODITÉS — une seule écriture, deux endroits qui l'affichent.
 *
 * LA DEMANDE. Armelin, le 30/08/2026 : « dans Copilote, quand je clique sur
 * "Commodités sur place", les informations sont affichées sous forme de
 * texte, alors que sur une borne de recharge elles sont structurées, ligne
 * par ligne, avec la distance et un logo. Ce serait bien de faire le même
 * principe dans Copilote. »
 *
 * IL A RAISON, ET LA CORRECTION N'EST PAS DE RECOPIER : la fiche de borne
 * avait ce rendu depuis le 27/08, le copilote se contentait d'une phrase.
 * Deux écritures du même affichage se seraient séparées à la première
 * retouche — c'est déjà arrivé sur les cartouches. On extrait donc CE QUI
 * EXISTE, et les deux appellent la même fonction.
 *
 * LES CLASSES RESTENT CELLES DE LA FICHE (`fb-…`) : elles sont déjà peintes,
 * déjà mesurées par des parcours, et renommer trois fichiers pour un préfixe
 * n'aurait servi personne.
 */
import { distanceM } from '../lib/le-long-du-trajet';
import { TYPES_COMMODITE, type Commodite } from '../lib/commodites';
import { svgCommodite } from './icone-commodite';

export interface OptionsListeCommodites {
  /** Montrer le lieu sur la carte — absent : le nom ne se clique pas. */
  surLaCarte?: (c: Commodite) => void;
  /** Y aller — absent : pas de bouton d'itinéraire. */
  yAller?: (c: Commodite, libelle: string) => void;
}

/**
 * La liste, triée par distance — la plus proche en tête.
 *
 * LA DISTANCE EST AFFICHÉE, et c'est le cœur : « 60 m » décide de s'y rendre
 * à pied pendant la charge, « 800 m » non. Une liste sans distances
 * obligerait à ouvrir chaque nom sur la carte pour le savoir.
 */
export function listeCommodites(
  trouvees: readonly Commodite[], cible: { lon: number; lat: number },
  options: OptionsListeCommodites = {},
): HTMLUListElement {
  const avecDistance = trouvees
    .map((c) => ({ c, m: Math.round(distanceM([cible.lon, cible.lat], [c.lon, c.lat])) }))
    .sort((a, b) => a.m - b.m);

  const liste = document.createElement('ul');
  liste.className = 'fb-liste-commodites';
  for (const { c, m } of avecDistance) {
    const li = document.createElement('li');
    const libelleType = TYPES_COMMODITE.find((t) => t.cle === c.type)?.libelle ?? c.type;
    // Un quart des commodités ne portent aucune identité : le type suffit.
    const libelle = c.nom ?? libelleType;

    /* LE PICTO DESSINÉ AVANT LE MOT — la présentation « claire et stylisée »
       demandée le 27/08. Jamais un logo d'enseigne : le picto porte le TYPE,
       le nom s'écrit à côté. */
    const picto = document.createElement('span');
    picto.className = `com-picto com-${c.type}`;
    picto.setAttribute('aria-hidden', 'true');
    picto.innerHTML = svgCommodite(c.type);

    const type = document.createElement('span');
    type.className = 'fb-commodite-type';
    type.textContent = libelleType;

    let nom: HTMLElement;
    if (options.surLaCarte) {
      /* LE NOM EST UN BOUTON : il montre le lieu sur la carte. Armelin, le
         26/08 : « ça ne me donne pas la possibilité de cliquer dessus ». */
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fb-commodite-nom';
      b.textContent = libelle;
      b.setAttribute('aria-label', `Voir ${libelle} sur la carte`);
      b.addEventListener('click', () => { options.surLaCarte?.(c); });
      nom = b;
    } else {
      /* SANS CARTE À MONTRER, PAS DE BOUTON : un bouton qui ne fait rien est
         pire qu'un texte. Le copilote s'en sert ainsi pendant le suivi — la
         carte y est occupée par la route. */
      const s = document.createElement('span');
      s.className = 'fb-commodite-nom fb-commodite-nom-fixe';
      s.textContent = libelle;
      nom = s;
    }

    const dist = document.createElement('span');
    dist.className = 'fb-commodite-distance';
    dist.textContent = `${m} m`;

    li.append(picto, type, nom, dist);

    if (options.yAller) {
      const aller = document.createElement('button');
      aller.type = 'button';
      aller.className = 'fb-commodite-aller';
      aller.textContent = 'Itinéraire';
      aller.setAttribute('aria-label', `Itinéraire vers ${libelle}`);
      aller.addEventListener('click', () => { options.yAller?.(c, libelle); });
      li.append(aller);
    }
    liste.append(li);
  }
  return liste;
}
