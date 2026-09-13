begin;

create extension if not exists pgtap with schema extensions;
select plan(34);

select has_table('public', 'presentation_agenda_images', 'one Presentation Agenda image state table exists');
select has_column('public', 'presentation_agenda_images', 'representative_work_id', 'explicit representative Work state exists');
select has_column('public', 'presentation_agenda_images', 'preview_object_path', 'private Agenda thumbnail path exists only in private state');
select is((select relrowsecurity from pg_class where oid = 'public.presentation_agenda_images'::regclass), true, 'Agenda image state has RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.presentation_agenda_images'::regclass), true, 'Agenda image state forces RLS');
select ok(not has_table_privilege('authenticated', 'public.presentation_agenda_images', 'select'), 'browser roles have no direct Agenda image table read');
select ok(not has_table_privilege('authenticated', 'public.presentation_agenda_images', 'insert'), 'browser roles have no direct Agenda image table write');
select function_privs_are('public', 'get_public_agenda_thumbnail_contexts', array['uuid[]'], 'anon', array['EXECUTE'], 'public Agenda thumbnail projection is available to anonymous readers');
select function_privs_are('public', 'reserve_presentation_agenda_image_upload', array['uuid','text','text','bigint','bigint'], 'authenticated', array['EXECUTE'], 'only authenticated managers may reserve through the public RPC');
select function_privs_are('public', 'set_presentation_representative_work', array['uuid','uuid'], 'authenticated', array['EXECUTE'], 'only authenticated managers may set a representative Work');
select ok(position('security definer' in lower(pg_get_functiondef('public.get_managed_presentation_agenda_image_context(uuid)'::regprocedure))) > 0, 'managed context is security definer behind its management predicate');
select ok(position('security definer' in lower(pg_get_functiondef('public.get_public_agenda_thumbnail_contexts(uuid[])'::regprocedure))) > 0, 'public Agenda projection is server-authoritative');
select ok(position('preview_object_path' in pg_get_function_result('public.get_public_agenda_thumbnail_contexts(uuid[])'::regprocedure)) = 0, 'public Agenda projection does not expose private thumbnail paths');

select has_function('public', 'service_get_presentation_agenda_image_upload', array['uuid','uuid'], 'finalize Edge Function has an exposed-schema service wrapper');
select has_function('public', 'service_mark_presentation_agenda_image_upload', array['uuid','uuid','boolean','text'], 'verification Edge Function has an exposed-schema service wrapper');
select has_function('public', 'service_finish_presentation_agenda_image_cleanup', array['uuid','uuid'], 'replacement cleanup has an exposed-schema service wrapper');
select has_function('public', 'service_get_presentation_agenda_image_removal', array['uuid','uuid'], 'delete planning has an exposed-schema service wrapper');
select has_function('public', 'service_remove_presentation_agenda_image', array['uuid','uuid','uuid'], 'delete finalization has an exposed-schema service wrapper');
select has_function('public', 'service_get_public_presentation_agenda_image', array['uuid'], 'public delivery Edge Function has an exposed-schema service wrapper');

select function_privs_are('public', 'service_get_presentation_agenda_image_upload', array['uuid','uuid'], 'service_role', array['EXECUTE'], 'only the trusted Edge role can resolve an upload');
select function_privs_are('public', 'service_mark_presentation_agenda_image_upload', array['uuid','uuid','boolean','text'], 'service_role', array['EXECUTE'], 'only the trusted Edge role can mark verification');
select function_privs_are('public', 'service_finish_presentation_agenda_image_cleanup', array['uuid','uuid'], 'service_role', array['EXECUTE'], 'only the trusted Edge role can finish replacement cleanup');
select function_privs_are('public', 'service_get_presentation_agenda_image_removal', array['uuid','uuid'], 'service_role', array['EXECUTE'], 'only the trusted Edge role can plan an Agenda image removal');
select function_privs_are('public', 'service_remove_presentation_agenda_image', array['uuid','uuid','uuid'], 'service_role', array['EXECUTE'], 'only the trusted Edge role can finalize an Agenda image removal');
select function_privs_are('public', 'service_get_public_presentation_agenda_image', array['uuid'], 'service_role', array['EXECUTE'], 'only the trusted Edge role can resolve a private delivery path');

select ok(
  not has_function_privilege('anon', 'public.service_get_presentation_agenda_image_upload(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.service_get_presentation_agenda_image_upload(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.service_mark_presentation_agenda_image_upload(uuid,uuid,boolean,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.service_mark_presentation_agenda_image_upload(uuid,uuid,boolean,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.service_finish_presentation_agenda_image_cleanup(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.service_finish_presentation_agenda_image_cleanup(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.service_get_presentation_agenda_image_removal(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.service_get_presentation_agenda_image_removal(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.service_remove_presentation_agenda_image(uuid,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.service_remove_presentation_agenda_image(uuid,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.service_get_public_presentation_agenda_image(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.service_get_public_presentation_agenda_image(uuid)', 'EXECUTE'),
  'browser roles cannot execute any service wrapper'
);

select ok(
  (select count(*) = 6
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'service_get_presentation_agenda_image_upload',
        'service_mark_presentation_agenda_image_upload',
        'service_finish_presentation_agenda_image_cleanup',
        'service_get_presentation_agenda_image_removal',
        'service_remove_presentation_agenda_image',
        'service_get_public_presentation_agenda_image'
      )
      and not p.prosecdef
      and p.proconfig @> array['search_path=""']),
  'service wrappers are SECURITY INVOKER with an empty search_path'
);

select ok(
  position('private.is_published_work(w.id)' in pg_get_functiondef('private.presentation_representative_work_is_eligible(uuid,uuid)'::regprocedure)) > 0,
  'representative Work eligibility reuses canonical public Work visibility'
);

select ok(
  position('w.publication_revision' in pg_get_functiondef('private.presentation_representative_work_is_eligible(uuid,uuid)'::regprocedure)) > 0
  and position('wi.id::text' in pg_get_functiondef('private.presentation_representative_work_is_eligible(uuid,uuid)'::regprocedure)) > 0,
  'representative Work path is bound to the current Work publication and cover image'
);

select ok(
  position('presentations_editor' in pg_get_functiondef('private.account_can_manage_presentation_content(uuid,uuid)'::regprocedure)) > 0
  and position('profile_access_grants' in pg_get_functiondef('private.account_can_manage_presentation_content(uuid,uuid)'::regprocedure)) > 0
  and position('presentation_cooperators' in pg_get_functiondef('private.account_can_manage_presentation_content(uuid,uuid)'::regprocedure)) > 0,
  'explicit-actor service authorization mirrors membership, delegated editor, and cooperator management paths'
);

select ok(
  position('ai.image_id is distinct from expected_image_id' in pg_get_functiondef('private.service_remove_presentation_agenda_image(uuid,uuid,uuid)'::regprocedure)) > 0,
  'delete finalization is bound to the exact image generation whose private objects were removed'
);

select function_privs_are('private', 'reserve_presentation_agenda_image_upload', array['uuid','text','text','bigint','bigint'], 'authenticated', array['EXECUTE'], 'authenticated wrapper can invoke only the private reservation primitive it delegates to');
select function_privs_are('private', 'set_presentation_representative_work', array['uuid','uuid'], 'authenticated', array['EXECUTE'], 'authenticated wrapper can invoke only the private representative-Work primitive it delegates to');
select function_privs_are('private', 'resolve_public_presentation_agenda_thumbnail', array['uuid'], 'authenticated', array['EXECUTE'], 'authenticated followed-Agenda projection can invoke its public-safe thumbnail resolver');

select * from finish();
rollback;
