# Infonovice Maps

Cartographie **française et open source**, itinéraires et guidage : une
alternative française à Google Maps, construite sur les données publiques
françaises — européennes à défaut, assumé et documenté (météo Open-Meteo,
voir docs/apis.md) — Géoplateforme IGN, BAN, Panoramax, OpenStreetMap,
transport.data.gouv.fr. Le mot « souverain » a été retiré le 06/09/2026 :
l'hébergement (GitHub Pages, Cloudflare) et le certificat (Google Trust
Services) sont américains, et la page « À propos » le dit.

- **Zéro tracking.** Aucune donnée ne quitte votre navigateur : favoris et
  préférences vivent en IndexedDB local, exportables en JSON.
- **Zéro coût d'infrastructure.** Site statique (PWA) hébergé sur GitHub
  Pages, données servies par l'open data français.
- **Open source.** Licence AGPL-3.0. Les contributions passent par des PR,
  la CI doit être verte.

Production : https://maps.infonovice.fr

## Développement

```bash
npm install
npm run dev        # serveur local
npm test           # tests unitaires (Vitest)
npm run e2e        # tests bout-en-bout (Playwright)
npm run lint       # ESLint + typecheck
npm run build      # build de production
```

Le fichier `CLAUDE.md` décrit les contraintes du projet ; `docs/ROADMAP.md`
liste les PR prévues ; `docs/apis.md` documente chaque API consommée avec
ses quotas, vérifiés par de vrais appels.

Éditeur : INFONOVICE — France.
