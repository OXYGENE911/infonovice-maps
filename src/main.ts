// Point d'entrée : la carte plein écran (PR #2). La page « en construction »
// de la PR #1 est morte ici, comme prévu.
import './styles/tokens.css';
import './styles/carte.css';
import { registerSW } from 'virtual:pwa-register';
import { creerCarte } from './carte/carte';

registerSW({ immediate: true });

const conteneur = document.getElementById('carte');
if (conteneur) creerCarte(conteneur);
