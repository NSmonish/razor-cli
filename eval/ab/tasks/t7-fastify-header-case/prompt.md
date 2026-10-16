Security bug report: header schemas written with canonical-case header names
are only partly enforced.

Node.js lowercases incoming header names (`X-Admin` arrives as `x-admin`).
Fastify already lowercases the top-level `properties` and `required` of a
route's `headers` schema, but no other position. So a schema like

    headers: {
      type: 'object',
      properties: { 'X-Admin': { const: 'true' }, 'X-Admin-Token': { const: 'server-secret' } },
      dependencies: { 'X-Admin': ['X-Admin-Token'] }
    }

lets `X-Admin: true` through without a token, because the dependency trigger
`X-Admin` never matches the lowercased header.

Fix it so header-name normalization reaches every schema position:

- `dependencies` (array and subschema forms), `dependentRequired` and
  `dependentSchemas`, plus `properties`/`required` inside nested subschemas
  and inside local `$ref` definitions of the headers schema, are all
  lowercased. A canonical-case schema must behave exactly like the
  equivalent all-lowercase schema.
- Normalization must not mutate the schema object the user passed in.
- Header schemas reached through an *external* shared `$ref` (one added with
  `fastify.addSchema`) can't be normalized. For those, emit a new security
  warning `FSTSEC002`, defined and exported alongside the existing `FSTSEC001`
  warning, called with the route's method, url, and the `$ref` value exactly
  as written in the schema (e.g. `'http://example.com/admin-headers#'`).
  Inline schemas and local `$ref`s must not emit it.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
