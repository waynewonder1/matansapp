-- Export 2 of 2: the starting data that is NOT about any person: classes, learning areas, terms and the question bank.
-- READ-ONLY: it changes nothing. No learner, guardian or staff details are included.
-- Who wrote or approved a question is left out, because those staff accounts would not exist in a new database.
-- How to use: Supabase > SQL Editor > New query > paste all of this > Run > Export > Download CSV.
with parts(n, t, stmt) as (
  select 1, 'classes', format('insert into public.classes select * from jsonb_populate_record(null::public.classes, %L) on conflict do nothing;', to_jsonb(r)) from public.classes r
  union all
  select 2, 'learning_areas', format('insert into public.learning_areas select * from jsonb_populate_record(null::public.learning_areas, %L) on conflict do nothing;', to_jsonb(r)) from public.learning_areas r
  union all
  select 3, 'terms', format('insert into public.terms select * from jsonb_populate_record(null::public.terms, %L) on conflict do nothing;', to_jsonb(r)) from public.terms r
  union all
  select 4, 'competencies', format('insert into public.competencies select * from jsonb_populate_record(null::public.competencies, %L) on conflict do nothing;', to_jsonb(r) - 'created_by') from public.competencies r
  union all
  select 5, 'question_variants', format('insert into public.question_variants select * from jsonb_populate_record(null::public.question_variants, %L) on conflict do nothing;', to_jsonb(r) - 'created_by' - 'approved_by') from public.question_variants r
  union all
  -- make new ids carry on after the copied ones
  select 6, x, format($f$select setval(pg_get_serial_sequence('public.%1$s', 'id'), greatest(1, (select coalesce(max(id), 1) from public.%1$s)));$f$, x)
  from unnest(array['classes', 'learning_areas', 'terms', 'competencies', 'question_variants']) as x
  where pg_get_serial_sequence('public.' || x, 'id') is not null
)
select n as section, stmt as statement from parts order by n, t, stmt;
