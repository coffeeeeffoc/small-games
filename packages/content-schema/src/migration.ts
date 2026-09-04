/** Forward-only Dynamic Content migration implemented and owned by an individual Game. */
export type ContentMigration<TInput = unknown, TOutput = unknown> = {
  fromVersion: number;
  toVersion: number;
  migrate(payload: TInput): TOutput;
};
