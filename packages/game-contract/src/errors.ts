import {
  hostErrorSchema,
  type HostErrorCode,
  type HostErrorInput,
  type JsonValue,
} from './schemas.js';

/** Stable error class shared across in-process and iframe Game Hosts. */
export class HostError extends Error {
  readonly code: HostErrorCode;
  readonly retryable?: boolean;
  readonly details?: Readonly<Record<string, JsonValue>>;

  constructor(input: HostErrorInput) {
    const parsed = hostErrorSchema.parse(input);
    super(parsed.message);
    this.name = 'HostError';
    this.code = parsed.code;
    this.retryable = parsed.retryable;
    this.details = parsed.details;
  }
}
