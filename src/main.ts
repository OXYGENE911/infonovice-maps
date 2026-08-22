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
document.querySelector('.entete')?.appendChild(new EtatConnexion());

const conteneur = document.getElementById('carte');
if (conteneur) creerCarte(conteneur);
