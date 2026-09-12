# Déploiement et domaines

Deux sites, deux chaînes, deux hébergeurs. Ce document dit **quoi va où**,
**comment revenir en arrière**, **comment distinguer l'un de l'autre** et
**quoi faire quand un déploiement échoue**. Le reste est du détail historique,
en fin de page.

---

## 1. Qu'est-ce qui se déploie où

| | Production | Prévisualisation |
|---|---|---|
| Branche | `main` | `staging` |
| Workflow | `.github/workflows/deploiement.yml` | `.github/workflows/previsualisation.yml` |
| Hébergeur | GitHub Pages (source « GitHub Actions ») | Cloudflare Pages, projet `infonovice-maps-previsualisation` |
| Domaine | https://maps.infonovice.fr/ | https://staging.maps.infonovice.fr/ |
| Construction | `npm run build` | `INFONOVICE_ENVIRONNEMENT=previsualisation npm run build` |
| Indexation | ouverte (`robots.txt` ouvert, sitemap) | refusée par trois filets — `Disallow: /`, en-tête `X-Robots-Tag: noindex`, balise `meta`. **Ce n'est pas une garantie absolue : voir la limite au §3.** |
| Qui pousse | le CEO seul fusionne `staging` → `main` | toute fusion de PR sur `staging` |

La production n'est **pas** touchée par la prévisualisation : autre branche,
autre construction, autre hébergeur, autre domaine, autre workflow. Modifier
`previsualisation.yml` ne peut pas déplacer une ligne de ce que sert
`maps.infonovice.fr`.

### Ce que fait exactement le workflow de prévisualisation

À chaque poussée sur `staging` (et à la demande, via *Run workflow*) :

1. `npm ci` sur Node 24, comme la CI ;
2. `npm run lint` puis `npm test` — une fusion sur `staging` n'est pas
   forcément identique aux PR qui l'ont formée ;
3. construction avec `INFONOVICE_ENVIRONNEMENT=previsualisation` ;
4. **la porte** : `node scripts/verifier-previsualisation.mjs dist` relit le
   dossier construit et exige, sur **chacune** des sept pages, le bandeau,
   l'attribut `data-environnement`, la balise `robots` et le titre préfixé —
   plus `robots.txt` fermé, `_headers` présent, `CNAME` et `sitemap.xml`
   absents. **Un `dist/` non conforme ne part pas** ;
5. envoi à Cloudflare Pages par `wrangler pages deploy` (téléversement direct :
   Cloudflare ne construit rien, il reçoit le dossier déjà bâti).

Tant que les secrets ne sont pas déposés, les étapes 1 à 4 tournent quand même
et le workflow **reste vert** en écrivant une note : la construction est
vérifiée, le déploiement attend les gestes du §4.

---

## 2. Comment distinguer la prévisualisation de la production

Sur la préversion, et **seulement** sur elle :

- un **liseré ambre** fait le tour de l'écran, avec la mention
  « **PRÉVISUALISATION — ce site n'est pas la production** » posée en bas au
  centre. Le liseré n'intercepte aucun clic (`pointer-events: none`) : il se
  voit, il ne gêne pas ;
- le **titre de l'onglet** commence par « PRÉVISUALISATION — » ; on le voit
  dans les onglets, les favoris et les captures d'écran d'un rapport de bogue ;
- l'application **installée** s'appelle « Infonovice Maps — PRÉVISUALISATION »,
  raccourci « Maps préviz » : deux icônes distinctes sur l'écran d'accueil d'un
  testeur qui installe les deux ;
- `<html data-environnement="previsualisation">` : le point d'ancrage des
  sondes et des parcours automatisés, stable même si l'habillage change.

Tout cela est posé **dans le HTML à la construction**, pas par du JavaScript :
c'est visible avant que le bundle se charge, et même s'il ne se charge pas.

**Ce que la préversion ne change pas** : les données restent les mêmes API
publiques françaises, et rien ne sort du navigateur — la règle RGPD du projet
vaut ici comme ailleurs. Un test sur la préversion est donc représentatif.

---

## 3. Pourquoi la préversion n'est pas indexée, et par trois moyens

Une URL de préversion qui remonte dans un moteur de recherche à trois semaines
du Mondial de l'Auto serait longue à réparer. Trois filets, parce qu'aucun ne
couvre seul tous les chemins :

1. **`robots.txt` : `Disallow: /`**, aucun `Allow`, aucun `Sitemap`. Respecté
   par un robot qui vient le lire.
2. **En-tête `X-Robots-Tag: noindex, nofollow, noarchive`**, posé par le
   fichier `_headers` de Cloudflare Pages sur le motif `/*`. Il s'applique
   **aussi** aux URL `*.pages.dev` de chaque déploiement, publiques elles
   aussi, et à une URL atteinte par un lien fuité sans passage par
   `robots.txt`.
3. **`<meta name="robots" content="noindex, nofollow, noarchive">`** dans
   chaque page : il suit la page si elle est copiée ou archivée ailleurs.

`CNAME` et `sitemap.xml` sont retirés du `dist/` de préversion : le premier
nomme le domaine de production, le second liste des URL de production.

### La limite de ces trois filets — à connaître, pas à ignorer

`Disallow: /` et `noindex` **se gênent l'un l'autre**, et Google le documente :
un robot qui n'a pas le droit d'**explorer** une URL ne lit ni sa balise
`robots` ni son en-tête `X-Robots-Tag`. Si un lien fuite, l'URL peut donc
apparaître comme un résultat **nu** — sans titre ni extrait, mais présente.

Nous gardons quand même les deux, et c'est un choix assumé : la consigne
demande les deux ; les robots qui ignorent `robots.txt` (ils existent) butent
alors sur l'en-tête ; et un résultat sans titre vaut mieux qu'une préversion
indexée en entier.

**Le vrai remède n'est pas un fichier, c'est une porte.** Voir le Geste 4,
facultatif, au §4 : il rend l'indexation matériellement impossible.

---

## 4. Les trois gestes du CEO — à faire dans cet ordre

Ces trois gestes sont en **liste rouge** (création de compte sur un service
tiers, DNS, secrets) : aucun agent ne les fait. Ils sont écrits ici prêts à
exécuter. **Aucune préversion n'existe tant que les trois ne sont pas faits.**

### Geste 1 — créer le projet Cloudflare Pages

Dans le compte Cloudflare qui héberge déjà la zone `infonovice.fr`.
Deux voies, au choix.

**En ligne de commande** (la plus sûre : la branche de production est fixée du
premier coup) :

```
npx wrangler@4.131.1 login
npx wrangler@4.131.1 pages project create infonovice-maps-previsualisation --production-branch=staging
```

**Ou par le tableau de bord** : *Workers & Pages* → *Create* → *Pages* →
*Upload assets*, nom exact `infonovice-maps-previsualisation`. Puis, dans les
réglages du projet, mettre la **branche de production** à `staging`.

- **Nom exact du projet** : `infonovice-maps-previsualisation`
  (il est écrit dans `previsualisation.yml`, variable `PROJET_PAGES` — le
  changer ici oblige à le changer là).
- **Branche de production : `staging`.** Ce point n'est pas décoratif : si la
  branche de production du projet est autre chose, chaque envoi devient un
  déploiement de *préversion Cloudflare*, et le domaine
  `staging.maps.infonovice.fr` continuera de servir le tout premier
  déploiement, indéfiniment. Le symptôme est une page qui ne bouge plus alors
  que le workflow est vert.
- **Si on oublie ce geste** : le workflow échoue à l'étape de déploiement avec
  « project not found ». Rien n'est cassé, rien n'est publié.

### Geste 2 — fabriquer le jeton d'API et le déposer dans les secrets du dépôt

**Le jeton doit être restreint. Pas de jeton global.** Un jeton global déposé
dans un dépôt **public** donnerait, en cas de fuite, la main sur le DNS de
`infonovice.fr` — donc sur `maps.infonovice.fr`, la production.

Dans Cloudflare, *My Profile* → *API Tokens* → *Create Token* → *Create Custom
Token* :

| Réglage | Valeur |
|---|---|
| Nom | `github-maps-previsualisation` |
| Permission | **Account · Cloudflare Pages · Edit** — celle-ci et aucune autre |
| Account Resources | *Include* → le seul compte Infonovice |
| Zone Resources | rien (le jeton n'a aucune raison de toucher au DNS) |
| TTL | une date de fin, par exemple le 31/12/2026 |

Puis, dans GitHub : *Settings* → *Secrets and variables* → *Actions* →
*New repository secret*. **Deux secrets, ces noms exactement** :

| Nom du secret | Valeur |
|---|---|
| `CLOUDFLARE_API_TOKEN` | le jeton fabriqué ci-dessus |
| `CLOUDFLARE_ACCOUNT_ID` | l'identifiant de compte, visible à droite de la page d'accueil du tableau de bord Cloudflare |

- **Si on oublie ce geste** : le workflow reste **vert** et écrit « Préversion
  construite, non déployée ». Rien n'est publié, rien ne rougit — c'est voulu.
- **Si un seul des deux secrets est posé** : même chose, la condition exige les
  deux.

### Geste 3 — poser l'enregistrement DNS et rattacher le domaine

**DNS = liste rouge.** Deux moitiés, et il faut les deux :

1. Dans le projet Pages : *Custom domains* → *Set up a custom domain* →
   `staging.maps.infonovice.fr`. Cloudflare indique alors l'enregistrement à
   créer.
2. Dans la zone `infonovice.fr` : enregistrement **CNAME**,
   nom `staging.maps`, cible `infonovice-maps-previsualisation.pages.dev`,
   **proxy orange activé** (contrairement au CNAME de la production, qui est
   en gris parce que GitHub Pages sert son propre certificat ; ici, c'est
   Cloudflare qui sert et qui a besoin d'être dans le chemin).

- **Si on oublie ce geste** : le déploiement fonctionne, mais l'URL utilisable
  est `https://infonovice-maps-previsualisation.pages.dev/` — la préversion est
  en ligne et testable, simplement pas sous le nom prévu. Cette URL est, elle
  aussi, couverte par les trois filets d'indexation.
- **Ce geste ne touche pas** l'enregistrement `maps` (production). Ne pas le
  modifier.

### Geste 4 — FACULTATIF, mais c'est le seul verrou qui ferme vraiment

Les trois filets du §3 demandent aux moteurs de ne pas indexer. Une **porte**,
elle, les en empêche. **Cloudflare Access** (Zero Trust, palier gratuit)
protège `staging.maps.infonovice.fr` derrière un code envoyé par courriel, à
une liste d'adresses : les quatre testeurs de l'AFUVE, le CEO. Un robot
n'entre pas ; un lien fuité ne mène nulle part.

**Attention, et c'est le piège** : protéger le seul domaine personnalisé ne
suffit pas. Le contenu reste servi par `infonovice-maps-previsualisation.pages.dev`
et par l'URL propre à chaque déploiement. Il faut donc couvrir **aussi** ces
adresses (une politique Access sur `*.pages.dev` du projet), sans quoi la porte
est posée à côté de l'entrée.

Ce qu'il en coûte : chaque testeur reçoit un code à la première visite, et
recommence quand la session expire. À arbitrer — un vrai testeur de terrain
n'aime pas les portes. **C'est une décision du CEO**, pas un geste que prend un
agent. Si elle est prise, elle s'applique dans Zero Trust → *Access* →
*Applications*, sur le seul domaine de préversion, et ne touche en rien
`maps.infonovice.fr`.

### Comment savoir que les gestes ont pris

Relancer le workflow sans commit : *Actions* → *Prévisualisation* → *Run
workflow* → branche `staging`. Le résumé du run affiche l'URL du déploiement.
Puis, depuis un terminal :

```
curl -sI https://staging.maps.infonovice.fr/ | grep -i x-robots-tag
curl -s  https://staging.maps.infonovice.fr/robots.txt
```

La première commande doit répondre `x-robots-tag: noindex, nofollow, noarchive`,
la seconde `Disallow: /`. Et la page, ouverte dans un navigateur, doit porter le
liseré ambre et un onglet qui commence par « PRÉVISUALISATION ».

---

## 5. Comment revenir en arrière

### Sur la prévisualisation

1. **Le plus rapide, sans toucher au dépôt** : tableau de bord Cloudflare →
   projet `infonovice-maps-previsualisation` → *Deployments* → le déploiement
   précédent → *Rollback to this deployment*. Le domaine bascule en quelques
   secondes.
2. **Par le dépôt, pour que le code et le site redisent la même chose** :
   `git revert <commit de fusion>` puis `git push origin staging`. Le workflow
   repart et republie l'état d'avant.

La préversion n'a pas d'usagers réels : un retour en arrière n'y coûte rien, et
la voie 1 est la bonne quand il faut simplement que le testeur puisse continuer.

### Sur la production

Inchangé : `git revert` sur `main`, poussé par le CEO. `deploiement.yml`
republie. GitHub Pages ne garde pas d'historique de déploiements sur lequel
revenir : **la branche est la seule source de vérité**.

---

## 6. Quand un déploiement échoue

Chercher dans cet ordre, du plus fréquent au plus rare.

| Ce qu'on voit | Cause probable | Geste |
|---|---|---|
| Workflow **vert**, note « Préversion construite, non déployée » | secrets absents | Geste 2 du §4 |
| Échec à **Lint** ou **Tests unitaires** | la fusion sur `staging` a cassé quelque chose que les PR isolées ne voyaient pas | corriger sur une branche, PR vers `staging` ; la préversion précédente reste en ligne |
| Échec à **Porte — la préversion se dit et ne s'indexe pas** | le marquage n'a pas été appliqué (variable d'environnement, plugin, ordre des transformations) | **ne pas contourner la porte.** Reproduire en local : `INFONOVICE_ENVIRONNEMENT=previsualisation npm run build` puis `node scripts/verifier-previsualisation.mjs`. Le script nomme chaque marque manquante |
| `Project not found` | le projet Pages n'existe pas, ou son nom diffère de `PROJET_PAGES` | Geste 1 du §4 |
| `Authentication error` (code 10000) | jeton expiré, révoqué, ou fabriqué sans la permission *Cloudflare Pages · Edit* | refaire le Geste 2 ; vérifier le TTL |
| Le déploiement réussit mais **la page ne change pas** | la branche de production du projet Pages n'est pas `staging` : les envois deviennent des préversions Cloudflare | réglages du projet → branche de production = `staging` |
| Le domaine répond `522` ou `404` Cloudflare | domaine personnalisé pas encore rattaché, ou CNAME absent | Geste 3 du §4 |
| Erreur de registre npm pendant `npm ci` | panne npmjs (déjà vue, cf. `ci.yml`) | relancer le workflow ; ce n'est pas une vulnérabilité |

**Règle générale** : un échec de déploiement de préversion **ne casse jamais la
production**, et laisse en ligne la préversion précédente. Il n'y a donc jamais
d'urgence à contourner une vérification.

---

## 7. Coût et fournisseur

- GitHub Actions : palier gratuit, dépôt public.
- Cloudflare Pages : palier gratuit. Cloudflare ne **construit** rien ici — le
  workflow envoie un dossier déjà bâti (téléversement direct) —, les limites du
  palier gratuit qui s'appliquent sont celles du site servi : 20 000 fichiers
  par site, 25 Mio par fichier, 100 règles dans `_headers`
  (developers.cloudflare.com/pages/platform/limits/, relevé le 13/09/2026).
- Cloudflare est une entreprise américaine. Ce n'est pas une dérogation
  nouvelle : la zone DNS de `infonovice.fr` y est déjà, et la contrainte 3 du
  `CLAUDE.md` dit depuis le 06/09/2026 ce que l'hébergement ne permet pas de
  promettre. **La préversion ne sert aucune donnée d'usager** : elle sert les
  mêmes fichiers statiques que la production, et les données restent dans le
  navigateur.

---

## Historique

### La production, depuis le 21/08/2026

**https://maps.infonovice.fr** — l'état canonique visé est atteint :

- DNS : CNAME `maps` → `oxygene911.github.io` (zone Cloudflare, proxy gris),
  posé par Armelin le 21/08.
- GitHub Pages : domaine personnalisé `maps.infonovice.fr`, HTTPS forcé.
- Build : à la racine (`/`), valeur par défaut du dépôt — chaque fusion sur
  `main` publie via le workflow `deploiement.yml` (source « GitHub Actions »).
- `https://oxygene911.github.io/infonovice-maps/` redirige en 301 : les liens
  partagés avant la mise en service ne cassent pas.

### Le sous-chemin github.io, pour la prochaine fois

Avant le CNAME, le site a vécu sous `/infonovice-maps/` sur github.io : le
workflow posait alors `BASE_PUBLIQUE=/infonovice-maps/` (variable lue par
`vite.config.ts`, retirée en PR #20). Ce mécanisme reste disponible si le
site devait un jour être servi sous un sous-chemin. Détail utile : les icônes
du manifeste PWA sont en chemins RELATIFS précisément pour suivre la base
sans retouche.

Une passerelle Worker Cloudflare avait été envisagée pour créer le DNS sans
attendre ; refusée par le garde-fou de permissions de la session du 20/08 —
refus respecté, et le CNAME canonique s'est avéré plus simple et durable.
