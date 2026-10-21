begin;
alter table management.content_drafts drop constraint if exists content_drafts_envelope_check;
alter table management.content_drafts add constraint content_drafts_envelope_check
  check (jsonb_typeof(envelope->'gameId') = 'string' and length(envelope->>'gameId') > 0);
commit;
