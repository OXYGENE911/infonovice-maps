// Point d'entrée : la carte plein écran (PR #2). La page « en construction »
// de la PR #1 est morte ici, comme prévu.
import './styles/tokens.css';
import './styles/carte.css';
// Le pied de page de la carte partage la feuille des pages de texte.
import './styles/pages.css';
import { registerSW } from 'virtual:pwa-register';
import { creerCarte } from './carte/carte';
import { EtatConnexion } from './carte/etat-connexion';

registerSW({ immediate: true });

// L'état de connexion et l'invite d'installation vivent dans l'en-tête :
// ils concernent l'application entière, pas la carte.
const entete = document.querySelector<HTMLElement>('.entete');
if (entete) {
  entete.appendChild(new EtatConnexion());
  /* LA HAUTEUR DE L'EN-TÊTE EST PUBLIÉE EN VARIABLE CSS. Le décalage des
     contrôles MapLibre était un « top: 62px » calibré sur un en-tête d'une
     seule ligne. Dès que le bandeau hors ligne ou le bouton d'installation le
     font grandir, l'en-tête recouvrait le sélecteur de fonds et le
     planificateur d'itinéraire, et interceptait leurs clics — mesuré au
     `elementFromPoint`, pas supposé. La CSS suit désormais la hauteur réelle. */
  const publierHauteur = (): void => {
    const hauteur = Math.round(entete.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--hauteur-entete', `${hauteur}px`);
  };
  new ResizeObserver(publierHauteur).observe(entete);
  publierHauteur();
}

const conteneur = document.getElementById('carte');
if (conteneur) creerCarte(conteneur);
