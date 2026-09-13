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
| Hébergeur | GitHub Pages (source « GitHub Actions ») | Cloudflare Pages, projet `maps-staging` |
| Domaine | https://maps.infonovice.fr/ | https://maps-staging.pages.dev/ |
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

### Ce que le changement de cible a coûté sur ce point — à savoir

Tant que la préversion vit sur `maps-staging.pages.dev`, **il n'existe aucune
porte à fermer**, et c'est le seul vrai recul de la nouvelle cible.

Cloudflare Pages propose bien une politique d'accès sur les déploiements de
préversion, mais sa documentation dit exactement ce qu'elle NE protège pas :
« this will only protect your preview deployments (for example,
`373f31e2.user-example.pages.dev` and every other randomly generated preview
link) and not your `*.pages.dev` domain or custom domain »
(developers.cloudflare.com/pages/configuration/preview-deployments/, relevé le
13/09/2026). Or c'est précisément `maps-staging.pages.dev` que regarderont le
CEO et les testeurs.

Et **Cloudflare Access ne peut pas non plus le couvrir** : une application
Access se pose sur un nom d'hôte appartenant à une zone active du compte
Cloudflare ; `pages.dev` est une zone de Cloudflare, pas la nôtre, et on ne
peut pas l'y ajouter. La porte redevient possible **le jour où le domaine
personnalisé `maps-staging.infonovice.fr` existe** — c'est-à-dire le jour où
le CEO décide de le poser (§4 bis).

**Ce qui est gagné sans rien décider, en revanche** : la politique d'accès des
déploiements de préversion ferme les URL à empreinte
(`<hash>.maps-staging.pages.dev`), qui sont publiques elles aussi et qu'aucun
des trois filets ne rend privées. Une case à cocher dans les réglages du
projet, gratuite, sans effet sur l'adresse que regardent les testeurs. Elle est
écrite en §4 comme geste facultatif du CEO.

---

## 4. Les deux gestes du CEO — à faire dans cet ordre

Ils sont en **liste rouge** (création de projet sur un service tiers, secrets) :
aucun agent ne les fait. Ils sont écrits ici prêts à exécuter. **Aucune
préversion n'existe tant que les deux ne sont pas faits.**

> **Il n'y en a plus que deux.** Le troisième — poser un enregistrement DNS — a
> disparu avec le changement de cible du 13/09 : `maps-staging.pages.dev` est
> servi par Cloudflare sans aucun DNS de notre part. Le domaine personnalisé
> `maps-staging.infonovice.fr` est **reporté** ; sa procédure est écrite au
> §4 bis et **n'est pas active**.

### Geste 1 — créer le projet Cloudflare Pages, **branche de production `staging`**

Dans le compte Cloudflare qui héberge déjà la zone `infonovice.fr`.

```
npx wrangler@4.131.1 login
npx wrangler@4.131.1 pages project create maps-staging --production-branch=staging
```

- **Nom exact du projet : `maps-staging`.** C'est lui qui fabrique l'adresse :
  un projet Pages est servi sur `<nom-du-projet>.pages.dev`. Le nom est aussi
  écrit dans `previsualisation.yml`, variable `PROJET_PAGES` — le changer ici
  oblige à le changer là.
- **Branche de production : `staging`, et ce n'est pas un détail de confort.**
  La documentation Cloudflare est explicite : `<projet>.pages.dev` sert la
  **branche de production** ; toute autre branche reçoit un alias dérivé de son
  nom, `<branche>.<projet>.pages.dev`
  (developers.cloudflare.com/pages/configuration/preview-deployments/, relevé
  le 13/09/2026). Si la branche de production du projet était `main`, nos
  envois deviendraient des préversions Cloudflare et `maps-staging.pages.dev`
  servirait indéfiniment le tout premier déploiement — ou rien. Le symptôme :
  une page qui ne bouge plus alors que le workflow est vert.
- **LA LIGNE DE COMMANDE N'EST PAS UNE PRÉFÉRENCE DE STYLE, C'EST LE SEUL
  CHEMIN.** Notre projet est un projet de **téléversement direct** (le workflow
  envoie un `dist/` déjà bâti ; Cloudflare ne construit rien). Or la
  documentation dit : « if your project is a Direct Upload project, you will not
  have the option to configure production branch controls in the dashboard, and
  to update your production branch, you will need to manually call the Update
  Project endpoint in the API »
  (developers.cloudflare.com/pages/get-started/direct-upload/, relevé le
  13/09/2026). **Le tableau de bord n'offrira pas ce réglage.** Fixé de travers
  à la création, il se rattrape par l'API :

  ```
  curl -X PATCH \
    "https://api.cloudflare.com/client/v4/accounts/<ID_DE_COMPTE>/pages/projects/maps-staging" \
    -H "Authorization: Bearer <JETON>" \
    -H "Content-Type: application/json" \
    --data-raw "{\"production_branch\":\"staging\"}"
  ```

- **Si on oublie ce geste** : le workflow échoue à l'étape de déploiement avec
  « project not found ». Rien n'est cassé, rien n'est publié, la production ne
  bouge pas.

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

### Geste facultatif — fermer les URL à empreinte

Gratuit, réversible, sans effet sur l'adresse que regardent les testeurs :
réglages du projet `maps-staging` → *Preview deployments* → exiger
l'authentification. Cela ferme les URL du type
`<empreinte>.maps-staging.pages.dev`, publiques et couvertes par les trois
filets mais par rien d'autre. Cela **ne ferme pas** `maps-staging.pages.dev` :
la documentation le dit mot pour mot (citée au §3). Il n'existe pas de moyen de
fermer celle-là tant que le domaine personnalisé n'existe pas.

### Comment savoir que les gestes ont pris

Relancer le workflow sans commit : *Actions* → *Prévisualisation* → *Run
workflow* → branche `staging`. Le résumé du run affiche l'URL du déploiement.
Puis, depuis un terminal :

```
curl -sI https://maps-staging.pages.dev/ | grep -i x-robots-tag
curl -s  https://maps-staging.pages.dev/robots.txt
```

La première commande doit répondre `x-robots-tag: noindex, nofollow, noarchive`,
la seconde `Disallow: /`. Et la page, ouverte dans un navigateur, doit porter le
liseré ambre et un onglet qui commence par « PRÉVISUALISATION ».

**Le contrôle qui compte vraiment, et qu'on oublierait** : dans le tableau de
bord, le déploiement doit apparaître comme **Production**, et non comme
*Preview*. S'il apparaît en *Preview*, la branche de production du projet n'est
pas `staging` — c'est le PATCH d'API du Geste 1. Autre symptôme du même
réglage : deux poussées de suite et `maps-staging.pages.dev` ne bouge pas,
workflow vert.

---

## 4 bis. Le domaine personnalisé — REPORTÉ, écrit mais NON ACTIF

**Cette procédure n'est pas en vigueur.** Elle est écrite pour le jour où le CEO
en décidera : « domaine personnalisé `maps-staging.infonovice.fr` plus tard si
besoin » (directive du 13/09/2026). Tant qu'elle n'est pas exécutée, l'adresse
de la préversion est `https://maps-staging.pages.dev/` et rien d'autre.

**Pourquoi `maps-staging.infonovice.fr` et pas un sous-domaine de
`maps.infonovice.fr`** : un certificat générique `*.infonovice.fr` couvre
`maps.infonovice.fr`, mais **pas** ce qui serait encore un cran plus bas — un
générique ne couvre qu'un seul niveau. La limite est la même chez OVH et dans
le SSL universel de Cloudflare. `maps-staging.infonovice.fr` reste à un cran et
l'évite. C'est le motif du changement de cible du 13/09/2026.

Le jour venu, **DNS = liste rouge**, deux moitiés et il faut les deux :

1. Dans le projet Pages : *Custom domains* → *Set up a custom domain* →
   `maps-staging.infonovice.fr`. Cloudflare indique l'enregistrement à créer.
2. Dans la zone `infonovice.fr` : enregistrement **CNAME**, nom `maps-staging`,
   cible `maps-staging.pages.dev`, **proxy orange activé** (contrairement au
   CNAME de la production, en gris parce que GitHub Pages sert son propre
   certificat ; ici c'est Cloudflare qui sert et qui doit être dans le chemin).

Ce geste ne touche **pas** l'enregistrement `maps` (production).

**Ce qu'il débloquerait en plus de l'adresse** : c'est seulement à ce moment-là
qu'une porte **Cloudflare Access** devient possible (voir §3), sur un nom d'hôte
de notre zone. Elle protégerait la préversion derrière un code envoyé par
courriel à une liste d'adresses — les quatre testeurs de l'AFUVE, le CEO. Ce
qu'elle coûte : un code à chaque première visite et à chaque expiration de
session ; un testeur de terrain n'aime pas les portes. **C'est une décision du
CEO**, pas un geste d'agent.

---

## 5. Comment revenir en arrière

### Sur la prévisualisation

1. **Le plus rapide, sans toucher au dépôt** : tableau de bord Cloudflare →
   projet `maps-staging` → *Deployments* → le déploiement
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
| `Project not found` | le projet Pages n'existe pas, ou son nom diffère de `PROJET_PAGES` (`maps-staging`) | Geste 1 du §4 |
| `Authentication error` (code 10000) | jeton expiré, révoqué, ou fabriqué sans la permission *Cloudflare Pages · Edit* | refaire le Geste 2 ; vérifier le TTL |
| Le déploiement réussit mais **la page ne change pas** | la branche de production du projet Pages n'est pas `staging` : les envois deviennent des préversions Cloudflare, et `maps-staging.pages.dev` reste figé | **pas par le tableau de bord** — un projet de téléversement direct n'y expose pas ce réglage : le PATCH d'API du Geste 1 |
| `maps-staging.pages.dev` répond `404` | aucun déploiement de **production** n'existe encore sur le projet : voir la ligne précédente | PATCH d'API du Geste 1, puis relancer le workflow |
| Un domaine personnalisé répond `522` ou `404` | sans objet aujourd'hui — aucun domaine personnalisé n'est rattaché | §4 bis, et seulement sur décision du CEO |
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
