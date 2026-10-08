import { reactConfig, nodeConfig } from '@coffeeeeffoc/config-eslint';
export default [
  ...reactConfig,
  nodeConfig,
  { ignores: ['dev-mode.js', 'public/**', 'server-dist/**'] },
];
