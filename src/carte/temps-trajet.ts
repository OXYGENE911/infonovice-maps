/* LE TEMPS DE TRAJET PAR MODE, À LA DEMANDE — le module partagé des fiches
 * (TEMPS-POI-1 puis RAIL-DISTANCE-ROUTE, 04/09).
 *
 * QUATRE MODES, DEUX REQUÊTES AU PLUS, ZÉRO D'OFFICE : le moteur public ne
 * connaît que `car` et `pedestrian` — la moto partage la voiture, le vélo se
 * déduit du chemin piéton (dureeVelo, la règle du planificateur). Chaque
 * appui coûte UNE requête, mise en cache pour les modes frères.
 *
 * POURQUOI LA VRAIE DISTANCE ET PAS UNE ESTIMATION : mesuré le 04/09 sur
 * huit paires (Paris intra-muros, banlieues, Nantes, Lille, Marseille,
 * Toulouse), le rapport route / vol d'oiseau va de 1,21 à 2,33 — les sens
 * uniques et les fleuves ruinent toute constante, et le pire est sur les
 * COURTES distances, l'usage même des listes « à proximité ». Un « ≈ ×1,25 »
 * aurait menti là où il servait le plus. On affiche donc du MESURÉ, à la
 * demande, ou rien.
 */
import { positionConnueActuelle } from './recherche';
import { calculerItineraire, formaterDuree, type Profil } from '../lib/itineraire';
import { dureeVelo } from '../lib/modes-deplacement';

interface Reponse { duree: number; distance: number }

const MODES: { icone: string; nom: string; profil: Profil;
  duree: (r: Reponse) => number; estime?: boolean }[] = [
  { icone: '🚗', nom: 'en voiture', profil: 'car', duree: (r) => r.duree },
  { icone: '🏍️', nom: 'à moto', profil: 'car', duree: (r) => r.duree },
  { icone: '🚲', nom: 'à vélo', profil: 'pedestrian', duree: (r) => dureeVelo(r.distance), estime: true },
  { icone: '🚶', nom: 'à pied', profil: 'pedestrian', duree: (r) => r.duree },
];

/**
 * Pose la rangée « Temps de trajet : 🚗 🏍️ 🚲 🚶 » et sa ligne de réponse
 * dans `boite`. Les classes restent celles de la fiche des lieux : un seul
 * habit pour toutes les fiches.
 */
export function brancherTempsTrajet(
  boite: HTMLElement, vers: { lon: number; lat: number },
): void {
  const temps = document.createElement('p');
  temps.className = 'poi-fiche-temps';
  const mot = document.createElement('span');
  mot.className = 'poi-fiche-temps-mot';
  mot.textContent = 'Temps de trajet :';
  temps.append(mot);
  const etat = document.createElement('span');
  etat.className = 'poi-fiche-temps-etat';
  etat.setAttribute('role', 'status');
  const reponses = new Map<Profil, Promise<Reponse>>();
  const demander = (profil: Profil): Promise<Reponse> => {
    const deja = reponses.get(profil);
    if (deja) return deja;
    const depuis = positionConnueActuelle();
    if (!depuis) return Promise.reject(new Error('position inconnue'));
    const promesse = calculerItineraire(depuis, vers, profil)
      .then((r) => ({ duree: r.duree, distance: r.distance }));
    /* Un échec ne se met pas en cache : le réseau revient, la réponse
       d'erreur ne doit pas lui survivre. */
    promesse.catch(() => { reponses.delete(profil); });
    reponses.set(profil, promesse);
    return promesse;
  };
  for (const m of MODES) {
    const bm = document.createElement('button');
    bm.type = 'button';
    bm.className = 'poi-fiche-temps-mode';
    bm.textContent = m.icone;
    bm.setAttribute('aria-label', `Temps de trajet ${m.nom}`);
    bm.addEventListener('click', () => {
      if (positionConnueActuelle() === null) {
        /* PAS DE POSITION, PAS DE PROMESSE : le geste renvoie au bouton qui
           la donne — jamais une requête depuis un point inventé. */
        etat.textContent = 'Appuyez d’abord sur « Me localiser » (en haut à droite de la carte).';
        return;
      }
      etat.textContent = `Calcul ${m.nom}…`;
      demander(m.profil).then((r) => {
        const km = r.distance / 1000;
        const dist = km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`;
        etat.textContent = `${m.icone} ${formaterDuree(m.duree(r))} ${m.nom} (${dist})`
          + (m.estime === true ? ' — estimation' : '');
      }).catch(() => {
        etat.textContent = 'Temps de trajet indisponible pour le moment.';
      });
    });
    temps.append(bm);
  }
  boite.append(temps, etat);
}
