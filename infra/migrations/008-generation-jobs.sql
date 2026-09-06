begin;
create table if not exists management.generation_jobs (
  id uuid primary key,
  operator_id uuid not null references management.accounts(id),
  game_id text not null,
  schema_version integer not null check (schema_version > 0),
  input text not null check (length(input) between 1 and 4000),
  input_hash char(64) not null,
  attempt integer not null check (attempt > 0),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  model text,
  output_hash char(64),
  validation_result jsonb,
  disposition text not null check (disposition in ('pending', 'draft_created', 'validation_failed', 'failed')),
  draft_id uuid references management.content_drafts(id),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists generation_jobs_queue on management.generation_jobs (created_at) where status = 'queued';
grant select, insert, update on management.generation_jobs to management_app;
commit;
