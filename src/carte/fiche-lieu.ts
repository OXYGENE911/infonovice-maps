/* <fiche-lieu> — le cartouche de détail d'un lieu d'exception.
 *
 * LA DEMANDE. Armelin, le 27/08/2026 au soir, sur les lieux d'exception
 * fraîchement livrés : « il est impossible de cliquer dessus pour avoir le
 * détail à l'identique d'une station de recharge ». Le nom volait vers le
 * lieu, et c'était tout — la liste savait où, jamais quoi.
 *
 * CE QUE LA FICHE SAIT DIRE, ET D'OÙ. Tout vient de l'index Mérimée engendré
 * (lib/monuments.ts) : titre, commune, siècle de construction (85 % de
 * couverture), adresse (27 % — affichée quand elle est là), et la RÉFÉRENCE
 * Mérimée (100 %), qui ouvre la notice OFFICIELLE sur pop.culture.gouv.fr —
 * l'historique complet vit là-bas, chez le ministère, pas dans un index de
 * 1,5 Mo qu'il faudrait décupler pour le porter.
 *
 * MÊME DESSIN, MÊMES RÈGLES QUE LA FICHE DE BORNE : les classes fb-* sont
 * REPRISES — un seul langage visuel pour tous les cartouches — et tout le
 * contenu passe par textContent : titres et adresses viennent d'un fichier
 * externe.
 */
import type { Map as CarteMapLibre } from 'maplibre-gl';
import type { Monument } from '../lib/monuments';
import { refermerPanneaux } from './panneaux';
import type { PorteItineraire } from './fiche-borne';
import { photoDuMonument, type PhotoLieu } from '../lib/photos-monuments';

/** L'autre cartouche de l'application — un seul ouvert à la fois. */
export interface CartoucheHomologue { fermer(): void }

export class FicheLieu extends HTMLElement {
  #carte: CarteMapLibre | null = null;
  #itineraire: PorteItineraire | null = null;
  #homologue: CartoucheHomologue | null = null;
  /** L'appel de photo en cours — abandonné dès qu'une autre fiche s'ouvre. */
  #photoEnCours: AbortController | null = null;
  /* « PASSER PAR LÀ » — la même action que la page des lieux : le monument
     devient une étape. Posée par carte.ts ; sans elle, le bouton ne paraît
     pas plutôt que d'échouer au clic. */
  #detourPar: ((lieu: Monument) => void) | null = null;

  set carte(c: CarteMapLibre) { this.#carte = c; }
  set itineraire(p: PorteItineraire) { this.#itineraire = p; }
  set homologue(h: CartoucheHomologue) { this.#homologue = h; }
  set detourPar(f: (lieu: Monument) => void) { this.#detourPar = f; }

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.hidden = true;
    this.setAttribute('role', 'complementary');
    this.setAttribute('aria-label', 'Détail du lieu d’exception');
    this.innerHTML = `
      <article class="fb" tabindex="-1">
        <header class="fb-tete">
          <h2 class="fb-titre"></h2>
          <button type="button" class="fb-fermer" aria-label="Fermer le détail">✕</button>
        </header>
        <div class="fb-corps"></div>
      </article>`;
    this.querySelector('.fb-fermer')?.addEventListener('click', () => { this.fermer(); });
    // Échap ferme — la même convention que partout, écoutée sur soi.
    this.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); this.fermer(); }
    });
    /* UNE SEULE SURFACE DANS LA COLONNE DE GAUCHE — la règle de la PR #45,
       étendue à ce cartouche : un volet de tête qui s'ouvre le referme. */
    document.addEventListener('toggle', (e) => {
      const cible = e.target;
      if (!(cible instanceof HTMLDetailsElement) || !cible.open) return;
      if (cible.parentElement?.closest('details')) return;
      if (this.contains(cible)) return;
      this.fermer();
    }, true);
  }

  fermer(): void {
    this.hidden = true;
    /* Une fiche refermée n'attend plus rien : la photo en vol est abandonnée
       plutôt que peinte dans un cartouche que personne ne regarde. */
    this.#photoEnCours?.abort();
    this.#photoEnCours = null;
  }

  /** Ouvre le cartouche sur un lieu. La photo, elle, se demande au réseau. */
  ouvrir(lieu: Monument): void {
    refermerPanneaux(document);
    // Deux cartouches ouverts se recouvriraient : l'autre se range.
    this.#homologue?.fermer();
    this.hidden = false;

    (this.querySelector('.fb-titre') as HTMLElement).textContent = lieu.titre;
    const corps = this.querySelector('.fb-corps') as HTMLElement;
    const photo = document.createElement('figure');
    photo.className = 'fb-photo';
    photo.hidden = true;
    corps.replaceChildren(
      this.#bandeau(),
      photo,
      this.#actions(lieu),
      this.#identite(lieu),
      this.#provenance(lieu),
    );
    (this.querySelector('.fb') as HTMLElement).focus();
    void this.#chargerPhoto(lieu, photo);
  }

  /**
   * LA PHOTO DU LIEU (PHOTO-1 — décision d'Armelin du 29/08 : « OK pour
   * Wikimedia »).
   *
   * À LA DEMANDE, ET SEULEMENT ICI : deux appels quand une fiche s'ouvre,
   * jamais en lot pour une liste de trente monuments qu'on ne regardera
   * pas. L'appel précédent est ABANDONNÉ quand une autre fiche s'ouvre —
   * sans quoi la photo du château arriverait sur la fiche de l'église.
   *
   * L'ÉCHEC NE SE VOIT PAS, ET C'EST VOULU : une fiche sans photo reste une
   * fiche (4 % des classés n'en ont aucune, mesuré) ; un message d'erreur
   * pour une illustration absente serait du bruit.
   */
  async #chargerPhoto(lieu: Monument, figure: HTMLElement): Promise<void> {
    this.#photoEnCours?.abort();
    const controle = new AbortController();
    this.#photoEnCours = controle;
    let photo: PhotoLieu | null = null;
    try {
      photo = await photoDuMonument(lieu.reference, 480, controle.signal);
    } catch {
      return; // Service muet ou hors ligne : la fiche vit sans image.
    }
    // La fiche a pu changer pendant l'appel : on ne peint pas dans le vide.
    if (controle.signal.aborted || !photo) return;

    const image = document.createElement('img');
    image.className = 'fb-photo-image';
    image.src = photo.vignette;
    image.alt = `Photographie de ${lieu.titre}`;
    image.loading = 'lazy';
    /* UNE IMAGE QUI NE CHARGE PAS NE LAISSE PAS UN CADRE CASSÉ : la figure
       entière disparaît. */
    image.addEventListener('error', () => { figure.hidden = true; });

    /* L'ATTRIBUTION EST UNE OBLIGATION, pas une politesse : ces photos sont
       libres, elles ne sont pas anonymes. Auteur et licence passent par
       `textContent` — jamais par `innerHTML` : ce sont des chaînes tierces. */
    const credit = document.createElement('figcaption');
    credit.className = 'fb-photo-credit';
    credit.textContent = `${photo.auteur} — ${photo.licence} · Wikimedia Commons`;
    if (photo.page) {
      const lien = document.createElement('a');
      lien.href = photo.page;
      lien.target = '_blank';
      lien.rel = 'noopener noreferrer';
      lien.textContent = 'voir le fichier';
      credit.append(' · ', lien);
    }
    figure.replaceChildren(image, credit);
    figure.hidden = false;
  }

  /* Le bandeau dit le STATUT — c'est lui qui fait le « lieu d'exception ». */
  #bandeau(): HTMLElement {
    const p = document.createElement('p');
    p.className = 'fb-acces fb-acces-libre';
    p.textContent = 'Monument historique classé';
    return p;
  }

  #actions(lieu: Monument): HTMLElement {
    const boite = document.createElement('div');
    boite.className = 'fb-actions';
    if (this.#itineraire) {
      const aller = document.createElement('button');
      aller.type = 'button';
      aller.className = 'fb-aller';
      aller.textContent = 'Itinéraire vers ce lieu';
      aller.addEventListener('click', () => {
        // Le libellé porte la commune : « Église Saint-Denis » en désigne cent.
        this.#itineraire?.allerVers(
          { lon: lieu.lon, lat: lieu.lat },
          lieu.commune ? `${lieu.titre} — ${lieu.commune}` : lieu.titre,
        );
        this.fermer();
      });
      boite.append(aller);
    }
    if (this.#detourPar) {
      const detour = document.createElement('button');
      detour.type = 'button';
      detour.className = 'fb-plan';
      detour.textContent = 'Passer par là (étape du trajet)';
      detour.addEventListener('click', () => {
        this.#detourPar?.(lieu);
        this.fermer();
      });
      boite.append(detour);
    }
    const voir = document.createElement('button');
    voir.type = 'button';
    voir.className = 'fb-plan';
    voir.textContent = 'Voir sur la carte';
    voir.addEventListener('click', () => {
      this.#carte?.flyTo({ center: [lieu.lon, lieu.lat], zoom: 16 });
    });
    boite.append(voir);
    return boite;
  }

  #identite(lieu: Monument): HTMLElement {
    const b = document.createElement('section');
    b.className = 'fb-bloc';
    const h = document.createElement('h3');
    h.textContent = 'Identité';
    b.append(h);
    const ligne = (intitule: string, valeur: string): void => {
      if (!valeur) return;
      const p = document.createElement('p');
      p.className = 'fb-ligne';
      const dt = document.createElement('span');
      dt.className = 'fb-intitule';
      dt.textContent = intitule;
      const dd = document.createElement('span');
      dd.className = 'fb-valeur';
      dd.textContent = valeur;
      p.append(dt, dd);
      b.append(p);
    };
    ligne('Commune', lieu.commune);
    ligne('Adresse', lieu.adresse);
    /* « 12e s.;16e s. » → « 12e s., 16e s. » : le point-virgule du fichier
       est un séparateur technique, pas une ponctuation française. */
    ligne('Construction', lieu.siecle.replaceAll(';', ', '));
    return b;
  }

  /* LA NOTICE OFFICIELLE EST À UN CLIC : l'historique complet vit chez le
     ministère. Un LIEN SORTANT n'est pas un appel — la CSP ne borne que ce
     que la page va chercher, pas où l'usager choisit d'aller. */
  #provenance(lieu: Monument): HTMLElement {
    const b = document.createElement('section');
    b.className = 'fb-bloc fb-source';
    const h = document.createElement('h3');
    h.textContent = 'Source';
    b.append(h);
    if (lieu.reference) {
      const p = document.createElement('p');
      p.className = 'fb-ligne';
      const a = document.createElement('a');
      a.className = 'fb-valeur fb-notice';
      // La référence est vérifiée par motif au décodage : l'URL est sûre.
      a.href = `https://www.pop.culture.gouv.fr/notice/merimee/${lieu.reference}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `Notice Mérimée ${lieu.reference} — historique complet (POP,`
        + ' ministère de la Culture)';
      p.append(a);
      b.append(p);
    }
    const note = document.createElement('p');
    note.className = 'fb-nuance';
    note.textContent = 'Base Mérimée, monuments historiques classés. Horaires'
      + ' et conditions de visite non déclarés au fichier : renseignez-vous'
      + ' avant le détour.';
    b.append(note);
    return b;
  }
}

customElements.define('fiche-lieu', FicheLieu);
