Security report: `request.host`, `request.hostname` and `request.protocol` can be spoofed
when `trustProxy` restricts which proxies are trusted.

`trustProxy` lets an application say which proxies it trusts, for example
`fastify({ trustProxy: '10.0.0.1' })`. `request.ip` respects that: it only takes
addresses from `X-Forwarded-For` when the connection really comes from a trusted proxy.
`request.host`, `request.hostname` and `request.protocol` do not. A client that connects
to the server directly, bypassing the proxy, can send

    X-Forwarded-Host: evil.com
    X-Forwarded-Proto: https

and `request.host` / `request.hostname` become `evil.com` and `request.protocol` becomes
`https`. Applications use these values to build redirects, absolute URLs and
security decisions, so this is exploitable.

Expected behavior:

- If the connection does not come from a proxy that the `trustProxy` setting trusts,
  `request.host`, `request.hostname` and `request.protocol` ignore `X-Forwarded-Host`
  and `X-Forwarded-Proto` and fall back to the `Host` header and the socket's actual
  protocol.
- If the connection does come from a trusted proxy, the forwarded values keep being
  used exactly as today.
- Every form of `trustProxy` that Fastify supports must keep working for the
  deployments that rely on it today.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
