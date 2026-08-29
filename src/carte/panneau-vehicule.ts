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
  autonomies, consommationsDepuisEssais, capaciteReelle,
  CONTEXTES, type Vehicule, type CleContexte,
} from '../lib/vehicule';
import { collectionAnneaux } from '../lib/cercle';
import {
  CATALOGUE, libelleModele, libelleDansMarque, parMarque,
  modeleParCle, autonomiesProposees,
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
  nom: '', capaciteNominale: 0, soce: 100, soc: 80,
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

  set position(p: { lon: number; lat: number }) {
    this.#position = p;
    this.#bilan();
    if (this.#actif) this.#poser();
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
        <summary aria-label="Mon véhicule électrique">Véhicule</summary>
        <fieldset class="veh-corps">
          <legend>Mon véhicule électrique</legend>

          <!-- LE CATALOGUE PRÉ-REMPLIT, IL NE VERROUILLE PAS. Saisir cinq
               chiffres avant de pouvoir se servir du planificateur est un
               péage à l'entrée : beaucoup ne le franchissent pas, et ceux qui
               le franchissent y mettent des approximations. Chaque champ reste
               modifiable après application. -->
          <label class="veh-ligne veh-ligne-catalogue">Modèle
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

          <label class="veh-bascule">
            <input type="checkbox" class="veh-anneaux"> Afficher mon rayon d’action
          </label>

          <div class="veh-bilan" role="status"></div>
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
          || cle === 'puissanceFroidKw' || cle === 'puissanceChaudKw') {
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
          `${modele.wltpKm} km WLTP constructeur (optimiste, surtout sur autoroute)`,
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

    this.#installerCurseur();
    void this.#restaurer();
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
          | 'masseKg' | 'puissanceFroidKw' | 'puissanceChaudKw'] ?? 0;
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
      capaciteNominale: nombre(v['capaciteNominale']),
      soce: nombre(v['soce'], 100),
      soc: nombre(v['soc'], 80),
      consommations: { ville: 0, route: 0, autoroute: 0 },
      puissanceMaxKw: nombre(v['puissanceMaxKw']),
      /* Zéro vaut « non déclaré » — c'est la convention de lib/vehicule : on
         garde donc la clé même à zéro, sans quoi le champ resterait vide à
         l'écran alors que la base porte bien un 0 voulu. */
      masseKg: nombre(v['masseKg']),
      puissanceFroidKw: nombre(v['puissanceFroidKw']),
      puissanceChaudKw: nombre(v['puissanceChaudKw']),
    };
    for (const { cle } of CONTEXTES) this.#essais[cle] = nombre(e[cle]);
    this.#actif = m['anneaux'] === true;

    this.#refletChamps();
    const bascule = this.querySelector<HTMLInputElement>('.veh-anneaux');
    if (bascule) bascule.checked = this.#actif;

    this.#recalculer();
  }

  #bilan(): void {
    const boite = this.querySelector<HTMLElement>('.veh-bilan');
    if (!boite) return;
    boite.textContent = '';

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
    const lignes: string[] = [];
    for (const c of CONTEXTES) {
      if (a[c.cle] > 0) lignes.push(`${c.libelle} : ${Math.round(a[c.cle])} km`);
    }
    if (lignes.length === 0) {
      boite.textContent = 'Renseignez au moins une autonomie constatée.';
      return;
    }

    const p = document.createElement('p');
    p.className = 'veh-bilan-lignes';
    p.textContent = lignes.join(' · ');
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
    const a = autonomies(this.#vehicule);
    const donnees = this.#actif && this.#position
      ? collectionAnneaux(this.#position.lon, this.#position.lat,
        CONTEXTES.map((c) => ({ cle: c.cle, rayonKm: a[c.cle], couleur: c.couleur })))
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
