import { baseConfig, nodeConfig } from '@coffeeeeffoc/config-eslint';
export default [
  ...baseConfig,
  nodeConfig,
  {
    files: ['src/dev.ts'],
    languageOptions: {
      globals: { document: 'readonly', window: 'readonly', localStorage: 'readonly' },
    },
  },
];
