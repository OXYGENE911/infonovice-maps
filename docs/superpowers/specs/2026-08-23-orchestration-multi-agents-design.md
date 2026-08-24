# Conception — Orchestration multi-agents : Claude, Codex, Gemini

**Date :** 23/08/2026
**Décidé par :** Armelin
**Statut :** validé en conception, non éprouvé

---

## 1. Ce que ce document décide

Comment trois agents — Claude Code, Codex CLI et Gemini CLI — travaillent
ensemble sur Infonovice Maps, qui fait quoi, et à quelles conditions on
peut dire qu'un travail a été contesté.

Ce document ne décide **pas** : la question de la souveraineté de
l'hébergement (GitHub/Cloudflare, CLOUD Act), le routage automatique par
coût, le tableau de bord temps réel, ni l'autonomie commerciale. Ce sont
quatre chantiers distincts, chacun avec son propre cycle.

---

## 2. Le problème

La PR #16 a établi la valeur des revues adverses : trois passes
successives ont trouvé 17, puis 11, puis 10 défauts — dont plusieurs
**dans les correctifs de la passe précédente**. La morale consignée à
l'époque : « corriger un défaut est un changement comme un autre, il se
relit avec la même sévérité ».

Ces trois passes ont été menées à la main. La question est de savoir si
un second et un troisième agent peuvent en tenir le rôle, et à quel prix.

---

## 3. Les rôles

Principe structurant : **un seul agent écrit**.

| Agent | Mandat | Capacité | Interdit |
|---|---|---|---|
| **Gemini** | Contester le **plan**, avant qu'une ligne de code existe | `--approval-mode plan` — lecture seule | N'a pas les outils d'écriture |
| **Claude** | Concevoir, implémenter, tester, documenter | Écriture complète | Ne valide jamais seul son propre diff |
| **Codex** | Contester le **diff**, une fois le code écrit | `sandbox: read-only` | N'a pas les outils d'écriture |

Les deux contradicteurs sont en lecture seule **par capacité, pas par
consigne** : un prompt se contourne, une capacité absente non.

Conséquence directe : aucun conflit de merge, aucun worktree séparé,
aucun risque qu'un agent mal briefé committe du code violant les
contraintes du projet. C'est ce qui rend ce montage peu coûteux.

**Réserve ouverte :** la garantie de lecture seule côté Gemini n'est pas
encore acquise — voir §8, blocage ②.

---

## 4. Le cycle d'une PR

```
   ROADMAP → Claude annonce le plan
                 │
                 ▼
   ①  GEMINI conteste le PLAN            (lecture seule, 1 appel)
                 │
                 ▼
      révision ──► livraison : plan + objections BRUTES + réponses
                 │
                 ▼
   ②  ACCORD D'ARMELIN                    ← garde-fou existant de CLAUDE.md
                 │
                 ▼
      code + tests (TDD)
                 │
                 ▼
   ③  CODEX conteste le DIFF — ronde 1
      correctifs
   ④  CODEX conteste LES CORRECTIFS — ronde 2
      (deux rondes par défaut ; une troisième seulement si la ronde 2
       trouve encore un constat « bloquant », et sur accord d'Armelin)
                 │
                 ▼
      livraison : diff + constats bruts + réponses, désaccords compris
                 │
                 ▼
   ⑤  CI verte → PR → merge par Armelin
```

Trois propriétés voulues :

- **Ça s'ajoute au workflow existant**, ça ne le remplace pas. Les cinq
  étapes de `CLAUDE.md` demeurent ; la CI reste l'arbitre final.
- **Les deux contradicteurs ne se parlent pas.** Des agents qui
  conversent se ratifient. Ici l'échange est médié par des artefacts —
  le plan, puis le diff — donc auditable et tracé.
- **Amont sans plafond, aval plafonné.** Une objection sur le plan coûte
  un paragraphe ; la même sur le diff coûte du code. Le plus cher des
  deux contradicteurs passe en dernier et sous plafond.

---

## 5. Les consignes : une source unique

Trois fichiers de consignes quasi identiques dériveraient. Séparation
entre le commun et le propre à chaque rôle :

| Fichier | Contenu | Taille |
|---|---|---|
| `CLAUDE.md` | **Canonique.** Contexte, contraintes absolues, stack, API, résilience, workflow Git, qualité. Seule source à maintenir. | inchangé |
| `AGENTS.md` | Pointeur → `CLAUDE.md` + mandat de Codex (contester le diff, lecture seule, format de sortie) | 37 lignes |
| `GEMINI.md` | Pointeur → `CLAUDE.md` + mandat de Gemini (contester le plan, lecture seule, format de sortie) | 38 lignes |

Chaque fichier ne contient que ce qui lui est irréductiblement propre :
rien à synchroniser, donc rien qui dérive. Les mandats vivent là où la
convention de chaque outil les cherche, et deviennent versionnés et
relisibles — une consigne de revue façonne le produit, elle mérite le
traitement du `ci.yml`.

**Alternative écartée :** un `docs/CONTRAINTES.md` neutre vers lequel les
trois pointeraient. Plus élégant sur le principe, mais impose à Claude un
saut de lecture supplémentaire à chaque session, pour un gain nul.

---

## 6. Les formes d'appel

**Gemini — amont, contestation du plan :**

```bash
gemini --approval-mode plan -o json -p "<mandat + plan à contester>"
```

Sortie JSON exploitable. Un appel, sans reprise de contexte : passe
unique sur un texte.

**Codex — aval, contestation du diff**, via MCP (portée `user`,
enregistré le 22/08) :

```
mcp__codex__codex        { prompt, cwd, sandbox: "read-only",
                           approval-policy: "never" }
   → { threadId, content }
mcp__codex__codex-reply  { threadId, prompt: "voici les correctifs,
                           relis-les" }
```

`codex-reply` est ce qui rend les rondes adverses réelles : **la ronde 2
se souvient de la ronde 1**. Elle ne redécouvre pas le code, elle juge ce
qui a été fait de ses objections. Gemini n'a pas d'équivalent — raison de
plus pour lui confier l'amont, où une passe unique suffit.

**Asymétrie assumée :** Codex expose nativement `codex mcp-server` ;
Gemini ne s'expose pas en serveur MCP (`gemini mcp` ne fait que
*consommer*). Un appel MCP revient typé dans le fil ; un `gemini -p` est
un processus dont on ne récupère que la sortie standard.

**Coût pour le dépôt :** deux fichiers de documentation et un fichier de
test (`tests/consignes-agents.test.ts`, le garde-fou anti-dérive du §5).
Zéro dépendance, zéro ligne de code applicative, zéro octet de bundle. Ni
le budget des 300 Ko ni la contrainte 0 € ne sont entamés.

---

## 7. Le protocole d'échange

Un constat qui n'expose pas comment il casse est une opinion. Structure
imposée aux deux contradicteurs, rapportée telle quelle à Armelin :

| Champ | Rôle |
|---|---|
| **Gravité** | bloquant · sérieux · mineur |
| **Où** | `fichier:ligne` pour un diff, section pour un plan |
| **Le constat** | une phrase, l'affirmation seule |
| **Le scénario d'échec** | entrées concrètes → comportement faux. **Sans lui, le constat est rejeté d'office.** |
| **La réponse de Claude** | accepté / contesté, et pourquoi |

Le scénario d'échec est le garde-fou anti-baratin : traduction directe de
la morale de la PR #16 — ce qui n'est pas mesuré sur des données réelles
ne compte pas.

La dernière ligne est la contrepartie d'un choix assumé. Armelin a
décidé que Claude convoque lui-même les contradicteurs (§10) ; la revue y
perd son indépendance. La compensation : **un constat rejeté reste
affiché**, avec l'argument à côté. Armelin peut donner tort à Claude.

---

## 8. Dégradation

| Gemini | Codex | Comportement |
|:---:|:---:|---|
| ✔ | ✔ | **Nominal.** Gemini l'amont, Codex l'aval. |
| ✔ | ✘ | Gemini prend aussi l'aval, mandat réécrit. Dégradé : sans fil de conversation, les rondes ne s'enchaînent pas — le diff et les objections précédentes doivent être recollés à la main. |
| ✘ | ✔ | Codex prend l'amont en plus de l'aval, en `sandbox: read-only`. |
| ✘ | ✘ | Claude le dit et s'arrête à l'auto-revue. **Un travail n'est jamais présenté comme contesté s'il ne l'a pas été.** |

Cette dernière ligne n'est pas une politesse : le jour où les deux quotas
tombent ensemble, la tentation d'écrire « revu » et de passer est
exactement ce qui vide la méthode.

### Blocages ouverts au 23/08/2026

- **① Gemini non authentifié.** `Please set an Auth method`. Action
  interactive d'Armelin : `gemini` puis « Login with Google » (compte
  Pro). La moitié amont est bloquée jusque-là.
- **② Mode lecture seule non garanti.** Message capté :
  `Approval mode overridden to "default" because the current folder is
  not trusted`. La garantie structurelle du §3 est conditionnelle à la
  confiance accordée au dossier. À revérifier après authentification ;
  si elle ne tient pas, le §3 doit être révisé, pas maquillé.
- **③ Quota Codex épuisé jusqu'au 29/08/2026.** La moitié aval est
  inéprouvable avant cette date.
- **④ Outils MCP indisponibles avant redémarrage de session.**

---

## 9. Comment la méthode sera éprouvée

1. **Armelin** — authentifier Gemini
2. **Claude** — revérifier la tenue de `--approval-mode plan` ; réviser
   le §3 si elle ne tient pas
3. **Claude** — écrire `GEMINI.md`, réécrire `AGENTS.md`
4. **Épreuve à l'aveugle** — se placer sur le commit *antérieur* aux
   correctifs d'une PR dont les défauts sont connus, en soustrayant
   `docs/ROADMAP.md` et `docs/CHANGELOG.md` de ce que l'agent peut lire.
   Comparer ses constats à la vérité terrain.
5. **Après le 29/08** — même épreuve côté Codex, sur un diff connu
6. **Première PR réelle** en méthode complète

**Pourquoi la soustraction à l'étape 4 :** `docs/ROADMAP.md` énumère les
défauts trouvés sur la PR #16 — le frein anti-rafale mort trente
secondes, les onze véhicules effacés, les 64 % perdus au Havre. Un agent
qui lit ce fichier récite la réponse. Sans cette précaution, on mesure sa
lecture, pas sa perspicacité.

**Critère de succès, fixé d'avance pour ne pas être ajusté après coup :**
l'étape 4 produit un chiffre — *n* défauts réels retrouvés sur *N*
connus, plus le nombre de constats inventés (sans scénario d'échec
tenable).

- *n/N* ≥ 1/3 → la méthode est retenue
- *n/N* < 1/3 → elle est retenue en amont seulement, où elle coûte peu
- *n* = 0, ou plus de constats inventés que de réels → elle est abandonnée

On le saura avant d'avoir bâti dessus.

---

## 10. Décisions prises, et ce qu'elles coûtent

| Décision | Alternative écartée | Ce que ça coûte |
|---|---|---|
| Rôles adverses distincts (Gemini amont / Codex aval) | Un rôle unique tenu indifféremment par l'un ou l'autre | Bascule dégradée plutôt que triviale |
| Contradiction en amont + rondes bornées en aval | Une passe unique en fin de PR ; ou rondes illimitées | Plafond arbitraire, franchissable sur accord |
| Claude convoque les contradicteurs | Armelin les lance lui-même depuis son terminal | **L'indépendance de la revue.** Compensé par le rapport brut (§7) |
| Aucune image générée | Illustrations produites par modèle | Ergonomie limitée au CSS et au SVG écrit à la main |
| Rôles assignés selon les outils exposés | Assignation selon une supériorité mesurée des modèles | Aucune mesure ne fonde l'assignation ; c'est un paramètre, pas une fondation |
| `AGENTS.md` porte le mandat de lecture seule sans condition, alors que la convention `AGENTS.md` est lue par bien d'autres outils que Codex | Un fichier de mandat propre à Codex, distinct de la convention `AGENTS.md` | Tout agent tiers qu'un contributeur brancherait en écriture sur ce dépôt public lira le même mandat de relecteur — effet voulu (« un seul agent écrit »), assumé ici plutôt que subi comme un accident du nom de fichier |

**Sur l'absence d'images :** décidé le 23/08. La PR #21 s'interdit tout
« binaire opaque au dépôt » — une illustration produite par un modèle est
exactement cela : non reproductible, non auditable, dans un dépôt public
qui vend la transparence. Gemini sort donc du circuit produit ; il ne
reste que contradicteur.

---

## 11. Limites connues

- **Les angles morts corrélés traversent les trois passes.** Une API
  française mal comprise ou une contrainte d'accessibilité qu'aucun des
  trois ne connaît ne sera pas détectée.
- **La contradiction ne remplace pas la mesure de terrain.** Ce sont 44
  flux et 416 véhicules réels qui ont corrigé la PR #16. Aucun
  contradicteur n'aurait deviné que Brest publie `timestamp: 0`.
- **Chaque PR consomme du quota** sur des abonnements grand public
  (ChatGPT Plus, Gemini Pro, Claude Max) utilisés aussi à d'autres fins.
  Adosser un plan de charge permanent à ces abonnements frotte avec
  leurs conditions d'usage.
