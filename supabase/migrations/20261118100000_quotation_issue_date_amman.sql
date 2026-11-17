-- Stage 20b-FIX — a new quotation is dated by the Amman calendar
--
-- The database clock runs on UTC, so "current_date" was still yesterday
-- between midnight and 03:00 in Amman: a quotation made at 01:45 on 18 Nov was
-- dated 17 Nov and valid until 17 Dec (found by the 20b tester).
-- valid_until is issue_date + the validity days (trigger
-- quotations_before_write), so it follows this default.
alter table public.quotations
  alter column issue_date set default ((now() at time zone 'Asia/Amman')::date);
