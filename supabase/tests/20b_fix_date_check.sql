-- Stage 20b-FIX check. Paste into the Supabase SQL editor and run.
-- It ends by raising "RESULT ..." on purpose, which also undoes what it did.
-- Run AFTER migration 20261118100000_quotation_issue_date_amman.sql.

-- ===== D1: a new quotation takes today's date in Amman ======================
-- Wanted: issue date = Amman date (same) | valid for 30 days
-- (the UTC date is shown only for comparison: it differs from the Amman date
--  between 00:00 and 03:00 Amman time)
do $$
declare v_client uuid; r record;
begin
  update pricing_settings set quote_validity_days = 30;
  insert into clients (full_name, phone) values ('TEST client 20b fix', '0790000000') returning id into v_client;
  insert into quotations (client_id) values (v_client) returning * into r;
  raise exception 'RESULT D1 -> issue date % | Amman date % (%) | UTC date % | valid for % days',
    r.issue_date, (now() at time zone 'Asia/Amman')::date,
    case when r.issue_date = (now() at time zone 'Asia/Amman')::date then 'same' else 'DIFFERENT (wrong)' end,
    (now() at time zone 'UTC')::date, r.valid_until - r.issue_date;
end $$;
