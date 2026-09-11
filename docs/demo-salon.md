# Scénario de démo — Mondial de l'Auto (12-18 octobre 2026)

Écrit le 11/09/2026 par Produit & Architecture, sur `origin/main` (a304eb9).

**Ce document a deux lecteurs.** Celui qui tient la tablette sur le stand, et le
parcours Playwright qui doit rejouer exactement la même chose en CI. Chaque
étape porte donc trois choses : le **geste**, le **résultat vérifiable** (texte
affiché et sélecteur DOM réel, relevés dans le code du 11/09), et la **durée
cible**. Total : **2 min 50**, huit étapes
(10 + 25 + 25 + 20 + 20 + 15 + 35 + 20 = 170 s).

Les noms de gestes reprennent ceux des utilitaires existants — `ouvrirPlanificateur`,
`allerA`, `ouvrirVolet`, `ouvrirReglagesBornes` (`tests-e2e/planificateur.ts`,
`tests-e2e/volets.ts`) — pour qu'Ingénierie n'ait rien à réinventer.

## Les données de la démo, fixées

| | |
|---|---|
| Départ | **14 Rue Linois, 75015 Paris** — vérifié BAN le 11/09 (`2.282604, 48.848501`, type `housenumber`) |
| Arrivée | **5 Place Charles Beraudier, 69003 Lyon** — gare de la Part-Dieu, vérifié BAN (`4.859273, 45.760829`) |
| Véhicule | **VinFast VF 8 (Plus)** — au catalogue (`src/lib/catalogue-vehicules.ts`, clé `vinfast-vf8-plus`) : 87,7 kWh, 150 kW, WLTP 457 km, Combo CCS, bridage froid 30 kW / canicule 60 kW |
| Charge au départ | **80 %** (champ `Charge (SOC)`) |
| Réseaux déclarés | **Ionity** et **IZIVIA** + case « Accessibles en itinérance (badges) » |

### Pourquoi « réseaux » et non « badges » — à dire sur le stand

Le brief demandait « deux badges déclarés » (Chargemap, Ulys, Mobilize…).
**L'application ne sait pas déclarer un badge, et c'est volontaire** : le
schéma IRVE ne porte aucun champ e-MSP (mesuré le 03/09, `src/lib/poi.ts`
l. 83-90). Ce qu'elle sait faire, et qui est la traduction honnête de la
demande :

- cocher **« Accessibles en itinérance (badges) »** — une station raccordée à
  l'itinérance accepte la grande majorité des badges ;
- cocher les **réseaux** que l'on veut privilégier sur ce trajet, par leur nom
  d'exploitant.

**Ionity** et **IZIVIA** ont été retenus parce qu'ils sont à la fois des marques
de badge citées par le CEO (« Ionity Power », « IZivia Pass ») **et** des
exploitants présents sur le couloir : relevé du 11/09 sur le fichier IRVE
national, à moins de 25 km de la droite Paris–Lyon et à 150 kW ou plus —
Ionity **14 stations / 46 points de charge**, IZIVIA **368 points**. La case
sera donc bien là, avec un nombre non nul à côté.

Si le CEO veut voir écrit « Chargemap » ou « Ulys » à l'écran, c'est une
fonctionnalité à décider, pas une case à cocher : voir le rapport de cycle.

---

## Étape 1 — La carte s'ouvre (cible : 10 s)

**Geste** — ouvrir `https://maps.infonovice.fr/`. Ne rien toucher.

**Résultat vérifiable**

| Quoi | Sélecteur | Attendu |
|---|---|---|
| la carte est peinte | `#carte canvas.maplibregl-canvas` | visible en moins de 15 s |
| la promesse est lisible | en-tête | `Française et open source — IGN · BAN · zéro traceur` |

**Ce qu'on dit** : « pas de compte, pas de cookie, pas de bandeau de
consentement. Vous êtes déjà dans la carte. »

## Étape 2 — Le véhicule : VF 8 Plus, 80 % au départ (cible : 25 s)

**Geste** — `ouvrirVolet(page, '.vehicule')` (ou `allerA(page, 'vehicule')`),
déplier **« Toutes les marques »**, ouvrir **VinFast**, choisir
**« VF 8 (Plus) »**, puis mettre le champ **`Charge (SOC)`** à `80`.

**Résultat vérifiable**

| Quoi | Sélecteur / libellé | Attendu |
|---|---|---|
| le catalogue a rempli la fiche | `getByLabel('Batterie', { exact: true })` | `87.7` |
| | `getByLabel('Charge max', { exact: true })` | `150` |
| | `getByLabel('Nom du véhicule')` | `VinFast VF 8 (Plus)` |
| | `getByLabel('Choisir un modèle de véhicule')` | `vinfast-vf8-plus` |
| la charge partielle est dite | `.veh-bilan-charge` | contient **« 80 % de charge »** et **« pas à pleine charge »** |

> `{ exact: true }` est obligatoire sur `Batterie` et `Charge max` : sans lui,
> Playwright accroche `Charge max sous 0 °C` et `Charge max en canicule`.

**Ce qu'on dit** : « le catalogue connaît la VF 8 Plus, y compris son bridage
de charge par grand froid. Je pars à 80 %, comme ce matin. »

## Étape 3 — Paris 15e → Lyon Part-Dieu (cible : 25 s)

**Geste** — `ouvrirPlanificateur(page)`, puis remplir les deux champs de
`.vue-accueil` et valider chaque fois la première suggestion.

```
champs = page.locator('.vue-accueil input[type="search"]')
champs.nth(0).fill('14 rue Linois Paris')  → cliquer la première [role="option"]
champs.nth(1).fill('5 place Charles Beraudier Lyon') → cliquer la première [role="option"]
```

**Il n'y a pas de bouton « Calculer »** : le calcul part seul dès que les deux
bouts sont posés (`src/carte/panneau-itineraire.ts` l. 934-942). C'est un
argument, pas un manque — le dire.

**Résultat vérifiable**

| Quoi | Sélecteur | Attendu |
|---|---|---|
| le champ porte l'adresse | `[data-role="depart"] input` | contient `Linois` |
| | `[data-role="arrivee"] input` | contient `Beraudier` |
| le résumé arrive | `.iti-resultat` | correspond à `/^\d+ km — .+ · arrivée vers \d\d:\d\d/` |
| le tracé est sur la carte | source MapLibre `iti` | présente (`window.__carte`) |

Format exact du résumé une fois le plan calculé (l. 3145-3148) :
`465 km — 5 h 40 au total (4 h 18 de route + 1 h 22 de charge) · arrivée vers 18:35 avec 23 % de batterie`.

## Étape 4 — Mes réseaux, mes badges (cible : 20 s)

**Geste** — `allerA(page, 'recharge')`, déplier **« Réseaux préférés »**,
cocher **Ionity** puis **IZIVIA**. Puis `ouvrirReglagesBornes(page)`, cocher
**« Bornes électriques »**, et **seulement ensuite** « Accessibles en
itinérance (badges) ».

**L'ORDRE N'EST PAS UN DÉTAIL, et le test le paierait.** Le bloc
`.poi-filtres`, qui porte `input.poi-itinerance`, est `hidden` tant que la
couche des bornes n'est pas active : `#majVisibiliteFiltres()` dans
`src/carte/panneau-poi.ts` pose `bloc.hidden = !this.#actives.has('bornes')`.
Or `ouvrirReglagesBornes` (`tests-e2e/volets.ts` l. 109-118) ouvre le volet,
elle n'allume pas la couche ; et dans un contexte Playwright neuf aucune
préférence n'est en IndexedDB, donc `#actives` est vide. Sans
`page.getByRole('checkbox', { name: 'Bornes électriques' }).check()`, la case
d'itinérance reste masquée et le `check()` expire. Recette exacte dans
`tests-e2e/bornes-filtres.spec.ts` l. 42-52 — qui saute d'abord au zoom 13.
Ce saut n'est pas indispensable au filtre lui-même : `ZOOM_MIN = 12` commande
l'interrogation du PORTAIL, et sous ce seuil les bornes viennent quand même de
l'index national embarqué (`#chargerDepuisIndex`, `panneau-poi.ts` l. 976-977).
Il l'est pour le reste de la démo, où l'on veut la donnée fraîche du portail.

Sur le stand la question ne se pose pas : la tablette a déjà servi, sa
préférence est en mémoire. C'est au test que l'ordre s'impose.

**Résultat vérifiable**

| Quoi | Sélecteur | Attendu |
|---|---|---|
| le dépliant s'annonce | `details.recharge-reseaux summary` | `Réseaux préférés — tous (N sur ce trajet)` avant, `Réseaux préférés — 2 sur N` après |
| chaque réseau porte son compte | `.recharge-reseaux-corps label` | un `Ionity (n)` et un `IZIVIA (n)`, `n ≥ 1` |
| l'itinérance est cochée | `input.poi-itinerance` | `checked` |
| la note reste honnête | `.poi-filtre-ligne + p` | contient « La donnée publique ne dit pas quels badges précisément » |

**Ce qu'on dit** : « je ne vous vends pas un filtre par badge que la donnée
publique ne permet pas. Je vous dis ce qui est raccordé à l'itinérance, et je
privilégie mes deux réseaux. »

> **La liste des cases se calcule sur les bornes RÉELLEMENT trouvées le long du
> trajet** (`#voletReseaux`, panneau-itineraire.ts) : « proposer une case
> *Ionity* sur un trajet qui n'en croise aucune est une promesse creuse ».
> Le relevé du 11/09 dit qu'elles seront là (Ionity 14 stations, IZIVIA 368
> points à ≥ 150 kW le long du couloir) — **mais c'est à confirmer au premier
> passage vert du spec**. Si l'une des deux manquait, prendre les deux premiers
> réseaux affichés et adapter le discours : le geste ne change pas.

## Étape 5 — Le plan de recharge, et pourquoi (cible : 20 s)

**Geste** — rester sur la page **Arrêts de recharge**, lire le résumé, puis
ouvrir **« Pourquoi ce plan ? »**.

**Résultat vérifiable**

| Quoi | Sélecteur | Attendu |
|---|---|---|
| le résumé | `p.recharge-resume` | `/^\d+ arrêts? · \d+ min de charge · arrivée à \d+ %$/` |
| le nombre d'arrêts | `ol.recharge-liste > li` | **1 ou 2** pour Paris → Lyon en VF 8 Plus à 80 % (à figer par Ingénierie au premier passage vert, puis à verrouiller) |
| chaque arrêt est détaillé | `span.recharge-detail` | `/^\d+ km · arrivée \d+ % → départ \d+ % · \d+ min de charge · \d+ kW$/` |
| l'explication existe | `details.recharge-pourquoi summary` | `Pourquoi ce plan ?` |
| le périmètre est annoncé | `p.recharge-note-reserve` | se termine par `Bornes de 50 kW et plus, depuis le fichier national IRVE.` |

**Ce qu'on dit** : « température aux deux bouts, dénivelé, vitesse du parcours,
bridage de la VF 8 : tout est écrit là-dedans. Aucune boîte noire. »

## Étape 6 — Ce qu'il y a autour de la borne (cible : 15 s)

**Geste** — sur le premier arrêt, presser **« Commodités sur place »**.

**Résultat vérifiable**

| Quoi | Sélecteur | Attendu |
|---|---|---|
| le bouton | `button.recharge-commodites` | texte `Commodités sur place` |
| la sortie | `p.recharge-commodites-corps` | au moins une `.com-puce`, une `.com-distance`, et la mention `OpenStreetMap` |

**Ce qu'on dit** : « vingt-cinq minutes de charge, c'est un café ou des
toilettes. La carte le sait, et elle dit d'où elle le tient. »

## Étape 7 — Emporter la carte du trajet (cible : 35 s)

**Geste** — `allerA(page, 'partage')`, presser **« Emporter la carte du
trajet »**, laisser la jauge aller au bout.

**Résultat vérifiable**

| Quoi | Sélecteur | Attendu |
|---|---|---|
| l'annonce avant | `.iti-couloir-etat` | `/^\d+ tuiles, environ [\d,]+ Mo\.$/` |
| le bouton | `button` par son nom | `Emporter la carte du trajet` |
| la progression | `.iti-couloir-jauge` | visible, `value` croissante ; `.iti-couloir-etat` en `/\d+ sur \d+…/` |
| la fin | `.iti-couloir-etat` | `Couloir emporté : N tuiles, gardées quatorze jours.` |

> **Sur le stand, faire cette étape AVANT l'ouverture des portes** si le wifi du
> salon est douteux : c'est la seule étape qui télécharge en masse. La jauge
> reprend là où elle s'est arrêtée, le bouton **Arrêter** est prévu pour ça.

## Étape 8 — Mode avion (cible : 20 s)

**Geste** — mettre la tablette en **mode avion**, puis revenir à la carte, la
déplacer le long du trajet, **taper « boulangerie » dans le champ de
recherche**, et rouvrir le planificateur. La saisie n'est pas décorative :
c'est le SEUL geste de cette étape qui fasse paraître le message d'erreur
attendu plus bas. Sans elle, `.recherche-erreur` reste masquée et l'assertion
tombe.

**Résultat vérifiable**

| Quoi | Sélecteur | Attendu |
|---|---|---|
| le bandeau apparaît | `.hors-ligne strong` | **`Hors ligne.`** |
| il dit quoi exactement | `.hors-ligne` | « La carte déjà consultée et vos favoris restent accessibles. Tout ce qui interroge un service — recherche, itinéraire, trafic, météo, points d'intérêt, photos de rue — attend le réseau. » |
| et où en lire plus | `.hors-ligne-lien` | texte `Ce qui marche sans réseau`, `href="/sans-reseau.html"` |
| la carte du couloir tient | `#carte canvas.maplibregl-canvas` | toujours visible, fond peint le long du trajet |
| une recherche échoue proprement | `.recherche-erreur:visible` | **après la saisie de « boulangerie »**, contient `hors réseau` et **ne contient pas** `Réessayez` (rien avant la saisie) |
| le planificateur s'ouvre quand même | `.iti-corps` | visible après `ouvrirPlanificateur` |

**Ce qu'on dit** : « je ne vous promets pas le hors-ligne complet, et la page
`/sans-reseau.html` explique pourquoi. Je vous promets de ne pas vous laisser
devant un écran blanc dans un tunnel. »

---

## Rejouer ce scénario en Playwright

**Préambule** — identique à `tests-e2e/recharge.spec.ts` :

```ts
import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes, tuilesDuServiceWorker } from './tuiles-simulees';
import { ouvrirPlanificateur, allerA } from './planificateur';
import { ouvrirVolet, ouvrirReglagesBornes } from './volets';
```

Routes à simuler pour un parcours déterministe (sans consommer de quota
public) : `api-adresse.data.gouv.fr/search`, `data.geopf.fr/navigation/itineraire`
(avec la garde `resource=bdtopo-pgr` → `{"portions":[]}`), `data.geopf.fr/altimetrie`,
`api.open-meteo.com`, `public.opendatasoft.com` (index IRVE — `/exports/json`
rend un **tableau nu**), `overpass.openstreetmap.fr` (en-tête
`Access-Control-Allow-Origin: '*'` **obligatoire**), `tabular-api.data.gouv.fr`.

**Deux `test()`, pas un seul — c'est mesuré et coûteux à redécouvrir.**
L'étape 7 exige `tuilesDuServiceWorker(page)`, qui pose une route de
**contexte** (`page.context().route`) ; or cette même route casse le parcours
hors réseau (commentaire de `tests-e2e/tuiles-simulees.ts` l. 68-82 : trois
échecs sur trois). Découpage à respecter :

- `test('DÉMO SALON — étapes 1 à 7')` : `simulerTuiles` + `tuilesDuServiceWorker`,
  `test.setTimeout(120_000)`, attente de `navigator.serviceWorker.controller`
  avant l'étape 7.
- `test('DÉMO SALON — étape 8, mode avion')` : il ne peut PAS hériter du
  couloir emporté par le premier — voir juste en dessous ce qu'il doit
  préparer lui-même.

### Ce que le second test doit préparer lui-même, et pourquoi

**Playwright donne à chaque `test()` un contexte neuf.** Cache Storage,
service worker et IndexedDB du premier test n'existent pas dans le second :
les tuiles emportées à l'étape 7 **n'y sont pas**. Ouvrir l'accueil puis le
recharger ne prépare donc aucun fond le long de Paris–Lyon, et la ligne « la
carte du couloir tient » du tableau de l'étape 8 tomberait sur une carte
vide. Le second test doit refaire le couloir, dans son propre contexte, AVANT
de couper :

1. `test.setTimeout(120_000)` — le seul couloir prend jusqu'à soixante
   secondes sous la charge de la suite (mesuré, `couloir.spec.ts` l. 47-52).
2. `simulerTuiles(page)` **et** `tuilesDuServiceWorker(page)` : le
   téléchargement passe PAR le service worker (`src/carte/couloir-hors-ligne.ts`
   demande les tuiles, le worker les garde) ; sans la route de contexte, elles
   partent sur le vrai service IGN — 149 tuiles et ses 502, mesuré le 09/09.
3. Le trajet : `page.goto('/#iti=…')` puis `page.reload()`, attendre
   `.iti-resultat`, puis `navigator.serviceWorker.controller`. Sans gardien, le
   bouton est **désactivé avant tout téléchargement** et `.iti-couloir-etat`
   affiche « Rechargez la page une fois… » — le contrôle est dans
   `src/carte/panneau-itineraire.ts` l. 4117-4123 (`gardienPresent()`), pas
   dans `emporterLesTuiles`, qui, elle, télécharge sans rien vérifier.
4. `allerA(page, 'partage')`, cliquer **Emporter la carte du trajet**, et
   attendre la phrase de fin `Couloir emporté : N tuiles` : c'est elle, pas la
   jauge, qui atteste que le cache est rempli.
5. **Retirer la route de contexte avant de couper** :
   `await page.context().unroute('**/data.geopf.fr/wmts**')`. C'est elle qui
   empêchait le worker de servir sa coquille pré-cachée (trois échecs sur
   trois, 09/09) ; le couloir une fois en cache, elle n'a plus d'objet.
6. Alors seulement la recette de `tests-e2e/sans-reseau.spec.ts` l. 19-30 :
   attendre `registration.active`, `page.reload()`, `context.setOffline(true)`,
   puis `window.dispatchEvent(new Event('offline'))`.

**UN POINT N'EST PAS MESURÉ, ET IL FAUT LE DIRE** : la mesure du 09/09 porte
sur une route de contexte posée pendant TOUT le parcours ; personne n'a
vérifié qu'un `unroute` la répare. Si l'étape 6 échoue encore, le repli est de
ne pas passer par le service worker et de garnir le cache à la main avant de
couper — `caches.open('tuiles-plan')` puis `cache.put()` sur les URL que
`urlTuiles('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png')`
(`src/carte/style-ign.ts`) fabrique pour les tuiles rendues par
`tuilesDuCouloir()` (`src/lib/couloir.ts`). Le nom du cache vient de
`RESERVES_TUILES`, dans `src/lib/tuiles-en-cache.ts`. C'est moins fidèle — on
écrit ce que le worker aurait écrit — mais cela ne dépend d'aucune route.

**Le couloir du test n'est pas celui du stand** : `couloir.spec.ts` prend
Paris → Melun, environ 149 tuiles. Le second test doit en faire autant : ce
qu'il prouve, c'est qu'un fond EMPORTÉ tient hors réseau — pas qu'il fait six
cents kilomètres.

Un ordre de grandeur circule pour Paris–Lyon, **947 tuiles** ; il vient de
`tests/couloir.test.ts`, qui l'obtient sur une **ligne droite** de quarante
points entre Paris (2,3522 / 48,8566) et Lyon (4,8357 / 45,7640). Ce n'est
PAS le trajet de la démo, qui part de Linois et arrive à Beraudier en suivant
la route : le compte réel du stand se lit dans `.iti-couloir-etat` avant le
téléchargement, il ne se déduit pas de ce 947.

**Le chemin rapide, pour les étapes 3 à 7** : `page.goto('/#iti=2.282604,48.848501;4.859273,45.760829;car')`
**puis `page.reload()`** — le fragment n'est rejoué qu'au démarrage. Le
scénario du stand, lui, saisit les adresses à la main : c'est la partie
spectaculaire.

**Ce qu'il ne faut pas chercher** (relevé le 11/09, pour éviter trente minutes
perdues à Ingénierie) :

1. il n'existe **aucun** bouton « Calculer l'itinéraire » ;
2. il n'existe **aucune** sélection de badge par enseigne ;
3. le sélecteur du résumé est `.iti-resultat`, **pas** `.iti-resume` ;
4. `tests-e2e/corridor.spec.ts` **n'est pas** le couloir hors ligne (c'est
   l'interrogation Overpass le long du tracé) — c'est `couloir.spec.ts` ;
5. la mascotte n'est jamais nommée dans le code : elle y est « le chien au
   volant » (`.vue-chien`, `attente-chien`).

## Le repli, si le réseau du salon lâche pendant la démo

L'étape 8 devient l'étape 1 : couloir déjà emporté la veille, mode avion assumé
d'entrée, et le discours change de « regardez comme c'est frais » à « regardez
ce qui tient quand plus rien ne répond ». C'est la seule démo de la salle qui
gagne à perdre le réseau — autant que ce soit un choix.
