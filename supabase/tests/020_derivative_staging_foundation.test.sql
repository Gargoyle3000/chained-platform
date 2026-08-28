begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('storage', 'buckets', 'Storage bucket catalogue exists');
select ok(
  exists (select 1 from storage.buckets where id = 'work-derivative-staging' and public = false),
  'derivative staging bucket exists and is private'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'work-derivative-staging'),
  array['image/webp']::text[],
  'derivative staging bucket accepts only processor WebP outputs'
);
select ok(
  not exists (
    select 1
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and roles && array['anon'::name, 'authenticated'::name, 'public'::name]
       and (coalesce(qual, '') || coalesce(with_check, '')) not like '%work-originals%'
  ),
  'no broad browser Storage policy can reach derivative staging'
);
insert into storage.objects (bucket_id, name)
values ('work-derivative-staging', 'server-owned/fixture.webp');

set local role anon;
select is_empty(
  $$select id from storage.objects where bucket_id = 'work-derivative-staging'$$,
  'anon cannot read or list derivative staging objects'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('work-derivative-staging', 'anon/test.webp')$$,
  '42501', null, 'anon cannot write derivative staging objects'
);
select is_empty(
  $$update storage.objects set name = 'anon/changed.webp' where bucket_id = 'work-derivative-staging' returning id$$,
  'anon cannot update derivative staging objects'
);
select throws_ok(
  $$delete from storage.objects where bucket_id = 'work-derivative-staging'$$,
  '42501', null, 'anon cannot delete derivative staging objects'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is_empty(
  $$select id from storage.objects where bucket_id = 'work-derivative-staging'$$,
  'authenticated browser users cannot read or list derivative staging objects'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('work-derivative-staging', 'browser/test.webp')$$,
  '42501', null, 'authenticated browser users cannot write derivative staging objects'
);
select is_empty(
  $$update storage.objects set name = 'browser/changed.webp' where bucket_id = 'work-derivative-staging' returning id$$,
  'authenticated browser users cannot update derivative staging objects'
);
select throws_ok(
  $$delete from storage.objects where bucket_id = 'work-derivative-staging'$$,
  '42501', null, 'authenticated browser users cannot delete derivative staging objects'
);
reset role;

select * from finish();
rollback;
