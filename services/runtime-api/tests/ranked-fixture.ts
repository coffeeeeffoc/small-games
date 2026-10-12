import { CompetitionError } from '../src/competition/types.js';
import type {
  RankedRun,
  Receipt,
  RunRepository,
  Settlement,
} from '../src/competition/ranked-types.js';

export function memoryRuns() {
  const runs = new Map<string, RankedRun>();
  const receipts = new Map<string, Receipt>();
  const results = new Map<string, Settlement>();
  const locks = new Map<string, Promise<unknown>>();
  const repository: RunRepository = {
    async create(run) {
      runs.set(run.id, structuredClone(run));
    },
    async mutate(id, change) {
      const previous = locks.get(id) ?? Promise.resolve();
      const operation = previous
        .catch(() => {})
        .then(async () => {
          const existing = runs.get(id);
          if (!existing) throw new CompetitionError('RUN_NOT_FOUND', 404);
          const run = structuredClone(existing);
          const pending = new Map<string, Receipt>();
          let result: Settlement | undefined;
          const output = await change({
            run,
            receipt: async (seq) => receipts.get(`${id}:${seq}`),
            saveReceipt: async (seq, receipt) => {
              pending.set(`${id}:${seq}`, receipt);
            },
            record: async (entry) => {
              result = entry;
            },
          });
          runs.set(id, run);
          for (const [key, receipt] of pending) receipts.set(key, structuredClone(receipt));
          if (result) results.set(id, structuredClone(result));
          return output;
        });
      locks.set(id, operation);
      return operation;
    },
  };
  return { repository, runs, receipts, results };
}
