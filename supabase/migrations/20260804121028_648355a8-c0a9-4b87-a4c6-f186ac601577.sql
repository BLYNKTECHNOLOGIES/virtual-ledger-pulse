update public.hr_biometric_devices
set last_stamp = to_char(
      (last_stamp)::timestamp - make_interval(mins => coalesce(clock_offset_minutes, 0)),
      'YYYY-MM-DD HH24:MI:SS')
where last_stamp is not null
  and last_stamp <> '0'
  and coalesce(clock_offset_minutes, 0) <> 0;