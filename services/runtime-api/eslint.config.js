import { baseConfig, nodeConfig } from '@coffeeeeffoc/config-eslint';
export default [{ ignores: ['rules/frozen/**'] }, ...baseConfig, nodeConfig];
