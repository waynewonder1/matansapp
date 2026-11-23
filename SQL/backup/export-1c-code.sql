-- Export 1c: views, functions and triggers. READ-ONLY. Run it, then Export > Download CSV.
select 1 as part, c.oid::bigint as k, format('create or replace view public.%I as %s', c.relname, pg_get_viewdef(c.oid)) as statement
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
union all
select 1, p.oid::bigint, pg_get_functiondef(p.oid) || ';'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 2, t.oid::bigint, pg_get_triggerdef(t.oid) || ';'
from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
where not t.tgisinternal and pn.nspname = 'public'
order by 1, 2;
