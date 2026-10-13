Clients need to list orders. Add GET /order:

- It responds 200 with `{ "items": [...orders], "total": <number> }`, with
  items ordered by id ascending.
- Optional query parameter `userId` (integer) returns only that user's orders.
- Pagination: `limit` (integer 1–100, default 20) and `offset` (integer ≥ 0,
  default 0). `total` is the number of orders matching the filter, ignoring
  pagination.
- Any invalid query value (not a whole number, limit outside 1–100, negative
  offset) → 400.
- Document the new operation and its three query parameters in the API's
  OpenAPI document.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
