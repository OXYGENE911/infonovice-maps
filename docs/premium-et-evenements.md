# Premium, rallyes AFUVE et cortèges — cadrage avant décision

**Date :** 25/08/2026 · **Statut :** cadrage, rien n'est engagé

Armelin a décrit trois choses le 25/08 : un **niveau premium** avec compte,
des **événements AFUVE** (rallyes suivis en direct, statistiques, classement),
et des **cortèges entre amis** avec position partagée — le tout possiblement
adossé à `family.infonovice.fr`.

Ce document ne conçoit rien. Il sépare ce qui est trois projets distincts,
nomme ce que chacun exige, et pose les questions dont la réponse appartient à
Armelin. Il est écrit avant tout code, parce qu'une de ces décisions engage
juridiquement une personne physique.

---

## 1. Ce qui change, et ce qui ne change pas

La contrainte 1 disait : *« 0 €. Aucun service payant, aucun backend, aucune
BDD serveur. »* La décision d'Armelin du 25/08 la scinde en deux :

| | Gratuit | Premium |
|---|---|---|
| Coût d'infrastructure | **0 €, inchangé** | financé par l'abonnement |
| Données | IndexedDB local, export JSON | serveur |
| Ce qui doit rester vrai | « vos données ne quittent jamais ce navigateur » | une autre promesse, à écrire |

**Le point de vigilance principal :** la page « Vie privée » affirme
aujourd'hui, sans nuance, que rien ne sort du navigateur. Le jour où un
premium existe, cette phrase devient **fausse pour une partie des usagers** si
elle n'est pas réécrite. Ce n'est pas un détail de rédaction : c'est
l'argument de vente du produit, et une affirmation inexacte sur le traitement
de données personnelles est un manquement, pas une maladresse.

**Conséquence pratique :** le premier commit qui pose un backend doit aussi
réécrire la page « Vie privée ». Pas le suivant.

---

## 2. Trois projets, pas trois fonctionnalités

Ils partagent un besoin de serveur, et rien d'autre. Les mêler produirait un
cahier des charges que personne ne pourrait terminer.

### A — Premium « confort » : comptes, itinéraires sauvegardés, historique

Le moins risqué des trois, et de loin. Les données sont **les siennes, au
repos** : profil véhicule, itinéraires enregistrés, historique de recharge,
comparaison d'un trajet A avec un trajet B.

- **Exige :** authentification, base de données, hébergement
- **Sensibilité RGPD :** moyenne — des habitudes de déplacement restent des
  données personnelles, mais elles ne sont ni temps réel ni partagées
- **Réutilisable :** oui, c'est le socle des deux autres

### B — Événements AFUVE : rallyes suivis en direct

Le plus enthousiasmant, et le plus lourd. Le « 24 h en électrique » et les
rallyes 1000 km demandent : départ géorepéré, chronomètre déclenché à
l'éloignement, positions en continu, vitesse instantanée et moyenne, arrêts,
recharges, classement, et **signalement de panne avec position**.

- **Exige :** tout le socle A, plus un flux temps réel, plus **une application
  mobile** — un navigateur en arrière-plan n'émet pas de position de façon
  fiable, et sur iOS il s'arrête
- **Cette application mobile est la PHASE 2** du projet (Kotlin, dépôt
  séparé). `CLAUDE.md` interdit de mélanger les deux phases, et cette règle
  est bonne : elle empêche exactement le glissement qui menace ici
- **Sensibilité RGPD :** **élevée.** Position en continu de personnes
  identifiées, avec vitesse. C'est un traitement à part entière

### C — Cortèges entre amis

Techniquement proche de B, socialement différent : pas d'organisateur, pas de
classement, une durée courte, et un motif de sécurité explicite — savoir où
est celui qui ne répond plus.

- **Exige :** le socle A, le temps réel de B, et une notion d'**amis**
- **Sensibilité RGPD :** élevée, mais mieux cadrée — le partage est mutuel,
  volontaire, et limité dans le temps

---

## 3. Ce qu'il faut savoir avant, pas après

### 3.1 La position en direct est la donnée la plus sensible du RGPD

Savoir « qui est où, à quelle vitesse, en continu » n'est pas une
fonctionnalité comme une autre. Concrètement, cela demande :

- un **responsable de traitement** — ce sera INFONOVICE, donc Armelin en
  personne, en tant qu'auto-entrepreneur
- une **base légale** par usage : le consentement pour un cortège entre amis,
  probablement le contrat pour un rallye auquel on s'inscrit
- une **durée de conservation** écrite : les positions brutes d'un rallye
  n'ont aucune raison de survivre au classement
- une **information claire** des participants, y compris de ceux qui rejoignent
  un cortège sur invitation

Rien de tout cela n'est hors de portée. Mais c'est du travail à faire **avant**
la première ligne, pas après le premier incident.

**Une piste qui allège beaucoup :** ne conserver que les **agrégats** après
l'événement (distance, durée, moyennes, arrêts) et **détruire les traces
brutes**. Un classement n'a pas besoin de savoir où était la voiture à 14 h 32.

### 3.2 Le motif « sécurité » mérite d'être pris au sérieux, pas invoqué

Armelin cite le cas du participant inconscient après un accident. C'est le
meilleur argument du projet — et c'est précisément pour cela qu'il ne faut
pas le promettre à la légère : une fonctionnalité de secours à laquelle on se
fie et qui échoue est **pire que son absence**, parce qu'elle a remplacé un
réflexe. Un téléphone sans réseau dans un vallon n'émet rien.

Si cette promesse est faite, elle doit être bornée en toutes lettres, comme la
PR #15 a su écrire « abandonné, avec la mesure » plutôt que promettre des
horaires à moitié.

### 3.3 Un backend américain viderait l'argument du produit

Tout ce projet repose sur une phrase : données françaises, hébergement
maîtrisé, pas de dépendance extra-européenne. Poser la base de données chez un
fournisseur américain la contredirait plus sûrement que n'importe quel
tracker. **OVH — qu'Armelin possède déjà — répond exactement à ce besoin**, et
Scaleway est l'alternative.

À noter, pour être complet : `main` est aujourd'hui hébergé sur GitHub Pages,
donc chez Microsoft. C'est une dépendance existante et assumée (voir l'échange
du 24/08) ; elle ne porte aujourd'hui **aucune donnée personnelle**, puisqu'il
n'y en a pas. Un backend changerait cet équilibre.

### 3.4 L'adossement à Family Circle est probablement la bonne idée

Réutiliser les cercles de `family.infonovice.fr` évite de bâtir un second
système d'amis, et donne au cortège une notion de confiance déjà établie.

Trois questions à trancher avant, cependant :
- `family` a-t-il déjà **comptes et authentification** ? Si oui, `maps` s'y
  adosse au lieu d'en créer d'autres — un seul système d'identité
- Un cercle familial est-il le bon périmètre pour un **cortège de rallye** ?
  Les participants d'un 1000 km ne sont pas la famille
- Les deux dépôts sont publics : la frontière entre les deux doit être une
  **API**, pas un partage de base

---

## 4. Ordre proposé

| # | Chantier | Pourquoi à ce rang |
|---|---|---|
| 1 | **Décider le modèle** (§5) | Tout le reste en dépend, et rien ne se code avant |
| 2 | **Réécrire « Vie privée »** en deux régimes | Doit accompagner le premier octet de backend, jamais suivre |
| 3 | **Socle A : compte + itinéraires + historique** | Le moins risqué, réutilisé par B et C, et livrable seul |
| 4 | **C : cortèges** avant **B : rallyes** | Plus simple, plus court, meilleur terrain d'essai du temps réel — et il éprouve la brique la plus délicate sur un cercle restreint |
| 5 | **B : événements AFUVE** | Le plus lourd, et il dépend de l'app mobile de la phase 2 |

**Une remarque sur le rang 4 :** l'ordre naturel semblerait B avant C, puisque
l'AFUVE est le besoin réel. Mais un rallye est un événement daté qu'on ne peut
pas rater ; un cortège s'essaie un dimanche à trois voitures. Livrer d'abord ce
qui se répare sans conséquence.

---

## 5. Les décisions qui appartiennent à Armelin

1. **Le premium est-il payant, ou gratuit-avec-compte ?** S'il est payant, il
   y a facturation, TVA, et un service dû — un engagement d'une autre nature
   que du logiciel libre.
2. **Où vit le backend ?** OVH est la réponse cohérente avec le discours.
3. **Qui est responsable de traitement ?** Si c'est INFONOVICE, c'est Armelin
   personnellement, et cela mérite d'être dit à voix haute une fois.
4. **Les traces brutes sont-elles conservées, et combien de temps ?** Ma
   recommandation : agrégats gardés, traces détruites à la fin de l'événement.
5. **`family` porte-t-il déjà l'identité ?** Si oui, `maps` s'y adosse plutôt
   que d'ajouter un second compte.
6. **Le dépôt reste-t-il public ?** Un backend AGPL publie aussi son serveur.
   C'est tenable et cohérent, mais ce n'est plus la même exposition.

---

## 6. Ce qui reste vrai quoi qu'il arrive

Le mode gratuit doit continuer à fonctionner **entièrement sans compte**, en
local, avec son export JSON. Ce n'est pas une concession commerciale : c'est ce
qui distingue ce produit de celui qu'il concurrence. Un premium qui rend le
gratuit inutilisable ne serait pas un modèle économique, ce serait un
reniement.
