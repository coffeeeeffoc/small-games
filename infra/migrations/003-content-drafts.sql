begin;
create table if not exists management.content_drafts (
  id uuid primary key,
  name text not null check (length(name) between 1 and 120),
  revision integer not null check (revision >= 0),
  envelope jsonb not null check (envelope->>'gameId' = 'cultivation')
);
grant select, insert, update on management.content_drafts to management_app;
commit;
