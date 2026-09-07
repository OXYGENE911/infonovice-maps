/* LA PORTE DU PLANIFICATEUR — le volet du rail avant que son module n'arrive.
 *
 * POURQUOI ELLE EXISTE (PERF-4, 07/09/2026). Le planificateur est, de loin, le
 * plus gros module de l'application : 48 Ko gzippés à lui seul sur les 156 du
 * morceau de démarrage. Or il ne sert pas au premier écran — la carte, elle,
 * s'affiche sans lui. Mesuré le 07/09 (Lighthouse 13, mobile simulé, A/B
 * croisé sur la même machine, trois passages chacun, le planificateur remplacé
 * par une souche vide pour connaître le plafond) :
 *
 *     avec              note 76 / 72 / 73   FCP 2,6 s   LCP 3,8–3,9 s
 *     sans              note 81 / 82 / 83   FCP 2,3 s   LCP 3,6–3,7 s
 *
 * Neuf points de note et trois dixièmes de seconde sur le premier affichage :
 * cela valait un chantier.
 *
 * CE QU'ELLE FAIT. Elle pose dans le rail le MÊME volet fermé que le vrai
 * planificateur — même classe, même picto, même intitulé — et retient tout ce
 * qu'on lui branche. Au premier geste qui a besoin du planificateur, elle
 * charge le module, construit le vrai panneau, rejoue les branchements DANS
 * L'ORDRE OÙ ILS SONT VENUS, et se remplace par lui.
 *
 * CE QUI DÉCLENCHE LE CHARGEMENT, et rien d'autre :
 *   · l'ouverture du volet (le geste évident) ;
 *   · `allerVers` et `detourParLieu` — « Y aller » depuis une fiche ;
 *   · un lien partagé qui porte déjà un trajet (`#iti=…`), au démarrage.
 * La position GPS, elle, ne déclenche RIEN : elle arrive une fois par seconde
 * et n'est qu'une valeur à retenir. Charger là-dessus aurait annulé le gain.
 *
 * PAS DE PRÉCHARGEMENT AU REPOS, et c'est mesuré (voir carte.ts, PERF-3) : le
 * repos du navigateur tombe DANS la fenêtre de mesure, et le travail déplacé
 * s'y ajoute au lieu d'en sortir.
 */
import { pictoMenu } from './icone-menu';
import type { Map as CarteMapLibre } from 'maplibre-gl';
import type { PointGeo } from '../lib/coordonnees';
import type { Monument } from '../lib/monuments';
import type { FicheBorne } from './fiche-borne';
import type { FicheLieu } from './fiche-lieu';
import type { BandeauGuidage } from './bandeau-guidage';
import type { PanneauItineraire, PorteCouchesBornes } from './panneau-itineraire';

/** Le volet fermé, identique à celui que le vrai panneau rend lui-même. */
function voletFerme(): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'iti surface-de-travail';
  const summary = document.createElement('summary');
  summary.setAttribute('aria-label', 'Ouvrir le planificateur d’itinéraire');
  summary.innerHTML = `${pictoMenu('itineraire')}Itinéraire`;
  details.append(summary);
  return details;
}

/** Un lien partagé porte-t-il déjà un trajet ? — PURE. */
export function fragmentPorteUnTrajet(fragment: string): boolean {
  return /(^|[#&])iti=/.test(fragment);
}

export class PortePlanificateur {
  readonly #hote: HTMLElement;
  #volet: HTMLDetailsElement;
  #vrai: PanneauItineraire | null = null;
  #venue: Promise<void> | null = null;

  /* CE QU'ON LUI BRANCHE AVANT QU'ELLE N'OUVRE. Rejoué dans l'ordre du vrai
     câblage : la carte AVANT la pose dans le document (le panneau la lit en
     se connectant), le reste après. */
  #carte: CarteMapLibre | null = null;
  #couchesBornes: PorteCouchesBornes | null = null;
  #fiche: FicheBorne | null = null;
  #ficheLieu: FicheLieu | null = null;
  #guidage: BandeauGuidage | null = null;
  #prevoirGuidage: (() => void) | null = null;
  #position: PointGeo | null = null;
  #logements: [vue: 'vehicule', element: HTMLElement][] = [];
  /** Le geste qui a déclenché le chargement, rejoué une fois le panneau là. */
  #aFaire: ((p: PanneauItineraire) => void) | null = null;

  constructor(hote: HTMLElement) {
    this.#hote = hote;
    this.#volet = voletFerme();
    /* UNE ENVELOPPE, ET ELLE PORTE UN NOM À TIRET — deux raisons, toutes deux
       payées par un parcours rouge. Le rail se lit
       `.maplibregl-ctrl-top-left > div > * > details` : le vrai panneau EST
       cet astérisque, et sans enveloppe le volet remontait d'un cran. Et
       `panneaux.ts` ne tient pour volet de tête que ce qui vit DANS un
       composant, reconnu au tiret de son nom : sans tiret, Échap et le clic
       extérieur ne refermaient plus la porte. */
    const enveloppe = document.createElement('porte-planificateur');
    enveloppe.append(this.#volet);
    /* `toggle` ET NON `click` : le volet s'ouvre aussi au clavier (Entrée sur
       le summary), et un lecteur d'écran peut l'ouvrir sans clic. */
    this.#volet.addEventListener('toggle', () => {
      if (this.#volet.open) void this.charger();
    });
    hote.append(enveloppe);
  }

  /** Le vrai panneau, s'il est déjà là — pour les parcours et les tests. */
  get panneau(): PanneauItineraire | null { return this.#vrai; }

  /**
   * Fait venir le module, une seule fois.
   *
   * L'ORDRE DE REJEU EST CELUI DU CÂBLAGE D'ORIGINE, et ce n'est pas un
   * détail : `loger` cherche un nœud que le panneau ne construit qu'en se
   * connectant, et `carte` doit être connue AVANT cette construction.
   */
  async charger(): Promise<void> {
    this.#venue ??= import('./panneau-itineraire').then(({ PanneauItineraire: Panneau }) => {
      const vrai = new Panneau();
      if (this.#carte) vrai.carte = this.#carte;
      const ouvert = this.#volet.open;
      this.#hote.replaceChildren(vrai);
      if (this.#couchesBornes) vrai.couchesBornes = this.#couchesBornes;
      if (this.#fiche) vrai.fiche = this.#fiche;
      if (this.#ficheLieu) vrai.ficheLieu = this.#ficheLieu;
      if (this.#prevoirGuidage) vrai.prevoirGuidage = this.#prevoirGuidage;
      if (this.#guidage) vrai.guidage = this.#guidage;
      for (const [vue, element] of this.#logements) vrai.loger(vue, element);
      if (this.#position) vrai.position = this.#position;
      if (ouvert) vrai.querySelector('details.iti')?.setAttribute('open', '');
      this.#vrai = vrai;
      const aFaire = this.#aFaire;
      this.#aFaire = null;
      aFaire?.(vrai);
    });
    return this.#venue;
  }

  /* ---- la même surface que le panneau, vue de carte.ts ---- */

  set carte(c: CarteMapLibre) {
    this.#carte = c;
    if (this.#vrai) this.#vrai.carte = c;
  }

  set couchesBornes(p: PorteCouchesBornes) {
    this.#couchesBornes = p;
    if (this.#vrai) this.#vrai.couchesBornes = p;
  }

  set fiche(f: FicheBorne) {
    this.#fiche = f;
    if (this.#vrai) this.#vrai.fiche = f;
  }

  set ficheLieu(f: FicheLieu) {
    this.#ficheLieu = f;
    if (this.#vrai) this.#vrai.ficheLieu = f;
  }

  set guidage(b: BandeauGuidage) {
    this.#guidage = b;
    if (this.#vrai) this.#vrai.guidage = b;
  }

  set prevoirGuidage(f: () => void) {
    this.#prevoirGuidage = f;
    if (this.#vrai) this.#vrai.prevoirGuidage = f;
  }

  /** La position ne déclenche RIEN : une valeur retenue, rien de plus. */
  set position(p: PointGeo) {
    this.#position = p;
    if (this.#vrai) this.#vrai.position = p;
  }

  loger(vue: 'vehicule', element: HTMLElement): void {
    this.#logements.push([vue, element]);
    if (this.#vrai) this.#vrai.loger(vue, element);
  }

  /** Sans trajet tracé, il n'y a rien à reposer : le silence est la réponse. */
  reposerBornesTrajet(): void {
    this.#vrai?.reposerBornesTrajet();
  }

  allerVers(point: PointGeo, libelle: string): void {
    if (this.#vrai) { this.#vrai.allerVers(point, libelle); return; }
    this.#aFaire = (p) => { p.allerVers(point, libelle); };
    void this.charger();
  }

  /* CE QUE LE CARTOUCHE D'UNE BORNE DEMANDE (PorteItineraire). Ces deux-là
     sont OPTIONNELS dans l'interface : les oublier ne fait pas rougir le
     compilateur, seulement deux parcours — « la fiche propose de retirer
     l'arrêt » et « … de l'ajouter ». Sans planificateur, il n'y a pas de plan :
     `null` est la réponse vraie, et le bouton ne paraît pas. */
  etatDansLePlan(cle: string): 'retenu' | 'candidat' | null {
    return this.#vrai?.etatDansLePlan(cle) ?? null;
  }

  basculerArret(cle: string, action: 'imposer' | 'ecarter'): void {
    this.#vrai?.basculerArret(cle, action);
  }

  /** Rend `false` tant que le module n'est pas là — le détour se fait ensuite. */
  detourParLieu(lieu: Monument): boolean {
    if (this.#vrai) return this.#vrai.detourParLieu(lieu);
    this.#aFaire = (p) => { p.detourParLieu(lieu); };
    void this.charger();
    return false;
  }
}
