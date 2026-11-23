-- Export 1b: keys, checks, links between tables, indexes, and enum types. READ-ONLY. Run it, then Export > Download CSV.
select 1 as part, 'create' || format(' type public.%I as enum (%s);', t.typname,
    (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid)) as statement
from pg_type t join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typtype = 'e'
union all
select case when con.contype = 'f' then 3 else 2 end,
  format('alter table public.%I add constraint %I %s;', c.relname, con.conname, pg_get_constraintdef(con.oid))
from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and con.contype in ('p', 'u', 'c', 'f', 'x')
union all
select 4, pg_get_indexdef(i.indexrelid) || ';'
from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not exists (select 1 from pg_constraint con where con.conindid = i.indexrelid and con.contype in ('p', 'u', 'x'))
order by 1, 2;
