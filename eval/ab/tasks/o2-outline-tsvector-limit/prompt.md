Saving some documents fails with a Postgres error. It happens when the text is
mostly unique tokens: hashes, IDs, base64, long tables of numbers. The document
search trigger caps its input at 1,000,000 characters, but Postgres's tsvector
size limit applies to the output, so a document under the cap can still produce
a search vector that's too big. The save errors out, the worker task that
refreshes the document text keeps retrying and failing, and the text and search
index go stale.

Saving such a document must succeed. When the full text produces a search
vector that is too large, index as much of the text as fits instead (at least
the beginning of the text). The title and the previous titles must still be
fully indexed, with their usual weights.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
