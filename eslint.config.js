// Configuration plate ESLint 9 : les règles TypeScript recommandées, sans
// assouplissement. Le style (indentation, guillemets) est volontairement
// absent : c'est TypeScript strict et la revue qui portent la qualité, pas
// une guerre de virgules.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { ignores: ['dist/', 'dev-dist/', 'node_modules/', 'playwright-report/', 'test-results/'] },
);
