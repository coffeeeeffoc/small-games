begin;
create table if not exists management.ad_drafts (
  id uuid primary key,
  name text not null check (length(name) between 1 and 120),
  revision integer not null check (revision >= 0),
  envelope jsonb not null check (envelope->>'formatVersion' = '1' and envelope->>'gameId' is not null)
);
grant select, insert, update on management.ad_drafts to management_app;
commit;
