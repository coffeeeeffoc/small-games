begin;
alter table management.content_drafts
  add column if not exists trashed_at bigint,
  add column if not exists purge_after bigint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'content_drafts_trash_window') then
    alter table management.content_drafts add constraint content_drafts_trash_window check (
      (trashed_at is null and purge_after is null) or purge_after = trashed_at + 2592000000
    );
  end if;
end $$;

revoke delete on management.content_drafts, management.game_versions, management.audit_log from management_app;
revoke delete on runtime.game_versions, runtime.cloud_saves from runtime_app;
grant update (trashed_at, purge_after) on management.content_drafts to management_app;
commit;
