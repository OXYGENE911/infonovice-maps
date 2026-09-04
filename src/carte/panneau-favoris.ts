// <panneau-favoris> — les lieux de l'usager, et LA promesse du projet en
// toutes lettres : « Vos données ne quittent jamais ce navigateur. »
// L'export télécharge tout (favoris + préférences) en JSON ; l'import
// restaure — c'est la portabilité RGPD en deux boutons, sans compte, sans
// serveur. Les noms de favoris passent par textContent : ils peuvent venir
// d'un libellé BAN (service externe) comme d'une saisie libre.
import type { Map as CarteMapLibre } from 'maplibre-gl';
import { AJOUT_FAVORI } from './choix-liste';
import { CHANGEMENT_FAVORIS } from './mes-poi';
import {
  listerFavoris, retirerFavori, renommerFavori, exporterDonnees, importerDonnees, ajouterFavori,
  listerListes, creerListe, effacerListe, rangerFavori,
} from '../lib/favoris';
import {
  LISTE_PAR_DEFAUT, COULEURS, type ListeFavoris,
} from '../lib/listes-favoris';
import { ErreurFavoris, ErreurStockage, type Favori } from '../lib/favoris';
import { lireExportGoogle, nomDeListe } from '../lib/import-google';
import { REPERES, lireRepere, effacerRepere, ecrireRepere } from '../lib/reperes';
import { adresseInverse } from '../lib/adresse';
import { pictoMenu } from './icone-menu';
import { formaterCoordonnees } from '../lib/coordonnees';
import { RechercheAdresse } from './recherche';
import { lireHabitudes, oublierHabitudes } from '../lib/routines';
import { telecharger } from '../lib/trace';
import {
  versFragmentFavoris, depuisFragmentFavoris, sansDejaConnus,
  ErreurPartageFavoris, type LieuPartage,
} from '../lib/partage-favoris';

export class PanneauFavoris extends HTMLElement {
  #carte: CarteMapLibre | null = null;

  set carte(c: CarteMapLibre) { this.#carte = c; }

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <details class="favoris">
        <summary aria-label="Ouvrir les favoris">${pictoMenu('favoris')}Favoris</summary>
        <div class="favoris-corps">
          <!-- LES REPÈRES D'ABORD : « rentrer chez moi » doit être un geste,
               pas une recherche dans une liste. -->
          <div class="fav-reperes">
            <p class="fav-reperes-titre">Mes repères</p>
            <div class="fav-reperes-liste"></div>
          </div>
          <ul class="favoris-liste" aria-label="Lieux favoris"></ul>
          <!-- CRÉER UNE LISTE (FAVORIS-2, 31/08). Armelin : « en indiquant
               soi-même un nom, un émoji et couleur dédiée ». Le formulaire
               est REPLIÉ : trois champs ouverts en permanence donneraient
               l'impression qu'il faut les remplir avant de se servir. -->
          <details class="favoris-nouvelle">
            <summary>Nouvelle liste</summary>
            <div class="favoris-nouvelle-corps">
              <label class="favoris-champ">Nom
                <input type="text" class="favoris-liste-nom-champ" maxlength="40"
                  placeholder="Bars à vin" aria-label="Nom de la liste">
              </label>
              <label class="favoris-champ">Émoji
                <input type="text" class="favoris-liste-emoji-champ" maxlength="8"
                  placeholder="🍷" aria-label="Émoji de la liste">
              </label>
              <div class="favoris-couleurs" role="radiogroup"
                aria-label="Couleur de la liste"></div>
              <button type="button" class="favoris-liste-creer">Créer la liste</button>
            </div>
          </details>
          <p class="favoris-vide">Aucun favori. Appuyez longuement sur la carte
            pour en ajouter un.</p>
          <p class="favoris-promesse">Vos données ne quittent jamais ce
            navigateur. L’export ci-dessous les met dans un fichier qui
            n’appartient qu’à vous.</p>
          <div class="favoris-actions">
            <button type="button" class="favoris-exporter">Exporter mes données</button>
            <button type="button" class="favoris-importer">Importer</button>
            <button type="button" class="favoris-partager">Partager mes favoris</button>
            <!-- IL PORTE UN NOM (31/08). Il n'en avait pas : un parcours le
                 désignait par son TYPE, et l'arrivée d'un second champ de
                 fichier — l'import Google — a cassé le sélecteur. Troisième
                 collision de ce genre en deux jours : un élément qu'un
                 parcours doit atteindre se nomme, dès qu'il existe. -->
            <input type="file" class="favoris-fichier"
              accept="application/json,.json" hidden>
            <!-- L'IMPORT GOOGLE MAPS (FAVORIS-3, 31/08). Armelin : « pouvoir
                 exporter et importer ses favoris Google Maps […] recréer une
                 structure similaire sous forme de liste ».
                 RIEN NE PART CHEZ GOOGLE : le fichier vient de Takeout,
                 l'usager le télécharge lui-même, et tout se lit ici. -->
            <button type="button" class="favoris-google">Importer depuis Google Maps</button>
            <input type="file" class="favoris-google-fichier"
              accept=".csv,.json,text/csv,application/json" hidden>
          </div>
          <!-- DEUX GESTES, DEUX OUTILS — la demande d'Armelin du 28/08 :
               « exporter les favoris si on change de téléphone… et même un
               partage ». Le LIEN transporte les favoris seuls, de la main à
               la main ; l'EXPORT transporte tout (favoris et préférences)
               dans un fichier. Les repères — domicile, travail — ne voyagent
               JAMAIS par lien : partager « chez moi » d'un geste distrait
               doit être impossible, pas improbable. -->
          <p class="favoris-partage-note">Le lien transporte vos favoris vers
            un autre téléphone, un autre ordinateur, ou quelqu’un d’autre —
            jamais vos repères (domicile, travail). Il ne passe par aucun
            serveur.</p>
          <!-- LES HABITUDES SE VOIENT ET S'EFFACENT (décision du 29/08) :
               une routine qu'on ne peut ni voir ni effacer serait un
               mouchard. Tout vit dans CE navigateur. -->
          <p class="favoris-habitudes" hidden>
            <span class="favoris-habitudes-texte"></span>
            <button type="button" class="favoris-habitudes-oubli">Tout oublier</button>
          </p>
          <p class="favoris-etat" role="status"></p>
        </div>
      </details>`;

    this.querySelector('.favoris-exporter')?.addEventListener('click', () => {
      void exporterDonnees().then((json) => {
        telecharger(json, 'infonovice-maps-donnees.json', 'application/json');
      });
    });
    /* PAR SA CLASSE, PAS PAR SON TYPE : depuis l'import Google, le volet en
       porte deux, et « le premier champ de fichier » n'est plus une
       désignation qui veut dire quelque chose. */
    const fichier = this.querySelector('.favoris-fichier') as HTMLInputElement;
    this.querySelector('.favoris-importer')?.addEventListener('click', () => fichier.click());
    fichier.addEventListener('change', () => {
      const f = fichier.files?.[0];
      if (!f) return;
      const etat = this.querySelector('.favoris-etat') as HTMLElement;
      // Le .catch couvre AUSSI l'échec de lecture du fichier (clé USB retirée,
      // fichier cloud non synchronisé) : sans lui, l'échec était muet et le
      // champ restait « sale », si bien que re-choisir le MÊME fichier
      // n'émettait plus d'événement (revue du 22/08).
      void f.text()
        .then(async (json) => {
          const n = await importerDonnees(json);
          etat.textContent = `Importé : ${n} favori${n > 1 ? 's' : ''}. Rechargement…`;
          // Les préférences importées (fond, couches) s'appliquent au
          // chargement : recharger EST l'application de l'import.
          setTimeout(() => window.location.reload(), 800);
        })
        .catch((e: unknown) => {
          etat.textContent = e instanceof ErreurFavoris || e instanceof ErreurStockage
            ? e.message : 'Import impossible : le fichier n’a pas pu être lu.';
          fichier.value = '';
          void this.rafraichir();
        });
    });
    this.querySelector('.favoris-habitudes-oubli')?.addEventListener('click', () => {
      void oublierHabitudes().then(() => this.rafraichir()).then(() => {
        const etat = this.querySelector('.favoris-etat');
        if (etat) etat.textContent = 'Habitudes de trajet oubliées.';
      });
    });
    this.querySelector('.favoris-partager')?.addEventListener('click', () => {
      void this.#partager();
    });

    /* LES COULEURS SONT DES BOUTONS, PAS UN SÉLECTEUR SYSTÈME : dix teintes
       lisibles valent mieux qu'un choix libre dont la moitié serait
       illisible sur la carte. */
    const palette = this.querySelector('.favoris-couleurs');
    if (palette) {
      COULEURS.forEach((couleur, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'favoris-couleur';
        b.style.setProperty('--teinte', couleur);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(i === 0));
        b.setAttribute('aria-label', `Couleur ${i + 1}`);
        b.dataset['couleur'] = couleur;
        b.addEventListener('click', () => {
          for (const autre of palette.querySelectorAll('[role="radio"]')) {
            autre.setAttribute('aria-checked', String(autre === b));
          }
        });
        palette.append(b);
      });
    }
    this.querySelector('.favoris-liste-creer')?.addEventListener('click', () => {
      const nom = this.querySelector<HTMLInputElement>('.favoris-liste-nom-champ');
      const emoji = this.querySelector<HTMLInputElement>('.favoris-liste-emoji-champ');
      const choisie = this.querySelector<HTMLElement>('.favoris-couleur[aria-checked="true"]');
      const etat = this.querySelector('.favoris-etat') as HTMLElement;
      void creerListe({
        nom: nom?.value ?? '',
        emoji: emoji?.value ?? '',
        couleur: choisie?.dataset['couleur'] ?? COULEURS[0]!,
      }).then((l) => {
        if (nom) nom.value = '';
        if (emoji) emoji.value = '';
        etat.textContent = `Liste ${l.nom} créée.`;
        return this.rafraichir();
      }).catch((e: unknown) => {
        etat.textContent = e instanceof ErreurFavoris
          ? e.message : 'La liste n’a pas pu être créée.';
      });
    });

    const fichierGoogle = this.querySelector<HTMLInputElement>('.favoris-google-fichier');
    this.querySelector('.favoris-google')?.addEventListener('click', () => {
      fichierGoogle?.click();
    });
    fichierGoogle?.addEventListener('change', () => {
      const f = fichierGoogle.files?.[0];
      if (!f) return;
      void this.#importerGoogle(f).finally(() => { fichierGoogle.value = ''; });
    });

    /* UN LIEU GARDÉ DEPUIS UNE FICHE ENTRE DANS LA LISTE TOUT DE SUITE
       (FAVORIS-4, 03/09) : sans cette écoute, le volet restait à ce qu'il
       montrait à l'ouverture, et une borne qu'on venait de garder n'y
       paraissait qu'au rechargement. */
    document.addEventListener(AJOUT_FAVORI, () => { void this.rafraichir(); });

    void this.rafraichir();
    this.#recevoirDuLien();
  }

  /**
   * Fabrique le lien de partage et le met en route : la feuille de partage
   * du téléphone quand elle existe (navigator.share), le presse-papiers
   * sinon. Le refus d'un lot trop grand NOMME son remède : l'export.
   */
  async #partager(): Promise<void> {
    const etat = this.querySelector('.favoris-etat') as HTMLElement;
    try {
      const fragment = versFragmentFavoris(await listerFavoris());
      const lien = location.origin + location.pathname + fragment;
      /* navigator.share N'EST PAS UN DÉTOUR : sur téléphone — le cas même de
         la demande —, c'est la feuille de partage du système, vers l'autre
         appareil ou l'autre personne. Son refus (geste annulé) est bénin. */
      if (navigator.share) {
        await navigator.share({ title: 'Mes favoris Infonovice Maps', url: lien })
          .catch(() => { /* partage annulé : pas une erreur */ });
        etat.textContent = '';
        return;
      }
      await navigator.clipboard.writeText(lien);
      etat.textContent = 'Lien copié ! Ouvrez-le sur l’autre appareil pour y retrouver vos favoris.';
    } catch (e) {
      etat.textContent = e instanceof ErreurPartageFavoris
        ? e.message : 'Le partage est indisponible pour le moment.';
    }
  }

  /**
   * Un lien de favoris reçu s'ouvre sur une boîte de CONFIRMATION — jamais
   * une écriture silencieuse : c'est le stockage de l'usager, un lien forgé
   * ou cliqué par erreur ne doit rien pouvoir y déposer sans son accord.
   */
  #recevoirDuLien(): void {
    const lieux = depuisFragmentFavoris(location.hash);
    if (!lieux) return;
    /* LE FRAGMENT S'EFFACE TOUT DE SUITE : un rechargement ne doit pas
       reposer la même question, et le lien ne doit pas rester dans la barre
       comme s'il décrivait cette session. */
    history.replaceState(null, '', location.pathname + location.search);

    const boite = document.createElement('dialog');
    boite.className = 'recevoir-favoris';
    boite.setAttribute('aria-label', 'Favoris partagés avec vous');
    const titre = document.createElement('p');
    titre.className = 'recevoir-titre';
    titre.textContent = lieux.length === 1
      ? 'Un lieu a été partagé avec vous'
      : `${lieux.length} lieux ont été partagés avec vous`;
    const liste = document.createElement('ul');
    liste.className = 'recevoir-liste';
    for (const l of lieux) {
      const item = document.createElement('li');
      // textContent : le nom vient d'un lien, jamais interprété en HTML.
      item.textContent = l.nom;
      liste.append(item);
    }
    const actions = document.createElement('div');
    actions.className = 'recevoir-actions';
    const ajouter = document.createElement('button');
    ajouter.type = 'button';
    ajouter.className = 'recevoir-ajouter';
    ajouter.textContent = 'Ajouter à mes favoris';
    const ignorer = document.createElement('button');
    ignorer.type = 'button';
    ignorer.className = 'recevoir-ignorer';
    ignorer.textContent = 'Ignorer';
    actions.append(ajouter, ignorer);
    boite.append(titre, liste, actions);
    document.body.append(boite);

    ignorer.addEventListener('click', () => { boite.close(); boite.remove(); });
    ajouter.addEventListener('click', () => {
      void (async (): Promise<void> => {
        ajouter.disabled = true;
        /* LES DOUBLONS S'ÉCARTENT PAR LA POSITION, pas par le nom : le même
           endroit renommé reste le même endroit. */
        const nouveaux: LieuPartage[] = sansDejaConnus(lieux, await listerFavoris());
        for (const l of nouveaux) {
          await ajouterFavori(l.nom, { lon: l.lon, lat: l.lat });
        }
        boite.close(); boite.remove();
        const etat = this.querySelector('.favoris-etat') as HTMLElement;
        etat.textContent = nouveaux.length === 0
          ? 'Rien à ajouter : ces lieux sont déjà dans vos favoris.'
          : `${nouveaux.length} favori${nouveaux.length > 1 ? 's' : ''} ajouté${nouveaux.length > 1 ? 's' : ''}`
            + (lieux.length > nouveaux.length ? ' (le reste y était déjà)' : '') + '.';
        await this.rafraichir();
      })().catch(() => {
        ajouter.disabled = false;
        (this.querySelector('.favoris-etat') as HTMLElement).textContent =
          'Ajout impossible (stockage local indisponible).';
      });
    });
    boite.showModal();
  }

  /** Relit et raffiche la liste — appelée aussi par l'assemblage quand un
      favori naît ailleurs (popup d'appui long). */
  /* LES REPÈRES SE REDESSINENT À CHAQUE RAFRAÎCHISSEMENT, y compris quand ils
     sont ABSENTS : une ligne « non défini » apprend à l'usager que la
     fonctionnalité existe, là où une section vide ne dit rien. */
  async #rendreReperes(): Promise<void> {
    const boite = this.querySelector('.fav-reperes-liste');
    if (!boite) return;
    boite.replaceChildren();

    for (const { cle, libelle } of REPERES) {
      const repere = await lireRepere(cle);
      const ligne = document.createElement('div');
      ligne.className = 'fav-repere';

      const aller = document.createElement('button');
      aller.type = 'button';
      aller.className = 'fav-repere-aller';
      if (repere) {
        aller.textContent = libelle;
        const lieu = document.createElement('span');
        lieu.className = 'fav-repere-lieu';
        lieu.textContent = ` — ${repere.libelle}`;
        aller.appendChild(lieu);
        aller.setAttribute('aria-label', `Aller à ${libelle} : ${repere.libelle}`);
        aller.addEventListener('click', () => {
          this.#carte?.flyTo({ center: [repere.lon, repere.lat], zoom: 16 });
        });
      } else {
        aller.textContent = `${libelle} — non défini`;
        aller.disabled = true;
        aller.setAttribute('aria-label',
          `${libelle} non défini. Utilisez le bouton Définir, ou appuyez`
          + ' longuement sur la carte.');
      }
      ligne.appendChild(aller);

      /* UN BOUTON POUR LE DÉFINIR, ET PAS SEULEMENT L'APPUI LONG. Un repère
         grisé sans moyen visible de le renseigner est une impasse : rien
         n'indiquait qu'il fallait presser la carte. On le pose donc depuis le
         CENTRE DE LA CARTE — ce qu'on regarde est ce qu'on désigne — et son
         adresse est demandée à la BAN pour qu'il porte un nom lisible. */
      if (!repere) {
        const definir = document.createElement('button');
        definir.type = 'button';
        definir.className = 'fav-repere-definir';
        definir.textContent = 'Définir ici';
        definir.setAttribute('aria-label',
          `Définir mon ${libelle.toLowerCase()} au centre de la carte`);
        definir.addEventListener('click', () => {
          const carte = this.#carte;
          if (!carte) return;
          definir.disabled = true;
          definir.textContent = 'Recherche de l’adresse…';
          const c = carte.getCenter();
          const point = { lon: c.lng, lat: c.lat };
          /* L'ADRESSE EST UN CONFORT, PAS UNE CONDITION : si la BAN ne répond
             pas, le repère est enregistré quand même, sous ses coordonnées.
             Perdre le lieu parce qu'un service tiers hésite serait absurde. */
          adresseInverse(point)
            .catch(() => null)
            .then((a) => ecrireRepere(cle, point, a?.libelle
              ?? formaterCoordonnees(point)))
            .then(() => this.rafraichir())
            .then(() => {
              const etat = this.querySelector('.favoris-etat');
              if (etat) etat.textContent = `${libelle} enregistré.`;
            })
            .catch(() => {
              definir.disabled = false;
              definir.textContent = 'Enregistrement impossible';
            });
        });
        ligne.appendChild(definir);
      }

      /* « PAR ADRESSE… » — le retour d'Armelin du 29/08 : « si on est chez
         soi pour la première utilisation, il n'est pas possible de saisir
         l'adresse du boulot ; il faudrait obligatoirement se rendre sur
         place ». On tape l'adresse, la BAN la trouve, le repère est posé —
         d'où qu'on soit. Le bouton existe AUSSI quand le repère est défini :
         on déménage, on change de bureau. */
      const parAdresse = document.createElement('button');
      parAdresse.type = 'button';
      parAdresse.className = 'fav-repere-adresse';
      parAdresse.textContent = 'Par adresse…';
      parAdresse.setAttribute('aria-label',
        `Définir mon ${libelle.toLowerCase()} en saisissant une adresse`);
      parAdresse.addEventListener('click', () => {
        const deja = ligne.nextElementSibling;
        if (deja instanceof HTMLElement && deja.classList.contains('fav-repere-saisie')) {
          deja.remove();
          return;
        }
        // Une seule saisie ouverte à la fois : l'autre repère range la sienne.
        this.querySelector('.fav-repere-saisie')?.remove();
        const saisie = document.createElement('div');
        saisie.className = 'fav-repere-saisie';
        const champ = new RechercheAdresse();
        champ.surSelection = (r) => {
          void ecrireRepere(cle, { lon: r.lon, lat: r.lat }, r.libelle)
            .then(() => this.rafraichir())
            .then(() => {
              const etat = this.querySelector('.favoris-etat');
              if (etat) etat.textContent = `${libelle} enregistré : ${r.libelle}.`;
            })
            .catch(() => {
              const etat = this.querySelector('.favoris-etat');
              if (etat) etat.textContent = 'Enregistrement impossible (stockage local indisponible).';
            });
        };
        saisie.append(champ);
        ligne.after(saisie);
        champ.querySelector('input')?.focus();
      });
      ligne.appendChild(parAdresse);

      if (repere) {
        const oubli = document.createElement('button');
        oubli.type = 'button';
        oubli.className = 'fav-repere-oubli';
        oubli.textContent = 'Oublier';
        oubli.setAttribute('aria-label', `Oublier mon ${libelle.toLowerCase()}`);
        oubli.addEventListener('click', () => {
          void effacerRepere(cle).then(() => this.rafraichir()).then(() => {
            // Le bouton focalisé vient d'être détruit : sans reprise, le focus
            // retombe sur <body>. Même leçon que le retrait d'un favori.
            const etat = this.querySelector('.favoris-etat');
            if (etat) etat.textContent = `${libelle} oublié.`;
            this.querySelector<HTMLButtonElement>('.fav-repere-aller')?.focus();
          });
        });
        ligne.appendChild(oubli);
      }
      boite.appendChild(ligne);
    }
  }

  async rafraichir(): Promise<void> {
    /* LA CARTE ÉCOUTE (MES-POI-1) : tout chemin qui change les favoris —
       retrait, rangement, renommage, import — passe ici. Sans ce cri, la
       carte montrerait un favori supprimé, c'est-à-dire mentirait. */
    document.dispatchEvent(new CustomEvent(CHANGEMENT_FAVORIS));
    await this.#rendreReperes();
    /* Les habitudes apprises : combien, et le bouton pour tout oublier. */
    const habitudes = await lireHabitudes();
    const ligne = this.querySelector<HTMLElement>('.favoris-habitudes');
    const texte = this.querySelector<HTMLElement>('.favoris-habitudes-texte');
    if (ligne && texte) {
      ligne.hidden = habitudes.length === 0;
      texte.textContent = `Habitudes de trajet : ${habitudes.length}`
        + ` destination${habitudes.length > 1 ? 's' : ''} retenue${habitudes.length > 1 ? 's' : ''}`
        + ' sur cet appareil, jamais ailleurs.';
    }
    const liste = this.querySelector('.favoris-liste') as HTMLUListElement;
    const vide = this.querySelector('.favoris-vide') as HTMLElement;
    const favoris = await listerFavoris();
    /* LES LIEUX SE RANGENT PAR LISTE (FAVORIS-2, 31/08). Armelin voulait
       « une catégorie custom […] ou une liste prédéfinie comme sur Google
       Maps ». Une liste plate de cinquante favoris ne se lit plus ; rangée,
       elle se parcourt. */
    this.#listes = await listerListes();
    liste.replaceChildren();
    vide.hidden = favoris.length > 0;
    for (const l of this.#listes) {
      /* TOUTES LES LISTES S'AFFICHENT, MÊME VIDES. J'avais d'abord caché les
         listes vides pour éviter l'encombrement — mais une liste qu'on vient
         de créer est vide par définition : la création paraissait alors sans
         effet, et un parcours l'a attrapé. Une liste existe parce que
         quelqu'un l'a voulue ; elle se voit. Son compte dit « vide », ce qui
         est une information, pas un encombrement. */
      const dedans = favoris.filter((f) => (f.liste ?? LISTE_PAR_DEFAUT) === l.id);
      liste.append(this.#enteteListe(l, dedans.length));
      for (const favori of dedans) liste.append(this.#ligneFavori(favori, favoris));
    }
    /* CE QUI POINTE VERS UNE LISTE DISPARUE NE SE PERD PAS : ranger n'est pas
       jeter, et un favori orphelin reste un favori. */
    const connues = new Set(this.#listes.map((l) => l.id));
    const orphelins = favoris.filter((f) => !connues.has(f.liste ?? LISTE_PAR_DEFAUT));
    for (const favori of orphelins) liste.append(this.#ligneFavori(favori, favoris));
  }

  #listes: ListeFavoris[] = [];

  /**
   * Importe un export Google Maps — TOUT SE LIT ICI, rien ne part.
   *
   * LE NOM DU FICHIER FAIT LA LISTE : « Envie d'y aller.csv » devient la liste
   * « Envie d'y aller ». C'est la « structure similaire » demandée, et elle ne
   * coûte aucune saisie.
   *
   * CE QU'ON NE SAIT PAS SITUER EST DIT, JAMAIS DEVINÉ : certains liens Google
   * ne portent qu'un identifiant interne, que seul Google sait résoudre. Les
   * géocoder sur le seul titre placerait « Chez Marcel » sur un homonyme à
   * trois cents kilomètres — un favori faux est pire qu'un favori manquant,
   * parce qu'on le croit.
   */
  async #importerGoogle(fichier: File): Promise<void> {
    const etat = this.querySelector('.favoris-etat') as HTMLElement;
    etat.textContent = 'Lecture du fichier…';
    try {
      const lecture = lireExportGoogle(await fichier.text());
      if (lecture.lieux.length === 0 && lecture.sansPosition.length === 0) {
        etat.textContent = 'Ce fichier ne ressemble pas à un export Google Maps'
          + ' (CSV d’une liste, ou « Lieux enregistrés » en JSON).';
        return;
      }
      const liste = await creerListe({
        nom: nomDeListe(fichier.name), emoji: '📍', couleur: COULEURS[5]!,
      });
      for (const lieu of lecture.lieux) {
        await ajouterFavori(lieu.nom, { lon: lieu.lon, lat: lieu.lat }, liste.id);
      }
      await this.rafraichir();
      /* LE COMPTE-RENDU DIT LES TROIS NOMBRES : ce qui est entré, ce qu'on n'a
         pas su situer, et ce qu'on n'a pas su lire. Taire les deux derniers
         ferait croire à un import complet. */
      const morceaux = [`${lecture.lieux.length} lieu`
        + `${lecture.lieux.length > 1 ? 'x' : ''} importé`
        + `${lecture.lieux.length > 1 ? 's' : ''} dans « ${liste.nom} »`];
      if (lecture.sansPosition.length > 0) {
        morceaux.push(`${lecture.sansPosition.length} sans position dans le fichier`
          + ` (${lecture.sansPosition.slice(0, 3).join(', ')}`
          + `${lecture.sansPosition.length > 3 ? '…' : ''}) :`
          + ' Google ne donne qu’un identifiant interne, que lui seul sait résoudre.');
      }
      if (lecture.illisibles > 0) {
        morceaux.push(`${lecture.illisibles} ligne`
          + `${lecture.illisibles > 1 ? 's' : ''} illisible`
          + `${lecture.illisibles > 1 ? 's' : ''}.`);
      }
      etat.textContent = morceaux.join(' · ');
    } catch (e) {
      etat.textContent = e instanceof ErreurFavoris
        ? e.message : 'Ce fichier n’a pas pu être lu.';
    }
  }

  /** L'en-tête d'une liste : son émoji, son nom, ce qu'elle porte. */
  #enteteListe(l: ListeFavoris, combien: number): HTMLLIElement {
    const item = document.createElement('li');
    item.className = 'favoris-entete-liste';
    item.style.setProperty('--teinte', l.couleur);
    const emoji = document.createElement('span');
    emoji.className = 'favoris-liste-emoji';
    emoji.setAttribute('aria-hidden', 'true');
    emoji.textContent = l.emoji;
    const nom = document.createElement('span');
    nom.className = 'favoris-liste-nom';
    nom.textContent = l.nom;
    const compte = document.createElement('span');
    compte.className = 'favoris-liste-compte';
    compte.textContent = combien === 0 ? 'vide' : String(combien);
    item.append(emoji, nom, compte);
    if (l.livree !== true) {
      const effacer = document.createElement('button');
      effacer.type = 'button';
      effacer.className = 'favoris-liste-effacer';
      effacer.textContent = '✕';
      effacer.setAttribute('aria-label',
        `Supprimer la liste ${l.nom} — ses lieux rejoindront « Lieux favoris »`);
      effacer.addEventListener('click', () => {
        void effacerListe(l.id).then(() => this.rafraichir()).then(() => {
          (this.querySelector('.favoris-etat') as HTMLElement).textContent =
            `Liste ${l.nom} supprimée. Ses lieux sont dans « Lieux favoris ».`;
        });
      });
      item.append(effacer);
    }
    return item;
  }

  /** Une ligne de favori — extraite pour que le rangement par liste la réemploie. */
  #ligneFavori(favori: Favori, favoris: readonly Favori[]): HTMLLIElement {
    {
      const item = document.createElement('li');
      const aller = document.createElement('button');
      aller.type = 'button';
      aller.className = 'favori-aller';
      aller.textContent = favori.nom;
      /* L'ADRESSE D'ORIGINE EN SOUS-TITRE quand le favori a été renommé :
         « Maison de Mamie » n'aide que si l'on peut encore situer où c'est.
         Même dessin que les repères (fav-repere-lieu). */
      if (favori.adresse && favori.adresse !== favori.nom) {
        const lieu = document.createElement('span');
        lieu.className = 'favori-adresse';
        lieu.textContent = ` — ${favori.adresse}`;
        aller.appendChild(lieu);
      }
      aller.setAttribute('aria-label', `Aller à ${favori.nom}`);
      aller.addEventListener('click', () => {
        this.#carte?.flyTo({ center: [favori.lon, favori.lat], zoom: 16 });
      });
      const renommer = document.createElement('button');
      renommer.type = 'button';
      renommer.className = 'favori-renommer';
      renommer.textContent = '✎';
      renommer.title = 'Renommer';
      renommer.setAttribute('aria-label', `Renommer ${favori.nom}`);
      renommer.addEventListener('click', () => { this.#editerNom(item, favori); });
      const retirer = document.createElement('button');
      retirer.type = 'button';
      retirer.className = 'favori-retirer';
      retirer.textContent = '✕';
      retirer.setAttribute('aria-label', `Retirer ${favori.nom} des favoris`);
      retirer.addEventListener('click', () => {
        // Le retrait DÉTRUIT le bouton focalisé : sans reprise explicite, le
        // focus retombe sur <body> et l'usager clavier doit tout retraverser ;
        // et rien n'est annoncé au lecteur d'écran (revue du 22/08).
        const rang = favoris.indexOf(favori);
        void retirerFavori(favori.id)
          .then(() => this.rafraichir())
          .then(() => {
            (this.querySelector('.favoris-etat') as HTMLElement).textContent =
              `${favori.nom} retiré des favoris.`;
            const restants = this.querySelectorAll<HTMLButtonElement>('.favori-retirer');
            const suivant = restants[Math.min(rang, restants.length - 1)];
            (suivant ?? this.querySelector<HTMLElement>('.favoris summary'))?.focus();
          });
      });
      /* CHANGER DE LISTE SANS SORTIR DE LA LIGNE : ranger doit coûter un
         geste, sinon personne ne range. */
      const ranger = document.createElement('select');
      ranger.className = 'favori-liste';
      ranger.setAttribute('aria-label', `Liste de ${favori.nom}`);
      for (const l of this.#listes) {
        const o = document.createElement('option');
        o.value = l.id;
        o.textContent = `${l.emoji} ${l.nom}`;
        o.selected = (favori.liste ?? LISTE_PAR_DEFAUT) === l.id;
        ranger.append(o);
      }
      ranger.addEventListener('change', () => {
        void rangerFavori(favori.id, ranger.value).then(() => this.rafraichir());
      });
      item.append(aller, ranger, renommer, retirer);
      return item;
    }
  }

  /**
   * L'édition du nom, EN PLACE — la demande d'Armelin du 27/08/2026 : « leur
   * donner un displayname plus facile à visualiser ».
   *
   * PAS DE window.prompt : il est bloqué dans certains contextes, il ne se
   * style pas, et il sort l'usager de la page. Un champ remplace la ligne,
   * Entrée valide, Échap rend la ligne telle quelle.
   */
  #editerNom(item: HTMLLIElement, favori: Favori): void {
    const champ = document.createElement('input');
    champ.type = 'text';
    champ.className = 'favori-nom-champ';
    champ.value = favori.nom;
    champ.setAttribute('aria-label', `Nouveau nom pour ${favori.nom}`);
    item.replaceChildren(champ);
    champ.focus();
    champ.select();

    let clos = false;
    const annuler = (): void => {
      if (clos) return;
      clos = true;
      void this.rafraichir();
    };
    const valider = (): void => {
      if (clos) return;
      clos = true;
      renommerFavori(favori.id, champ.value)
        .then(() => this.rafraichir())
        .then(() => {
          (this.querySelector('.favoris-etat') as HTMLElement).textContent =
            `Renommé en « ${champ.value.trim()} ».`;
          this.querySelector<HTMLButtonElement>('.favori-renommer')?.focus();
        })
        .catch((e: unknown) => {
          (this.querySelector('.favoris-etat') as HTMLElement).textContent =
            e instanceof ErreurFavoris ? e.message : 'Renommage impossible.';
          void this.rafraichir();
        });
    };
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); valider(); }
      if (e.key === 'Escape') { e.stopPropagation(); annuler(); }
    });
    /* LE BLUR VALIDE, IL N'ANNULE PAS : on a tapé un nom, cliquer ailleurs ne
       doit pas le jeter — c'est la convention des éditions en place. */
    champ.addEventListener('blur', valider);
  }
}

customElements.define('panneau-favoris', PanneauFavoris);
