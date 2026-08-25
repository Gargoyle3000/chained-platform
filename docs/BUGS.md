# CHAINED — ACTIVE BUGS / BLOCKERS

Last updated: 2026-08-18

## Fresh invited artist has no managed profile/workspace

- Official CHAINED artist invites are accepted correctly: the account is active and receives `private_member` + `artist` roles.
- Acceptance currently creates no artist `public_profiles` row, `primary_controller_account_id`, or active owner `profile_members` relation. `list_manageable_artist_profiles()` therefore returns zero; the Work editor is reachable but editing/upload remains correctly disabled.
- RLS/authorization fails closed. This affects every newly invited artist without a pre-provisioned or claimable profile and is a pre-tester blocker, not a confirmed security vulnerability.
- Investigation boundary: do not loosen RLS or infer a profile from the `artist` role alone. Add a controlled artist-workspace/profile provisioning step.
- Validation target: fresh official artist invite → managed artist profile → first draft Work → image finalize.
