# Déploiement et domaine

## État actuel (20/08/2026)

Chaque fusion sur `main` publie le build sur GitHub Pages (workflow
`deploiement.yml`, source « GitHub Actions »). Le site est servi à :

**https://oxygene911.github.io/infonovice-maps/**

Le build de déploiement pose `BASE_PUBLIQUE=/infonovice-maps/` car Pages sert
les dépôts de projet sous un sous-chemin. Le reste de la chaîne (dev, tests,
CI) construit à la racine (`/`), la valeur cible.

## Mise en service de maps.infonovice.fr (action requise : Armelin)

La seule étape hors de portée de l'automatisation est l'enregistrement DNS
(zone Cloudflare d'infonovice.fr). Dans l'ordre :

1. **DNS (Cloudflare, ~2 minutes)** — zone `infonovice.fr` → DNS → ajouter :
   - Type : `CNAME` — Nom : `maps` — Cible : `oxygene911.github.io`
   - **Proxy DÉSACTIVÉ (nuage gris, « DNS only »)** dans un premier temps :
     GitHub doit voir le CNAME nu pour valider le domaine et émettre son
     certificat TLS. (Le proxy orange peut être réactivé plus tard si besoin,
     mais il est inutile : Pages sert déjà en HTTPS.)

2. **Côté GitHub Pages** — une fois le DNS posé, dire à Claude « le CNAME est
   posé » ; il exécutera :

   ```bash
   gh api -X PUT repos/OXYGENE911/infonovice-maps/pages --field cname=maps.infonovice.fr
   ```

   puis, quand le certificat est émis (quelques minutes) :

   ```bash
   gh api -X PUT repos/OXYGENE911/infonovice-maps/pages --field https_enforced=true
   ```

3. **Retour du build à la racine** — retirer la variable `BASE_PUBLIQUE` du
   workflow `deploiement.yml` (le commentaire PROVISOIRE marque l'endroit) :
   avec le domaine personnalisé, le site vit à `/`.

Après quoi `https://oxygene911.github.io/infonovice-maps/` redirigera d'office
vers `https://maps.infonovice.fr` — aucun lien ne casse.

## Pourquoi pas de passerelle Cloudflare Worker

Un Worker en domaine personnalisé aurait créé le DNS automatiquement, mais il
ajoutait une pièce d'infrastructure hors du contrat du projet (GitHub Pages
direct, zéro backend) et sa création a été refusée par le garde-fou de
permissions de la session du 20/08 — refus respecté. Le CNAME canonique est de
toute façon plus simple et plus durable.
