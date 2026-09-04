import { HostError, type HostErrorCode } from '@coffeeeeffoc/game-contract';

/** Minimal framework-neutral assertion used by reusable contract vectors. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Requires an asynchronous adapter operation to fail with one standard HostError code. */
export async function expectHostError(
  operation: () => Promise<unknown>,
  code: HostErrorCode,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    invariant(error instanceof HostError, 'Operation did not throw a HostError');
    invariant(error.code === code, `Expected ${code}, received ${error.code}`);
    return;
  }
  throw new Error(`Expected HostError ${code}`);
}

/** Requires a synchronous contract guard to fail with one standard HostError code. */
export function expectSynchronousHostError(operation: () => unknown, code: HostErrorCode): void {
  try {
    operation();
  } catch (error) {
    invariant(error instanceof HostError, 'Operation did not throw a HostError');
    invariant(error.code === code, `Expected ${code}, received ${error.code}`);
    return;
  }
  throw new Error(`Expected HostError ${code}`);
}
