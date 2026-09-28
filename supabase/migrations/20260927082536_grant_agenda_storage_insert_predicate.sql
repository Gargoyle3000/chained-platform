-- Every authenticated storage.objects INSERT can evaluate the permissive Agenda
-- policy alongside the Work policy. Its predicate must be callable even when
-- the row targets another bucket; the predicate itself still checks the exact
-- reservation, actor, path, MIME and size.
grant execute on function private.can_insert_reserved_presentation_agenda_media(text, jsonb)
to authenticated;
