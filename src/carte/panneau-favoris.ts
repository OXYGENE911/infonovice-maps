// <panneau-favoris> — les lieux de l'usager, et LA promesse du projet en
// toutes lettres : « Vos données ne quittent jamais ce navigateur. »
// L'export télécharge tout (favoris + préférences) en JSON ; l'import
// restaure — c'est la portabilité RGPD en deux boutons, sans compte, sans
// serveur. Les noms de favoris passent par textContent : ils peuvent venir
// d'un libellé BAN (service externe) comme d'une saisie libre.
import type { Map as CarteMapLibre } from 'maplibre-gl';
import {
  listerFavoris, retirerFavori, exporterDonnees, importerDonnees,
  ErreurFavoris, ErreurStockage,
} from '../lib/favoris';
import { REPERES, lireRepere, effacerRepere, ecrireRepere } from '../lib/reperes';
import { adresseInverse } from '../lib/adresse';
import { formaterCoordonnees } from '../lib/coordonnees';
import { telecharger } from '../lib/trace';

export class PanneauFavoris extends HTMLElement {
  #carte: CarteMapLibre | null = null;

  set carte(c: CarteMapLibre) { this.#carte = c; }

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <details class="favoris">
        <summary aria-label="Ouvrir les favoris">Favoris</summary>
        <div class="favoris-corps">
          <!-- LES REPÈRES D'ABORD : « rentrer chez moi » doit être un geste,
               pas une recherche dans une liste. -->
          <div class="fav-reperes">
            <p class="fav-reperes-titre">Mes repères</p>
            <div class="fav-reperes-liste"></div>
          </div>
          <ul class="favoris-liste" aria-label="Lieux favoris"></ul>
          <p class="favoris-vide">Aucun favori. Appuyez longuement sur la carte
            pour en ajouter un.</p>
          <p class="favoris-promesse">Vos données ne quittent jamais ce
            navigateur. L’export ci-dessous les met dans un fichier qui
            n’appartient qu’à vous.</p>
          <div class="favoris-actions">
            <button type="button" class="favoris-exporter">Exporter mes données</button>
            <button type="button" class="favoris-importer">Importer</button>
            <input type="file" accept="application/json,.json" hidden>
          </div>
          <p class="favoris-etat" role="status"></p>
        </div>
      </details>`;

    this.querySelector('.favoris-exporter')?.addEventListener('click', () => {
      void exporterDonnees().then((json) => {
        telecharger(json, 'infonovice-maps-donnees.json', 'application/json');
      });
    });
    const fichier = this.querySelector('input[type="file"]') as HTMLInputElement;
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
    void this.rafraichir();
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
    await this.#rendreReperes();
    const liste = this.querySelector('.favoris-liste') as HTMLUListElement;
    const vide = this.querySelector('.favoris-vide') as HTMLElement;
    const favoris = await listerFavoris();
    liste.replaceChildren();
    vide.hidden = favoris.length > 0;
    for (const favori of favoris) {
      const item = document.createElement('li');
      const aller = document.createElement('button');
      aller.type = 'button';
      aller.className = 'favori-aller';
      aller.textContent = favori.nom;
      aller.setAttribute('aria-label', `Aller à ${favori.nom}`);
      aller.addEventListener('click', () => {
        this.#carte?.flyTo({ center: [favori.lon, favori.lat], zoom: 16 });
      });
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
      item.append(aller, retirer);
      liste.append(item);
    }
  }
}

customElements.define('panneau-favoris', PanneauFavoris);
