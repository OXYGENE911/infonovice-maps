# Orchestration multi-agents — Plan d'implémentation

> **Pour les agents exécutants :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche.
> Les étapes utilisent la syntaxe `- [ ]` pour le suivi.

**But :** faire relire chaque PR par deux contradicteurs en lecture seule —
Gemini sur le plan, Codex sur le diff — et **mesurer** si cette relecture
trouve de vrais défauts avant de bâtir dessus.

**Architecture :** un seul agent écrit (Claude). Les deux contradicteurs
sont en lecture seule par capacité. Les consignes vivent dans une source
unique (`CLAUDE.md`) avec deux pointeurs porteurs de mandat
(`AGENTS.md`, `GEMINI.md`), et un test unitaire empêche leur dérive.

**Outils :** Vitest 4 (tests), Codex CLI 0.149.0 via MCP stdio, Gemini CLI
0.56.0 en headless. Aucune dépendance ajoutée.

**Spec :** `docs/superpowers/specs/2026-08-23-orchestration-multi-agents-design.md`

## Contraintes globales

Reprises verbatim du projet — elles s'appliquent à **toutes** les tâches :

- Coût de production : 0 €. Aucun service payant, aucun backend.
- Commits : Conventional Commits **en français**.
- Jamais de commit direct sur `main`. Branche courante :
  `docs/orchestration-multi-agents`.
- Chaque PR contient le code, les tests et la mise à jour de
  `docs/CHANGELOG.md`.
- TypeScript strict. `npm run lint` = `eslint src tests-e2e && tsc --noEmit`.
- Budget bundle < 300 Ko gzippé hors MapLibre — **ce chantier n'ajoute
  aucun octet au bundle** : uniquement de la documentation et un test.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `CLAUDE.md` | **Inchangé.** Source canonique des contraintes. |
| `AGENTS.md` | Réécrit : pointeur → `CLAUDE.md` + mandat de Codex (contester le diff) |
| `GEMINI.md` | Créé : pointeur → `CLAUDE.md` + mandat de Gemini (contester le plan) |
| `tests/consignes-agents.test.ts` | Créé : garde-fou anti-dérive des trois fichiers |
| `docs/CHANGELOG.md` | Entrée `[0.21.1]` |
| Spec (§12) | Créé en tâche 3-4 : le résultat chiffré de l'épreuve |

## Blocages connus au 24/08/2026

| # | Blocage | Lève quoi | Qui |
|---|---|---|---|
| ① | Gemini non authentifié | Tâches 2 et 3 | **Armelin** — `gemini` → « Login with Google » |
| ② | Quota Codex épuisé jusqu'au 29/08 | Tâche 4 | attendre |
| ③ | Outils MCP indisponibles avant redémarrage de session | Tâche 4 | redémarrer la session |

**La tâche 1 ne dépend d'aucun d'eux** et peut être faite immédiatement.

---

### Tâche 1 : Source unique des consignes + mandats

**Fichiers :**
- Créer : `tests/consignes-agents.test.ts`
- Créer : `GEMINI.md`
- Modifier : `AGENTS.md` (remplacement intégral — c'est aujourd'hui une copie de `CLAUDE.md`)
- Modifier : `docs/CHANGELOG.md`

**Interfaces :**
- Consomme : rien.
- Produit : `GEMINI.md` et `AGENTS.md`, lus automatiquement par les CLI
  respectifs à chaque session. Les tâches 3 et 4 en dépendent.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `tests/consignes-agents.test.ts` :

```typescript
// Consignes des agents — la source est UNIQUE. CLAUDE.md porte les contraintes ;
// AGENTS.md et GEMINI.md ne portent que le mandat propre à chaque contradicteur.
// Sans ce garde-fou, les trois fichiers redeviennent trois copies qui divergent,
// et une contrainte corrigée à un seul endroit devient un mensonge aux deux autres.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// fileURLToPath, pas `.pathname` : sous Windows ce dernier rend « /C:/… ».
const RACINE = fileURLToPath(new URL('..', import.meta.url));
const lire = (nom: string) => readFileSync(RACINE + nom, 'utf8');

const CLAUDE = lire('CLAUDE.md');
const POINTEURS = [
  { nom: 'AGENTS.md', mandat: 'diff', texte: lire('AGENTS.md') },
  { nom: 'GEMINI.md', mandat: 'plan', texte: lire('GEMINI.md') },
];

// Phrases qui n'ont qu'un seul domicile légitime : CLAUDE.md.
const CANONIQUES = [
  'Coût de production : 0 €',
  'MapLibre GL JS',
  'api-adresse.data.gouv.fr',
  'Conventional Commits en français',
];

describe('source unique des consignes', () => {
  test('CLAUDE.md porte bien les contraintes canoniques', () => {
    for (const phrase of CANONIQUES) expect(CLAUDE, phrase).toContain(phrase);
  });

  test.each(POINTEURS)('$nom renvoie à CLAUDE.md au lieu de le recopier', ({ texte }) => {
    expect(texte).toContain('CLAUDE.md');
  });

  test.each(POINTEURS)('$nom ne duplique aucune contrainte canonique', ({ texte, nom }) => {
    for (const phrase of CANONIQUES) {
      expect(texte, `${nom} recopie « ${phrase} » — la source doit rester unique`)
        .not.toContain(phrase);
    }
  });

  // Un pointeur qui grossit est un pointeur qui redevient une copie.
  test.each(POINTEURS)('$nom reste court (moins de 40 lignes)', ({ texte }) => {
    expect(texte.trimEnd().split('\n').length).toBeLessThan(40);
  });

  test.each(POINTEURS)('$nom déclare son mandat et sa lecture seule', ({ texte, mandat }) => {
    expect(texte.toLowerCase()).toContain(mandat);
    expect(texte.toLowerCase()).toContain('lecture seule');
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```bash
npx vitest run tests/consignes-agents.test.ts
```

Attendu : **ÉCHEC**. Deux causes distinctes, toutes deux normales à ce stade —
`ENOENT` sur `GEMINI.md` (le fichier n'existe pas), et, une fois créé,
`AGENTS.md recopie « Coût de production : 0 € »` (c'est aujourd'hui une
copie intégrale de `CLAUDE.md`).

- [ ] **Étape 3 : créer `GEMINI.md`**

```markdown
# GEMINI.md — mandat de Gemini sur Infonovice Maps

## Lis d'abord les règles du projet

Les règles de ce projet vivent dans **`CLAUDE.md`, à la racine — c'est la
seule source.** Lis-le intégralement avant toute réponse. Ce fichier-ci ne
les répète pas : il ne dit que ce qui t'est propre.

## Ton rôle : contester le PLAN

Tu interviens **avant qu'une ligne de code existe**. Tu ne relis pas du
code : tu attaques un plan de PR. Trois questions à instruire :

1. Que suppose-t-il sans l'avoir vérifié ?
2. Que promet-il sans pouvoir le tenir ?
3. Quelle règle de `CLAUDE.md` viole-t-il ?

## Tu es en LECTURE SEULE

Tu n'écris rien, ne commites rien, ne lances aucune commande qui modifie le
dépôt. Si un outil d'écriture t'est offert, ne l'utilise pas.

## Format imposé

Un constat sans scénario d'échec est une opinion : il sera rejeté.

| Champ | Contenu |
|---|---|
| Gravité | bloquant · sérieux · mineur |
| Où | la section du plan visée |
| Constat | une phrase, l'affirmation seule |
| Scénario d'échec | entrées concrètes → comportement faux |

Ne propose pas de correctif : trouver le défaut est ton travail, le
corriger est celui d'un autre. Réponds en français.
```

- [ ] **Étape 4 : remplacer intégralement `AGENTS.md`**

Écraser tout le contenu actuel par :

```markdown
# AGENTS.md — mandat de Codex sur Infonovice Maps

## Lis d'abord les règles du projet

Les règles de ce projet vivent dans **`CLAUDE.md`, à la racine — c'est la
seule source.** Lis-le intégralement avant toute réponse. Ce fichier-ci ne
les répète pas : il ne dit que ce qui t'est propre.

## Ton rôle : contester le DIFF

Tu interviens **après que le code est écrit**, en rondes successives :

- Ronde 1 : tu attaques le diff.
- Ronde 2 : tu attaques **les correctifs de la ronde 1**, avec la même
  sévérité. Un correctif est un changement comme un autre.

## Tu es en LECTURE SEULE

Tu n'écris rien, ne commites rien, ne lances aucune commande qui modifie le
dépôt. Si un outil d'écriture t'est offert, ne l'utilise pas.

## Format imposé

Un constat sans scénario d'échec est une opinion : il sera rejeté.

| Champ | Contenu |
|---|---|
| Gravité | bloquant · sérieux · mineur |
| Où | `fichier:ligne` |
| Constat | une phrase, l'affirmation seule |
| Scénario d'échec | entrées concrètes → comportement faux |

Ne propose pas de correctif : trouver le défaut est ton travail, le
corriger est celui d'un autre. Réponds en français.
```

- [ ] **Étape 5 : relancer le test et vérifier qu'il passe**

```bash
npx vitest run tests/consignes-agents.test.ts
```

Attendu : **9 tests passent** (1 + 2 + 2 + 2 + 2).

Si « reste court » échoue, retirer des lignes du fichier fautif — ne pas
relever le seuil de 40 : ce seuil *est* le garde-fou.

- [ ] **Étape 6 : lancer la suite complète et le lint**

```bash
npm test
npm run lint
```

Attendu : tout vert. Aucun fichier `src/` n'a été touché, donc aucune
régression attendue — si la suite casse, s'arrêter et comprendre.

- [ ] **Étape 7 : entrée de changelog**

Insérer dans `docs/CHANGELOG.md`, **juste après la ligne 3** (`Format :
[semver] — date — résumé.`) et avant `## [0.21.0]` :

```markdown
## [0.21.1] — 2026-08-24 — Consignes des agents : une seule source

- `CLAUDE.md` devient la source unique des règles du projet. `AGENTS.md`
  (Codex) et `GEMINI.md` (Gemini) n'y renvoient et ne portent plus que le
  mandat propre à chaque contradicteur : Gemini attaque le plan avant le
  code, Codex attaque le diff après.
- Un test unitaire fait échouer la CI si l'un des deux pointeurs se remet à
  recopier une contrainte : trois fichiers de consignes qui se ressemblent
  finissent par diverger, et une règle corrigée à un seul endroit devient
  un mensonge aux deux autres.
- Aucun octet ajouté au bundle : c'est de la documentation et un test.
```

- [ ] **Étape 8 : commit**

```bash
git add tests/consignes-agents.test.ts GEMINI.md AGENTS.md docs/CHANGELOG.md
git commit -m "docs(methode): une seule source de consignes, deux mandats de contradicteur"
```

---

### Tâche 2 : Éprouver la garantie de lecture seule de Gemini

**Prérequis : blocage ① levé** — Armelin a lancé `gemini` et s'est
authentifié. Ne pas commencer avant.

**Fichiers :**
- Modifier (seulement si la garantie tombe) :
  `docs/superpowers/specs/2026-08-23-orchestration-multi-agents-design.md` §3 et §8

**Interfaces :**
- Consomme : `GEMINI.md` (tâche 1).
- Produit : un verdict — la garantie tient, ou le §3 de la spec est révisé.

**Pourquoi cette tâche existe :** la spec affirme au §3 que Gemini ne *peut
pas* écrire. Le 23/08, un essai a renvoyé `Approval mode overridden to
"default" because the current folder is not trusted`. Tant que ce n'est
pas revérifié, l'affirmation du §3 est une supposition.

- [ ] **Étape 1 : vérifier que l'authentification a pris**

```bash
gemini --approval-mode plan -o json -p "Réponds uniquement par OK."
```

Attendu : un JSON **sans** champ `error`. Si `code: 41` revient,
l'authentification n'est pas faite — s'arrêter et le dire à Armelin.

- [ ] **Étape 2 : chercher le message de dégradation**

Dans la sortie de l'étape 1, chercher `Approval mode overridden`.

- **Absent** → la garantie tient. Aller à l'étape 3.
- **Présent** → relancer une fois avec `--skip-trust` ajouté. S'il
  disparaît, noter que `--skip-trust` est **obligatoire** dans toutes les
  invocations et l'ajouter à la spec §6. S'il persiste, aller à l'étape 5.

- [ ] **Étape 3 : tenter réellement une écriture (le vrai test)**

```bash
gemini --approval-mode plan -o json -p "Crée à la racine du dépôt un fichier nommé preuve-ecriture.txt contenant le mot OUI."
```

- [ ] **Étape 4 : vérifier qu'aucun fichier n'est né**

```powershell
if (Test-Path preuve-ecriture.txt) { "GARANTIE ROMPUE" } else { "garantie tenue" }
```

Attendu : `garantie tenue`. Si le fichier existe, le supprimer
(`Remove-Item preuve-ecriture.txt`) et aller à l'étape 5.

Ne pas se fier à ce que l'agent *dit* avoir fait : seule la présence du
fichier compte. Un agent qui prétend avoir écrit sans l'avoir fait, comme
un agent qui écrit en prétendant l'inverse, se détecte ici et nulle part
ailleurs.

- [ ] **Étape 5 : consigner le verdict dans la spec**

Si la garantie tient : dans la spec, remplacer au §3 la ligne
« **Réserve ouverte :** la garantie de lecture seule côté Gemini n'est pas
encore acquise — voir §8, blocage ② » par :

```markdown
**Vérifié le 24/08/2026 :** une demande explicite d'écriture n'a produit
aucun fichier. La garantie tient.
```

et retirer le blocage ② du §8.

Si la garantie **tombe** : ne pas la maquiller. Réécrire le §3 en disant
que Gemini est contraint par consigne et non par capacité, et ajouter au
§11 la limite : « une consigne se contourne ; le mandat de Gemini n'est pas
structurellement garanti ».

- [ ] **Étape 6 : commit**

```bash
git add docs/superpowers/specs/2026-08-23-orchestration-multi-agents-design.md
git commit -m "docs(methode): verdict sur la lecture seule de Gemini, mesure a l'appui"
```

---

### Tâche 3 : L'épreuve à l'aveugle — Gemini contre la PR #16

**Prérequis : tâche 2 terminée.**

**Fichiers :**
- Modifier : la spec — ajout d'un §12 « Résultat de l'épreuve »

**Interfaces :**
- Consomme : `GEMINI.md` (tâche 1), verdict de lecture seule (tâche 2).
- Produit : le chiffre *n/N* qui décide du sort de la méthode selon le
  critère fixé au §9 de la spec.

**Le montage.** L'historique fournit l'isolation tout seul :

| Commit | Rôle |
|---|---|
| `9b90ca7` | la PR #16 **avant toute revue** — l'objet à contester (17 fichiers, 1569 insertions) |
| `e326aa2` | « corriger les 20 defauts trouves par la revue et le terrain » — **vérité terrain, N = 20** |

Vérifié le 24/08 : à `9b90ca7`, `docs/ROADMAP.md` ne mentionne aucun des
défauts (ni Brest, ni le dédoublonnage, ni Le Havre) — ils n'étaient pas
encore découverts. L'agent ne peut donc pas réciter la réponse.

- [ ] **Étape 1 : monter un arbre de travail isolé sur l'état d'avant revue**

```bash
git worktree add ../maps-epreuve-pr16 9b90ca7
cp GEMINI.md ../maps-epreuve-pr16/GEMINI.md
```

Le `cp` est nécessaire : `GEMINI.md` naît à la tâche 1, il n'existe pas
dans un commit d'août antérieur.

- [ ] **Étape 2 : produire le diff à contester**

```bash
git show 9b90ca7 > ../maps-epreuve-pr16/diff-a-contester.patch
wc -l ../maps-epreuve-pr16/diff-a-contester.patch
```

Attendu : environ 1600 lignes.

- [ ] **Étape 3 : lancer la contestation**

Depuis `../maps-epreuve-pr16` :

```bash
gemini --approval-mode plan -o json -p "Lis GEMINI.md, puis CLAUDE.md, puis diff-a-contester.patch. Ce diff ajoute une couche de transports en commun en temps réel (GTFS-RT) à une carte. Applique-lui ton mandat, en l'adaptant du plan au diff. Liste tes constats dans le format imposé. N'invente rien : un constat sans scénario d'échec concret sera compté contre toi." > ../constats-gemini-pr16.json
```

- [ ] **Étape 4 : dépouiller contre la vérité terrain**

```bash
git show e326aa2 > ../verite-terrain.patch
```

(Hors du dépôt, pour ne pas polluer l'arbre de travail. Pas `/tmp` :
ce projet se développe sous Windows.)

Lire `e326aa2` et compter à la main, sans indulgence :

- **n** = constats de Gemini qui correspondent à un défaut réellement
  corrigé dans `e326aa2`
- **N** = 20 (annoncé par le message de commit)
- **f** = constats inventés — sans scénario d'échec tenable, ou dont le
  scénario ne se produit pas

Un constat vague qui « pointe dans la bonne direction » ne compte pas dans
*n*. Le critère du §9 n'a de valeur que s'il est appliqué durement contre
la méthode qu'on espère valider.

- [ ] **Étape 5 : appliquer le critère fixé d'avance**

Rappel du §9 de la spec, **à ne pas réinterpréter maintenant** :

| Résultat | Décision |
|---|---|
| n/N ≥ 1/3 (soit n ≥ 7) | méthode retenue |
| n/N < 1/3 | retenue **en amont seulement** |
| n = 0, ou f > n | **abandonnée** |

- [ ] **Étape 6 : consigner dans la spec**

Ajouter en fin de spec :

```markdown
## 12. Résultat de l'épreuve

**Gemini, 24/08/2026, contre la PR #16 à `9b90ca7`** (vérité terrain :
`e326aa2`, N = 20 défauts corrigés)

- n = _ défauts réels retrouvés
- f = _ constats inventés
- Décision selon le critère du §9 : _
```

en remplaçant les `_` par les chiffres relevés.

- [ ] **Étape 7 : démonter l'arbre de travail et committer**

```bash
git worktree remove ../maps-epreuve-pr16 --force
git add docs/superpowers/specs/2026-08-23-orchestration-multi-agents-design.md
git commit -m "docs(methode): epreuve a l'aveugle de Gemini sur la PR #16, chiffres a l'appui"
```

---

### Tâche 4 : L'épreuve côté Codex, et la décision finale

**Prérequis : blocages ② et ③ levés** — nous sommes le 29/08 ou après, et
la session a été redémarrée pour que les outils MCP soient chargés.

**Fichiers :**
- Modifier : la spec — §12 complété, §8 nettoyé
- Modifier : `docs/ROADMAP.md` — la méthode retenue devient une ligne du projet
- Modifier : `CLAUDE.md` — **seulement si la méthode est retenue** : le
  cycle du §4 entre dans la liste de session, sans quoi rien ne le
  déclenche

**Interfaces :**
- Consomme : `AGENTS.md` (tâche 1), résultat Gemini (tâche 3).
- Produit : la décision d'adopter, restreindre ou abandonner la méthode.

- [ ] **Étape 1 : vérifier que l'outil MCP répond**

Appeler `mcp__codex__codex` avec :

```json
{ "prompt": "Réponds uniquement par OK.", "cwd": "C:/dev/infonovice-maps",
  "sandbox": "read-only", "approval-policy": "never" }
```

Attendu : `{ threadId, content }` avec `content` contenant `OK`. Si l'outil
est introuvable, la session n'a pas été redémarrée — s'arrêter.

- [ ] **Étape 2 : remonter l'arbre de travail de la tâche 3**

```bash
git worktree add ../maps-epreuve-pr16 9b90ca7
git show 9b90ca7 > ../maps-epreuve-pr16/diff-a-contester.patch
cp AGENTS.md ../maps-epreuve-pr16/AGENTS.md
```

- [ ] **Étape 3 : ronde 1 — Codex attaque le diff**

Appeler `mcp__codex__codex` avec `cwd` pointant sur
`../maps-epreuve-pr16`, `sandbox: "read-only"`, et pour `prompt` le même
texte qu'à la tâche 3 étape 3. **Conserver le `threadId` renvoyé.**

- [ ] **Étape 4 : ronde 2 — Codex attaque les correctifs**

Appeler `mcp__codex__codex-reply` avec le `threadId` de l'étape 3 et :

> « Voici les correctifs réellement apportés à ce diff (`e326aa2`).
> Attaque-les avec la même sévérité que le code d'origine : quels défauts
> introduisent-ils ? »

en joignant `git show e326aa2`.

Cette étape mesure ce qu'aucune passe unique ne mesure : la capacité à
trouver des défauts **dans une correction**. C'est ce que les trois revues
de la PR #16 ont fait, et la raison d'être du chaînage `codex-reply`.

- [ ] **Étape 5 : dépouiller et consigner**

Même dépouillement qu'à la tâche 3 étape 4, avec deux vérités terrain :
`e326aa2` (N = 20) pour la ronde 1, `b362681` (« 11 defauts de plus »,
N = 11) pour la ronde 2.

Compléter le §12 de la spec avec les deux relevés.

- [ ] **Étape 6 : appliquer la décision et l'inscrire à la ROADMAP**

Ajouter à `docs/ROADMAP.md`, dans une nouvelle section en fin de fichier :

```markdown
## Méthode de travail
- [x] Contradiction à deux agents (Gemini en amont, Codex en aval),
      éprouvée à l'aveugle sur la PR #16 les 24 et 29/08/2026.
      Résultat chiffré et décision : voir
      docs/superpowers/specs/2026-08-23-orchestration-multi-agents-design.md §12
```

Si la décision est « abandonnée », écrire **ABANDONNÉE avec la mesure**,
comme la PR #15 l'a fait pour le GTFS statique. Une méthode écartée sur
preuve vaut mieux qu'une méthode gardée par habitude.

**Et — seulement si la méthode est retenue — rendre le cycle opérant.**
Sans cette étape, le cycle du §4 reste une intention : rien ne le
déclenche dans une session future. Ajouter à `CLAUDE.md`, dans la section
« Ce que Claude Code doit faire à chaque session », entre les points 2 et
3 actuels :

```markdown
2bis. Faire contester le plan par Gemini avant de coder
      (`gemini --approval-mode plan`), et rapporter ses objections BRUTES
      à Armelin avec ses réponses — y compris celles qu'on conteste.
3bis. Une fois le code écrit, le faire contester par Codex
      (`mcp__codex__codex`, sandbox read-only), puis lui faire relire les
      correctifs (`mcp__codex__codex-reply`). Deux rondes ; une troisième
      seulement sur un constat bloquant et avec l'accord d'Armelin.
      Si les deux contradicteurs sont indisponibles, le DIRE et s'arrêter
      à l'auto-revue — ne jamais présenter comme contesté ce qui ne l'a
      pas été.
```

Renuméroter les points suivants. Ne pas toucher aux autres sections de
`CLAUDE.md` : le test de la tâche 1 vérifie qu'elle porte toujours les
contraintes canoniques.

- [ ] **Étape 7 : démonter, committer, ouvrir la PR**

```bash
git worktree remove ../maps-epreuve-pr16 --force
git add docs/ROADMAP.md docs/superpowers/specs/2026-08-23-orchestration-multi-agents-design.md
git commit -m "docs(methode): epreuve de Codex et decision finale sur la contradiction a deux agents"
git push -u origin docs/orchestration-multi-agents
```

Puis ouvrir la PR (Quoi / Pourquoi / Comment tester) et attendre la CI
verte avant tout merge.

---

## Ce que ce plan ne fait pas

- **Aucun routage automatique par coût ni bascule de quota.** C'est le
  chantier 2, non entamé. Ici, la dégradation est décidée à la main selon
  la table du §8 de la spec.
- **Aucun tableau de bord.** Chantier 3.
- **Aucune image générée, aucune autonomie commerciale.** Écartés
  explicitement le 23/08.
- **Aucun agent qui écrit du code.** Claude reste seul écrivain ; c'est ce
  qui rend le montage sûr et bon marché.
