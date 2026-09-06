import { startWorkspaceAgent } from './index.js';

const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd();
const allowedOrigin = process.env.STUDIO_ORIGIN ?? 'http://127.0.0.1:5174';
const agent = await startWorkspaceAgent({
  workspaceRoot,
  allowedOrigins: [allowedOrigin],
  port: 4319,
});
console.log(`Workspace Agent: ${agent.url}\nPairing code: ${agent.pairingCode}`);
