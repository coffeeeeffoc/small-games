import { sys } from 'cc';

export type NightStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
> & {
  readonly source?: string;
  flush?: () => Promise<void>;
  refresh?: () => Promise<void>;
};

/** All Night business callers share this instance; only engine/dev-mode use the browser facade. */
export function getNightStorage(): NightStorage {
  if (!sys.isBrowser) return sys.localStorage;
  const storage = (globalThis as typeof globalThis & { __nightStorage?: NightStorage })
    .__nightStorage;
  if (!storage)
    throw Object.assign(new Error('Night storage is not initialized'), {
      code: 'STORAGE_UNAVAILABLE',
    });
  return storage;
}
