/* <fiche-borne> — le cartouche de détail d'une station de recharge.
 *
 * CE QU'IL REMPLACE. Une popup MapLibre de quatre lignes — nom, puissance,
 * nombre de points, réseau — posée sur la punaise. Armelin, le 25/08/2026 :
 * « on ne peut pas cliquer sur un point de charge suggéré pour avoir son
 * détail, ni le nom de l'opérateur du réseau », et, montrant ABRP : « le
 * détail s'affiche de façon claire et espacée dans des cartouches aux couleurs
 * distinguées ».
 *
 * POURQUOI UNE CARTE ET NON UNE POPUP. Une bulle ancrée à la punaise doit
 * tenir dans deux cent soixante pixels, se replace à chaque déplacement de
 * carte, et masque précisément ce qu'on vient de désigner. Le contenu ici fait
 * six rubriques : il lui faut une surface stable. La carte se pose donc en bas
 * à gauche sur grand écran, et occupe le bas de l'écran sur téléphone — sans
 * jamais entrer dans les accordéons du menu, dont Armelin dit justement qu'ils
 * défilent trop.
 *
 * ELLE NE PROMET PAS CE QU'ELLE N'A PAS. Pas d'occupation en direct, pas de
 * grille tarifaire : voir l'en-tête de lib/station.ts pour les mesures qui
 * ferment ces deux portes. La dernière rubrique le dit à l'usager, en toutes
 * lettres, plutôt que de laisser un blanc qu'il prendrait pour un oubli.
 *
 * TOUT EST CONSTRUIT EN textContent : noms de stations, adresses, tarifs et
 * enseignes viennent de services externes (règle du projet).
 */
import type { Map as CarteMapLibre } from 'maplibre-gl';
import {
  chercherReleves, resumerReleves, ageEnMots, PEREMPTION_OCCUPATION_MS,
} from '../lib/irve-dynamique';
import {
  chargerDetail, ErreurStation, type DetailStation, type GroupePdc,
} from '../lib/station';
import {
  chargerCommodites, ErreurCommodites, TYPES_COMMODITE, type Commodite,
} from '../lib/commodites';
import { distanceM } from '../lib/le-long-du-trajet';
import { cleBorne } from '../lib/arrets';
import { brancherAjoutFavori } from './choix-liste';
import { adresseInverse } from '../lib/adresse';
import { PRISES } from '../lib/poi';
import { palierDe, PALIERS } from '../lib/puissance';
import { eclairsSVG } from './icone-puissance';
import { svgCommodite } from './icone-commodite';
import { refermerPanneaux } from './panneaux';

/** Ce qu'il faut pour aller chercher une station : peu de choses. */
export interface CibleBorne {
  id: string | null;
  lon: number;
  lat: number;
  nom: string;
}

/** Rayon de recherche des commodités, en mètres. Cohérent avec la PR #16. */
const RAYON_COMMODITES = 400;

const libellePrise = (cle: string): string =>
  PRISES.find((p) => p.cle === cle)?.libelle ?? cle;

/** « 4 × 300 kW » — le multiplicateur ne se met qu'à partir de deux. */
function titreGroupe(g: GroupePdc): string {
  return g.nombre > 1 ? `${g.nombre} × ${g.puissanceKw} kW` : `${g.puissanceKw} kW`;
}

/** « il y a 4 mois » — la fraîcheur compte autant que la donnée. */
export function anciennete(iso: string | null, maintenant = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const jours = Math.floor((maintenant.getTime() - d.getTime()) / 86_400_000);
  // Une date future vient d'une saisie fautive du producteur : on la tait.
  if (jours < 0) return null;
  if (jours === 0) return 'aujourd’hui';
  if (jours === 1) return 'hier';
  if (jours < 31) return `il y a ${jours} jours`;
  const mois = Math.floor(jours / 30.44);
  if (mois < 24) return `il y a ${mois} mois`;
  return `il y a ${Math.floor(mois / 12)} ans`;
}

/** Ce que le cartouche sait demander au planificateur. */
export interface PorteItineraire {
  allerVers(point: { lon: number; lat: number }, libelle: string): void;
  /* LE PLAN DE RECHARGE SE COMMANDE AUSSI D'ICI — Armelin, le 27/08/2026 :
     « sélectionner une borne proposée sur le trajet pour en voir son détail et
     décider de la retirer », « sélectionner une borne non proposée […] et
     proposer de l'ajouter à l'itinéraire ». Optionnelles : le cartouche reste
     utilisable avec un planificateur qui ne sait pas encore répondre. */
  etatDansLePlan?(cle: string): 'retenu' | 'candidat' | null;
  basculerArret?(cle: string, action: 'imposer' | 'ecarter'): void;
}

export class FicheBorne extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  /* LE PLANIFICATEUR, quand il est branché. Le cartouche reste utilisable
     sans lui : le bouton « Itinéraire » ne paraît alors pas, plutôt que
     d'échouer au clic. */
  #itineraire: PorteItineraire | null = null;
  /* L'AUTRE CARTOUCHE (fiche-lieu) : deux ouverts se recouvriraient — le
     second geste range le premier, dans les deux sens (câblé par carte.ts). */
  #homologue: { fermer(): void } | null = null;

  set itineraire(p: PorteItineraire) { this.#itineraire = p; }

  set homologue(h: { fermer(): void }) { this.#homologue = h; }
  #annulation: AbortController | null = null;
  /** La cible affichée — sert à ignorer les réponses hors d'ordre. */
  #cible: CibleBorne | null = null;

  set carte(c: CarteMapLibre) { this.#carte = c; }

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.hidden = true;
    this.setAttribute('role', 'complementary');
    this.setAttribute('aria-label', 'Détail de la station de recharge');
    this.innerHTML = `
      <article class="fb" tabindex="-1">
        <header class="fb-tete">
          <h2 class="fb-titre"></h2>
          <button type="button" class="fb-fermer" aria-label="Fermer le détail">✕</button>
        </header>
        <div class="fb-corps"></div>
      </article>`;
    this.querySelector('.fb-fermer')?.addEventListener('click', () => { this.fermer(); });
    /* ÉCHAP FERME, comme partout ailleurs dans l'application. L'écouteur est
       posé sur la carte elle-même et non sur le document : une touche pressée
       dans un champ de recherche ne doit pas faire disparaître le cartouche
       qu'on vient d'ouvrir. */
    this.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); this.fermer(); }
    });

    /* UNE SEULE SURFACE À LA FOIS DANS LA COLONNE DE GAUCHE.
       Le cartouche et les volets du rail occupent le même bord de l'écran :
       ouverts ensemble, le premier RECOUVRE le second — ses filtres passaient
       sous la carte de détail, et c'est ce qu'Armelin voyait comme des encarts
       qui se chevauchent. Mesurer les textes ne le montrait pas : ils ne se
       recouvrent pas, c'est la surface entière qui masque l'autre.
       On les rend donc exclusifs, dans les deux sens. L'événement `toggle` NE
       REMONTE PAS : il faut l'écouter en capture. */
    document.addEventListener('toggle', (e) => {
      const cible = e.target;
      if (!(cible instanceof HTMLDetailsElement) || !cible.open) return;
      // Les volets IMBRIQUÉS ne comptent pas : ils vivent dans leur parent.
      if (cible.parentElement?.closest('details')) return;
      if (this.contains(cible)) return;
      this.fermer();
    }, true);
  }

  fermer(): void {
    this.#annulation?.abort();
    this.#annulation = null;
    this.#cible = null;
    this.hidden = true;
  }

  /** Ouvre le cartouche sur une station et va chercher son détail. */
  ouvrir(cible: CibleBorne): void {
    this.#annulation?.abort();
    const annulation = new AbortController();
    this.#annulation = annulation;
    this.#cible = cible;
    // Voir `connectedCallback` : la colonne de gauche ne porte qu'une surface.
    refermerPanneaux(document);
    this.#homologue?.fermer();
    this.hidden = false;

    const titre = this.querySelector('.fb-titre') as HTMLElement;
    const corps = this.querySelector('.fb-corps') as HTMLElement;
    titre.textContent = cible.nom;
    corps.replaceChildren(this.#note('Chargement du détail…', 'fb-attente'));
    (this.querySelector('.fb') as HTMLElement).focus();

    chargerDetail(cible, annulation.signal).then(
      (detail) => {
        if (annulation.signal.aborted || this.#cible !== cible) return;
        if (!detail) {
          corps.replaceChildren(this.#note(
            'Cette station n’est plus dans le fichier national des bornes.'
            + ' Elle a pu fermer depuis la dernière mise à jour de la carte.',
            'fb-vide',
          ));
          return;
        }
        titre.textContent = detail.nom;
        this.#rendre(detail, cible);
      },
      (e: unknown) => {
        if (annulation.signal.aborted || this.#cible !== cible) return;
        corps.replaceChildren(this.#note(
          e instanceof ErreurStation
            ? e.message
            : 'Le détail de cette station n’est pas disponible pour le moment.',
          'fb-erreur',
        ));
      },
    );
  }

  /* ---- rendu ---- */

  #note(texte: string, classe: string): HTMLElement {
    const p = document.createElement('p');
    p.className = classe;
    p.textContent = texte;
    return p;
  }

  /** Un cartouche titré. C'est l'unité visuelle de tout ce composant. */
  #bloc(titre: string, classe = ''): HTMLElement {
    const section = document.createElement('section');
    section.className = `fb-bloc ${classe}`.trim();
    const h = document.createElement('h3');
    h.textContent = titre;
    section.append(h);
    return section;
  }

  /** Une ligne « intitulé — valeur » dans un cartouche. */
  #ligne(parent: HTMLElement, intitule: string, valeur: string): void {
    const p = document.createElement('p');
    p.className = 'fb-ligne';
    const dt = document.createElement('span');
    dt.className = 'fb-intitule';
    dt.textContent = intitule;
    const dd = document.createElement('span');
    dd.className = 'fb-valeur';
    dd.textContent = valeur;
    p.append(dt, dd);
    parent.append(p);
  }

  #rendre(d: DetailStation, cible: CibleBorne): void {
    const corps = this.querySelector('.fb-corps') as HTMLElement;
    corps.replaceChildren();

    corps.append(this.#bandeauAcces(d));
    corps.append(this.#actions(d, cible));
    corps.append(this.#blocIdentite(d));
    if (d.groupes.length > 0) corps.append(this.#blocPoints(d));
    corps.append(this.#blocPratique(d));
    corps.append(this.#blocPaiement(d));
    corps.append(this.#blocCommodites(cible));
    corps.append(this.#blocEtat(d));
    corps.append(this.#blocProvenance(d));
  }

  /* LE BANDEAU D'ACCÈS EST EN TÊTE, et pas au milieu d'une liste : c'est la
     seule information qui peut rendre le déplacement inutile. Onze pour cent
     des stations françaises sont réservées à une flotte ou à des résidents. */
  #bandeauAcces(d: DetailStation): HTMLElement {
    const p = document.createElement('p');
    if (d.ouvert === true) {
      p.className = 'fb-acces fb-acces-libre';
      p.textContent = 'Ouvert à tous';
    } else if (d.ouvert === false) {
      p.className = 'fb-acces fb-acces-reserve';
      /* « RÉSERVÉ » NE VEUT PAS DIRE « INTERDIT ». Armelin, le 27/08/2026 :
         « il y a des bornes où je vais charger qui sont taguées accès réservé
         alors que ça fonctionne très bien avec mon badge ». Le schéma IRVE ne
         connaît que deux états, et « Accès réservé » couvre aussi bien la
         flotte d'entreprise fermée que la borne ouverte à quiconque porte le
         badge de l'opérateur. L'ancien texte — « vous ne pourrez pas y
         recharger librement » — transformait une condition en interdiction. */
      p.textContent = 'Accès réservé selon l’exploitant — badge, clientèle ou'
        + ' résidents. Votre badge peut y donner droit : vérifiez avant le détour.';
    } else {
      p.className = 'fb-acces fb-acces-inconnu';
      p.textContent = 'Conditions d’accès non déclarées par l’exploitant';
    }
    /* LE TEXTE PORTE L'INFORMATION, PAS SEULEMENT LA COULEUR : un bandeau vert
       ou orange ne dit rien à qui ne distingue pas ces deux teintes (WCAG
       1.4.1, « utilisation de la couleur »). */
    return p;
  }

  /**
   * Ce qu'on peut FAIRE de cette borne, tout en haut.
   *
   * Armelin, le 26/08/2026 : « quand je clique sur une borne de recharge, je
   * n'ai pas la possibilité de cliquer sur un bouton pour démarrer un
   * itinéraire vers cette dernière ». Le cartouche décrivait la station sans
   * jamais permettre d'y aller — il fallait relever son adresse et la retaper
   * dans le planificateur, pour un point qu'on désignait déjà du doigt.
   *
   * LE BOUTON EST EN TÊTE, sous l'accès : c'est l'action qu'on vient chercher,
   * pas une option à découvrir en bas d'une liste de six rubriques.
   */
  #actions(d: DetailStation, cible: CibleBorne): HTMLElement {
    const boite = document.createElement('div');
    boite.className = 'fb-actions';

    /* GARDER LA BORNE, DANS LA LISTE QU'ON VEUT (FAVORIS-4, 03/09).
       Armelin : « quand on clique sur une borne de recharge, on peut y aller,
       mais on ne peut pas l'ajouter en favoris dans une liste qu'on aurait
       créée pour retrouver plus facilement ses bornes de recharge favorites ».
       Ce cartouche n'avait AUCUN bouton de favori — les fiches de lieu et
       d'adresse en avaient un depuis longtemps, celle-ci était restée dehors.

       IL PASSE AVANT LE GARDE `#itineraire` : garder une borne ne demande
       aucun planificateur, et le retour d'Armelin porte précisément sur ce
       qu'on fait d'une borne QUAND ON NE PART PAS TOUT DE SUITE. */
    const favori = document.createElement('button');
    favori.type = 'button';
    favori.className = 'fb-favori';
    /* L'ÉTOILE DIT « FAVORI » (FBORNE-2, 04/09). Armelin : « le bouton est
       tout gris, on dirait même pas un bouton […] la couleur grise ne fait
       pas favoris. Soit le bouton est jaune, soit il y a un logo en étoile. »
       L'étoile, donc — le jaune plein aurait crié plus fort que « Itinéraire »,
       qui reste le geste premier de ce cartouche. */
    favori.textContent = '⭐ Ajouter aux favoris';
    /* LE NOM PORTE L'ADRESSE, pour la même raison que le bouton « Itinéraire »
       plus bas : « SIGEIF » seul, dans une liste de favoris, ne se retrouve
       pas. */
    brancherAjoutFavori(favori, boite, () => ({
      nom: d.adresse ? `${d.nom} — ${d.adresse}` : d.nom,
      point: { lon: cible.lon, lat: cible.lat },
    }));
    boite.append(favori);

    if (!this.#itineraire) return boite;

    const aller = document.createElement('button');
    aller.type = 'button';
    aller.className = 'fb-aller';
    aller.textContent = 'Itinéraire vers cette borne';
    aller.addEventListener('click', () => {
      /* LE LIBELLÉ PORTE L'ADRESSE quand on l'a. « SIGEIF » désigne des
         centaines de bornes ; « SIGEIF — 17 rue Aristide Briand,
         Chennevières-sur-Marne » en désigne une. Le trajet, lui, part des
         COORDONNÉES et serait juste dans les deux cas — mais l'usager doit
         pouvoir vérifier vers quoi il va. */
      this.#itineraire?.allerVers(
        { lon: cible.lon, lat: cible.lat },
        d.adresse ? `${d.nom} — ${d.adresse}` : d.nom,
      );
      this.fermer();
    });
    boite.append(aller);

    /* LE PLAN DE RECHARGE, quand il est à l'écran et que cette borne est sur
       le trajet. LA CLÉ est celle du planificateur (cleBorne) : identifiant
       d'itinérance d'abord, position sinon — le nom seul désignerait des
       centaines de stations. Aucun bouton hors trajet : proposer d'ajouter au
       plan une borne à 300 km de la route serait une promesse creuse. */
    const cle = cleBorne(cible);
    const etat = this.#itineraire.etatDansLePlan?.(cle) ?? null;
    if (etat && this.#itineraire.basculerArret) {
      const bascule = document.createElement('button');
      bascule.type = 'button';
      bascule.className = 'fb-plan';
      bascule.textContent = etat === 'retenu'
        ? 'Retirer cet arrêt du plan de recharge'
        : 'Ajouter au plan de recharge';
      bascule.addEventListener('click', () => {
        this.#itineraire?.basculerArret?.(cle, etat === 'retenu' ? 'ecarter' : 'imposer');
        /* LE CARTOUCHE SE FERME : le plan vient de changer sous les yeux de
           l'usager — pastilles et liste — et c'est LUI qu'on regarde alors. */
        this.fermer();
      });
      boite.append(bascule);
    }
    return boite;
  }

  #blocIdentite(d: DetailStation): HTMLElement {
    const b = this.#bloc('Identité');
    if (d.adresse) this.#ligne(b, 'Adresse', d.adresse);
    if (d.reseau) this.#ligne(b, 'Enseigne', d.reseau);
    /* L'OPÉRATEUR N'EST PAS L'ENSEIGNE, et l'usager a besoin des deux : la
       seconde est peinte sur la borne, le premier répond au téléphone. On ne
       répète pas quand les deux portent le même nom. */
    if (d.operateur && d.operateur !== d.reseau) this.#ligne(b, 'Opérateur', d.operateur);
    if (d.amenageur && d.amenageur !== d.operateur && d.amenageur !== d.reseau) {
      this.#ligne(b, 'Aménageur', d.amenageur);
    }
    if (d.telephone) {
      const p = document.createElement('p');
      p.className = 'fb-ligne';
      const dt = document.createElement('span');
      dt.className = 'fb-intitule';
      dt.textContent = 'Téléphone';
      /* UN LIEN `tel:`, PARCE QUE C'EST LE CAS D'USAGE : on consulte cette
         ligne quand la borne refuse de démarrer, souvent depuis un téléphone.
         L'href est construit à partir des seuls chiffres et du « + ». */
      const a = document.createElement('a');
      a.className = 'fb-valeur fb-tel';
      a.href = `tel:${d.telephone.replace(/[^\d+]/g, '')}`;
      a.textContent = d.telephone;
      p.append(dt, a);
      b.append(p);
    }
    return b;
  }

  #blocPoints(d: DetailStation): HTMLElement {
    const b = this.#bloc('Points de charge', 'fb-points');
    const liste = document.createElement('ul');
    for (const g of d.groupes) {
      const li = document.createElement('li');
      const palier = palierDe(g.puissanceKw);
      const couleur = PALIERS.find((x) => x.palier === palier)?.couleur;

      const pastille = document.createElement('span');
      pastille.className = 'fb-pastille';
      pastille.setAttribute('aria-hidden', 'true');
      /* LES MÊMES ÉCLAIRS QUE LA CARTE — blancs, dessinés (eclairsSVG), là où
         l'émoji ⚡ sortait JAUNE de la police système. Markup engendré par le
         code à partir de constantes : la règle textContent vise les données
         externes, il n'y en a aucune ici. */
      pastille.innerHTML = eclairsSVG(palier ?? 0);
      if (couleur) pastille.style.background = couleur;

      const titre = document.createElement('span');
      titre.className = 'fb-pdc-titre';
      titre.textContent = titreGroupe(g);

      const prises = document.createElement('span');
      prises.className = 'fb-pdc-prises';
      prises.textContent = g.prises.length > 0
        ? g.prises.map(libellePrise).join(' · ')
        : 'connecteur non déclaré';

      li.append(pastille, titre, prises);
      liste.append(li);
    }
    b.append(liste);

    /* LA SOMME DÉCLARÉE ET LA SOMME COMPTÉE DIVERGENT PARFOIS : le fichier
       consolidé contient des doublons et des lignes manquantes. Quand c'est le
       cas, on montre les deux plutôt que de trancher pour le producteur. */
    const comptes = d.groupes.reduce((t, g) => t + g.nombre, 0);
    if (d.pdc !== null && d.pdc !== comptes) {
      b.append(this.#note(
        `L’exploitant déclare ${d.pdc} point${d.pdc > 1 ? 's' : ''} de charge ;`
        + ` le fichier national en détaille ${comptes}.`,
        'fb-nuance',
      ));
    }
    return b;
  }

  #blocPratique(d: DetailStation): HTMLElement {
    const b = this.#bloc('Sur place');
    if (d.horaires) this.#ligne(b, 'Horaires', d.horaires === '24/7' ? '24 h/24, 7 j/7' : d.horaires);
    if (d.implantation) this.#ligne(b, 'Implantation', d.implantation);
    if (d.pmr) this.#ligne(b, 'Accessibilité', d.pmr);
    if (d.reservation === true) this.#ligne(b, 'Réservation', 'possible');
    if (d.deuxRoues === true) this.#ligne(b, 'Deux-roues', 'station adaptée');
    // Un cartouche sans la moindre ligne serait un titre seul : on le dit.
    if (!b.querySelector('.fb-ligne')) {
      b.append(this.#note('Rien de déclaré sur les conditions de place.', 'fb-nuance'));
    }
    return b;
  }

  #blocPaiement(d: DetailStation): HTMLElement {
    const b = this.#bloc('Paiement');
    if (d.gratuit === true) this.#ligne(b, 'Recharge', 'gratuite');
    if (d.paiementCb !== null) {
      this.#ligne(b, 'Carte bancaire', d.paiementCb ? 'acceptée' : 'non acceptée');
    }
    if (d.paiementActe !== null) {
      this.#ligne(b, 'Sans abonnement', d.paiementActe ? 'possible' : 'non');
    }
    if (d.tarification) {
      /* LE TARIF EST RENDU TEL QUEL, ET SA PROVENANCE EST DITE. Le champ n'est
         rempli que sur 24 % des lignes (mesuré), en texte libre : il contient
         aussi bien « 0,29 €/kWh » qu'une adresse de site web. L'interpréter
         pour en faire un prix affiché serait inventer une précision. */
      const p = document.createElement('p');
      p.className = 'fb-tarif';
      p.textContent = d.tarification;
      b.append(p);
      b.append(this.#note('Texte déclaré par l’exploitant, non vérifié.', 'fb-nuance'));
    } else {
      b.append(this.#note(
        'Aucun tarif déclaré au fichier national — il n’est renseigné que'
        + ' pour une station sur quatre.',
        'fb-nuance',
      ));
    }
    return b;
  }

  /* LES COMMODITÉS SONT À LA DEMANDE. Overpass est un service bénévole : on ne
     l'interroge pas à l'ouverture de chaque cartouche « au cas où ». */
  #blocCommodites(cible: CibleBorne): HTMLElement {
    const b = this.#bloc('À proximité');
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'fb-commodites';
    bouton.textContent = 'Chercher les commerces et services';
    const sortie = document.createElement('div');
    sortie.className = 'fb-commodites-corps';
    sortie.setAttribute('role', 'status');

    bouton.addEventListener('click', () => {
      bouton.disabled = true;
      sortie.replaceChildren(this.#note('Recherche…', 'fb-attente'));
      chargerCommodites(cible.lon, cible.lat, RAYON_COMMODITES).then(
        (trouvees) => {
          if (this.#cible !== cible) return;
          sortie.replaceChildren(this.#listeCommodites(trouvees, cible));
        },
        (e: unknown) => {
          if (this.#cible !== cible) return;
          // Overpass tombe régulièrement : l'appel reste rejouable.
          bouton.disabled = false;
          sortie.replaceChildren(this.#note(
            e instanceof ErreurCommodites
              ? e.message
              : 'Les commerces alentour ne sont pas disponibles pour le moment.',
            'fb-erreur',
          ));
        },
      );
    });
    b.append(bouton, sortie);
    return b;
  }

  /** La liste des commodités, la plus proche d'abord, avec sa distance. */
  #listeCommodites(trouvees: Commodite[], cible: CibleBorne): HTMLElement {
    if (trouvees.length === 0) {
      return this.#note(
        'Rien de cartographié dans les 400 mètres — ce qui ne veut pas dire'
        + ' qu’il n’y a rien.',
        'fb-nuance',
      );
    }
    /* TRIÉ PAR DISTANCE, ET LA DISTANCE EST AFFICHÉE : « 60 m » décide de
       s'y rendre à pied pendant la charge, « 800 m » non. Une liste sans
       distances obligerait à ouvrir chaque nom sur la carte pour le savoir. */
    const avecDistance = trouvees
      .map((c) => ({
        c,
        m: Math.round(distanceM([cible.lon, cible.lat], [c.lon, c.lat])),
      }))
      .sort((a, b) => a.m - b.m);

    const liste = document.createElement('ul');
    liste.className = 'fb-liste-commodites';
    for (const { c, m } of avecDistance) {
      const li = document.createElement('li');
      const libelleType = TYPES_COMMODITE.find((t) => t.cle === c.type)?.libelle ?? c.type;
      // Un quart des commodités ne portent aucune identité : le type suffit.
      const libelle = c.nom ?? libelleType;

      /* LE PICTO DESSINÉ AVANT LE MOT — la présentation « claire et
         stylisée » demandée le 27/08 (restautoroute.fr en exemple). Jamais un
         logo d'enseigne : le picto porte le TYPE, le nom s'écrit à côté. */
      const picto = document.createElement('span');
      picto.className = `com-picto com-${c.type}`;
      picto.setAttribute('aria-hidden', 'true');
      picto.innerHTML = svgCommodite(c.type);

      const type = document.createElement('span');
      type.className = 'fb-commodite-type';
      type.textContent = libelleType;

      /* LE NOM EST UN BOUTON : il montre le lieu sur la carte. Armelin, le
         26/08 : « ça ne me donne pas la possibilité de cliquer dessus ». Une
         liste qu'on lit sans pouvoir la situer oblige à chercher des yeux ce
         que l'application sait déjà. */
      const nom = document.createElement('button');
      nom.type = 'button';
      nom.className = 'fb-commodite-nom';
      nom.textContent = libelle;
      nom.setAttribute('aria-label', `Voir ${libelle} sur la carte`);
      nom.addEventListener('click', () => {
        this.#carte?.flyTo({ center: [c.lon, c.lat], zoom: 17 });
      });

      const dist = document.createElement('span');
      dist.className = 'fb-commodite-distance';
      dist.textContent = `${m} m`;

      li.append(picto, type, nom, dist);

      /* ET UN ITINÉRAIRE VERS LUI. C'est l'autre moitié de la demande : on
         regarde un restaurant à 62 m et l'on veut y aller, pas recopier son
         nom dans un champ de recherche. */
      if (this.#itineraire) {
        const aller = document.createElement('button');
        aller.type = 'button';
        aller.className = 'fb-commodite-aller';
        aller.textContent = 'Itinéraire';
        aller.setAttribute('aria-label', `Itinéraire vers ${libelle}`);
        aller.addEventListener('click', () => {
          /* LE NOM SEUL NE SUFFIT PAS. Armelin, le 26/08/2026 : « le champ de
             recherche affiche seulement le nom du commerce mais pas son
             adresse […] il existe des milliers de Carrefour en France ». Le
             trajet partait bel et bien des bonnes COORDONNÉES — mais rien ne
             permettait de le vérifier, et « Carrefour » dans un champ
             d'adresse se lit comme une saisie à moitié faite.
             On demande donc l'adresse à la BAN, et son échec ne perd rien :
             on retombe sur les coordonnées, qui désignent le lieu sans
             ambiguïté même si elles se lisent moins bien. */
          const secours = `${libelle} (${c.lat.toFixed(5)}, ${c.lon.toFixed(5)})`;
          aller.disabled = true;
          adresseInverse({ lon: c.lon, lat: c.lat }).then(
            (a) => {
              this.#itineraire?.allerVers({ lon: c.lon, lat: c.lat },
                a ? `${libelle} — ${a.libelle}` : secours);
              this.fermer();
            },
            () => {
              this.#itineraire?.allerVers({ lon: c.lon, lat: c.lat }, secours);
              this.fermer();
            },
          );
        });
        li.append(aller);
      }
      liste.append(li);
    }
    const enveloppe = document.createElement('div');
    enveloppe.append(liste, this.#note('Source OpenStreetMap.', 'fb-nuance'));
    return enveloppe;
  }

  /**
   * L'ÉTAT DÉCLARÉ DES POINTS — daté, jamais donné pour l'instant présent.
   *
   * IRVE-1 (01/09). Armelin demandait « les points libres ou occupés » et un
   * reroutage automatique quand une station est chargée. La base existe et
   * elle est française, publique et gratuite ; elle n'est simplement PAS
   * vivante. Mesuré le jour même sur 1 400 points : aucun relevé de moins de
   * 9,6 heures, 45 % de plus de sept jours. Un reroutage bâti là-dessus
   * détournerait quelqu'un sur une file d'attente d'avant-hier.
   *
   * ALORS ON MONTRE CE QUI SE TIENT : le nombre de points signalés HORS
   * SERVICE — une panne ne se vide pas comme une place — et l'occupation
   * DATÉE en toutes lettres, tant qu'elle a moins d'une semaine. UN SEUL
   * APPEL, à l'ouverture de la fiche, jamais en boucle.
   */
  #blocEtat(d: DetailStation): HTMLElement {
    const b = this.#bloc('État déclaré des points', 'fb-etat');
    const attente = this.#note('Lecture des derniers relevés…', 'fb-attente');
    b.append(attente);
    const cible = this.#cible;
    void chercherReleves(d.pdcIds).then(
      (releves) => {
        /* LA FICHE A PU CHANGER PENDANT L'APPEL : écrire dans celle d'une
           autre station serait pire que ne rien écrire. */
        if (this.#cible !== cible) return;
        attente.remove();
        const r = resumerReleves(releves);
        if (r.releves === 0 || r.leFrais === null) {
          b.append(this.#note(
            'Aucun relevé public pour les points de cette station. Ce silence'
            + ' est celui du fichier national, pas de la carte : la plupart'
            + ' des opérateurs n’y déposent rien.',
            'fb-nuance',
          ));
          return;
        }
        const age = ageEnMots(r.leFrais, Date.now());
        this.#ligne(b, 'Dernier relevé', `${age} · ${r.releves} point${
          r.releves > 1 ? 's' : ''} sur ${d.pdcIds.length}`);
        if (r.horsService > 0) {
          /* CELLE-LÀ SE VOIT : c'est la seule qui peut rendre le détour
             inutile, et elle ne se périme pas comme une place occupée. */
          const p = this.#note(
            `${r.horsService} point${r.horsService > 1 ? 's' : ''} signalé${
              r.horsService > 1 ? 's' : ''} HORS SERVICE au dernier relevé.`,
            'fb-alerte',
          );
          b.append(p);
        }
        if (Date.now() - r.leFrais <= PEREMPTION_OCCUPATION_MS) {
          this.#ligne(b, 'Occupation ce jour-là',
            `${r.libres} libre${r.libres > 1 ? 's' : ''}, ${r.occupes} occupé${
              r.occupes > 1 ? 's' : ''}`);
        }
        b.append(this.#note(
          'Ces relevés ne sont PAS en direct : le plus frais mesuré sur ce'
          + ' fichier avait neuf heures. Ils disent l’état d’un jour passé,'
          + ' pas la place libre qui vous attend.',
          'fb-nuance',
        ));
      },
      () => {
        if (this.#cible !== cible) return;
        attente.remove();
        /* UNE PANNE DE CE SERVICE N'EST PAS UNE ABSENCE DE RELEVÉ : le dire
           autrement ferait porter au réseau un silence qui vient d'ailleurs. */
        b.append(this.#note(
          'Les relevés d’état ne répondent pas pour le moment.', 'fb-nuance',
        ));
      },
    );
    return b;
  }

  /* LA DERNIÈRE RUBRIQUE DIT D'OÙ VIENT LA DONNÉE, ET CE QU'ELLE N'A PAS.
     Un cartouche silencieux sur l'occupation laisse croire à un oubli
     d'affichage ; il vaut mieux écrire qu'aucune source publique française ne
     la donne à l'échelle du pays. */
  #blocProvenance(d: DetailStation): HTMLElement {
    const b = this.#bloc('Source et limites', 'fb-source');
    const age = anciennete(d.majLe);
    this.#ligne(
      b, 'Fichier',
      `IRVE consolidé (data.gouv.fr)${age ? `, mis à jour ${age}` : ''}`,
    );
    if (d.id) this.#ligne(b, 'Identifiant d’itinérance', d.id);
    /* CETTE PHRASE ÉTAIT FAUSSE, ET IRVE-1 L'A ÉTABLI : une source publique
       française DIFFUSE bien l'état des points à l'échelle nationale. Elle
       n'est simplement pas vivante. Se tromper dans ce sens-là revenait à
       cacher une donnée qui existe. */
    b.append(this.#note(
      'L’occupation en direct n’existe dans aucune source publique française :'
      + ' le fichier national d’état des points est déposé par lots, et son'
      + ' relevé le plus frais mesuré avait neuf heures. Vérifiez la'
      + ' disponibilité dans l’application de l’opérateur avant de vous engager.',
      'fb-nuance',
    ));
    return b;
  }
}

customElements.define('fiche-borne', FicheBorne);
