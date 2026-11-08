import {
  CONTROL_GAME_IDS,
  controlSnapshotDigest,
  normalizeControlSnapshot,
  type NightOperations,
  type openControlDatabase,
  type ControlDatabaseExecutor,
} from '@coffeeeeffoc/service-kit';
import { createCompetitionControl } from '../src/competition/control.js';
import { controlDatabase } from './control-fixture.js';

export const fallback = {
  origins: ['https://env.example'],
  methods: ['GET', 'POST', 'OPTIONS'],
  headers: ['authorization', 'content-type'],
  credentials: false,
  maxAge: 600,
};
export function fixture() {
  let version = 0,
    time = 1000,
    delayed = false,
    broken = false,
    perQueryDelay = 0,
    failCommit = false,
    statement = '5s',
    lock = '750ms',
    failRestore = false;
  let snapshot = normalizeControlSnapshot({
    apiOrigins: ['https://published.example'],
    games: Object.fromEntries(
      CONTROL_GAME_IDS.map((id) => [
        id,
        ['night-overwatch', 'tetracube'].includes(id) ? 'disabled' : 'enabled',
      ]),
    ),
  });
  const memory = controlDatabase((text, params) => {
    time += perQueryDelay;
    if (text.includes("current_setting('statement_timeout')")) return [{ statement, lock }];
    if (text.includes('set_config') && params[0] === statement && failRestore)
      throw new Error('restore failed');
    if (text.includes('pg_advisory_xact_lock_shared') && delayed) time += 2001;
    if (text.includes('from game_control.published_config'))
      return version
        ? [{ version, snapshot, digest: broken ? 'f'.repeat(64) : controlSnapshotDigest(snapshot) }]
        : [];
    if (text.includes('from game_control.current_policy'))
      return CONTROL_GAME_IDS.map((id) => ({
        game_id: id,
        state: snapshot.games[id],
        kill_epoch: 0,
        revision: version,
      }));
    return [];
  });
  const database = {
    transaction<T>(work: (tx: ControlDatabaseExecutor, remaining: () => number) => Promise<T>) {
      const deadline = time + 2000;
      return memory.db.transaction(async (tx) => {
        const result = await work(tx, () => {
          if (time >= deadline) throw new Error('CONTROL_UNAVAILABLE');
          return deadline - time;
        });
        if (failCommit) throw new Error('commit failed');
        return result;
      });
    },
    close() {},
  } satisfies ReturnType<typeof openControlDatabase>;
  const control = createCompetitionControl(database, fallback, () => time, 'runtime-primary');
  return {
    ...memory,
    control,
    database,
    publish(next = 1) {
      version = next;
    },
    advance(ms: number) {
      time += ms;
    },
    delay() {
      delayed = true;
    },
    queryDelay(ms: number) {
      perQueryDelay = ms;
    },
    failCommit(value: boolean) {
      failCommit = value;
    },
    timeouts(nextStatement: string, nextLock: string) {
      statement = nextStatement;
      lock = nextLock;
    },
    failRestore() {
      failRestore = true;
    },
    breakDigest() {
      broken = true;
    },
    origins(origins: string[]) {
      snapshot = { ...snapshot, apiOrigins: origins };
    },
    operations(operations: NightOperations) {
      snapshot = { ...snapshot, nightOperations: operations };
    },
  };
}
