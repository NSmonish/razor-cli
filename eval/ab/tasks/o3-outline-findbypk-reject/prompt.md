`urls.unfurl` returns a 500 for a share URL whose document slug is malformed,
e.g. `${URL}/s/<shareId>/doc/invalid`. It should be a 404.

The cause is in our models' custom `findByPk` overrides (Document, Collection
and Template; they also accept url slugs). When the id is neither a UUID nor a
valid slug they return `null`, even when the caller passed `rejectOnEmpty`.
Callers that pass `rejectOnEmpty` rely on a non-null result, so the `null`
surfaces later as a 500.

Make these overrides honor `rejectOnEmpty` for any id that doesn't resolve to a
record, malformed ones included, the same way Sequelize's own `findByPk` does.
Without `rejectOnEmpty`, a malformed id should still return `null`.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
