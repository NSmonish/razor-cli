Security bug report: request schemas set to boolean `false` are silently ignored.

In JSON Schema, `false` matches nothing, so a route declaring
`schema: { body: false }` should reject every request body. Today Fastify
treats such a schema as if no schema had been declared at all: validation is
skipped and the handler runs. The same happens for `querystring` (including
its documented `query` alias), `params` and `headers`.

Fix it so boolean request schemas are compiled and enforced like any other
schema:

- A `false` schema on any request part (body, querystring or its `query`
  alias, params, headers) rejects every request with 400, and the handler
  never runs. This must also work when that `false` schema is the route's only
  schema.
- A custom `validatorCompiler` receives the literal `false` schema (with the
  right `httpPart`).
- Warning FSTWRN001 (a route declaring an undefined schema) is still emitted
  for schemas that are explicitly `undefined`, and not for `false`.
- A `null` schema is invalid: `fastify.ready()` must fail with
  `FST_ERR_SCH_VALIDATION_BUILD` instead of accepting requests.
- Declaring both `query` and `querystring` on one route must still throw.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
