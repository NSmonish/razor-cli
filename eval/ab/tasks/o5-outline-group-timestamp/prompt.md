A group's `updatedAt` doesn't change when its membership changes. Clients use
the group's timestamp to tell whether their cached copy is stale, so after
someone joins or leaves a group they keep showing the old member list.

When a user joins or leaves a group, the group's `updatedAt` must move forward.
That applies however the membership changes: through the API
(`groups.add_user`, `groups.remove_user`), group sync, or user deletion, so put
it where every path goes through. The `groups.add_user` and
`groups.remove_user` responses must include the group with its new `updatedAt`.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
