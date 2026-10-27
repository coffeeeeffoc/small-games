import { createGameServices, createRunRecorder } from './game-services.js';

export function connectGameServices() {
  const config = globalThis.__COMPETITION_CONFIG__;
  if (!config?.competitionEnabled || !config.apiUrl) return undefined;
  const services = createGameServices({ gameId: config.game });
  let status = 'connecting',
    metadata,
    error;
  const refresh = () =>
    services.metadata().then(
      (result) => {
        metadata = result;
        status = 'ready';
        return result;
      },
      (cause) => {
        status = 'offline';
        error = cause.code || 'SERVICE_UNAVAILABLE';
        return undefined;
      },
    );
  const ready = refresh();
  // Games opt into existing service methods; local play never waits on ready.
  return Object.freeze({
    services,
    createRecorder: (ruleVersion, options) =>
      createRunRecorder(createGameServices({ gameId: config.game, ruleVersion }), options),
    ready,
    refresh,
    get status() {
      return status;
    },
    get metadata() {
      return metadata;
    },
    get error() {
      return error;
    },
  });
}

if (typeof window !== 'undefined') {
  globalThis.SmallGamesServices = connectGameServices();
}
