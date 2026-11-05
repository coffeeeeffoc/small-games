import { createGameServices, createRunRecorder } from './game-services.js';

export function connectGameServices() {
  const config = globalThis.__COMPETITION_CONFIG__;
  if (!config?.competitionEnabled || !config.apiUrl) return undefined;
  const storage = config.game === 'night-overwatch' ? globalThis.__nightStorage : undefined;
  const services = createGameServices({ gameId: config.game, storage });
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
      createRunRecorder(createGameServices({ gameId: config.game, ruleVersion, storage }), options),
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
  const connect = () => {
    globalThis.SmallGamesServices = connectGameServices();
  };
  if (globalThis.__COMPETITION_CONFIG__?.game === 'night-overwatch') {
    if (globalThis.__nightStorageReady)
      void globalThis.__nightStorageReady.then(connect).catch(() => {});
  } else connect();
}
