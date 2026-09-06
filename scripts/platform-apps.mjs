import { join } from 'node:path';
import { managementEnvironment, runtimeEnvironment } from './platform-config.mjs';

/** Every application process owned by the local platform command. */
export function developmentEntries(node, root) {
  const vite = join(root, 'node_modules/vite/bin/vite.js');
  const tsx = join(root, 'apps/workspace-agent/node_modules/tsx/dist/cli.mjs');
  return [
    {
      name: 'management',
      command: node,
      args: ['services/management-api/dist/main.js'],
      env: { ...process.env, ...managementEnvironment, PORT: '53001' },
    },
    {
      name: 'runtime',
      command: node,
      args: ['services/runtime-api/dist/main.js'],
      env: { ...process.env, ...runtimeEnvironment, PORT: '53002' },
    },
    { name: 'shell-web', command: node, args: [vite, 'apps/shell-web', '--port', '5173'] },
    {
      name: 'shell-bilibili',
      command: node,
      args: [vite, 'apps/shell-bilibili', '--port', '5175'],
    },
    { name: 'studio-web', command: node, args: [vite, 'apps/studio-web', '--port', '5174'] },
    { name: 'workspace-agent', command: node, args: [tsx, 'apps/workspace-agent/src/main.ts'] },
  ];
}
