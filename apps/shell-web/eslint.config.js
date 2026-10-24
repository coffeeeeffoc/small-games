import { nodeConfig, reactConfig } from '@coffeeeeffoc/config-eslint';

export default [{ ignores: ['public/games/**'] }, ...reactConfig, nodeConfig];
