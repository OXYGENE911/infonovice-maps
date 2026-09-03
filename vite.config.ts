/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { JOURS_EN_CACHE, RESERVES_TUILES } from './src/lib/tuiles-en-cache';

// La base du site vient de l'environnement : « / » quand il vivra à la racine
// de maps.infonovice.fr, « /infonovice-maps/ » tant que github.io le sert sous
// ce sous-chemin (le déploiement pose la variable, voir docs/DEPLOIEMENT.md).
// Une variable plutôt qu'un drapeau --base : Git Bash sous Windows réécrit les
// arguments qui ressemblent à des chemins POSIX, pas les variables.
const BASE = process.env.BASE_PUBLIQUE ?? '/';

/* LA VERSION VIENT DU JOURNAL, ET C'EST LA CORRECTION DE MON PREMIER JET
   (VERSION-2, 02/09).
   VERSION-1 la lisait dans `package.json`. Deux versions plus tard, la
   production affichait « 1.31.0 » alors qu'elle servait la 1.33.0 : j'avais
   oublié d'incrémenter le fichier deux fois de suite. Un numéro FAUX est pire
   qu'aucun numéro — c'est précisément le doute qu'Armelin signalait, rendu
   officiel par l'application elle-même.
   LE JOURNAL, LUI, NE S'OUBLIE PAS : la règle du projet impose une entrée de
   `docs/CHANGELOG.md` à chaque PR, et son entrée la plus haute EST la version
   qu'on livre. En faire la source unique supprime la discipline à tenir au
   lieu de la répéter. Un test unitaire garde l'accord des deux fichiers. */
const VERSION = (() => {
  const journal = readFileSync(resolve(__dirname, 'docs/CHANGELOG.md'), 'utf-8');
  const m = /^## \[(\d+\.\d+\.\d+)\]/m.exec(journal);
  /* PAS DE REPLI SILENCIEUX : un journal illisible doit ARRÊTER la
     construction, pas livrer un « 0.0.0 » que personne ne remarquerait. */
  if (!m) throw new Error('vite.config : version introuvable en tête de docs/CHANGELOG.md');
  return m[1] as string;
})();

export default defineConfig({
  base: BASE,
  define: {
    __VERSION__: JSON.stringify(VERSION),
  },
  // Vitest ne regarde QUE tests/ : les specs Playwright (tests-e2e/) ont leur
  // propre exécuteur, et les mêler faisait échouer la suite unitaire.
  test: { include: ['tests/**/*.test.ts'] },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      // MULTI-PAGES : les pages de texte (à propos, vie privée, mentions
      // légales) sont de vraies pages HTML, servies telles quelles et
      // lisibles SANS JavaScript — c'est meilleur pour le référencement, pour
      // la vitesse, et cohérent avec ce qu'elles promettent.
      input: {
        index: resolve(__dirname, 'index.html'),
        'a-propos': resolve(__dirname, 'a-propos.html'),
        'offre-flottes': resolve(__dirname, 'offre-flottes.html'),
        'vie-privee': resolve(__dirname, 'vie-privee.html'),
        'mentions-legales': resolve(__dirname, 'mentions-legales.html'),
      },
      output: {
        // MapLibre pèse ~230 Ko gzippé à lui seul : il vit dans son propre
        // morceau, exclu du budget bundle applicatif (< 300 Ko) que la CI
        // mesure — le budget surveille NOTRE code, pas la bibliothèque carte.
        //
        // EN FONCTION, ET NON EN OBJET : Rollup (embarqué par Vite 8) n'accepte
        // plus la forme `{ maplibre: ['maplibre-gl'] }`. Le typage l'a refusée
        // à la compilation, pas au premier chargement en production — c'est la
        // bonne façon de l'apprendre.
        manualChunks: (id: string) => (id.includes('maplibre-gl') ? 'maplibre' : undefined),
      },
    },
  },
  plugins: [
    VitePWA({
      /* « prompt » ET NON « autoUpdate » (MAJ-1, 03/09). Armelin : « j'ai des
         testeurs qui ne savaient pas qu'il fallait rafraîchir l'application
         pour la mettre à jour ». En autoUpdate, la page peut se RECHARGER
         TOUTE SEULE quand la nouvelle version arrive — inacceptable en pleine
         navigation. En prompt, l'application ANNONCE la version et l'usager
         choisit son moment (voir main.ts et bandeau-maj.ts). */
      registerType: 'prompt',
      // La page « en construction » n'a rien à mettre hors ligne d'utile,
      // mais le manifeste et le service worker font partie du socle : les
      // poser maintenant, c'est vérifier la chaîne PWA dès la CI de la PR #1
      // plutôt qu'au moment où la carte arrivera.
      manifest: {
        name: 'Infonovice Maps',
        short_name: 'Maps',
        description:
          'Cartographie et itinéraires souverains : l’alternative française à Google Maps.',
        lang: 'fr',
        start_url: BASE,
        display: 'standalone',
        /* Blanc, pas la charte sombre : la barre du navigateur et l'écran
           de lancement suivent le FOND de l'application (retrait de la
           « barre noire » relevée par Armelin le 29/08). */
        background_color: '#FFFFFF',
        theme_color: '#FFFFFF',
        // Chemins RELATIFS : le navigateur les résout contre l'URL du
        // manifeste lui-même, donc ils suivent la base sans qu'on les touche
        // (en absolu, /icones/... aurait ignoré la base et cassé sous
        // github.io — vu au premier build en sous-chemin).
        icons: [
          { src: 'icones/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icones/icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icones/icone-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        /* AVEC « prompt », le worker n'active plus tout seul — c'est le but.
           Mais SANS `clientsClaim`, le PREMIER worker ne prenait pas la main
           avant la navigation suivante : la coquille hors ligne ne se
           préparait qu'à la seconde visite, et deux parcours HORS LIGNE l'ont
           vu. `clientsClaim` seul règle la PREMIÈRE installation ;
           `skipWaiting: false` garde les MISES À JOUR derrière le bandeau. */
        clientsClaim: true,
        skipWaiting: false,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        /* LES TUILES IGN, une route par couche : la table et ses motifs
           vivent dans src/lib/tuiles-en-cache.ts, où des tests unitaires les
           confrontent aux URL réellement fabriquées par `urlTuiles()`.
           CacheFirst : une tuile ne change pas d'un jour à l'autre, et c'est
           ce qui rend la carte utilisable sans réseau.
           LE TYPE MIME EST VÉRIFIÉ, PAS SEULEMENT LE CODE 200 : un portail
           captif ou un proxy d'entreprise répond « 200 text/html » à tout, y
           compris aux tuiles. Sans ce contrôle, la page de blocage s'écrivait
           dans le cache et se resservait pendant 14 jours, réseau revenu —
           reproduit en navigateur avant d'écrire ces lignes. Le statut 0
           (réponse opaque) est écarté pour la même raison : rien n'y est
           vérifiable, donc rien n'y est digne de confiance. */
        runtimeCaching: RESERVES_TUILES.map((reserve) => ({
          urlPattern: reserve.motif,
          handler: 'CacheFirst' as const,
          options: {
            cacheName: reserve.cache,
            expiration: {
              maxEntries: reserve.tuiles,
              maxAgeSeconds: JOURS_EN_CACHE * 24 * 60 * 60,
              purgeOnQuotaError: true,
            },
            cacheableResponse: {
              statuses: [200],
              headers: { 'content-type': reserve.format },
            },
          },
        })),
        /* LE REPLI DE NAVIGATION reste celui de vite-plugin-pwa, `index.html`
           RELATIF : une valeur absolue (« /index.html ») paraît équivalente à
           la racine, mais sous une autre base — le sous-chemin github.io que
           docs/DEPLOIEMENT.md garde disponible — workbox ne la retrouve pas
           dans le précache, lève à l'évaluation du service worker, et TOUT ce
           qui suit (les routes de tuiles) n'est jamais enregistré. En silence.

           LA LISTE D'EXCLUSION, elle, sert dans un cas et un seul : les pages
           de texte portant un paramètre. Sans paramètre, le précache les sert
           directement ; avec « ?ref=… », la clé de précache ne correspond
           plus, le repli prend la main et rendait l'application carte à la
           place des mentions légales. D'où le « (\?|$) » : workbox confronte
           ses motifs à `pathname + search`, pas au seul chemin. Le « (^|/) »
           de tête laisse passer une base autre que la racine. */
        navigateFallbackDenylist: [
          /(^|\/)(a-propos|offre-flottes|vie-privee|mentions-legales)\.html(\?|$)/,
        ],
      },
    }),
  ],
});
