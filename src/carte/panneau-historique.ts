// <panneau-historique> — les parcours gardés, dans le Menu (ERGO-4, 02/09).
//
// POURQUOI IL EXISTE, ET POURQUOI IL A DÉMÉNAGÉ. STATS-2 l'avait posé dans le
// planificateur, faute d'un meilleur endroit. Armelin, deux fois : « idem pour
// le menu Historique qui se trouve dans itinéraire. Il serait plus logique de
// le mettre dans la section Menu. Ce qui permet d'afficher tous les menus et
// boutons du menu itinéraire si on ne garde que Mon véhicule et Options du
// trajet. Cela simplifie au maximum l'ergonomie et plus besoin de scroller. »
//
// IL A RAISON SUR LE FOND : on consulte l'historique SANS avoir planifié quoi
// que ce soit — c'est même à cela qu'il sert, comparer d'une semaine à
// l'autre. Le ranger derrière « Itinéraire » supposait un trajet en cours.
//
// LE PREMIER JET AVAIT REFUSÉ CE DÉMÉNAGEMENT, et il avait tort de le refuser
// à moitié : j'avais craint un bouton du menu de droite qui ouvre le volet de
// gauche. La réponse n'était pas de renoncer, c'était d'EXTRAIRE la page dans
// son propre composant — ce que fait ce fichier.
import {
  lireHistorique, ecrireHistorique, comparerTrajets, type TrajetEnregistre,
} from '../lib/historique-trajets';
import {
  texteDuPartage, nomDuFichier, CONTACT, CE_QUI_PART, CE_QUI_RESTE,
} from '../lib/partage-trajet';
import { pictoMenu } from './icone-menu';

export class PanneauHistorique extends HTMLElement {
  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <details class="hist">
        <summary aria-label="Historique des parcours enregistrés">${
  pictoMenu('feuille')}Historique</summary>
        <div class="hist-corps">
          <p class="iti-hist-vide" hidden>Aucun parcours enregistré. À la fin
            d’un trajet, le bilan propose de le garder.</p>
          <div class="iti-hist-liste" role="group" aria-label="Parcours enregistrés"></div>
          <div class="iti-hist-actions" hidden>
            <button type="button" class="iti-hist-comparer">Comparer</button>
            <button type="button" class="iti-hist-contribuer">Contribuer à
              l’algorithme</button>
            <button type="button" class="iti-hist-oublier">Oublier</button>
          </div>
          <p class="iti-hist-note">Ces parcours ne quittent pas cet appareil.</p>
          <div class="iti-hist-partage" hidden></div>
        </div>
      </details>`;

    /* LA LISTE SE RELIT À CHAQUE OUVERTURE : un trajet peut avoir été
       enregistré depuis le bandeau de suivi entre-temps. */
    const volet = this.querySelector('details.hist') as HTMLDetailsElement;
    volet.addEventListener('toggle', () => {
      if (volet.open) void this.#ouvrirHistorique();
      else this.#fermerComparaison();
    });

    this.querySelector('.iti-hist-comparer')?.addEventListener('click', () => {
      this.#montrerComparaison();
    });
    this.querySelector('.iti-hist-contribuer')?.addEventListener('click', () => {
      this.#montrerLePartage();
    });
    this.querySelector('.iti-hist-oublier')?.addEventListener('click', () => {
      void (async () => {
        this.#trajets = this.#trajets.filter((x) => !this.#coches.has(x.id));
        await ecrireHistorique(this.#trajets);
        this.#coches.clear();
        this.#rendreHistorique();
      })();
    });
  }

  /* L'HISTORIQUE EST RELU À CHAQUE OUVERTURE DE LA PAGE, jamais gardé en
     mémoire : un trajet peut avoir été enregistré depuis le bandeau de suivi
     entre-temps, et une liste figée l'aurait ignoré. */
  #trajets: TrajetEnregistre[] = [];

  #coches = new Set<string>();

  /* L'URL DE L'OBJET SE RÉVOQUE, sans quoi le fichier reste en mémoire aussi
     longtemps que la page — et il grossit à chaque clic sur « Contribuer ». */
  #urlPartage: string | null = null;

  async #ouvrirHistorique(): Promise<void> {
    this.#trajets = await lireHistorique();
    this.#coches.clear();
    this.#rendreHistorique();
  }

  #rendreHistorique(): void {
    const liste = this.querySelector<HTMLElement>('.iti-hist-liste');
    const vide = this.querySelector<HTMLElement>('.iti-hist-vide');
    const actions = this.querySelector<HTMLElement>('.iti-hist-actions');
    if (!liste || !vide || !actions) return;
    vide.hidden = this.#trajets.length > 0;
    liste.replaceChildren();
    const quand = (ms: number): string => new Date(ms)
      .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    for (const trajet of this.#trajets) {
      const l = document.createElement('label');
      l.className = 'iti-hist-ligne';
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.className = 'iti-hist-case';
      c.value = trajet.id;
      c.checked = this.#coches.has(trajet.id);
      c.addEventListener('change', () => {
        if (c.checked) this.#coches.add(trajet.id); else this.#coches.delete(trajet.id);
        this.#majActionsHistorique();
      });
      const texte = document.createElement('span');
      const min = Math.round(trajet.resume.dureeMs / 60_000);
      texte.textContent = `${trajet.titre} — ${quand(trajet.departMs)}`
        + ` · ${min} min`;
      l.append(c, texte);
      liste.appendChild(l);
    }
    this.#majActionsHistorique();
  }

  /**
   * Montre les parcours cochés CÔTE À CÔTE.
   *
   * Armelin : « une fenêtre s'ouvrira en plein écran avec les statistiques
   * côte à côte de chaque parcours […] cela permet de regarder si on a fait
   * mieux d'une semaine à l'autre ou observer la différence quand on voyage
   * seul ou en famille sur un même trajet ». Ce ne sont donc pas des chiffres
   * qu'il faut aligner, mais des ÉCARTS qu'il faut nommer : la colonne la
   * meilleure est marquée, quand « meilleur » veut dire quelque chose.
   */
  #montrerComparaison(): void {
    const choisis = this.#trajets.filter((x) => this.#coches.has(x.id));
    if (choisis.length < 2) return;
    const boite = this.querySelector<HTMLElement>('.iti-hist-comparaison')
      ?? (() => {
        const d = document.createElement('div');
        d.className = 'iti-hist-comparaison';
        d.setAttribute('role', 'group');
        d.setAttribute('aria-label', 'Comparaison des parcours');
        this.querySelector('.hist-corps')?.appendChild(d);
        return d;
      })();
    boite.replaceChildren();

    /* ELLE SE REFERME (HIST-3, 02/09). Armelin : « quand j'ai comparé deux
       trajets, l'affichage de la comparaison reste et je ne peux pas
       l'enlever même en fermant la page d'historique. Quand je reviens sur
       l'historique, la dernière comparaison reste affichée. » Un tableau
       qu'on ne peut pas retirer occupe l'écran pour toujours — et il porte
       en plus des chiffres périmés dès que la sélection change. */
    const tete = document.createElement('div');
    tete.className = 'iti-hist-comparaison-tete';
    const titreComp = document.createElement('p');
    titreComp.className = 'iti-hist-comparaison-titre';
    titreComp.textContent = `Comparaison de ${choisis.length} parcours`;
    const fermer = document.createElement('button');
    fermer.type = 'button';
    fermer.className = 'iti-hist-fermer-comparaison';
    fermer.textContent = 'Fermer';
    fermer.addEventListener('click', () => { this.#fermerComparaison(); });
    tete.append(titreComp, fermer);
    boite.appendChild(tete);

    const table = document.createElement('table');
    const entete = document.createElement('tr');
    entete.appendChild(document.createElement('th'));
    for (const t2 of choisis) {
      const th = document.createElement('th');
      th.textContent = t2.titre;
      entete.appendChild(th);
    }
    table.appendChild(entete);
    for (const ligne of comparerTrajets(choisis)) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = ligne.libelle;
      tr.appendChild(th);
      ligne.valeurs.forEach((v, i) => {
        const td = document.createElement('td');
        td.textContent = v;
        /* LE MEILLEUR SE DIT AUSSI EN TOUTES LETTRES : une pastille verte ne
           s'entend pas dans un lecteur d'écran. */
        if (ligne.meilleur === i) {
          td.dataset['meilleur'] = 'oui';
          const dit = document.createElement('span');
          dit.className = 'bg-lu-seulement';
          dit.textContent = ' (le meilleur)';
          td.appendChild(dit);
        }
        tr.appendChild(td);
      });
      table.appendChild(tr);
    }
    boite.appendChild(table);
  }

  /**
   * Prépare la contribution, et la MONTRE — elle ne part pas d'ici.
   *
   * PARTAGE-1 (01/09). Rien ne quitte l'appareil sans un geste de plus :
   * l'application écrit un fichier, l'usager le lit en entier, puis il
   * l'envoie s'il le veut. Une application qui poste d'elle-même n'aurait
   * pas à demander la permission, et c'est ce qu'on reproche aux autres.
   *
   * LE COURRIEL N'EMPORTE PAS DE PIÈCE JOINTE : `mailto:` ne sait pas en
   * porter. On propose donc le téléchargement et l'adresse ; c'est moins
   * lisse qu'un envoi en un clic, et c'est le prix de la vérification qu'il
   * a demandée.
   */
  #montrerLePartage(): void {
    const boite = this.querySelector<HTMLElement>('.iti-hist-partage');
    if (!boite) return;
    const choisis = this.#trajets.filter((x) => this.#coches.has(x.id));
    if (choisis.length === 0) return;
    boite.replaceChildren();
    boite.hidden = false;

    const titre = document.createElement('h3');
    titre.textContent = `Contribuer ${choisis.length} parcours`;
    boite.appendChild(titre);

    const dit = (intro: string, points: readonly string[], classe: string): void => {
      const p = document.createElement('p');
      p.className = classe;
      p.textContent = intro;
      const ul = document.createElement('ul');
      for (const mot of points) {
        const li = document.createElement('li');
        li.textContent = mot;
        ul.appendChild(li);
      }
      boite.append(p, ul);
    };
    dit('Ce qui part :', CE_QUI_PART, 'iti-hist-part');
    /* CE QUI RESTE EST DIT AUSSI FORT que ce qui part : une promesse de
       floutage énoncée en petits caractères ne rassure personne, et celle-ci
       se VÉRIFIE dans le fichier juste en dessous. */
    dit('Ce qui NE part pas :', CE_QUI_RESTE, 'iti-hist-reste');

    const texte = texteDuPartage(choisis);
    const zone = document.createElement('textarea');
    zone.className = 'iti-hist-fichier';
    zone.readOnly = true;
    zone.value = texte;
    zone.setAttribute('aria-label', 'Contenu exact du fichier qui sera envoyé');
    boite.appendChild(zone);

    const lien = document.createElement('a');
    lien.className = 'iti-hist-telecharger';
    lien.download = nomDuFichier(choisis);
    if (this.#urlPartage !== null) URL.revokeObjectURL(this.#urlPartage);
    this.#urlPartage = URL.createObjectURL(
      new Blob([texte], { type: 'application/json' }),
    );
    lien.href = this.#urlPartage;
    lien.textContent = 'Télécharger le fichier';
    boite.appendChild(lien);

    const envoi = document.createElement('p');
    envoi.className = 'iti-hist-note';
    envoi.textContent = `Envoyez-le en pièce jointe à ${CONTACT}.`
      + ' Aucun envoi n’est fait par l’application : ce fichier reste sur'
      + ' votre appareil tant que vous ne l’expédiez pas vous-même.';
    boite.appendChild(envoi);
  }

  /** Retire la comparaison — elle ne survit ni au geste, ni à la sortie. */
  #fermerComparaison(): void {
    this.querySelector('.iti-hist-comparaison')?.remove();
  }

  #majActionsHistorique(): void {
    const actions = this.querySelector<HTMLElement>('.iti-hist-actions');
    const comparer = this.querySelector<HTMLButtonElement>('.iti-hist-comparer');
    if (!actions || !comparer) return;
    actions.hidden = this.#coches.size === 0;
    /* COMPARER EXIGE DEUX PARCOURS, et le bouton le dit en restant éteint :
       proposer une comparaison à un seul serait promettre un écart qui
       n'existe pas. */
    comparer.disabled = this.#coches.size < 2;
    comparer.title = this.#coches.size < 2
      ? 'Cochez au moins deux parcours' : '';
    /* CONTRIBUER N'EXIGE QU'UN PARCOURS : un seul trajet renseigne déjà sur
       un itinéraire. Mais la boîte de vérification se referme dès que la
       sélection change — le fichier qu'elle montrait ne correspondrait plus
       à ce qui est coché, et montrer un contenu périmé serait pire que ne
       rien montrer. */
    const boite = this.querySelector<HTMLElement>('.iti-hist-partage');
    if (boite) { boite.hidden = true; boite.replaceChildren(); }
    /* ET LA COMPARAISON TOMBE AVEC (HIST-3) : ses chiffres portent sur les
       parcours cochés À CE MOMENT-LÀ. Cocher un troisième trajet sans que le
       tableau bouge afficherait un écart qui n'existe plus. */
    this.#fermerComparaison();
    if (this.#urlPartage !== null) {
      URL.revokeObjectURL(this.#urlPartage);
      this.#urlPartage = null;
    }
  }

}

customElements.define('panneau-historique', PanneauHistorique);
