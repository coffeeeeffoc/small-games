import { nightRuntimeSchema, type NightRuntime } from '@coffeeeeffoc/service-kit';
import type { Observation } from './control-model.js';

export function validateRuntimeOrigin(value: string | undefined) {
  if (!value) return;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== value ||
      url.username ||
      url.password
    )
      throw Error();
  } catch {
    throw Error('Invalid management configuration: ADMIN_RUNTIME_ORIGIN');
  }
}

export async function readNightRuntime(
  origin: string | undefined,
  observations: Observation[],
  now = Date.now,
  request = fetch,
) {
  let report: NightRuntime | null = null;
  if (origin) {
    try {
      const response = await request(`${origin}/health/night-rules`, {
        signal: AbortSignal.timeout(3000),
        redirect: 'error',
      });
      if (!response.ok) throw Error();
      report = nightRuntimeSchema.parse(await response.json());
    } catch {
      /* A missing or old service is unknown, never evidence of compatibility. */
    }
  }
  const checkedAt = now();
  return {
    checkedAt,
    report,
    error: report ? null : origin ? 'UNAVAILABLE' : 'NOT_CONFIGURED',
    // shortcut: one configured Runtime is probed; add per-instance discovery before using a pool.
    otherInstances: observations
      .filter(
        (o) =>
          o.consumer === 'runtime' &&
          o.instanceId !== report?.instanceId &&
          o.observedAt > checkedAt - 60_000 &&
          o.observedAt <= checkedAt,
      )
      .map((o) => o.instanceId),
  };
}
