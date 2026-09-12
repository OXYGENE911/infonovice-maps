# Mesure Paris → Lyon — délai de garde sur l'altimétrie (C4, 12/09/2026)

Tâche Airtable `recu7iXoI2DPdP5Pr`, cycle C4, département Ingénierie A. Branche
`feat/recgTL2LqMYAZf0mB-optim-paris-lyon` (worktree `C:/Dev/_wt-optim-c3`), sur
la même PR que le C3 (**#313**) — voir la section « Pourquoi la même PR » en
bas de ce document.

Ce document n'existait pas avant cette tâche : le C3 a mesuré (banc T3) mais
ne l'a jamais publié, et ses chiffres n'ont pas pu être reproduits (constat du
chef de cabinet, tâche `recgTL2LqMYAZf0mB`). Tout ce qui suit est un relevé
**publié en même temps que la mesure**, pas reconstitué après coup.

## Le constat qui fonde cette tâche

Après l'optimisation du C3 (débounce, préchargement IRVE, grille spatiale), la
contre-mesure indépendante du 12/09 (six sessions froides) a donné, en
millisecondes : **2 201 / 5 376 / 2 953 / 1 552 / 4 779 / 1 522**. p95 = 5 376
ms — au-dessus du seuil dur. Le facteur limitant n'est plus le code
d'Infonovice Maps : c'est l'altimétrie de la Géoplateforme (`data.geopf.fr`),
mesurée entre 902 ms et environ 7 s, attendue dans un `Promise.all` **sans
délai de garde ni repli** (`src/carte/panneau-itineraire.ts:1878`,
`#chargerConditions` : un `.catch` sur l'erreur, rien sur la lenteur).

## Ce qui a été fait

Un **délai de garde explicite de 2 000 ms** sur le seul appel altimétrique
(`avecDelaiDeGarde`, nouveau fichier `src/lib/delai-garde.ts`) : au-delà, le
plan se calcule sans le dénivelé plutôt que d'attendre — la promesse
sous-jacente n'est **ni annulée ni relancée** (aucun appel supplémentaire,
conformément au mandat). « Pourquoi ce plan ? » et la note de réserve du
volet recharge le disent en toutes lettres quand ça arrive : « relief non pris
en compte — le service altimétrique était trop lent ou indisponible », jamais
un silence qui ferait passer un dénivelé absent pour un dénivelé nul.

La météo (Open-Meteo, deux appels par trajet) **n'a pas reçu le même délai** :
la mesure ci-dessous (section « Le délai de 2 000 ms, justifié ») ne lui a
trouvé aucun risque comparable. Le code et son commentaire (constante
`DELAI_GARDE_ALTIMETRIE_MS`, `panneau-itineraire.ts`) documentent cette
décision et la mesure qui la fonde ; si une mesure future montre le même
risque sur la météo, le même traitement s'impose — la fonction
`avecDelaiDeGarde` est déjà générique et prête à l'accueillir.

## Le délai de 2 000 ms, justifié

**Mesure hors navigateur** (neuf appels réels aux services, `curl`, le 12/09,
horaires ouvrés — six à l'altimétrie, trois à la météo) :

| # | Service | Résultat |
|---|---|---|
| 1 | Altimétrie (Paris→Lyon, 3 sommets) | **7 277 ms** |
| 2 | Altimétrie | 576 ms |
| 3 | Altimétrie | 702 ms |
| 4 | Altimétrie | 868 ms |
| 5 | Altimétrie | 658 ms |
| 6 | Altimétrie | 872 ms |
| 7 | Météo (Open-Meteo, Lyon) | 150 ms |
| 8 | Météo | 117 ms |
| 9 | Météo | 103 ms |

**Cinq réponses altimétrie sur six entre 576 et 872 ms** (médiane ≈ 700 ms),
**une (la première de la série) à 7 277 ms** — cohérent avec la fourchette
902 ms-7 s relevée par la contre-mesure du 12/09. **2 000 ms** laisse une
marge large (≈ ×2,9) sur le cas normal tout en coupant la queue de latence
avant qu'elle ne menace le seuil de 5 s. La météo, elle, n'a montré aucun cas
au-delà de 150 ms dans cette même série (trois appels) : aucun risque
comparable trouvé, d'où la décision de ne pas lui appliquer de délai de garde
pour l'instant (voir plus haut).

**Limite de cette justification, dite en clair** : cinq appels rapides et un
lent, sur six, à une heure donnée, ne sont pas une distribution statistique —
c'est un ordre de grandeur, cohérent avec la contre-mesure indépendante du
12/09 (six sessions, même fourchette), mais rien de plus. Non vérifié : la
distribution de la latence de `data.geopf.fr/altimetrie` à d'autres heures ou
sous charge. Le choix de 2 000 ms est donc **assumé, pas prouvé** — exactement
ce que le mandat demandait (« proposition 2 s, à justifier par la mesure »).

## Les six sessions froides — relevés bruts

**Méthode.** Build de production (`npm run build`), servi par `vite preview`
sur le port dédié **4183** (choisi car > 4173, le port par défaut utilisé par
les autres sessions de ce cycle — mandat de la tâche). Hash du bundle
`panneau-itineraire` vérifié IDENTIQUE entre `dist/` sur disque et la réponse
HTTP du serveur avant toute mesure (sha256
`83fe40335a2ac502ce62a623a404fd633f60c28749268f9466a3d94f4506cfc1`, fichier
`panneau-itineraire-DzYMEYAK.js`) — le piège que le mandat signale (deux
sessions ont déjà mesuré le mauvais build sur cette machine) est donc écarté
pour cette mesure-ci.

Six itérations, **chacune dans une navigation fraîche** (`navigate` vers
`http://localhost:4183/`), précédée d'un nettoyage explicite de tout IndexedDB,
Cache Storage, service workers, `localStorage`/`sessionStorage` de l'origine,
et **vérifiée vide avant de continuer** (préférence véhicule relue = `"vide"`
à chaque fois — voir le détail ci-dessous). VinFast VF 8 (Plus), 80 % de
batterie, comme le banc T3 du C3. Trajet Paris 15ᵉ Arrondissement → Place
Charles Béraudier (Lyon Part-Dieu), identique aux six sessions.

**Le chronomètre ne vient pas de l'outil qui pilote le navigateur** (biais
connu du C3, corrigé dans son propre banc puis repris ici à la main) : un
script injecté à chaque navigation pose un `addEventListener` sur
`itineraire-lance` (le tout premier événement de `#calculer()`, avant tout
réseau) et un `MutationObserver` sur `.iti-recharge-corps` qui note l'instant
où un enfant `.recharge-resume`/`.recharge-refus` apparaît — les deux en
`performance.now()`, datés par le navigateur. Le total mesuré est la
différence entre ces deux instants du calcul déclenché par la sélection de
l'adresse d'arrivée.

| Session | Cache/IndexedDB vidés et vérifiés | Résultat (ms) | Relief pris en compte |
|---|---|---|---|
| 1 | oui | **2 364** | oui |
| 2 | oui | **494** | oui |
| 3 | oui | **6 642** | oui |
| 4 | oui | **3 924** | oui |
| 5 | oui | **4 291** | oui |
| 6 | oui | **3 202** | oui |

Chaque session a produit le même plan (« 1 arrêt · 33 min de charge · arrivée
à 10 % » — 464 km, 5 h 20 au total), confirmant que les six itérations ont
bien calculé le même trajet.

**p95 = 6 642 ms (le maximum des six, méthode identique à celle de la
contre-mesure du 12/09) — AU-DESSUS du seuil dur de 5 s.**
**Médiane = 3 563 ms — sous le seuil de 4 s.**

## Le critère n'est pas tenu, et pourquoi

Les six sessions ont toutes compté le relief (« oui » partout dans le
tableau) : dans aucune des six, l'altimétrie n'a dépassé le délai de garde de
2 000 ms — le délai de garde n'a donc jamais eu l'occasion de JOUER SON RÔLE
(refuser d'attendre) pendant cette mesure.

**Ce que « relief compté » ne prouve PAS, et qu'il faut dire clairement
(revue Codex du 12/09, remarque tenue) : ça ne veut pas dire que l'altimétrie
a répondu vite — seulement qu'elle a répondu en moins de 2 000 ms.** Un appel
qui aurait pris, par exemple, 1 900 ms compterait comme « relief pris en
compte » tout en ayant pesé lourd dans le total de la session 3 (6 642 ms) si
cet appel se trouvait sur le chemin le plus lent du `Promise.all`. La sonde
posée ici (les deux `performance.now()`, départ et fin du calcul complet) ne
décompose PAS le total par poste réseau — contrairement au banc Playwright du
C3, qui catégorisait chaque requête par nom mais n'existe pas sur cette
branche (voir « Ce qui n'a pas pu être fait »). **Je ne peux donc PAS exclure
que l'altimétrie ait contribué de façon significative (jusqu'à un peu moins de
2 s) au total de la session 3, ni l'affirmer : c'est un NON-VÉRIFIÉ, pas un
NON.** Ce qui est vérifié, en revanche : l'altimétrie n'a jamais, dans ces
six sessions, à elle seule dépassé le budget de 2 s que le délai de garde lui
impose désormais — le pire cas que la tâche visait à plafonner est plafonné,
que le reste de la chaîne soit lent ou non ce jour-là.

**Ce que ça veut dire, en clair : le délai de garde sur l'altimétrie corrige
le facteur limitant que la contre-mesure avait identifié, mais n'est pas, à
lui seul, une garantie que p95 < 5 s sur six sessions froides — parce que
d'autres services publics (itinéraire, IRVE) peuvent eux aussi, un jour
donné, répondre lentement, et rien dans cette tâche ne leur pose de délai de
garde.** C'est un résultat honnête, pas un résultat caché : la tâche demandait
de traiter l'altimétrie (et la météo si la mesure le montrait) — c'est fait et
mesuré — pas de traiter tous les points chauds possibles du pipeline réseau.

## Ce qui n'a pas pu être fait, et pourquoi (à déclarer, pas à cacher)

- **Pas de décomposition par service pour la session 3.** L'outil de lecture
  réseau disponible dans cette session (`read_network_requests`) n'a rendu
  aucune requête pour cet onglet (`No network requests recorded`), malgré
  plusieurs essais à des moments différents — cause non identifiée, signalée
  ici plutôt que contournée en silence. Le banc Playwright du C3
  (`tests-e2e/mesure-paris-lyon.spec.ts`, catégorisation par URL) existe sur
  une AUTRE branche du dépôt (`feat/recDF5ZaSt7nXSM0I-mesure-paris-lyon`,
  jamais fusionnée ni rebasée sur celle-ci) — je ne l'ai NI copié NI adapté
  sur cette branche : le mandat de cycle interdit toute modification des
  tests E2E (mission B du même cycle y travaille, conflit garanti), et ce
  spec vit dans `tests-e2e/`.
- **Cache HTTP disque non vidé explicitement.** L'IndexedDB, le Cache Storage
  et les service workers ont été vidés et VÉRIFIÉS vides avant chaque session
  (préférence véhicule relue = `"vide"`, capture jointe pour chaque
  itération) ; le cache HTTP disque du navigateur, lui, n'a pas été vidé par
  un mécanisme vérifiable dans cet environnement (pas d'accès DevTools
  « Empty cache and hard reload » depuis les outils disponibles ici). **Je ne
  dispose d'aucun argument qui permette d'écarter cette hypothèse** — l'écart
  entre sessions (494 ms à 6 642 ms) est compatible aussi bien avec un cache
  actif par endroits qu'avec un cache totalement froid : je le déclare NON
  VÉRIFIÉ, sans chercher à le minimiser par un raisonnement qui ne tiendrait
  pas (revue Codex du 12/09 : une tentative antérieure de cette phrase
  invoquait l'absence de décroissance monotone comme indice — argument
  invalide, retiré).
- **Une seule campagne, un seul moment de la journée.** Comme pour la
  contre-mesure du 12/09 et pour la mesure hors navigateur ci-dessus : six
  passages et neuf appels ne sont pas une distribution, seulement un ordre de
  grandeur cohérent d'une mesure à l'autre.

## Ce que le délai de garde coûte en précision du plan

Rien, dans ces six sessions : le relief a été compté à chaque fois, donc le
plan de recharge (dénivelé Paris→Lyon compris dans le calcul de consommation)
est resté aussi précis qu'avant cette tâche. Le coût potentiel — un plan qui
ignore un col ou une descente parce que l'altimétrie a mis plus de 2 s à
répondre — ne s'est pas matérialisé aujourd'hui, mais reste réel les jours où
le service est plus lent.

**Ce que les tests unitaires prouvent, précisément, et pas plus** (revue
Codex du 12/09 : la version précédente de ce paragraphe surclamait leur
portée) :
- `tests/delai-garde.test.ts` prouve que `avecDelaiDeGarde` — l'utilitaire
  générique, isolé de toute donnée métier — rend bien `undefined` au bout du
  délai sans jamais attendre la promesse lente au-delà, et sans rejet non
  géré même quand cette promesse échoue APRÈS coup.
- `tests/conditions.test.ts` (fonction `noteReserveConditions`, extraite de
  `panneau-itineraire.ts` pendant cette même tâche à la suite de la revue
  Codex) prouve que la note de réserve du volet recharge dit EXACTEMENT la
  bonne phrase dans les trois cas (relief compté, relief manquant seul,
  rien compté) — jamais que le relief est compté quand il ne l'est pas.
- **Ce qu'AUCUN test ne prouve** : que `#chargerConditions` (la méthode privée
  qui orchestre réellement l'appel réseau, le `Promise.all` et l'écriture de
  `#deniveleIndisponible`) déclenche bien ce chemin en conditions réelles, ni
  que le panneau « Pourquoi ce plan ? » (son propre bloc `cond`, distinct de
  la note de réserve) affiche la bonne phrase au moment voulu — cette classe
  fait plus de 5 000 lignes et n'a aucun harnais de test unitaire existant ;
  en construire un pour cette seule tâche aurait dépassé son périmètre. Cette
  bascule intégrale **n'a pas été observée dans une session réelle**
  aujourd'hui non plus (voir ci-dessus, aucune des six sessions n'a déclenché
  le délai de garde) : elle est vérifiée par construction et par lecture du
  code (la mienne, puis celle de Codex), pas par l'observation d'un cas réel
  ni par un test automatisé de bout en bout.

## Suite à la première revue Codex (12/09, VERDICT BLOQUANT)

Codex a trouvé quatre remarques sérieuses et une mineure sur la première
version de ce commit — rapport complet dans
`handoffs/2026-09-12-1630-codex-altimetrie.md`. Un second commit les corrige :

1. **Bug réel, corrigé** : la note de réserve ne regardait que `tempDepartC`
   pour décider si « la température est comptée », alors que le calcul retient
   la température LA PLUS DÉFAVORABLE des deux bouts — un départ en échec
   météo avec une arrivée glaciale comptée aurait affiché « à plat » alors
   que la température AVAIT compté. Corrigé (regarde `tempDepartC` OU
   `tempArriveeC`), et la logique de sélection des trois phrases a été
   extraite en une fonction pure `noteReserveConditions`
   (`src/lib/conditions.ts`), testée à sec sur ses trois cas.
2. **Écart entre le test et ce qu'il prouve, corrigé dans ce document** (voir
   « Ce que le délai de garde coûte en précision du plan » plus haut) : le
   test unitaire ne prouvait ni la bascule de `#chargerConditions` ni
   l'affichage de « Pourquoi ce plan ? » — seulement l'utilitaire générique.
   Dit maintenant précisément, sans surclamer.
3. **Erreur de comptage dans ce document, corrigée** : « dix appels » et
   « neuf sur dix » étaient faux — le relevé n'en comportait que neuf (six
   altimétrie, trois météo), cinq altimétries rapides sur six. Corrigé
   ci-dessus.
4. **Conclusion causale non soutenue par la mesure, corrigée** : ce document
   affirmait que la lenteur de la session 3 ne venait « pas » de
   l'altimétrie ; en réalité, « relief compté » prouve seulement que
   l'altimétrie a répondu sous 2 000 ms, pas qu'elle a répondu VITE — elle
   a pu peser jusqu'à ~1 900 ms dans le total sans déclencher le délai de
   garde. Reformulé en NON-VÉRIFIÉ plutôt qu'en négation.
5. **Argument faible sur le cache HTTP, retiré** (remarque mineure) :
   l'absence de décroissance monotone entre sessions ne permettait pas de
   conclure à l'absence d'effet de cache. Retiré, remplacé par un aveu simple
   de non-vérification.

**Ce qui N'A PAS changé** : la logique du délai de garde lui-même
(`avecDelaiDeGarde`, `DELAI_GARDE_ALTIMETRIE_MS = 2000`), donc les six
mesures brutes ci-dessus restent valides pour le comportement mesuré — elles
n'ont pas été rejouées après ce second commit, seule la CORRECTION d'un bug
d'affichage et de plusieurs erreurs de rédaction dans ce document justifiait
un second passage, pas une remesure.

## Suite à la deuxième revue Codex (12/09, VERDICT BLOQUANT à nouveau)

Le second commit corrigeait bien les points 3 et 5 ci-dessus, mais Codex a
trouvé : (a) deux occurrences oubliées de la coquille sur le nombre d'appels
(« dix » subsistait dans `docs/CHANGELOG.md` et dans la section « Ce qui n'a
pas pu être fait » de CE document — corrigées) ; (b) `docs/CHANGELOG.md`
répétait encore la conclusion causale non soutenue (« ne vient donc PAS de
l'altimétrie ») que ce document avait, lui, déjà corrigée — reformulé pour
dire la même chose que ci-dessus (NON VÉRIFIÉ) ; **(c) un bug réel et NOUVEAU,
introduit par mon propre correctif** : `noteReserveConditions` ne prévoyait
que trois cas et traitait « relief compté sans température » comme
« impossible en pratique », affichant alors « Température, relief et vitesse
[…] sont comptés » — un mensonge, puisque la température n'a PAS été
comptée. Ce cas est pourtant atteignable : météo et altimétrie sont deux
appels indépendants, attrapés séparément (`#chargerConditions`), et les deux
appels météo peuvent échouer pendant que l'altimétrie répond à temps. Pire :
le test que j'avais écrit consacrait cette phrase fausse comme le
comportement ATTENDU, avec un commentaire (« cas impossible en pratique »)
qui masquait le problème plutôt que de le révéler.

**Corrigé dans un troisième commit** : `noteReserveConditions` couvre
maintenant les QUATRE combinaisons (température/relief × compté/non compté),
chacune avec sa phrase honnête — la nouvelle, quand le relief est compté sans
la température, dit « Relief et vitesse du parcours sont comptés ; la
température n'a PAS pu être relevée […], le plan suppose 20 °C ». Le test
correspondant affirme maintenant l'inverse de ce qu'il affirmait avant :
qu'on ne doit JAMAIS lire « Température […] comptée » dans ce cas.

C'est le genre d'erreur que ce document doit aussi aux CEO et au chef de
cabinet de ne pas cacher : la première correction d'un défaut d'honnêteté en
a introduit un second, verrouillé par un test qui le validait — la revue
Codex, appliquée deux fois plutôt qu'une, l'a trouvé avant la mise en
production. Troisième passage de revue Codex lancé après ce commit ; verdict
dans `handoffs/2026-09-12-1630-codex-altimetrie.md`.

## Pourquoi la même PR (#313)

La mission demande de dire lequel et pourquoi. Cette tâche part de la branche
`feat/recgTL2LqMYAZf0mB-optim-paris-lyon` (HEAD `978e685`), qui est déjà celle
de la PR #313, ouverte sur `staging` et non fusionnée (statut Bloqué côté
Airtable). Les commits de cette tâche s'ajoutent donc à la même branche : ils
**complètent la PR #313** plutôt que d'en ouvrir une seconde — il n'y a pas de
divergence à rebaser, la branche n'a pas bougé sous cette tâche (vérifié :
aucune autre session n'écrit dans ce worktree, contrairement à
`C:/Dev/infonovice-maps-pro`). Une seconde PR aurait dupliqué la revue Codex
déjà en cours sur #313 sans raison.
