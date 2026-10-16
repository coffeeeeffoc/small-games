import { afterEach, expect, it, vi } from 'vitest';
const driver = vi.hoisted(() => ({
  pools: [] as {
    unsafe: ReturnType<typeof vi.fn>;
    begin: ReturnType<typeof vi.fn>;
    end: (...args: unknown[]) => Promise<unknown>;
  }[],
  block: false,
  release: undefined as (() => void) | undefined,
}));
vi.mock('postgres', () => ({
  default: vi.fn(() => {
    let rejectPending: ((error: Error) => void) | undefined;
    let rejectTransaction: ((error: Error) => void) | undefined;
    let closed = false;
    const pool = {
      unsafe: vi.fn(async () => {
        if (closed) throw new Error('CONNECTION_DESTROYED');
        if (driver.block) {
          driver.block = false;
          await new Promise<void>((resolve, reject) => {
            driver.release = resolve;
            rejectPending = reject;
          });
        }
        return [];
      }),
      begin: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
        await pool.unsafe();
        return new Promise((resolve, reject) => {
          rejectTransaction = reject;
          void Promise.resolve(work(pool))
            .then(async (value) => {
              await pool.unsafe();
              resolve(value);
            }, reject)
            .catch(reject);
        });
      }),
      end: vi.fn(async () => {
        closed = true;
        rejectPending?.(new Error('CONNECTION_DESTROYED'));
        rejectTransaction?.(new Error('CONNECTION_DESTROYED'));
      }),
    };
    driver.pools.push(pool);
    return pool;
  }),
}));
vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: (client: (typeof driver.pools)[number]) => ({ execute: client.unsafe }),
}));
import { openControlDatabase } from '../src/database.js';

afterEach(() => {
  vi.useRealTimers();
  driver.pools.length = 0;
  driver.block = false;
  driver.release = undefined;
});
it('serializes different control operations without a driver acquisition queue', async () => {
  driver.block = true;
  const database = openControlDatabase('postgres://fixture');
  const order: string[] = [];
  const a = database.transaction(async () => {
    order.push('cors');
    return 1;
  });
  const b = database.transaction(async () => {
    order.push('kart');
    return 2;
  });
  expect(driver.pools[0]!.unsafe).toHaveBeenCalledTimes(1);
  driver.release!();
  expect(await Promise.all([a, b])).toEqual([1, 2]);
  expect(order).toEqual(['cors', 'kart']);
  expect(driver.pools).toHaveLength(1);
  database.close();
  expect(driver.pools[0]!.end).toHaveBeenCalledWith({ timeout: 0 });
});
it('includes connection/BEGIN in the deadline, aborts only its pool and rebuilds after failure', async () => {
  vi.useFakeTimers();
  driver.block = true;
  const database = openControlDatabase('postgres://fixture');
  const late = vi.fn(async () => 1);
  const a = expect(database.transaction(late)).rejects.toThrow('CONTROL_UNAVAILABLE');
  const b = expect(database.transaction(late)).rejects.toThrow('CONTROL_UNAVAILABLE');
  await vi.advanceTimersByTimeAsync(2000);
  await Promise.all([a, b]);
  driver.release?.();
  expect(late).not.toHaveBeenCalled();
  expect(driver.pools[0]!.end).toHaveBeenCalledTimes(1);
  expect(await database.transaction(async () => 2)).toBe(2);
  expect(driver.pools).toHaveLength(2);
  database.close();
});
it('bounds queued admission, expires queued callbacks and closes without graceful waiting', async () => {
  vi.useFakeTimers();
  driver.block = true;
  const database = openControlDatabase('postgres://fixture');
  const late = vi.fn(async () => 1);
  const active = expect(database.transaction(late)).rejects.toThrow();
  const queued = Array.from({ length: 5 }, () =>
    expect(database.transaction(late)).rejects.toThrow('CONTROL_UNAVAILABLE'),
  );
  await expect(database.transaction(late)).rejects.toThrow('CONTROL_UNAVAILABLE');
  database.close();
  await Promise.all([active, ...queued]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(late).not.toHaveBeenCalled();
  await expect(database.transaction(late)).rejects.toThrow('CONTROL_UNAVAILABLE');
});
it('rejects a non-SQL await at the deadline, releases its slot, and blocks all late SQL/commit', async () => {
  vi.useFakeTimers();
  const database = openControlDatabase('postgres://fixture');
  let resume: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const request = expect(
    database.transaction(async (executor) => {
      await barrier;
      await executor.execute('select 1');
      return 1;
    }),
  ).rejects.toThrow('CONTROL_UNAVAILABLE');
  await vi.advanceTimersByTimeAsync(0);
  const old = driver.pools[0]!;
  expect(old.begin).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2000);
  await request;
  const calls = old.unsafe.mock.calls.length;
  expect(await database.transaction(async () => 2)).toBe(2);
  resume!();
  await vi.advanceTimersByTimeAsync(0);
  expect(old.unsafe).toHaveBeenCalledTimes(calls);
  expect(await database.transaction(async () => 3)).toBe(3);
  database.close();
});
it('a disconnected bound transaction cannot reconnect later SQL in autocommit', async () => {
  const database = openControlDatabase('postgres://fixture');
  let resume: (() => void) | undefined, entered: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const request = expect(
    database.transaction(async (executor) => {
      entered!();
      await barrier;
      await executor.execute('insert into fixture values (1)');
      return 1;
    }),
  ).rejects.toThrow('CONNECTION_DESTROYED');
  await ready;
  const old = driver.pools[0]!;
  await old.end({ timeout: 0 });
  await request;
  const calls = old.unsafe.mock.calls.length;
  resume!();
  await new Promise((resolve) => setImmediate(resolve));
  expect(old.unsafe).toHaveBeenCalledTimes(calls);
  expect(await database.transaction(async () => 2)).toBe(2);
  database.close();
});
