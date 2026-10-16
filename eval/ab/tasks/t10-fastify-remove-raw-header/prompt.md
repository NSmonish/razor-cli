Bug report: `reply.removeHeader()` does not remove headers that were set on the raw
response.

Plugins and compatibility layers often set headers directly on the Node.js response,
e.g. `reply.raw.setHeader('X-Powered-By', 'legacy')`. Fastify's reply sees those
headers: `reply.getHeader('x-powered-by')` returns `'legacy'` and
`reply.hasHeader('x-powered-by')` is `true`. But

    reply.removeHeader('X-Powered-By')

has no effect on them: `getHeader` / `hasHeader` still report the header and it is
still sent to the client.

Expected behavior: after `reply.removeHeader(name)`, the header is gone, whether it
was set through `reply.header()` or directly on `reply.raw`. It is no longer reported
by `reply.getHeader()`, `reply.getHeaders()` or `reply.hasHeader()`, and it is not
sent in the response. Header names are case-insensitive, as everywhere else in the
reply API.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
