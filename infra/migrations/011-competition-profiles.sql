BEGIN;
ALTER TABLE runtime.competition_players
  ADD COLUMN IF NOT EXISTS display_name text
  CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 2 AND 16);
-- Display names may repeat. Identity and scores continue to use the immutable UUID.
COMMIT;
