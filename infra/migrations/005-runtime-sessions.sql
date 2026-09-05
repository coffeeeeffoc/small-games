begin;
create table if not exists runtime.canary_assignments (
  player_id uuid not null,
  game_id text not null,
  stable_epoch text not null,
  version_id text not null references runtime.game_versions(id),
  primary key (player_id, game_id, stable_epoch)
);
create table if not exists runtime.game_sessions (
  session_id uuid primary key,
  player_id uuid not null,
  game_id text not null,
  version_id text not null references runtime.game_versions(id),
  context jsonb not null,
  created_at bigint not null
);
grant select, insert on runtime.canary_assignments, runtime.game_sessions to runtime_app;
commit;
