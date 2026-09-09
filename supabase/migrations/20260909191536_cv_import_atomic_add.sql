-- Atomic, profile-authorized persistence for reviewed CV Import candidates.
-- Imported records are ordinary manual CV entries and never retain provider,
-- document, or Presentation source data.

create function private.import_cv_entries(
  target_profile_id uuid,
  selected_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  submitted_count integer;
  inserted_count integer;
  item jsonb;
  normalized_entries jsonb := '[]'::jsonb;
  category_type_value text;
  year_label_value text;
  title_value text;
  organization_value text;
  location_value text;
  url_value text;
begin
  if actor_id is null
     or not private.can_manage_cv_owner(target_profile_id) then
    raise exception 'The Artist CV may not be imported.'
      using errcode = '42501';
  end if;

  if selected_entries is null
     or jsonb_typeof(selected_entries) <> 'array' then
    raise exception 'CV Import entries must be an array.'
      using errcode = '22023';
  end if;

  submitted_count := jsonb_array_length(selected_entries);

  if submitted_count < 1 or submitted_count > 500 then
    raise exception 'CV Import requires between 1 and 500 entries.'
      using errcode = '22023';
  end if;

  -- Serialize imports for one profile across database sessions so the exact
  -- duplicate check and insert cannot race with another import submission.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_profile_id::text, 4348494)
  );

  perform private.ensure_fixed_cv_categories(target_profile_id);

  if (
    select count(*) <> 10
      from public.cv_categories as category
     where category.profile_id = target_profile_id
       and category.category_type in (
         'education',
         'solo_exhibition',
         'duo_exhibition',
         'group_presentation',
         'award',
         'grant',
         'collection',
         'residency',
         'teaching',
         'curatorial'
       )
  ) then
    raise exception 'The fixed CV category structure is unavailable.'
      using errcode = '55000';
  end if;

  for item in
    select value
      from jsonb_array_elements(selected_entries)
  loop
    if jsonb_typeof(item) <> 'object'
       or not item ?& array[
         'categoryType',
         'yearLabel',
         'title',
         'organization',
         'locationText',
         'url',
         'sourceActivityId'
       ]
       or exists (
         select 1
           from jsonb_object_keys(item) as supplied(key)
          where supplied.key <> all (array[
            'categoryType',
            'yearLabel',
            'title',
            'organization',
            'locationText',
            'url',
            'sourceActivityId'
          ])
       ) then
      raise exception 'A CV Import entry has an invalid shape.'
        using errcode = '22023';
    end if;

    if jsonb_typeof(item -> 'categoryType') <> 'string'
       or jsonb_typeof(item -> 'title') <> 'string'
       or jsonb_typeof(item -> 'sourceActivityId') <> 'null'
       or jsonb_typeof(item -> 'yearLabel') not in ('string', 'null')
       or jsonb_typeof(item -> 'organization') not in ('string', 'null')
       or jsonb_typeof(item -> 'locationText') not in ('string', 'null')
       or jsonb_typeof(item -> 'url') not in ('string', 'null') then
      raise exception 'A CV Import entry has invalid field types.'
        using errcode = '22023';
    end if;

    category_type_value := item ->> 'categoryType';
    if category_type_value not in (
      'education',
      'solo_exhibition',
      'duo_exhibition',
      'group_presentation',
      'award',
      'grant',
      'collection',
      'residency',
      'teaching',
      'curatorial'
    ) then
      raise exception 'A CV Import category is unsupported.'
        using errcode = '22023';
    end if;

    year_label_value := nullif(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(item ->> 'yearLabel'),
        '[[:space:]]+',
        ' ',
        'g'
      ),
      ''
    );
    title_value := pg_catalog.regexp_replace(
      pg_catalog.btrim(item ->> 'title'),
      '[[:space:]]+',
      ' ',
      'g'
    );
    organization_value := nullif(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(item ->> 'organization'),
        '[[:space:]]+',
        ' ',
        'g'
      ),
      ''
    );
    location_value := nullif(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(item ->> 'locationText'),
        '[[:space:]]+',
        ' ',
        'g'
      ),
      ''
    );
    url_value := nullif(pg_catalog.btrim(item ->> 'url'), '');

    if title_value = ''
       or char_length(title_value) > 300
       or char_length(year_label_value) > 40
       or char_length(organization_value) > 300
       or char_length(location_value) > 300
       or char_length(url_value) > 2000
       or (
         url_value is not null
         and url_value !~* '^https?://'
       ) then
      raise exception 'A CV Import entry contains invalid content.'
        using errcode = '22023';
    end if;

    normalized_entries := normalized_entries || jsonb_build_array(
      jsonb_build_object(
        'categoryType', category_type_value,
        'yearLabel', year_label_value,
        'title', title_value,
        'organization', organization_value,
        'locationText', location_value,
        'url', url_value
      )
    );
  end loop;

  with submitted as (
    select
      item.ordinality,
      item.value ->> 'categoryType' as category_type,
      nullif(item.value ->> 'yearLabel', '') as year_label,
      item.value ->> 'title' as title,
      nullif(item.value ->> 'organization', '') as organization,
      nullif(item.value ->> 'locationText', '') as location_text,
      nullif(item.value ->> 'url', '') as url,
      pg_catalog.regexp_replace(
        pg_catalog.concat_ws(
          ', ',
          nullif(item.value ->> 'title', ''),
          nullif(item.value ->> 'organization', ''),
          nullif(item.value ->> 'locationText', '')
        ),
        '[[:space:]]+',
        ' ',
        'g'
      ) as complete_line
    from jsonb_array_elements(normalized_entries)
      with ordinality as item(value, ordinality)
  ),
  unique_submitted as (
    select distinct on (
      submitted.category_type,
      coalesce(submitted.year_label, ''),
      submitted.complete_line
    )
      submitted.*
    from submitted
    order by
      submitted.category_type,
      coalesce(submitted.year_label, ''),
      submitted.complete_line,
      submitted.ordinality
  ),
  resolved as (
    select
      unique_submitted.*,
      category.id as category_id
    from unique_submitted
    join public.cv_categories as category
      on category.profile_id = target_profile_id
     and category.category_type = unique_submitted.category_type
  ),
  new_entries as (
    select resolved.*
      from resolved
     where not exists (
       select 1
         from public.cv_entries as existing
         join public.cv_categories as existing_category
           on existing_category.id = existing.category_id
        where existing_category.profile_id = target_profile_id
          and existing_category.category_type = resolved.category_type
          and coalesce(
            pg_catalog.regexp_replace(
              pg_catalog.btrim(existing.year_label),
              '[[:space:]]+',
              ' ',
              'g'
            ),
            ''
          ) = coalesce(resolved.year_label, '')
          and pg_catalog.regexp_replace(
            pg_catalog.concat_ws(
              ', ',
              nullif(pg_catalog.btrim(existing.title), ''),
              nullif(pg_catalog.btrim(existing.organization), ''),
              nullif(pg_catalog.btrim(existing.location_text), '')
            ),
            '[[:space:]]+',
            ' ',
            'g'
          ) = resolved.complete_line
     )
  ),
  ordered as (
    select
      new_entries.*,
      coalesce(existing_order.maximum_order, -1)
        + row_number() over (
          partition by new_entries.category_id
          order by new_entries.ordinality
        ) as display_order
    from new_entries
    left join lateral (
      select max(existing.display_order) as maximum_order
        from public.cv_entries as existing
       where existing.category_id = new_entries.category_id
    ) as existing_order on true
  ),
  inserted as (
    insert into public.cv_entries (
      category_id,
      source_activity_id,
      year_label,
      title,
      organization,
      location_text,
      url,
      display_order,
      is_visible
    )
    select
      ordered.category_id,
      null,
      ordered.year_label,
      ordered.title,
      ordered.organization,
      ordered.location_text,
      ordered.url,
      ordered.display_order,
      true
    from ordered
    order by ordered.ordinality
    returning id
  )
  select count(*)::integer
    into inserted_count
    from inserted;

  return jsonb_build_object(
    'submitted_count', submitted_count,
    'inserted_count', inserted_count,
    'duplicate_count', submitted_count - inserted_count
  );
end;
$$;

create function public.import_cv_entries(
  target_profile_id uuid,
  selected_entries jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.import_cv_entries(
    target_profile_id,
    selected_entries
  );
$$;

revoke all on function private.import_cv_entries(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.import_cv_entries(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function private.import_cv_entries(uuid, jsonb)
  to authenticated;
grant execute on function public.import_cv_entries(uuid, jsonb)
  to authenticated;

comment on function private.import_cv_entries(uuid, jsonb) is
  'Atomically validates and appends reviewed manual CV Import entries for one manageable artist profile.';
comment on function public.import_cv_entries(uuid, jsonb) is
  'Authenticated CV Import persistence boundary; accepts reviewed manual-entry fields only.';
