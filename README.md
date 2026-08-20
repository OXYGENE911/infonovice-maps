# Infonovice Maps

Cartographie et itinéraires **souverains** : une alternative française à
Google Maps, construite exclusivement sur les API publiques françaises
(Géoplateforme IGN, BAN, Panoramax, Météo-France, transport.data.gouv.fr).

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
