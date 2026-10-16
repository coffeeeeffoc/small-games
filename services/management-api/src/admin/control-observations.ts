import { CONSUMERS, type Head, type Observation, type Revision } from './control-model.js';

/** Reports describe known instances; they cannot prove that unknown or expired processes stopped. */
export function controlApplicationState(
  head: Head,
  revision: Revision | undefined,
  observations: Observation[],
  now: number,
) {
  const fresh = (item: Observation) => item.observedAt <= now && item.observedAt > now - 60_000;
  const matching = observations.filter(
    (item) =>
      revision &&
      item.version === head.version &&
      item.digest === revision.digest &&
      item.status === 'applied' &&
      fresh(item),
  );
  const observed = CONSUMERS.every((consumer) => {
    const reports = observations.filter((item) => item.consumer === consumer);
    return reports.length > 0 && reports.every((item) => matching.includes(item));
  });
  return {
    observationCoverage: {
      complete: false as const,
      missingConsumers: CONSUMERS.filter(
        (consumer) => !observations.some((item) => item.consumer === consumer && fresh(item)),
      ),
      expiredUnknown: observations
        .filter((item) => !fresh(item))
        .map(({ consumer, instanceId }) => ({ consumer, instanceId })),
    },
    status: !head.version
      ? 'unpublished'
      : observed
        ? 'observed'
        : matching.length
          ? 'partial'
          : 'desired',
  };
}
