-- Internal caller only; no fixture persists.
BEGIN;
DO $$ DECLARE new_id uuid; refused boolean := false;
BEGIN
 INSERT INTO public.positions(title,in_workforce_planning)
 VALUES('DS1 rollback test',false) RETURNING id INTO new_id;
 IF (SELECT hierarchy_level FROM public.positions WHERE id=new_id) IS NOT NULL THEN
  RAISE EXCEPTION 'New designation must have NULL grade';
 END IF;
 BEGIN UPDATE public.positions SET hierarchy_level=9 WHERE id=new_id;
 EXCEPTION WHEN check_violation THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'Grade 9 must be refused'; END IF;
 refused:=false;
 BEGIN UPDATE public.positions SET reports_to_position_id=new_id WHERE id=new_id;
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%already reports%' THEN RAISE; END IF;
  refused:=true;
 END;
 IF NOT refused THEN RAISE EXCEPTION 'Self-reporting must be refused'; END IF;
END $$;
SELECT 'PASS: NULL default, grade bounds, self-reporting' AS result;
ROLLBACK;