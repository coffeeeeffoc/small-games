import { nodeConfig, reactConfig } from '@coffeeeeffoc/config-eslint';

export default [
  { ignores: ['public/games/**'] },
  ...reactConfig,
  nodeConfig,
  {
    files: ['public/fullscreen.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        Element: 'readonly',
        MutationObserver: 'readonly',
      },
    },
  },
];
