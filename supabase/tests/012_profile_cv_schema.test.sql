begin;

create extension if not exists pgtap with schema extensions;
select plan(43);

select has_table(
  'public',
  'cv_categories',
  'CV categories table exists'
);

select has_table(
  'public',
  'cv_entries',
  'CV entries table exists'
);

select has_column(
  'public',
  'cv_categories',
  'profile_id',
  'CV category belongs to a profile'
);

select has_column(
  'public',
  'cv_categories',
  'category_type',
  'CV category has a stable type'
);

select has_column(
  'public',
  'cv_categories',
  'label',
  'CV category has a public label'
);

select has_column(
  'public',
  'cv_categories',
  'display_order',
  'CV category has a display order'
);

select has_column(
  'public',
  'cv_categories',
  'is_visible',
  'CV category controls visibility'
);

select has_column(
  'public',
  'cv_entries',
  'category_id',
  'CV entry belongs to a category'
);

select has_column(
  'public',
  'cv_entries',
  'source_activity_id',
  'CV entry can reference a Presentation'
);

select has_column(
  'public',
  'cv_entries',
  'year_label',
  'manual CV entry has a year label'
);

select has_column(
  'public',
  'cv_entries',
  'title',
  'manual CV entry has a title'
);

select has_column(
  'public',
  'cv_entries',
  'organization',
  'manual CV entry has an organization'
);

select has_column(
  'public',
  'cv_entries',
  'location_text',
  'manual CV entry has a location'
);

select has_column(
  'public',
  'cv_entries',
  'url',
  'manual CV entry has an external URL'
);

select has_column(
  'public',
  'cv_entries',
  'display_order',
  'CV entry has a display order'
);

select has_column(
  'public',
  'cv_entries',
  'is_visible',
  'CV entry controls visibility'
);

select has_index(
  'public',
  'cv_categories',
  'cv_categories_profile_order',
  'ordered profile category lookup is indexed'
);

select has_index(
  'public',
  'cv_entries',
  'cv_entries_category_order',
  'ordered category entry lookup is indexed'
);

select has_index(
  'public',
  'cv_entries',
  'cv_entries_public_lookup',
  'public CV entry lookup is indexed'
);

select ok(
  (
    select relrowsecurity
      from pg_class
     where oid = 'public.cv_categories'::regclass
  ),
  'CV category RLS is enabled'
);

select ok(
  (
    select relforcerowsecurity
      from pg_class
     where oid = 'public.cv_categories'::regclass
  ),
  'CV category RLS is forced'
);

select ok(
  (
    select relrowsecurity
      from pg_class
     where oid = 'public.cv_entries'::regclass
  ),
  'CV entry RLS is enabled'
);

select ok(
  (
    select relforcerowsecurity
      from pg_class
     where oid = 'public.cv_entries'::regclass
  ),
  'CV entry RLS is forced'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.cv_categories',
    'INSERT'
  ),
  'anonymous users cannot insert CV categories'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.cv_categories',
    'UPDATE'
  ),
  'anonymous users cannot update CV categories'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.cv_entries',
    'INSERT'
  ),
  'anonymous users cannot insert CV entries'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.cv_entries',
    'DELETE'
  ),
  'anonymous users cannot delete CV entries'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.cv_categories',
    'DELETE'
  ),
  'authenticated users cannot delete CV categories'
);

select ok(
  has_table_privilege(
    'authenticated',
    'public.cv_entries',
    'DELETE'
  ),
  'authenticated users receive RLS-controlled manual entry deletion'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.cv_entries',
    'source_activity_id',
    'INSERT'
  ),
  'ordinary users cannot create Presentation linkage directly'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.cv_entries',
    'source_activity_id',
    'UPDATE'
  ),
  'ordinary users cannot change Presentation linkage directly'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.cv_categories',
    'profile_id',
    'UPDATE'
  ),
  'ordinary users cannot change CV category ownership'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.cv_categories',
    'category_type',
    'UPDATE'
  ),
  'ordinary users cannot change the stable category type'
);

select ok(
  exists (
    select 1
      from pg_constraint
     where conrelid = 'public.cv_categories'::regclass
       and conname = 'cv_categories_profile_type_unique'
  ),
  'a profile has at most one category of each stable type'
);

select ok(
  exists (
    select 1
      from pg_constraint
     where conrelid = 'public.cv_entries'::regclass
       and conname = 'cv_entries_source_activity_unique'
  ),
  'a Presentation can create at most one CV placement'
);

select ok(
  exists (
    select 1
      from pg_constraint
     where conrelid = 'public.cv_entries'::regclass
       and conname = 'cv_entries_category_id_fkey'
       and confdeltype = 'c'
  ),
  'deleting a category cascades its entries'
);

select ok(
  exists (
    select 1
      from pg_constraint
     where conrelid = 'public.cv_entries'::regclass
       and conname = 'cv_entries_source_activity_id_fkey'
       and confdeltype = 'c'
  ),
  'deleting a source Activity cascades its CV placement'
);

select ok(
  to_regprocedure(
    'private.can_manage_cv_owner(uuid)'
  ) is not null,
  'CV profile management helper exists'
);

select ok(
  to_regprocedure(
    'private.sync_profile_activity_cv_entry()'
  ) is not null,
  'Presentation-to-CV synchronization function exists'
);

select ok(
  exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.profile_activities'::regclass
       and tgname = 'profile_activities_sync_cv_entry'
       and not tgisinternal
  ),
  'Presentation changes trigger CV synchronization'
);

select ok(
  exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.cv_categories'::regclass
       and tgname = 'cv_categories_prepare_row'
       and not tgisinternal
  ),
  'CV categories use their validation trigger'
);

select ok(
  exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.cv_entries'::regclass
       and tgname = 'cv_entries_prepare_row'
       and not tgisinternal
  ),
  'CV entries use their validation trigger'
);

select ok(
  exists (
    select 1
      from pg_constraint
     where conrelid = 'public.cv_entries'::regclass
       and conname = 'cv_entries_manual_title_required'
  ),
  'manual CV entries require a title'
);

select * from finish();
rollback;