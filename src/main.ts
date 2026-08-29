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
if (conteneur) {
  creerCarte(conteneur);

  /* LA HAUTEUR DE L'ATTRIBUTION EST PUBLIÉE, ELLE AUSSI. Le pied de page se
     posait dessus dès qu'elle prenait deux lignes : son décalage était un
     « bottom: 26px » calibré à l'œil sur une attribution d'une seule ligne.
     Masquer la mention IGN, même à moitié, n'est pas un défaut cosmétique —
     c'est une obligation de la Géoplateforme. C'est exactement le défaut que
     l'en-tête avait, et le même remède : on mesure au lieu de deviner.

     MapLibre pose son attribution après la construction de la carte, d'où
     l'attente : on observe le conteneur jusqu'à ce qu'elle paraisse, puis on
     suit sa taille réelle. */
  const suivreAttribution = (attribution: HTMLElement): void => {
    const publier = (): void => {
      /* CE QU'ON PUBLIE EST LA DISTANCE DU BAS DE L'ÉCRAN AU SOMMET DE
         L'ATTRIBUTION, pas sa hauteur. Mesuré : l'attribution ne touche pas
         le bas — elle garde 10 px de marge propre. Se caler sur sa seule
         hauteur laissait deux pixels de recouvrement, ce que le test E2E a
         vu et pas l'œil. C'est le sommet qu'il faut dégager. */
      const sommet = Math.round(window.innerHeight - attribution.getBoundingClientRect().top);
      document.documentElement.style.setProperty('--attribution-sommet', `${sommet}px`);
    };
    new ResizeObserver(publier).observe(attribution);
    publier();
  };

  /* L'ÉCHELLE SE MESURE AUSSI (30/08) : le rond de vitesse GPS vit dans le
     même coin et la recouvrait — « un rectangle blanc correspondant à
     l'échelle qui est masqué par le rond de la vitesse GPS ». Sa hauteur
     dépend de la police et du fuseau : on la MESURE, comme l'en-tête et
     l'attribution, plutôt que de la deviner. */
  const suivreEchelle = (echelle: HTMLElement): void => {
    const publier = (): void => {
      const hauteur = Math.round(echelle.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--echelle-hauteur', `${hauteur + 10}px`);
    };
    new ResizeObserver(publier).observe(echelle);
    publier();
  };

  const dejaLa = conteneur.querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
  if (dejaLa) suivreAttribution(dejaLa);
  else {
    const guetteur = new MutationObserver(() => {
      const venue = conteneur.querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
      if (!venue) return;
      guetteur.disconnect();
      suivreAttribution(venue);
    });
    guetteur.observe(conteneur, { childList: true, subtree: true });
  }

  const echelle = conteneur.querySelector<HTMLElement>('.maplibregl-ctrl-scale');
  if (echelle) suivreEchelle(echelle);
  else {
    const guetteur = new MutationObserver(() => {
      const venue = conteneur.querySelector<HTMLElement>('.maplibregl-ctrl-scale');
      if (!venue) return;
      guetteur.disconnect();
      suivreEchelle(venue);
    });
    guetteur.observe(conteneur, { childList: true, subtree: true });
  }
}
