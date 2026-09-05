begin;
create table if not exists runtime.players (
  player_id uuid primary key,
  credential_hash text not null unique check (credential_hash ~ '^[a-f0-9]{64}$'),
  created_at bigint not null
);
create table if not exists runtime.cloud_saves (
  player_id uuid not null,
  game_id text not null,
  save_key text not null check (length(save_key) between 1 and 128),
  value jsonb not null,
  version bigint not null check (version > 0),
  updated_at bigint not null,
  primary key (player_id, game_id, save_key)
);
grant select, insert on runtime.players to runtime_app;
grant select, insert, update on runtime.cloud_saves to runtime_app;
commit;
