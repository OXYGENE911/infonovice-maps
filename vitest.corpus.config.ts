import { defineConfig } from 'vite';

/**
 * LE BANC DE RECHERCHE A SA PROPRE CONFIGURATION, et ce n'est pas un caprice.
 *
 * Il APPELLE DE VRAIS SERVICES publics — deux cent cinquante requêtes qui se
 * démultiplient sur cinq sources. Rangé dans `tests/`, il partirait à chaque
 * `npm test` et à chaque poussée : « ne jamais marteler les API publiques ;
 * ces quotas sont un bien commun ». Il vit donc dans `scripts/`, hors du
 * périmètre de la suite ordinaire, et ne se lance qu'à la main :
 *
 *   npx vitest run --config vitest.corpus.config.ts
 *
 * IL IMPORTE LE CODE DE L'APPLICATION, ce qui est tout l'intérêt : un banc
 * qui recopierait le pipeline mesurerait une copie, et la copie ne dérive
 * jamais du même côté que l'original.
 */
export default defineConfig({
  test: {
    include: ['scripts/**/*.banc.ts'],
    /* Deux cent cinquante requêtes réelles, une à la fois : il faut du temps,
       et l'attente est délibérée — c'est elle qui tient le débit. */
    testTimeout: 45 * 60 * 1000,
    hookTimeout: 60_000,
  },
});
