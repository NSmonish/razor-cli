Orders need a fulfilment status that is stored and can be changed over the API.

- Store the status in a new `status` column of the Orders table, added with a
  new database migration (don't edit the existing migration).
- Every new order starts as `processing`, whatever status the request body
  sends. GET /order/:id returns the order's current status.
- Add PATCH /order/:id/status with a JSON body `{"status": "<new status>"}`.
  The allowed transitions are: processing → shipped, processing → cancelled,
  shipped → delivered, delivered → returned.
  - On success, respond 200 with the updated order.
  - A status value that isn't one of processing, shipped, delivered, cancelled,
    returned (or a missing one) → 400.
  - A known status that isn't an allowed transition from the current one → 409,
    and the status stays unchanged.
  - An order id that doesn't exist → 404.
- Every successful change publishes a message to the `order.events` exchange
  with routing key `order.events.status-changed` and payload
  `{ "orderId": <id>, "from": "<old status>", "to": "<new status>" }`, the same
  way new orders are announced today.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
