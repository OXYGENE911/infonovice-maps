# Mesure — la porte de sortie, et la campagne qui n'a pas eu lieu (SEUIL-1, 13/09/2026)

> **Ce document contient un refus, pas une campagne.** La garde de charge posée
> par le CEO le 13/09 a rejeté la mesure sur ce poste. Le verdict sur le critère
> des 5 secondes n'est donc **pas** rendu ici. Ce qui suit dit exactement ce qui
> a été mesuré, ce qui ne l'a pas été, et pourquoi.

---

## 1. Le défaut repris de la PR #316 — arithmétique, pas aléatoire

`calculerItineraire` (`src/lib/itineraire.ts`) tente **deux fois**, avec
`DELAI_MS = 8000` par essai et 500 ms d'attente entre les deux : la promesse ne
peut donc jamais mettre plus de **16 500 ms** à trancher.

Le seuil d'abandon (`SEUIL_ABANDON_ITINERAIRE_MS`) ouvrait la porte de sortie
(« Réessayer ») à **15 000 ms**. Le `catch` de `#calculer` masquait le bandeau
d'abandon dès que la promesse rejetait. Entre les deux : **1 500 ms**.

```
t=0        calcul lancé
t=2 500    bandeau « répond lentement »
t=15 000   bandeau d'abandon + bouton « Réessayer »   ← la porte s'ouvre
t=16 500   la promesse rejette → catch → abandon.hidden = true  ← elle se referme
           durée de vie du bouton : 1 500 ms
```

**Note d'honnêteté sur le chiffre de 1 446 ms** cité dans la mission : il n'a pas
été retrouvé dans la documentation de la branche `feat/recaAomQQUEykgE5f-iti-lent`
(`docs/mesure-itineraire-lent.md` mesure le mécanisme à sec, avec
`vi.useFakeTimers`, et déclare l'E2E hors périmètre). Le chiffre **déductible du
code est 1 500 ms** ; 1 446 ms vient vraisemblablement d'un relevé en navigateur
dont la source n'est pas dans ce dépôt. Les deux disent la même chose — une
seconde et demie — et l'écart ne change aucune conclusion, mais il n'est pas
attribué, donc il n'est pas repris comme mesure.

## 2. Le mécanisme retenu : l'accord, pas la baisse du seuil

Les deux voies proposées par le CEO :

| | ce qu'elle fait | ce qu'elle laisse |
|---|---|---|
| **A — baisser le seuil d'abandon** | ouvrir la porte plus tôt (p. ex. 7 500 ms) pour que `16 500 − 7 500 = 9 000 ms` | la durée de vie reste une **soustraction entre deux constantes étrangères l'une à l'autre**. Elle ne vaut que dans le seul cas où le service épuise ses deux essais. Si le service échoue **de lui-même** à 8,2 s, le bouton revit 700 ms — et le défaut est de retour, sans qu'aucun test ne le voie. |
| **B — accorder les deux mécanismes** (retenue) | quand la porte a été ouverte pour ce calcul, l'échec de la promesse ne la referme plus : il **écrit dedans**. | la durée de vie n'est plus une soustraction : elle est **une propriété de l'écran**. La porte reste ouverte jusqu'à ce que l'usager s'en serve, relance un calcul, ou efface le trajet. |

**B est retenue.** Le compromis annoncé dans la mission — « le second est plus
propre mais touche plus de code, et nous sommes à 22 jours du gel » — ne s'est pas
matérialisé : le correctif fait **+8 lignes utiles** dans `#calculer`
(un champ, une affectation dans `surAbandon`, une remise à zéro, un `if/else`
dans le `catch`, une remise à zéro dans `#effacer`), et **+170 octets gzip** sur
le morceau du planificateur. A aurait coûté une constante et aurait laissé un
piège daté.

Raison de fond : A traite le symptôme (l'écart de 1 500 ms), B traite la cause
(deux mécanismes qui s'ignorent — l'un ouvre la porte, l'autre la referme sans
savoir qu'elle venait d'être ouverte).

**Le seuil d'abandon reste à 15 000 ms.** Le faire descendre est une question de
*délai avant la première porte de sortie* — une question de produit, distincte de
celle-ci, et non mesurée ici. Elle mérite d'être posée : 15 secondes de sablier
avant le premier geste proposé, c'est long pour un stand de salon. Elle n'est pas
tranchée dans cette PR.

## 3. La durée de vie du bouton — CE QUI N'A PAS PU ÊTRE MESURÉ

**Exigence du CEO : ≥ 8 000 ms, chiffre relevé et publié en millisecondes.**

**Ce chiffre n'est pas publié ici, parce qu'il n'a pas été mesuré.** La sonde
(`scripts/sonde-porte-sortie.mjs --porte`) a refusé de mesurer : 30 processus
résidents pour un plafond de 20 (§5). Le chemin de mesure situé après la garde
n'a donc **jamais été exercé** sur ce poste.

Ce qui est établi, et à quel titre :

- **Par le code et ses tests** (`tests/seuil-porte-sortie.test.ts`, 7 tests,
  contre-épreuve faite — §6) : après le correctif, **aucun chemin ne referme la
  porte** hors des trois gestes explicites (clic sur « Réessayer », nouveau
  calcul, « Effacer le trajet »). En particulier, le rejet de la promesse à
  16 500 ms ne la referme plus. La durée de vie n'est donc plus bornée par le
  code — elle est bornée par l'usager.
- **Ce n'est pas un chronométrage.** C'est une propriété structurelle vérifiée
  par lecture de source. Elle dit « rien ne ferme la porte » ; elle ne dit pas
  « le bouton a été cliquable pendant N millisecondes dans un vrai navigateur ».
  La différence compte : un bouton peut rester `hidden=false` et se retrouver
  recouvert, hors écran, ou dans un panneau replié. **La sonde teste cela**
  (`elementFromPoint` au centre du bouton, en plus de `hidden` et `disabled`) —
  et c'est précisément ce test-là qui n'a pas pu tourner.

**Conclusion franche : l'exigence des 8 secondes n'est pas démontrée par la
mesure. Elle est rendue structurellement possible par le correctif.** Il manque
un relevé en navigateur sur une machine au repos pour la clore.

## 4. Le critère des 5 secondes — VERDICT NON RENDU

La campagne de six sessions froides n'a **pas** eu lieu : même refus, même cause.

**Aucun verdict n'est rendu sur le critère des 5 secondes.** Ni tenu, ni non
tenu : **non mesuré**. C'est la seule chose honnête à écrire. Deux campagnes se
sont déjà contredites d'un soir à l'autre ; une troisième prise sous la charge de
nos propres outils ne trancherait rien et ferait fusionner du code sur un chiffre
de confort.

## 5. Le refus, et pourquoi il n'est pas contournable

### La sortie réelle, 13/09/2026

```
$ node scripts/sonde-porte-sortie.mjs --porte
=== SONDE PORTE — 2026-09-13T01:15:52.969Z ===
[garde] node=30 chrome=0 total=30 plafond=20 (2026-09-13T01:15:53.514Z)

CAMPAGNE REJETÉE AUTOMATIQUEMENT.
30 processus résidents au démarrage, plafond 20. Campagne REJETÉE : la mesure
ne part pas. Le seuil ne se relâche pas pour faire passer une mesure
(CLAUDE.md, « Validité d'une campagne de mesure », CEO 13/09/2026).

Aucune mesure n'a été prise. Ce n'est pas un avertissement.

$ echo $?
2
```

La garde s'exécute **avant** que le serveur ne démarre et avant que le navigateur
ne soit lancé : l'ordre est délibéré, démarrer l'un ou l'autre d'abord ajouterait
des processus au compte qu'on est en train de prendre.

**Un défaut trouvé en la faisant tourner** : au premier essai, la garde levait une
exception et Node sortait avec le code **1** (exception non rattrapée), écrasant
le code 2 voulu — un appelant qui distingue « refus de la garde » d'« erreur de la
sonde » se serait trompé. Corrigé : `process.exit(2)` explicite. C'est
exactement ce que « démontrer que le refus fonctionne » permet de trouver.

### Qui sont ces 30 processus — et ce qu'aucun d'eux n'est

**Aucune autre mission ne tournait.** Aucun build, aucun test, aucun agent en
cours de travail. Les 29 processus `node` (le 30ᵉ est la sonde elle-même) sont
des **serveurs MCP résidents**, attachés à des applications ouvertes :

| Propriétaire | Processus `node` | Détail |
|---|---:|---|
| **Codex (application de bureau), PID 17216** | **16** | 6 × `chrome-devtools-mcp`, 4 × `playwright-mcp`, 4 × `server.mjs`, 2 × greffon `unified` |
| Session Claude Code, PID 14692 | 9 | 3 × `chrome-devtools-mcp`, 2 × `claude-flow`, 2 × `mcp-server-pdf`, 2 × `playwright-mcp` |
| Session Claude Code, PID 1752 | 4 | 2 × `desktop-commander`, 2 × `mcp-server-pdf` |
| **Total** | **29** | + 1 (la sonde) = **30** ; `chrome` = 0 |

Commandes ayant produit ce tableau : `Get-CimInstance Win32_Process -Filter
"Name='node.exe'"`, remontée du `ParentProcessId` jusqu'à `claude.exe` ou
`Codex.exe`, regroupement par propriétaire et par ligne de commande.

### La conclusion à porter au CEO

**Ce n'est pas un incident, c'est une propriété du poste.**

L'application de bureau **Codex à elle seule occupe 16 des 30 processus** — plus
de la moitié, et à elle seule presque le plafond entier. Or Codex est l'outil que
`CLAUDE.md` **impose** pour la revue de code. Une seule session Claude Code
ouverte en plus (9 processus) porte le total à 25 : le plafond est franchi
**sans qu'aucune mission ne tourne**.

Autrement dit : **tant que la chaîne d'outils de HQ est ouverte, ce poste ne peut
pas héberger une campagne de mesure valide.** Le seuil de 20 n'est pas trop
sévère — c'est l'outillage qui le consomme entièrement avant qu'on ait commencé
à travailler.

Trois pistes, aucune décidée ici (elles relèvent du CEO et du chef de cabinet) :

1. **Mesurer fenêtre fermée** : quitter l'application Codex et toutes les
   sessions Claude Code sauf une avant la campagne, puis relancer la sonde. À
   vérifier par la mesure — non tenté ici, parce qu'arrêter les processus
   d'autres sessions n'est pas un geste que cette mission peut poser seule.
2. **Alléger la configuration MCP** : `chrome-devtools-mcp` et `playwright-mcp`
   coûtent 3 et 2 processus par session. Les désactiver hors des sessions qui
   s'en servent rendrait le plafond atteignable.
3. **Mesurer ailleurs** : une machine de mesure dédiée, ou une exécution en CI.
   C'est la seule piste qui donne un chiffre reproductible et comparable d'un
   cycle à l'autre — et la seule qui survivra au salon.

**Ce qui n'a PAS été fait, et délibérément** : le seuil n'a pas été relâché,
aucune exception n'a été taillée pour « --porte », aucun processus n'a été tué
pour faire passer la mesure, et aucun chiffre n'a été publié malgré le refus.

## 6. Ce qui a été mesuré pour de bon

Toutes les commandes ci-dessous ont été lancées sur
`feat/rec5eKjhMXs6GP3Fx-seuil-porte`, worktree `C:/Dev/_wt-seuil-c6`.

### Suite unitaire

```
$ npx vitest run
 Test Files  119 passed (119)
      Tests  1700 passed (1700)
```

1 681 tests au sommet de la PR #316 + 19 nouveaux (7 pour l'accord, 12 pour la
garde) = 1 700. Aucun test existant modifié ni supprimé.

### Contre-épreuve du correctif

Le défaut de la PR #316 a été **remis en place** (`abandon.hidden = true;`
inconditionnel dans le `catch`), puis les tests relancés :

```
$ npx vitest run tests/seuil-porte-sortie.test.ts
 × LE CŒUR DU CORRECTIF : le catch ne masque le bandeau d'abandon QUE s'il ne l'a pas ouvert
 × CONTRE-ÉPREUVE DE LA RÉGRESSION : le catch ne masque plus le bandeau d'abandon inconditionnellement
 Tests  2 failed | 5 passed (7)
```

Correctif restauré → **7 passed (7)**. Les tests voient donc bien le défaut, et
ne sont pas verts par construction.

### La garde, dans les deux sens

`tests/garde-processus.test.ts` (12 tests) éprouve la fonction pure de décision
des deux côtés du seuil : refus à 21, **acceptation à 20 pile** (« plus de 20 »
est un dépassement strict), acceptation à 3, refus si le comptage échoue (un
comptage impossible n'est pas un comptage à zéro), et absence de porte dérobée
par variable d'environnement. Une garde qu'on ne peut pas voir *ne pas* se
déclencher n'en serait pas une.

### Lint et typage

```
$ npm run lint      # eslint src tests-e2e && tsc --noEmit
(aucune sortie, aucune erreur)
```

### Bundle — trois points mesurés sur le même poste, le 13/09

| état | `panneau-itineraire-*.js` | gzip |
|---|---:|---:|
| `staging` (a304eb9) | 123,62 Ko | 39,99 Ko |
| sommet PR #316 (`e8e6e68`) | 125,45 Ko | 40,57 Ko |
| **cette PR (SEUIL-1)** | **125,62 Ko** | **40,61 Ko** |

Coût de l'accord : **+0,17 Ko brut, +0,04 Ko gzip** (≈ 40 octets). Le delta total
depuis `staging` est de +2,00 Ko / +0,62 Ko gzip, dans le budget « ±5 Ko ».

Commandes : `git stash push -u`, puis `npm run build` au sommet de la PR #316 ;
puis `git checkout origin/staging -- src/` et `npm run build` ; puis restauration
et `npm run build` final.

### Les deux chiffres faux du CHANGELOG, corrigés

1. **« environ sept fois »** → `2 500 / 380 = 6,58`, soit **six fois et demie**.
   Corrigé aux **trois** endroits où l'erreur avait été recopiée :
   `docs/CHANGELOG.md`, le commentaire de `src/carte/panneau-itineraire.ts`, et
   `docs/mesure-itineraire-lent.md` §2.
2. **Taille de bundle périmée** : le CHANGELOG annonçait `123,62 → 125,34 Ko /
   39,99 → 40,56 Ko gzip`. 125,34 Ko était la taille **d'avant** le correctif de
   la revue Codex du 12/09 — périmée dès le commit suivant. Remplacée par la
   valeur remesurée ce jour : `123,62 → 125,45 Ko / 39,99 → 40,57 Ko gzip`.

## 7. Ce que ce document ne prouve pas

- **Aucune mesure en navigateur n'a été prise** : ni la durée de vie du bouton,
  ni le critère des 5 secondes. La garde a refusé, et le refus a été respecté.
- **Le chemin de mesure de la sonde n'a jamais été exercé** au-delà de la garde.
  Ses sélecteurs viennent désormais du scénario E2E existant
  (`tests-e2e/accueil.spec.ts`), qui lui, tourne — mais les avoir empruntés à du
  code qui marche n'est pas la même chose que d'avoir vu la sonde marcher. Elle
  attend `.iti-resultat` visible avant de chronométrer : si le calcul n'est pas
  parti, elle échoue au lieu de rendre un `ouverteA: null` qu'on pourrait lire
  de travers.
- **Nous n'avons jamais mesuré sur un téléphone.** Tous les chiffres de ce dépôt
  viennent du poste de développement. Le calcul local (≈ 40 % du total selon les
  relevés antérieurs) sera **plus lent sur mobile, jamais plus rapide** : un
  critère tenu ici ne dirait rien du matériel du salon.
- **Le comportement réel du bouton sous le doigt** n'est pas vérifié. La leçon
  « un test qui clique à la souris ne prouve rien sur le tactile » vaut ici
  aussi, et cette PR ne touche pas aux tests E2E (hors périmètre).

## 8. Revue Codex — `codex exec -s read-only`, 13/09/2026, commit `7361d65`

**Verdict initial : BLOQUANT.** Quatre constats, **tous fondés, tous corrigés.**
Aucun ne portait sur l'accord des deux mécanismes lui-même : Codex a
explicitement écrit n'avoir trouvé « aucune fuite de `#abandonAnnonce` entre
deux calculs », le nouveau calcul et l'effacement le réinitialisant, et les
réponses obsolètes restant filtrées par le jeton de séquence.

| # | Gravité | Constat | Correction |
|---|---|---|---|
| 1 | **BLOQUANT** | `compterProcessus` n'appelait que `tasklist`, **absent de la CI Ubuntu du projet** : le test de comptage réel y aurait échoué à chaque exécution, rougissant la CI de toutes les PR suivantes. | Comptage à deux voies : `tasklist` sous Windows, `ps -A -o comm=` ailleurs, avec comparaison **stricte** sur le nom de base (`chrome_crashpad_handler` n'est pas `chrome`). |
| 2 | sérieux | La sonde visait `.iti-depart input`, `.iti-arrivee input`, `.iti-calculer` — **aucun de ces sélecteurs n'existe** dans le panneau. La sonde n'aurait jamais lancé de calcul, même sur une machine au repos. | `declencherCalcul` réécrite d'après le scénario E2E existant : deux champs `input[type="search"]`, suggestions de géocodage simulées, et **aucun bouton « Calculer »** — le calcul part tout seul dès que les deux points sont posés. Un témoin (`.iti-resultat` visible) vérifie que le calcul est bien parti. |
| 3 | sérieux | `jugerDerive(10, NaN)` rendait `suspecte: false` et « Dérive NaN processus, dans le tolérable » : **un comptage de fin impossible blanchissait la campagne** (`NaN > 3` vaut `false`). | Garde explicite : une dérive incalculable est **suspecte**. Même principe que dans `deciderValidite` — ne pas savoir n'est jamais un feu vert. |
| 4 | mineur | La contre-épreuve de régression cherchait `/^\s{6}abandon\.hidden = true;/m` : **elle dépendait de l'indentation**. La même ligne indentée de huit espaces faisait revenir le défaut sans faire rougir le test. | Le test **compte** au lieu de filtrer : il doit y avoir exactement UNE fermeture du bandeau dans le `catch`, et elle doit se trouver après le `} else {`. |

### La contre-épreuve du constat n° 4, refaite — et une première tentative fausse

Le contournement décrit par Codex (même ligne, huit espaces, en fin de `catch`) a
été **réellement injecté** pour vérifier que le test durci le voit.

**Première tentative, invalide** : l'injection a été faite par un remplacement de
chaîne, qui a touché **la première** occurrence de `attenteChien().effacer();`
dans le fichier (ligne 453, une autre méthode) et non celle du `catch` de
`#calculer` (ligne 5079). Les tests sont restés verts — ce qui n'établissait
rien, puisque le défaut n'avait pas été injecté là où on croyait. C'est le genre
de contre-épreuve vide contre lequel ce dépôt s'est déjà fait avoir.

**Seconde tentative, valide**, injection par numéro de ligne dans le bon `catch` :

```
contournement 8 espaces injecte DANS LE BON catch
 × CONTRE-ÉPREUVE DE LA RÉGRESSION : la SEULE fermeture du bandeau dans le
   catch est celle de la branche « je ne l'ai pas ouvert »
 Tests  1 failed | 6 passed (7)
```

Correctif restauré → **7 passed (7)**.

### État après corrections

```
$ npm run lint      # eslint src tests-e2e && tsc --noEmit   → aucune erreur
$ npx vitest run
 Test Files  119 passed (119)
      Tests  1700 passed (1700)
```

1 681 tests au sommet de la PR #316 + **19 nouveaux** = 1 700. Bundle inchangé
par les corrections de revue : **125,62 Ko / 40,61 Ko gzip**.

La garde refuse toujours, dans les deux modes (`--porte` et `--campagne`), avec
le même compte de 30 processus : **les corrections de revue ne changent rien au
fait qu'aucune mesure en navigateur n'a pu être prise ce jour.**

## 9. Une limite de la garde, trouvée par la CI (13/09, après la revue)

La CI Ubuntu a fait rougir `tests/garde-processus.test.ts` sur une assertion qui
semblait indiscutable : « il y a forcément au moins un processus `node`, puisque
c'est `node` qui m'exécute ». **Elle a compté 0.**

`ps -o comm=` lit `/proc/<pid>/comm`, que Node renseigne depuis `process.title`
— et Vitest renomme ses processus. **Un processus qui se renomme échappe au
comptage.**

**La limite est réelle, et elle n'est pas seulement dans le test :** le comptage
de la garde est **nominatif**, donc il **MINORE**. Conséquence à connaître avant
de se fier à un relevé :

- la garde ne peut pas refuser à tort une machine au repos en la sur-comptant ;
- elle **peut** laisser passer une machine chargée en la sous-comptant, si les
  processus qui la chargent portent un nom qu'elle ne connaît pas.

Pour un plafond de 20, minorer est le sens prudent — un refus se déclenche sur ce
qu'on voit, jamais sur ce qu'on devine. Mais **un compte « sous 20 » ne prouve
pas une machine au repos** : il prouve qu'on n'a pas vu plus de 20 processus des
familles connues. Le compte de 30 relevé ce jour, lui, est un **plancher** : la
machine était au moins aussi chargée que cela.

Le remède durable reste le même qu'au §5 : une machine de mesure dédiée ou une
exécution en CI, où la charge est connue au lieu d'être comptée.
