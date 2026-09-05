begin;
create table if not exists management.game_versions (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  game_id text not null,
  snapshot jsonb not null,
  created_at bigint not null
);
create table if not exists management.release_channels (
  game_id text not null,
  channel text not null check (channel in ('development','canary','stable')),
  revision integer not null default 0 check (revision >= 0),
  version_id text references management.game_versions(id),
  primary key (game_id, channel)
);
create table if not exists management.release_outbox (
  event_id uuid primary key,
  game_id text not null,
  channel text not null,
  revision integer not null check (revision > 0),
  request_hash text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  last_error text,
  delivered boolean not null default false,
  created_at bigint not null,
  unique (game_id, channel, revision)
);
create unique index if not exists one_pending_channel_transition
  on management.release_outbox (game_id, channel) where not delivered;
create table if not exists management.audit_log (
  id uuid primary key,
  actor_id uuid not null,
  action text not null,
  details jsonb not null,
  created_at bigint not null
);
grant select, insert on management.game_versions, management.audit_log to management_app;
grant select, insert, update on management.release_channels, management.release_outbox to management_app;

create table if not exists runtime.game_versions (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  game_id text not null,
  snapshot jsonb not null
);
create table if not exists runtime.release_channels (
  game_id text not null,
  channel text not null check (channel in ('development','canary','stable')),
  revision integer not null default 0 check (revision >= 0),
  version_id text references runtime.game_versions(id),
  primary key (game_id, channel)
);
create table if not exists runtime.projection_receipts (
  event_id uuid primary key,
  event_hash text not null,
  receipt jsonb not null
);
grant select, insert on runtime.game_versions, runtime.projection_receipts to runtime_app;
grant select, insert, update on runtime.release_channels to runtime_app;
commit;
