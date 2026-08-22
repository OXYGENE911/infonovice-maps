/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// La base du site vient de l'environnement : « / » quand il vivra à la racine
// de maps.infonovice.fr, « /infonovice-maps/ » tant que github.io le sert sous
// ce sous-chemin (le déploiement pose la variable, voir docs/DEPLOIEMENT.md).
// Une variable plutôt qu'un drapeau --base : Git Bash sous Windows réécrit les
// arguments qui ressemblent à des chemins POSIX, pas les variables.
const BASE = process.env.BASE_PUBLIQUE ?? '/';

export default defineConfig({
  base: BASE,
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
        'vie-privee': resolve(__dirname, 'vie-privee.html'),
        'mentions-legales': resolve(__dirname, 'mentions-legales.html'),
      },
      output: {
        // MapLibre pèse ~230 Ko gzippé à lui seul : il vit dans son propre
        // morceau, exclu du budget bundle applicatif (< 300 Ko) que la CI
        // mesure — le budget surveille NOTRE code, pas la bibliothèque carte.
        manualChunks: { maplibre: ['maplibre-gl'] },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
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
        background_color: '#0F1B2D',
        theme_color: '#0F1B2D',
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
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // MapLibre et son worker dépassent la limite par défaut (2 Mio) :
        // sans ce relèvement, le cœur de la carte reste hors du cache et le
        // mode hors ligne ne montre rien.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            /* LES TUILES IGN — mises en cache DANS LES BORNES QUE LE SERVEUR
               LUI-MÊME ANNONCE : `Cache-Control: private, max-age=1814400`,
               soit 21 jours (relevé le 22/08/2026 sur data.geopf.fr). On
               s'arrête à 14 jours pour rester en deçà, et le cache est
               « privé » par nature : il vit dans le navigateur de l'usager,
               jamais sur un serveur partagé.
               CacheFirst : une tuile ne change pas d'un jour à l'autre, et
               c'est ce qui rend la carte utilisable sans réseau. */
            urlPattern: ({ url }: { url: URL }) =>
              url.hostname === 'data.geopf.fr' && url.pathname.startsWith('/wmts'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tuiles-ign',
              expiration: {
                // ~800 tuiles à ~80 Ko : de l'ordre de 60 Mo au pire, et les
                // plus anciennes s'effacent d'elles-mêmes.
                maxEntries: 800,
                maxAgeSeconds: 14 * 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Une navigation hors ligne retombe sur la coquille de l'application,
        // déjà en cache : la carte s'ouvre avec ce qu'elle connaît.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/(a-propos|vie-privee|mentions-legales)\.html$/],
        // Les tuiles IGN se mettront en cache en PR #17 (stale-while-revalidate
        // avec plafond). Rien ici tant que la stratégie n'est pas écrite.
      },
    }),
  ],
});
