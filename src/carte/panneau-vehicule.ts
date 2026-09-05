/* <panneau-vehicule> — le profil du véhicule électrique et son rayon d'action.
 *
 * TOUT VIT DANS LE NAVIGATEUR. La capacité de la batterie, sa santé, l'état de
 * charge : rien de tout cela ne sort, rien n'est envoyé nulle part, et il n'y
 * a aucun compte à créer. C'est la contrainte 4 du projet, et c'est aussi ce
 * que la page « Vie privée » promet en toutes lettres.
 *
 * LES ANNEAUX DISENT « AU MIEUX, À PLAT ». Ils ignorent le relief, le vent, le
 * style de conduite et la charge du véhicule. L'interface le dit sous les
 * anneaux plutôt que de laisser croire à une prédiction — c'est la même ligne
 * éditoriale que la PR #15, qui a préféré écrire « abandonné, avec la mesure »
 * plutôt que de promettre des horaires à moitié.
 */
import type { Map as CarteMapLibre, GeoJSONSource } from 'maplibre-gl';
import { lirePreference, ecrirePreference } from '../lib/stockage';
import {
  autonomies, consommationsDepuisEssais, capaciteReelle, facteursDAffichage,
  CONTEXTES, RESERVE_ANNEAUX, motorisationDe, type Vehicule, type CleContexte,
} from '../lib/vehicule';
import {
  CARBURANTS, LIBELLES_CARBURANT, autonomieCarburantKm, carburantValide,
} from '../lib/carburant';
import { meteoA } from '../lib/meteo';
import { collectionAnneaux, rayonAffichable } from '../lib/cercle';
import {
  CATALOGUE, libelleModele, libelleDansMarque, parMarque,
  modeleParCle, autonomiesProposees, chercherModeles,
} from '../lib/catalogue-vehicules';
import {
  FORMES, curseurSVG, formeValide, FORME_DEFAUT, PREF_CURSEUR, type FormeCurseur,
} from './curseur-vehicule';

export const PREF_VEHICULE = 'vehicule';
const SOURCE = 'rayon-action';

/* UN VÉHICULE PAR DÉFAUT QUI NE PRÉTEND RIEN. Zéro partout : tant que l'usager
   n'a rien saisi, aucun anneau ne se dessine, et le panneau le dit. Inventer
   une « voiture moyenne » afficherait un rayon crédible et faux. */
const VIDE: Vehicule = {
  nom: '', motorisation: 'electrique', capaciteNominale: 0, soce: 100, soc: 80,
  consommations: { ville: 0, route: 0, autoroute: 0 },
  puissanceMaxKw: 0,
};

/** Ce qu'on demande à l'usager : des kilomètres, pas des kWh/100 km. Personne
 *  ne connaît sa consommation ; tout le monde sait jusqu'où il va. */
interface Essais { ville: number; route: number; autoroute: number }

export class PanneauVehicule extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #vehicule: Vehicule = { ...VIDE, consommations: { ...VIDE.consommations } };
  #essais: Essais = { ville: 0, route: 0, autoroute: 0 };
  #actif = false;
  /* LA RESTAURATION NE DOIT JAMAIS ÉCRASER UN CHOIX DÉJÀ FAIT.
     La lecture IndexedDB est ASYNCHRONE : un usager rapide — ou une machine
     chargée — peut cocher « Afficher mon rayon d'action », le décocher, et
     voir la case se RECOCHER toute seule quand la lecture, partie avant ses
     gestes, se résout enfin avec l'ancienne valeur. Rien ne le signale ; on
     croit avoir mal cliqué.
     Attrapé par un parcours E2E qui ne rougissait QUE dans la suite complète,
     c'est-à-dire quand la machine est assez chargée pour que la lecture arrive
     en retard. Le panneau des points d'intérêt porte le même garde-fou, pour
     la même raison. */
  #touche = false;
  /* LA POSITION DU VÉHICULE, quand la géolocalisation l'a donnée. Les anneaux
     l'entourent ELLE, pas le centre de la carte : faire glisser la carte ne
     déplace pas la voiture. Tant qu'aucune position n'est connue, ils
     entourent le centre — et l'interface le DIT, plutôt que de laisser croire
     à une mesure. */
  #position: { lon: number; lat: number } | null = null;

  /* LA TEMPÉRATURE DEHORS (RAYON-2, 02/09), quand on a pu la demander.
     `null` : on suppose la référence, comme avant. */
  #celsius: number | null = null;

  set position(p: { lon: number; lat: number }) {
    this.#position = p;
    this.#bilan();
    if (this.#actif) this.#poser();
    /* ET L'ON DEMANDE LA TEMPÉRATURE — UNE FOIS, sur la position qu'on vient
       de recevoir. Le froid coûte jusqu'à 45 % de consommation dans le modèle
       (lib/vehicule), et le cercle l'ignorait complètement : en janvier, il
       promettait les kilomètres d'un mois de mai. Armelin, 02/09 : « le rayon
       d'action trop optimiste par défaut ».
       C'EST LE MÊME SERVICE QUE LE COPILOTE, sur des coordonnées qu'il
       interroge déjà. L'échec est muet : on retombe sur la référence. */
    void meteoA(p.lon, p.lat, new Date())
      .then((m) => {
        if (!Number.isFinite(m.temperature)) return;
        this.#celsius = m.temperature;
        this.#bilan();
        if (this.#actif) this.#poser();
      })
      .catch(() => { /* sans météo, la référence — c'est le comportement d'avant */ });
  }

  set carte(c: CarteMapLibre) {
    if (this.#carte) return;
    this.#carte = c;
    // setStyle détruit les sources : on repose, même contrat que les autres.
    c.on('style.load', () => { this.#poser(); });
    /* PLUS AUCUN SUIVI DU DÉPLACEMENT DE CARTE : les anneaux n'entourent que
       la position du véhicule, et faire glisser la carte ne la déplace pas.
       Cet écouteur reposait les anneaux sur le centre de la vue tant que le
       GPS était muet — c'est-à-dire tant qu'ils n'avaient aucun sens. */
  }

  connectedCallback(): void {
    if (this.firstElementChild) return;
    const champ = (cle: string, libelle: string, unite: string, pas = '1') => `
      <label class="veh-ligne">${libelle}
        <span><input type="number" class="veh-champ" data-cle="${cle}"
          min="0" step="${pas}" inputmode="decimal"
          aria-label="${libelle}"> <em>${unite}</em></span>
      </label>`;

    this.innerHTML = `
      <details class="vehicule" open>
        <summary aria-label="Mon véhicule">Véhicule</summary>
        <fieldset class="veh-corps">
          <legend>Mon véhicule</legend>

          <!-- LA MOTORISATION D'ABORD (MOTORISATION-1, 05/09). Des amis
               d'Armelin : « le site est trop axé véhicule électrique ». En
               thermique ou hybride, la batterie, le catalogue, les
               autonomies et les anneaux se retirent, et le planificateur ne
               place AUCUN arrêt de recharge — il le dit. -->
          <div class="veh-motorisation" role="radiogroup" aria-label="Motorisation">
            <label class="veh-moteur">
              <input type="radio" name="veh-motorisation" value="electrique" checked>
              <span>Électrique</span>
            </label>
            <label class="veh-moteur">
              <input type="radio" name="veh-motorisation" value="hybride-rechargeable">
              <span>Hybride rechargeable</span>
            </label>
            <label class="veh-moteur">
              <input type="radio" name="veh-motorisation" value="thermique">
              <span>Thermique</span>
            </label>
          </div>
          <p class="veh-thermique-note">Sur la route, les pleins remplacent les
            arrêts de recharge : le planificateur propose les stations les
            moins chères (prix du jour, open data) avant la réserve et à
            chaque pause de deux heures. Pas de pourcentage de batterie pendant
            le suivi.</p>
          <p class="veh-hybride-note">Hybride rechargeable : la batterie fait la
            ville, le réservoir fait la route — aucun arrêt de recharge n’est
            imposé, les pleins se planifient comme pour un thermique. La
            batterie reste renseignable ci-dessous pour le rayon d’action.</p>

          <!-- LE CARBURANT (THERMIQUE-2, 06/09) : quatre choses que tout
               conducteur sait de sa voiture — pas de fiche constructeur. -->
          <div class="veh-carburant">
            <label class="veh-ligne">Carburant
              <span><select class="veh-carburant-choix" aria-label="Carburant">
                ${CARBURANTS.map((c) => `<option value="${c}">${LIBELLES_CARBURANT[c]}</option>`).join('')}
              </select></span>
            </label>
            ${champ('reservoirL', 'Réservoir', 'L')}
            ${champ('consommationL100', 'Consommation', 'L/100 km', '0.1')}
            ${champ('jaugePourcent', 'Jauge au départ', '%', '5')}
            <p class="veh-note">La consommation réelle, celle de l’ordinateur de
              bord sur route ; la jauge à la louche suffit.</p>
          </div>

          <div class="veh-electrique">

          <!-- LE CATALOGUE PRÉ-REMPLIT, IL NE VERROUILLE PAS. Saisir cinq
               chiffres avant de pouvoir se servir du planificateur est un
               péage à l'entrée : beaucoup ne le franchissent pas, et ceux qui
               le franchissent y mettent des approximations. Chaque champ reste
               modifiable après application. -->
          <!-- LE CATALOGUE SE CHERCHE ET SE REPLIE (CAT-1, 30/08). Armelin :
               « le choix des véhicules est trop long à scroller quand il y a
               trop de véhicules électriques dans la liste. Il faudrait les
               replier par marque […] on clique sur une marque pour déplier
               et voir les modèles existants, et ajouter une barre de
               recherche pour aller plus vite. »
               LE <select> RESTE, MASQUÉ À L'ŒIL : c'est lui qui porte le nom
               accessible, la navigation au clavier native et l'état choisi —
               un lecteur d'écran y retrouve la liste entière. Les marques
               repliées ci-dessous sont sa peau, pas son remplacement. -->
          <label class="veh-recherche-ligne">Chercher un véhicule
            <input type="search" class="veh-recherche"
              placeholder="Renault, VF 8, Zoe…"
              aria-label="Chercher une marque ou un modèle">
          </label>
          <!-- LA LISTE ENTIÈRE EST DANS UNE BOÎTE FERMÉE, et ce n'est pas
               un caprice : dépliées, trente-deux marques repoussaient le
               choix du repère à 1 500 px — hors de vue à l'ouverture, ce que
               FEN-6 interdit (Armelin, 29/08). La lui donner un ascenseur
               propre était l'autre issue, et FEN-6 l'interdit aussi (« deux
               ascenseurs, un dans l'autre »). Reste celle-ci : la recherche
               au-dessus reste TOUJOURS visible — c'est le chemin rapide —,
               et la boîte s'ouvre d'elle-même dès qu'on cherche. -->
          <details class="veh-marques-boite">
            <summary>Toutes les marques</summary>
            <div class="veh-marques"></div>
          </details>
          <label class="veh-ligne veh-ligne-catalogue veh-lu-seulement">Modèle
            <span><select class="veh-catalogue" aria-label="Choisir un modèle de véhicule">
              <option value="">— saisie manuelle —</option>
              <!-- GROUPÉ PAR MARQUE. Cent trente modèles à plat forment un
                   mur ; sous leur marque, on descend à la sienne et l'on
                   s'arrête. La balise optgroup fait cela nativement, sans
                   la moindre ligne de script. -->
              ${parMarque().map((g) => `
                <optgroup label="${g.marque}">
                  ${g.modeles.map((m) => `
                    <option value="${m.cle}">${libelleDansMarque(m)}</option>`).join('')}
                </optgroup>`).join('')}
            </select></span>
          </label>
          <!-- LA FICHE CONSTRUCTEUR DU MODÈLE CHOISI, en toutes lettres :
               « ce serait bien d'afficher la valeur WLTP du constructeur et
               l'année du véhicule » (Armelin, 27/08/2026). Vide tant qu'aucun
               modèle n'est appliqué. -->
          <p class="veh-catalogue-detail" role="status"></p>
          <p class="veh-note veh-note-catalogue">${CATALOGUE.length} modèles,
            valeurs constructeur indicatives, pré-remplies puis modifiables.
            L’autonomie proposée découle du cycle WLTP, optimiste sur
            autoroute : remplacez-la par vos propres relevés dès votre premier
            long trajet.</p>

          <!-- LE REPÈRE SUR LA CARTE (NAV-2, demande d'Armelin du 29/08 :
               « une personnalisation de cette icône […] comme une flèche,
               une voiture etc. »). Trois vignettes qui MONTRENT ce qu'elles
               proposent : nommer « flèche » et « voiture » obligerait à
               essayer pour voir.
               IL VIENT EN TÊTE DEPUIS LE 29/08 AU SOIR : « il faut scroller
               tout en bas de l'ascenseur pour voir apparaître la
               personnalisation du repère […] si l'utilisateur ne scrolle pas
               tout en bas, impossible de savoir que l'option existe ». Un
               réglage qu'on ne trouve pas n'existe pas. -->
          </div>

          <p class="veh-titre">Mon repère pendant la navigation</p>
          <div class="veh-curseurs" role="radiogroup" aria-label="Forme du repère">
            ${FORMES.map((f) => `
              <label class="veh-curseur">
                <input type="radio" name="veh-curseur" value="${f.cle}">
                ${curseurSVG(f.cle, 26)}
                <span>${f.libelle}</span>
              </label>`).join('')}
          </div>

          <label class="veh-ligne">Nom
            <span><input type="text" class="veh-nom" placeholder="VinFast VF8"
              aria-label="Nom du véhicule"></span>
          </label>
          <div class="veh-electrique">
          ${champ('capaciteNominale', 'Batterie', 'kWh', '0.1')}
          ${champ('soce', 'Santé (SOCE)', '%')}
          ${champ('soc', 'Charge (SOC)', '%')}
          ${champ('puissanceMaxKw', 'Charge max', 'kW')}

          <!-- LES CONDITIONS (28/08) : ce que le véhicule sait de lui-même
               face au froid, au chaud et au relief. TOUT est optionnel —
               vide, le plan reste celui d'avant. Les bridages sont des
               RELEVÉS du propriétaire (le BMS ne les publie pas) : le VF 8
               d'Armelin plafonne à 30 kW sous 0 °C et 60 kW par batterie
               très chaude. -->

          <p class="veh-titre">Par grand froid, canicule ou montagne (facultatif)</p>
          ${champ('masseKg', 'Masse', 'kg', '10')}
          ${champ('puissanceFroidKw', 'Charge max sous 0 °C', 'kW')}
          ${champ('puissanceChaudKw', 'Charge max en canicule', 'kW')}
          <p class="veh-note">Vos relevés à la borne, pas la fiche
            constructeur. Le planificateur ne connaît que la température de
            l’air : par gel ou canicule, il applique ces plafonds en
            estimation prudente. Masse vide : 2 000 kg.</p>

          <p class="veh-titre">Autonomie constatée à pleine charge</p>
          ${CONTEXTES.map((c) => champ(`essai-${c.cle}`, c.libelle, 'km')).join('')}
          <p class="veh-note">Vos relevés, pas la fiche du constructeur : c’est
            ce qui rend le calcul juste pour VOTRE voiture.</p>

          <!-- « JE ROULE EN DEUX-ROUES » A DÉMÉNAGÉ (MODE-1, 03/09). Armelin :
               « cela devrait plutôt se situer dans "Options du trajet" à côté
               de "Voiture" et "À pieds" ». Il a raison : ce n'est pas une
               propriété du véhicule qu'on possède — au milieu de la batterie,
               de la consommation et de la masse — mais une réponse à « comment
               je pars aujourd'hui », et cette question a déjà son endroit.
               Le choix déjà coché ici est repris par le bouton « Moto » au
               premier chargement : personne ne perd son réglage. -->

          <label class="veh-bascule">
            <input type="checkbox" class="veh-anneaux"> Afficher mon rayon d’action
          </label>
          <!-- ON DIT POURQUOI LE CERCLE EST PLUS PETIT QUE L'AUTONOMIE
               (RAYON-1, 02/09). Sans cette phrase, l'écart entre le chiffre du
               bilan et le rayon tracé se lirait comme une incohérence — c'est
               exactement le reproche qu'Armelin avait fait le 31/08 sur un
               autre chiffre juste et inexpliqué. -->
          <p class="veh-anneaux-note">Les anneaux sont tracés à vol d’oiseau,
            réduits d’un quart : une autonomie se dépense sur des routes, qui
            tournent. Mesuré sur huit trajets français, la route fait 1,19 fois
            le vol d’oiseau en médiane — l’anneau penche donc du côté prudent.
            <span class="veh-anneaux-reserve"></span></p>

          <div class="veh-bilan" role="status"></div>
          </div>
        </fieldset>
      </details>`;

    this.querySelector('.veh-nom')?.addEventListener('input', (e) => {
      this.#touche = true;
      this.#vehicule.nom = (e.target as HTMLInputElement).value;
      this.#enregistrer();
    });

    this.querySelectorAll<HTMLInputElement>('.veh-champ').forEach((c) => {
      c.addEventListener('input', () => {
        this.#touche = true;
        const valeur = Number(c.value);
        const cle = c.dataset['cle'] ?? '';
        const nombre = Number.isFinite(valeur) && valeur >= 0 ? valeur : 0;
        if (cle.startsWith('essai-')) {
          this.#essais[cle.slice(6) as CleContexte] = nombre;
        } else if (cle === 'capaciteNominale' || cle === 'soce' || cle === 'soc'
          || cle === 'puissanceMaxKw' || cle === 'masseKg'
          || cle === 'puissanceFroidKw' || cle === 'puissanceChaudKw'
          || cle === 'reservoirL' || cle === 'consommationL100' || cle === 'jaugePourcent') {
          this.#vehicule[cle] = nombre;
        }
        this.#recalculer();
      });
    });

    /* APPLIQUER UN MODÈLE remplit les champs ET l'état interne, puis
       recalcule. Écrire dans les seuls champs du formulaire ne suffirait
       pas : l'application lit son état, pas le DOM, et le bilan resterait
       muet jusqu'à ce que l'usager touche une case au hasard. */
    this.querySelector<HTMLSelectElement>('.veh-catalogue')?.addEventListener('change', (e) => {
      this.#touche = true;
      const modele = modeleParCle((e.target as HTMLSelectElement).value);
      if (!modele) return;
      const km = autonomiesProposees(modele);
      this.#vehicule = {
        ...this.#vehicule,
        nom: libelleModele(modele),
        capaciteNominale: modele.capaciteKwh,
        /* LA SANTÉ REVIENT À 100 % : le catalogue décrit une voiture NEUVE.
           Garder la santé d'un véhicule précédent appliquerait sa dégradation
           à un modèle qui n'a rien à voir. L'usager corrige ensuite. */
        soce: 100,
        puissanceMaxKw: modele.puissanceMaxKw,
        /* LA MOYENNE RELEVÉE SUIT LE MODÈLE (RECHARGE-1, 02/09), y compris
           vers l'absence : garder celle d'une autre voiture donnerait un temps
           de charge emprunté. */
        puissanceMoyenneKw: modele.puissanceMoyenneKw ?? 0,
        /* Les bridages SUIVENT le modèle — y compris vers zéro (« non
           déclaré ») : garder ceux du véhicule précédent appliquerait le BMS
           d'une autre voiture. */
        puissanceFroidKw: modele.puissanceFroidKw ?? 0,
        puissanceChaudKw: modele.puissanceChaudKw ?? 0,
      };
      this.#essais = { ...km };
      /* LA FICHE CONSTRUCTEUR S'AFFICHE SOUS LE CHOIX : années de la
         génération quand on les connaît, autonomie WLTP nommée pour ce
         qu'elle est. Le catalogue les portait sans jamais les montrer. */
      const detail = this.querySelector<HTMLElement>('.veh-catalogue-detail');
      if (detail) {
        detail.textContent = [
          modele.annees ? `Génération ${modele.annees}` : null,
          `${modele.capaciteKwh} kWh utiles`,
          `${modele.puissanceMaxKw} kW en pointe`,
          /* CE QU'ELLE TIENT VRAIMENT (RECHARGE-1, 02/09) : c'est ce chiffre
             qui décide du temps de charge annoncé, et l'écart avec la pointe
             surprend assez pour être écrit. */
          modele.puissanceMoyenneKw
            ? `${modele.puissanceMoyenneKw} kW soutenus de 10 à 80 %` : null,
          `${modele.wltpKm} km WLTP constructeur (optimiste, surtout sur autoroute)`,
          /* LA MARGE SE DIT (MARGE-1) : sans cette ligne, l'écart entre le
             WLTP affiché et les champs pré-remplis se lirait comme une
             erreur — le reproche d'Armelin du 31/08 sur un chiffre juste et
             inexpliqué. */
          'valeurs proposées avec 5 % de prudence — vos relevés les remplacent',
        ].filter(Boolean).join(' · ');
      }
      this.#refletChamps();
      /* LES BRIDAGES NE SURVIVENT PAS AU CHANGEMENT DE MODÈLE, même à
         l'écran : la règle « on n'écrase pas avec un zéro » protège le SOC
         du jour — pas le BMS d'une autre voiture. Un 30 kW affiché qui ne
         s'applique plus serait un mensonge. */
      for (const cle of ['puissanceFroidKw', 'puissanceChaudKw'] as const) {
        const c = this.querySelector<HTMLInputElement>(`.veh-champ[data-cle="${cle}"]`);
        if (c && !(this.#vehicule[cle] && this.#vehicule[cle]! > 0)) c.value = '';
      }
      this.#recalculer();
    });

    this.querySelector<HTMLInputElement>('.veh-anneaux')?.addEventListener('change', (e) => {
      this.#touche = true;
      this.#actif = (e.target as HTMLInputElement).checked;
      this.#enregistrer();
      this.#poser();
    });

    this.querySelectorAll<HTMLInputElement>('input[name="veh-motorisation"]').forEach((r) => {
      r.addEventListener('change', () => {
        if (!r.checked) return;
        this.#touche = true;
        this.#vehicule.motorisation = motorisationDe(r.value);
        this.#enregistrer();
        this.#refleterMotorisation();
        this.#bilan();
      });
    });
    this.querySelector<HTMLSelectElement>('.veh-carburant-choix')?.addEventListener('change', (e) => {
      this.#touche = true;
      const v = (e.target as HTMLSelectElement).value;
      if (carburantValide(v)) this.#vehicule.carburant = v;
      this.#enregistrer();
      this.#bilan();
    });

    this.#installerCatalogue();
    this.#installerCurseur();
    void this.#restaurer();
  }

  /** La motorisation choisie se voit : radio cochée, champs électriques
   *  retirés en thermique, anneaux effacés — ou reposés au retour. */
  #refleterMotorisation(): void {
    const moteur = this.#vehicule.motorisation ?? 'electrique';
    const thermique = moteur === 'thermique';
    const hybride = moteur === 'hybride-rechargeable';
    this.querySelectorAll<HTMLInputElement>('input[name="veh-motorisation"]').forEach((r) => {
      r.checked = r.value === moteur;
    });
    const corps = this.querySelector('.veh-corps');
    corps?.classList.toggle('veh-thermique', thermique);
    corps?.classList.toggle('veh-hybride', hybride);
    const choix = this.querySelector<HTMLSelectElement>('.veh-carburant-choix');
    if (choix && carburantValide(this.#vehicule.carburant)) choix.value = this.#vehicule.carburant;
    /* En thermique, #poser trace une collection vide : les anneaux d'un
       véhicule sans batterie s'effacent ; au retour à l'électrique, ils
       reviennent si la case est cochée. */
    this.#poser();
  }

  /* Les consommations se DÉDUISENT des relevés — un seul endroit où la vérité
     est saisie, pas deux qui pourraient se contredire. */
  #recalculer(): void {
    this.#vehicule.consommations = consommationsDepuisEssais(
      capaciteReelle(this.#vehicule), this.#essais,
    );
    this.#enregistrer();
    this.#bilan();
    if (this.#actif) this.#poser();
  }

  /** Recopie l'état interne dans les champs. Une seule écriture du DOM, que
      la restauration et le catalogue partagent — deux copies divergeraient. */
  #refletChamps(): void {
    const nom = this.querySelector<HTMLInputElement>('.veh-nom');
    if (nom) nom.value = this.#vehicule.nom;
    this.querySelectorAll<HTMLInputElement>('.veh-champ').forEach((c) => {
      const cle = c.dataset['cle'] ?? '';
      const valeur = cle.startsWith('essai-')
        ? this.#essais[cle.slice(6) as CleContexte]
        : this.#vehicule[cle as 'capaciteNominale' | 'soce' | 'soc' | 'puissanceMaxKw'
          | 'masseKg' | 'puissanceFroidKw' | 'puissanceChaudKw'
          | 'reservoirL' | 'consommationL100' | 'jaugePourcent'] ?? 0;
      /* ON N'ÉCRASE PAS UN CHAMP AVEC UN ZÉRO : le catalogue ne connaît pas
         l'état de charge du jour, et l'effacer à chaque changement de modèle
         obligerait à le ressaisir sans raison. */
      if (valeur > 0) c.value = String(valeur);
    });
  }

  #enregistrer(): void {
    void ecrirePreference(PREF_VEHICULE, {
      vehicule: this.#vehicule, essais: this.#essais, anneaux: this.#actif,
    });
    /* LE PLANIFICATEUR DOIT LE SAVOIR (29/08) : un plan de recharge calculé
       sur l'ANCIEN profil — capacité, bridage thermique — décrit une autre
       voiture. L'événement l'invalide, il se refera tout seul. */
    document.dispatchEvent(new CustomEvent('vehicule-change'));
  }

  /**
   * Le repère de navigation : le choix se pose, se garde, et se voit.
   *
   * IL VIT À PART DU VÉHICULE (clé `curseur-vehicule`) parce qu'il ne DÉCRIT
   * pas la voiture : c'est un goût d'affichage, il survit au changement de
   * modèle. Le bandeau de suivi le relit à chaque départ.
   */
  /**
   * Le catalogue repliable et cherchable (CAT-1, 30/08).
   *
   * IL PILOTE LE <select>, IL NE LE DOUBLE PAS. Choisir un modèle ici pose la
   * valeur du select et lui envoie un `change` : toute la logique
   * d'application du modèle reste à un seul endroit, celui qui existait
   * déjà. Deux chemins pour un seul geste seraient deux chemins à corriger.
   */
  #installerCatalogue(): void {
    const boite = this.querySelector<HTMLElement>('.veh-marques');
    const recherche = this.querySelector<HTMLInputElement>('.veh-recherche');
    const select = this.querySelector<HTMLSelectElement>('.veh-catalogue');
    if (!boite || !recherche || !select) return;

    const rendre = (): void => {
      const groupes = chercherModeles(recherche.value);
      boite.replaceChildren();
      if (groupes.length === 0) {
        const rien = document.createElement('p');
        rien.className = 'veh-note';
        rien.textContent = 'Aucune marque ni modèle ne correspond.'
          + ' Vous pouvez saisir les valeurs à la main.';
        boite.append(rien);
        return;
      }
      for (const g of groupes) {
        const marque = document.createElement('details');
        marque.className = 'veh-marque';
        marque.open = g.ouvrir;
        const titre = document.createElement('summary');
        titre.textContent = `${g.marque} (${g.modeles.length})`;
        marque.append(titre);
        for (const m of g.modeles) {
          const bouton = document.createElement('button');
          bouton.type = 'button';
          bouton.className = 'veh-modele';
          bouton.textContent = libelleDansMarque(m);
          bouton.setAttribute('aria-label', `Choisir ${libelleModele(m)}`);
          if (select.value === m.cle) bouton.setAttribute('aria-pressed', 'true');
          bouton.addEventListener('click', () => {
            select.value = m.cle;
            select.dispatchEvent(new Event('change'));
            /* ON NE REDESSINE PAS LA LISTE : la redessiner refermerait la
               marque qu'on vient d'ouvrir, sous le doigt de l'usager. Seule
               la marque choisie change d'état, et elle seule est repeinte. */
            for (const autre of boite.querySelectorAll('.veh-modele')) {
              autre.removeAttribute('aria-pressed');
            }
            bouton.setAttribute('aria-pressed', 'true');
          });
          marque.append(bouton);
        }
        boite.append(marque);
      }
    };

    /* PAS DE DÉBOUNCE ICI : la recherche est LOCALE (cent trente modèles en
       mémoire). Attendre 300 ms pour filtrer un tableau donnerait une
       impression de lourdeur sans rien économiser. */
    const boiteMarques = this.querySelector<HTMLDetailsElement>('.veh-marques-boite');
    recherche.addEventListener('input', () => {
      rendre();
      /* CHERCHER, C'EST DEMANDER À VOIR : la boîte s'ouvre sur la première
         lettre. Elle ne se REFERME pas quand on efface — refermer sous les
         doigts de qui vient de vider son champ pour recommencer serait pris
         pour une panne. */
      if (boiteMarques && recherche.value !== '') boiteMarques.open = true;
    });
    rendre();
  }

  #installerCurseur(): void {
    const cases = this.querySelectorAll<HTMLInputElement>('input[name="veh-curseur"]');
    for (const c of cases) {
      c.addEventListener('change', () => {
        if (c.checked) void ecrirePreference(PREF_CURSEUR, c.value as FormeCurseur);
      });
    }
    void lirePreference<string>(PREF_CURSEUR).then((f) => {
      const choisie = formeValide(f);
      for (const c of cases) c.checked = c.value === choisie;
    }).catch(() => {
      // Base illisible : la flèche par défaut se coche, rien ne se casse.
      for (const c of cases) c.checked = c.value === FORME_DEFAUT;
    });
  }

  async #restaurer(): Promise<void> {
    // Frontière système : la valeur relue se valide, elle ne se croit pas.
    const memo = await lirePreference<unknown>(PREF_VEHICULE);
    /* ET ELLE S'EFFACE DEVANT L'USAGER. Voir `#touche` : ce qui vient d'être
       saisi ou décoché prime sur ce qui dormait en base. */
    if (this.#touche) return;
    const m = (memo ?? {}) as Record<string, unknown>;
    const v = (m['vehicule'] ?? {}) as Record<string, unknown>;
    const e = (m['essais'] ?? {}) as Record<string, unknown>;
    const nombre = (x: unknown, defaut = 0): number =>
      (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : defaut);

    /* LES CONDITIONS ÉTAIENT ÉCRITES, ELLES N'ÉTAIENT PAS RELUES — Armelin,
       le 30/08 : « les informations de la masse, de charge sous 0° ou par
       temps de canicule ne sont pas mémorisées et je dois les saisir à
       chaque fois ». L'enregistrement porte le véhicule ENTIER ; cette
       reconstruction, elle, énumérait les champs un à un et en oubliait
       trois. Un objet reconstruit champ par champ perd ce qu'on ajoute
       ailleurs : les trois manquants sont donc relus ICI, et le parcours
       unitaire les nomme pour que l'oubli ne se refasse pas. */
    this.#vehicule = {
      nom: typeof v['nom'] === 'string' ? v['nom'] : '',
      // Absente (profil d'avant MOTORISATION-1) : électrique, rien ne change.
      motorisation: motorisationDe(v['motorisation']),
      carburant: carburantValide(v['carburant']) ? v['carburant'] : 'gazole',
      reservoirL: nombre(v['reservoirL']),
      consommationL100: nombre(v['consommationL100']),
      jaugePourcent: nombre(v['jaugePourcent']),
      capaciteNominale: nombre(v['capaciteNominale']),
      soce: nombre(v['soce'], 100),
      soc: nombre(v['soc'], 80),
      consommations: { ville: 0, route: 0, autoroute: 0 },
      puissanceMaxKw: nombre(v['puissanceMaxKw']),
      puissanceMoyenneKw: nombre(v['puissanceMoyenneKw']),
      /* Zéro vaut « non déclaré » — c'est la convention de lib/vehicule : on
         garde donc la clé même à zéro, sans quoi le champ resterait vide à
         l'écran alors que la base porte bien un 0 voulu. */
      masseKg: nombre(v['masseKg']),
      puissanceFroidKw: nombre(v['puissanceFroidKw']),
      puissanceChaudKw: nombre(v['puissanceChaudKw']),
      /* PAS DE `nombre()` ICI : c'est un booléen, et la convention « zéro vaut
         non déclaré » ne s'y applique pas. */
      moto: v['moto'] === true,
    };
    for (const { cle } of CONTEXTES) this.#essais[cle] = nombre(e[cle]);
    this.#actif = m['anneaux'] === true;

    this.#refletChamps();
    this.#refleterMotorisation();
    const bascule = this.querySelector<HTMLInputElement>('.veh-anneaux');
    if (bascule) bascule.checked = this.#actif;

    this.#recalculer();
  }

  #bilan(): void {
    const boite = this.querySelector<HTMLElement>('.veh-bilan');
    if (!boite) return;
    boite.textContent = '';
    /* L'AUTONOMIE CARBURANT D'ABORD (THERMIQUE-2) : pour un thermique, c'est
       tout le bilan ; pour un hybride rechargeable, elle précède la batterie. */
    const moteur = this.#vehicule.motorisation ?? 'electrique';
    if (moteur !== 'electrique') {
      const carbu = document.createElement('p');
      carbu.className = 'veh-bilan-carburant';
      const { reservoirL = 0, consommationL100 = 0, jaugePourcent = 0 } = this.#vehicule;
      const jauge = jaugePourcent > 0 ? jaugePourcent : 100;
      const km = autonomieCarburantKm(reservoirL, consommationL100, jauge);
      carbu.textContent = km > 0
        ? `Autonomie carburant : ~${Math.round(km)} km (${reservoirL} L à ${jauge} %,`
          + ` ${String(consommationL100).replace('.', ',')} L/100 km).`
        : 'Renseignez le réservoir et la consommation pour planifier les pleins.';
      boite.appendChild(carbu);
      if (moteur === 'thermique') return;
    }

    const capacite = capaciteReelle(this.#vehicule);
    if (capacite <= 0) {
      boite.textContent = 'Renseignez la batterie pour voir votre rayon d’action.';
      return;
    }

    /* LA DÉGRADATION SE DIT EN KILOMÈTRES, pas en pourcents. « Votre batterie a
       perdu 5,3 kWh, soit 26 km d'autoroute » se comprend ; « SOCE 94 % » ne
       dit rien à personne. */
    const perdus = this.#vehicule.capaciteNominale - capacite;
    const a = autonomies(this.#vehicule);
    const utiles = CONTEXTES.filter((c) => a[c.cle] > 0);
    if (utiles.length === 0) {
      boite.textContent = 'Renseignez au moins une autonomie constatée.';
      return;
    }

    /* CHAQUE LIGNE PREND LA COULEUR DE SON ANNEAU (ERGO-3, 30/08). Armelin :
       « ce serait bien d'ajouter un peu plus de couleur pour l'autonomie
       constatée à pleine charge […] ce qui permettra aux gens de mieux
       comprendre le cercle du rayon d'action, qui n'est pas accompagné d'une
       légende ».
       C'EST EXACTEMENT ÇA : la couleur n'est pas un ornement, c'est LA
       LÉGENDE qui manquait. Les teintes sont celles des anneaux
       (lib/vehicule.ts), pas des teintes choisies ici — deux jeux de
       couleurs se seraient désaccordés au premier changement. */
    /* À QUELLE CHARGE RÉPOND CE RAYON ? (défaut du 31/08). Armelin lisait
       384 km sous un champ où il avait saisi 480, et concluait à une panne.
       Le calcul était juste — 480 × 80 % de charge — mais RIEN ne le disait,
       et un chiffre juste qu'on ne peut pas expliquer ne se distingue pas
       d'un chiffre faux. Il fait même douter du reste.
       LA PHRASE VIENT AVANT LES CHIFFRES, parce qu'elle les qualifie. */
    const { soc, sante } = facteursDAffichage(this.#vehicule);
    const titre = document.createElement('p');
    titre.className = 'veh-bilan-charge';
    const morceaux: string[] = [];
    if (soc < 100) morceaux.push(`${Math.round(soc)} % de charge`);
    if (sante < 100) morceaux.push(`${Math.round(sante)} % de santé batterie`);
    titre.textContent = morceaux.length === 0
      ? 'Rayon d’action à pleine charge :'
      : `Rayon d’action à ${morceaux.join(' et ')} — pas à pleine charge :`;
    boite.appendChild(titre);

    const p = document.createElement('p');
    p.className = 'veh-bilan-lignes';
    for (const c of utiles) {
      const ligne = document.createElement('span');
      ligne.className = 'veh-bilan-ligne';
      ligne.style.setProperty('--teinte', c.couleur);
      ligne.textContent = `${c.libelle} : ${Math.round(a[c.cle])} km`;
      /* LA COULEUR NE PORTE PAS L'INFORMATION SEULE : le libellé la dit, et
         le titre nomme l'anneau correspondant sur la carte. Un daltonien lit
         la même chose que les autres. */
      /* L'INFOBULLE PORTE LE RAPPROCHEMENT AVEC LA SAISIE : « 384 km, contre
         480 saisis à pleine charge ». C'est la question exacte qu'Armelin
         s'est posée, et la réponse tient sur une ligne. */
      const aPleine = soc > 0 ? a[c.cle] * (100 / soc) : 0;
      ligne.title = `${c.libelle} — anneau ${c.couleur} sur la carte`
        + (soc < 100 ? `, soit ${Math.round(aPleine)} km à pleine charge` : '');
      p.appendChild(ligne);
    }
    boite.appendChild(p);

    if (perdus > 0.05 && a.autoroute > 0) {
      const km = Math.round((perdus / (this.#vehicule.consommations.autoroute || 1)) * 100);
      const d = document.createElement('p');
      d.className = 'veh-bilan-usure';
      d.textContent = `Usure de la batterie : ${perdus.toFixed(1)} kWh perdus,`
        + ` soit environ ${km} km d’autoroute.`;
      boite.appendChild(d);
    }

    const note = document.createElement('p');
    note.className = 'veh-bilan-reserve';
    note.textContent = 'Au mieux, à plat, par temps doux : ni le relief,'
      + ' ni le vent, ni votre conduite ne sont pris en compte.';
    boite.appendChild(note);

    /* D'OÙ PART LE RAYON ? La question n'est pas cosmétique : un anneau centré
       sur le regard plutôt que sur la voiture donne une réponse fausse. On dit
       donc lequel des deux sert d'ancre. */
    const ancre = document.createElement('p');
    ancre.className = 'veh-bilan-ancre';
    ancre.textContent = this.#position
      ? 'Rayon mesuré depuis votre position.'
      : 'Les anneaux attendent votre position : pressez « Me localiser ».'
        + ' Un rayon d’action centré ailleurs que sur la voiture répondrait'
        + ' faussement à la seule question qu’il pose.';
    boite.appendChild(ancre);
  }

  #poser(): void {
    const carte = this.#carte;
    if (!carte) return;
    /* PAS DE POSITION, PAS D'ANNEAUX. Armelin, le 26/08/2026 : « quand on coche
       la case sans avoir cliqué sur "me localiser", la carte affiche un cercle
       en plein milieu de la carte car elle ne sait pas où on est. Ce qui n'est
       pas logique. »
       Il a raison, et j'avais défendu l'inverse : je pensais qu'un anneau
       centré sur le regard, DÛMENT ANNONCÉ, valait mieux que rien. C'est faux.
       Un rayon d'action répond à « jusqu'où puis-je aller » — une question qui
       n'a de sens que depuis un endroit. Centré sur le regard, il ne répond
       pas à une autre question : il répond à la même, faussement. La mention
       sous les anneaux ne rattrapait pas ce qu'un cercle affirme d'un coup
       d'œil. */
    /* LE CERCLE GARDE LA RÉSERVE ET SUBIT LE FROID (RAYON-2, 02/09). Le
       planificateur refuse déjà tout plan qui descend sous 10 % ; le cercle,
       lui, promettait les kilomètres des dix derniers pourcents. Deux moitiés
       de la même application disaient deux choses de la même voiture. */
    const a = autonomies(
      this.#vehicule, this.#celsius ?? undefined, RESERVE_ANNEAUX,
    );
    /* ON DIT CE QU'ON A RETIRÉ, sans quoi l'écart entre le bilan chiffré et
       l'anneau se lirait comme une incohérence — le reproche exact d'Armelin
       le 31/08 sur un autre chiffre juste et inexpliqué. */
    const note = this.querySelector<HTMLElement>('.veh-anneaux-reserve');
    if (note) {
      note.textContent = `Ils gardent ${RESERVE_ANNEAUX} % de batterie en`
        + ' réserve, comme le plan de recharge'
        /* LE VRAI SIGNE MOINS, comme dans le tableau de comparaison des
           parcours : un trait d'union ASCII pour « −5 °C » se voit, et deux
           conventions dans la même application se lisent comme une
           négligence. */
        + (this.#celsius === null ? '' : `, et tiennent compte des ${
          String(Math.round(this.#celsius)).replace('-', '−')} °C relevés dehors`)
        + '.';
    }
    const donnees = this.#actif && this.#position && this.#vehicule.motorisation !== 'thermique'
      ? collectionAnneaux(this.#position.lon, this.#position.lat,
        /* LE CERCLE SE RÉTRÉCIT DU DÉTOUR ROUTIER (RAYON-1, 02/09) : une
           autonomie se dépense sur des routes, un cercle se mesure à vol
           d'oiseau. Mesuré sur huit trajets français : 1,19 en médiane. Sans
           cette correction, l'anneau promettait des points qu'aucune route
           ne rejoint. */
        CONTEXTES.map((c) => ({
          cle: c.cle, rayonKm: rayonAffichable(a[c.cle]), couleur: c.couleur,
        })))
      : { type: 'FeatureCollection' as const, features: [] };

    /* ON TENTE, ET L'ON NE DIFFÈRE QUE SUR L'ÉCHEC RÉEL.
       Ce bloc a connu deux versions fautives, dans deux directions opposées :
       d'abord un `return` muet quand le style n'était pas prêt — décocher les
       anneaux ne faisait alors RIEN, sans un mot ; puis un renvoi à `idle`
       conditionné à `isStyleLoaded()`, qui rend FAUX tant qu'une source charge
       encore. Avec des tuiles simulées, il ne repasse jamais à vrai : les
       anneaux attendaient un feu vert qui ne venait pas.
       La bonne question n'est pas « le style est-il prêt ? » mais « MapLibre
       a-t-il refusé ? ». On pose, et le refus — lui seul — programme une
       nouvelle tentative. C'est déjà le contrat des couches de points
       d'intérêt et du tracé d'itinéraire. */
    try {
      const source = carte.getSource(SOURCE) as GeoJSONSource | undefined;
      if (source) { source.setData(donnees); return; }
      carte.addSource(SOURCE, { type: 'geojson', data: donnees });
    } catch (e) {
      if (e instanceof Error && /style is not done loading/i.test(e.message)) {
        carte.once('idle', () => { this.#poser(); });
        return;
      }
      throw e;
    }
    /* CONTOUR SEUL, PAS DE REMPLISSAGE. Trois disques empilés sur une carte la
       rendent illisible ; trois traits la laissent lisible. */
    carte.addLayer({
      id: 'rayon-action-trait', type: 'line', source: SOURCE,
      paint: {
        'line-color': ['get', 'couleur'],
        'line-width': 2.5,
        'line-opacity': 0.9,
        'line-dasharray': [3, 2],
      },
    });
  }
}

customElements.define('panneau-vehicule', PanneauVehicule);
