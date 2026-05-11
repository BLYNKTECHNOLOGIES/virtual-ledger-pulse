-- Fix user deletion failure caused by terminal_mpi_snapshots.user_id NOT NULL with SET NULL FK.
-- These snapshots are per-user performance analytics; delete them when the user is deleted.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.terminal_mpi_snapshots'::regclass
      AND contype = 'f'
      AND conname ILIKE '%user_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.terminal_mpi_snapshots DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.terminal_mpi_snapshots
  ADD CONSTRAINT terminal_mpi_snapshots_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;