-- A14: Change terminal-sla-check cron from every 5 minutes to every 10 minutes
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'terminal-sla-check'),
  '*/10 * * * *'
);