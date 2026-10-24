import { reactConfig, nodeConfig } from '@coffeeeeffoc/config-eslint';
export default [
  ...reactConfig,
  nodeConfig,
  {
    ignores: [
      'dev-mode.js',
      'scripts/dev-mode.*',
      'public/**',
      'server-dist/**',
      'assets/scripts/core/**',
      'build/**',
      'library/**',
      'temp/**',
      'reports/**',
      'local/**',
      'profiles/**',
      'cc.d.ts',
    ],
  },
];
