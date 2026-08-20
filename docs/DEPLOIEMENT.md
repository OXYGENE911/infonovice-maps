# Déploiement et domaine

## État en service (depuis le 21/08/2026)

**https://maps.infonovice.fr** — l'état canonique visé est atteint :

- DNS : CNAME `maps` → `oxygene911.github.io` (zone Cloudflare, proxy gris),
  posé par Armelin le 21/08.
- GitHub Pages : domaine personnalisé `maps.infonovice.fr`, HTTPS forcé.
- Build : à la racine (`/`), valeur par défaut du dépôt — chaque fusion sur
  `main` publie via le workflow `deploiement.yml` (source « GitHub Actions »).
- `https://oxygene911.github.io/infonovice-maps/` redirige en 301 : les liens
  partagés avant la mise en service ne cassent pas.

## Histoire courte, pour la prochaine fois

Avant le CNAME, le site a vécu sous `/infonovice-maps/` sur github.io : le
workflow posait alors `BASE_PUBLIQUE=/infonovice-maps/` (variable lue par
`vite.config.ts`, retirée en PR #20). Ce mécanisme reste disponible si le
site devait un jour être servi sous un sous-chemin. Détail utile : les icônes
du manifeste PWA sont en chemins RELATIFS précisément pour suivre la base
sans retouche.

Une passerelle Worker Cloudflare avait été envisagée pour créer le DNS sans
attendre ; refusée par le garde-fou de permissions de la session du 20/08 —
refus respecté, et le CNAME canonique s'est avéré plus simple et durable.
