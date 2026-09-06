# CHAINED — ACTIVE BUGS / BLOCKERS

Last updated: 2026-09-06

## Agenda occurrence publication regression

- Gothic Summer remains a published occurrence but has `show_in_agenda = false`, so it no longer appears in Agenda.
- Newly created finissage occurrences can retain `show_in_agenda = true` but remain `draft`; the current Agenda UI has no clear working publish action.
- Authenticated occurrence insertion intentionally begins `draft`. The likely regression area is the frontend occurrence publish/state-machine path and/or an unintended `show_in_agenda` update while editing Presentation Program entries.
- Agenda visibility and Presentation Program visibility remain independent: `show_in_agenda` is not `show_in_presentation`.

Do not mark this resolved without a production-validated occurrence publish flow.
