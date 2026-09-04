import { HostError } from './errors.js';
import type { HostCapability } from './schemas.js';

/** Rejects startup when a Game Host omits a capability required by the Game manifest. */
export function assertHostCapabilities(
  required: readonly HostCapability[],
  granted: readonly HostCapability[],
): void {
  const missing = required.filter((capability) => !granted.includes(capability));
  if (missing.length > 0) {
    throw new HostError({
      code: 'CAPABILITY_MISSING',
      message: `Game Host did not grant required capabilities: ${missing.join(', ')}`,
      details: { missing },
    });
  }
}
