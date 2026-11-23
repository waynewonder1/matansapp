-- Export 1d: row level security and its rules (policies). READ-ONLY. Run it, then Export > Download CSV.
select 1 as part, tablename as table_name, '' as policy,
  format('alter table public.%I enable row level security;', tablename) as statement
from pg_tables where schemaname = 'public' and rowsecurity
union all
select 2, tablename, policyname,
  'create' || format(E' policy %I on public.%I as %s for %s to %s%s%s;', policyname, tablename, permissive, cmd,
    array_to_string(roles, ', '),
    coalesce(E'\n  using (' || qual || ')', ''), coalesce(E'\n  with check (' || with_check || ')', ''))
from pg_policies where schemaname = 'public'
order by 1, 2, 3;
