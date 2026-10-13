Bug report: Content-Type parameters with quoted values are parsed incorrectly.

Fastify parses the parameters of a Content-Type header (`type/subtype; name=value; ...`)
by splitting on `;`. That breaks as soon as a parameter value is a quoted string that
contains a `;`. For example, with

    multipart/mixed; boundary="part;one"; charset=utf-8

the parsed `boundary` is cut off at the `;` instead of being `part;one`. Worse, text
inside a quoted value can be mistaken for parameters of its own: for

    text/plain; title="lang=en; charset=latin1"

Fastify reports a `charset` parameter of `latin1`, although the header declares no
charset at all; `latin1` is just part of the `title` value.

Expected behavior: parameter values are parsed as the HTTP specification (RFC 9110)
defines them, token or quoted-string. In particular:

- A `;` inside a quoted parameter value is part of that value, and the parameters that
  follow the quoted value are still parsed correctly.
- Nothing inside a quoted value is ever treated as a separate parameter.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
