-- Bills can now sit in committee for a month between being tabled and being
-- voted on, so the status check must admit that stage.
alter table public.bills drop constraint if exists bills_status_check;
alter table public.bills add constraint bills_status_check
  check (status in ('available', 'proposed', 'in_committee', 'passed', 'failed'));
