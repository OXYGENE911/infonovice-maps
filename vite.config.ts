/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Le site vit à la racine du domaine maps.infonovice.fr (CNAME GitHub Pages) :
// base « / ». Si le CNAME saute un jour, Pages servirait sous /infonovice-maps/
// et il faudrait une base relative — le choix est consigné ici pour ce jour-là.
export default defineConfig({
  base: '/',
  // Vitest ne regarde QUE tests/ : les specs Playwright (tests-e2e/) ont leur
  // propre exécuteur, et les mêler faisait échouer la suite unitaire.
  test: { include: ['tests/**/*.test.ts'] },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
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
        start_url: '/',
        display: 'standalone',
        background_color: '#0F1B2D',
        theme_color: '#0F1B2D',
        icons: [
          { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icones/icone-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Les tuiles IGN se mettront en cache en PR #17 (stale-while-revalidate
        // avec plafond). Rien ici tant que la stratégie n'est pas écrite.
      },
    }),
  ],
});
