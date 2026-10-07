import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Compile the reviewed classic sources into static modules; never evaluate source at runtime. */
export function wulongSharedSourcePlugin(gameRoot) {
  const sources = new Map(
    ['levels-data.js', 'level-order.js', 'levels.js'].map((name) => [
      path.join(gameRoot, name).replaceAll('\\', '/'),
      name,
    ]),
  );
  return {
    name: 'wulong-shared-classic-sources',
    enforce: 'pre',
    async load(id) {
      const name = sources.get(id.split('?')[0]);
      if (!name) return;
      const source = await readFile(id, 'utf8');
      if (name === 'levels-data.js') {
        if (!source.includes('window.LEVEL_DATA =')) throw new Error('Unsupported level data export');
        const transformed = source.replaceAll('window.LEVEL_DATA', 'LEVEL_DATA')
          .replaceAll('window.WULONG_SCENES', 'WULONG_SCENES');
        return 'let LEVEL_DATA, WULONG_SCENES;\n' + transformed + '\nexport { LEVEL_DATA, WULONG_SCENES };';
      }
      if (name === 'level-order.js') {
        if (!source.includes('window.LEVEL_ROUTE =')) throw new Error('Unsupported level route export');
        return "import { LEVEL_DATA } from './levels-data.js';\n" +
          source.replace('window.LEVEL_ROUTE =', 'const LEVEL_ROUTE =') + '\nexport { LEVEL_ROUTE };';
      }
      const data = await readFile(path.join(gameRoot, 'levels-data.js'), 'utf8');
      const imports = data.includes('window.WULONG_SCENES')
        ? "import { WULONG_SCENES } from './levels-data.js';\n" : '';
      return `${imports}export function registerLevels(W) {\n${source.replaceAll('window.WULONG_SCENES', 'WULONG_SCENES')}\n}`;
    },
  };
}
