// Point d'entrée : la carte plein écran (PR #2). La page « en construction »
// de la PR #1 est morte ici, comme prévu.
import { restaurerTheme } from './lib/theme';
import { BandeauMaj } from './carte/bandeau-maj';
import './styles/tokens.css';
import './styles/carte.css';
// Le pied de page de la carte partage la feuille des pages de texte.
import './styles/pages.css';
import { registerSW } from 'virtual:pwa-register';
import { preparerMaj } from './lib/maj-secours';
import { creerCarte } from './carte/carte';
import { EtatConnexion } from './carte/etat-connexion';

/* LA NOUVELLE VERSION S'ANNONCE, ELLE NE S'IMPOSE PAS (MAJ-1, 03/09).
   Armelin : « j'ai des testeurs qui ne savaient pas qu'il fallait rafraîchir
   l'application pour la mettre à jour. Comment est-ce possible de leur
   afficher une popup quelque part pour les prévenir ? »
   DEUX MOITIÉS AU DÉFAUT : le service worker ne VÉRIFIE les mises à jour
   qu'au chargement de la page — une PWA qui reste ouverte n'apprend jamais
   rien — et quand il les voyait, il ne le disait à personne. On vérifie donc
   toutes les trente minutes, et l'on ANNONCE au lieu d'imposer : recharger
   tout seul en pleine navigation couperait le guidage. */
const appliquerMaj = registerSW({
  immediate: true,
  onNeedRefresh() {
    /* LE GESTE EST SECOURU (MAJ-2, 04/09). Armelin : « quand je clique sur
       "Mise à jour", il ne se passe absolument rien ». Entre l'annonce et le
       clic, un nouveau déploiement peut remplacer le worker en attente : le
       SKIP_WAITING du greffon part alors dans le vide. `preparerMaj` relit
       l'état RÉEL après coup et finit toujours par recharger — voir
       lib/maj-secours. */
    document.dispatchEvent(new CustomEvent('maj-disponible', {
      detail: { appliquer: preparerMaj({
        demarrer: () => { void appliquerMaj(true); },
        inscription: () => navigator.serviceWorker.getRegistration(),
        recharger: () => { window.location.reload(); },
        surPriseDeControle: (f) => {
          navigator.serviceWorker.addEventListener('controllerchange', f, { once: true });
        },
      }) },
    }));
  },
  onRegisteredSW(_url, inscription) {
    if (!inscription) return;
    setInterval(() => { void inscription.update().catch(() => { /* hors ligne : on réessaiera */ }); },
      30 * 60 * 1000);
  },
});

/* LE THÈME CHOISI SE RESTAURE AVANT LE PREMIER RENDU (THEME-1, 03/09) :
   restauré plus tard, l'écran s'ouvrirait dans un thème et sauterait dans
   l'autre — le « flash » que toutes les applications à thème connaissent. */
void restaurerTheme();

/* LE FILET DES CASSES MUETTES (BLANC-1, 04/09). Une exception non rattrapée
   peut laisser une page qui a l'air vivante et ne répond plus — et l'usager
   conclut « écran blanc » sans qu'on sache jamais quoi. On ne répare rien
   ici : on DIT qu'une casse a eu lieu, une fois, avec la porte de sortie.
   Le message ne s'empile pas et n'efface rien — c'est un aveu, pas un
   pansement. */
let casseDite = false;
const direLaCasse = (): void => {
  if (casseDite) return;
  casseDite = true;
  const bandeau = document.createElement('div');
  bandeau.className = 'casse-bandeau';
  bandeau.setAttribute('role', 'alert');
  const mot = document.createElement('p');
  mot.textContent = 'Quelque chose s’est cassé dans l’application.'
    + ' Si l’écran ne répond plus, rechargez :';
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.textContent = 'Recharger';
  bouton.addEventListener('click', () => { window.location.reload(); });
  const fermer = document.createElement('button');
  fermer.type = 'button';
  fermer.className = 'casse-fermer';
  fermer.textContent = '✕';
  fermer.setAttribute('aria-label', 'Fermer cet avertissement');
  fermer.addEventListener('click', () => { bandeau.remove(); });
  bandeau.append(mot, bouton, fermer);
  document.body.append(bandeau);
};
window.addEventListener('error', () => { direLaCasse(); });
window.addEventListener('unhandledrejection', () => { direLaCasse(); });

// L'état de connexion et l'invite d'installation vivent dans l'en-tête :
// ils concernent l'application entière, pas la carte.
document.body.append(new BandeauMaj());
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
