import { startWorkspaceAgent } from './index.js';
import { createHttpSourceGenerator } from './source-generator.js';

const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd();
const allowedOrigin = process.env.STUDIO_ORIGIN ?? 'http://127.0.0.1:5174';
const sourceGenerator =
  process.env.AI_PROVIDER_URL && process.env.AI_PROVIDER_KEY && process.env.AI_PROVIDER_MODEL
    ? createHttpSourceGenerator({
        endpoint: process.env.AI_PROVIDER_URL,
        apiKey: process.env.AI_PROVIDER_KEY,
        model: process.env.AI_PROVIDER_MODEL,
      })
    : undefined;
const agent = await startWorkspaceAgent({
  workspaceRoot,
  allowedOrigins: [allowedOrigin],
  port: 4319,
  sourceGenerator,
  allowedSourceDependencies: (process.env.AI_ALLOWED_DEPENDENCIES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
});
console.log(`Workspace Agent: ${agent.url}\nPairing code: ${agent.pairingCode}`);
