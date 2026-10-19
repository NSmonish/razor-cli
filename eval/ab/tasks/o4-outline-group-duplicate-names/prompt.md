Group sync from external identity providers breaks when two groups share a
display name. Providers such as Entra ID can legitimately report several groups
with the same name (each with its own external id). Today either the second
group fails the team-wide name uniqueness check, or both get created in the
same transaction (the validator can't see uncommitted rows) and from then on
every sync fails with `The name of this group is already in use` when it
re-validates one of them.

Expected behavior:

- Synced groups with different external ids can share a name. Syncing the same
  set of external groups twice keeps updating the same groups in place; the
  second sync creates nothing.
- Groups created by hand (no `externalId`) must still have unique names within
  the team, compared case-insensitively.
- Two groups with the same `externalId` and the same name (case-insensitive) in
  a team are still a conflict.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
