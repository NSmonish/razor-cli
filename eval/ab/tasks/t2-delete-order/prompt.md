We need to be able to delete orders over the API. Add support for
DELETE /order/:id: it should delete that order and respond with HTTP 204 and
an empty body. After deletion, fetching that order with GET /order/:id must
return 404, and other orders must be unaffected.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
