DO $$
DECLARE v_id int;
BEGIN
  FOREACH v_id IN ARRAY ARRAY[1,2,4,6,8,10,12,71]
  LOOP
    BEGIN
      PERFORM cron.unschedule(v_id);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'skip % : %', v_id, SQLERRM;
    END;
  END LOOP;
END $$;