import { nodeConfig, reactConfig } from '@coffeeeeffoc/config-eslint';

export default [{ ignores: ['dist-iframe/**'] }, ...reactConfig, nodeConfig];
