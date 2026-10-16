When an order is created (POST /order), the API verifies the user by calling
the users service, and it currently waits for as long as that service takes;
if the users service hangs, order requests hang with it. Add a timeout to
that call: 2000 ms by default, overridable through the HTTP_TIMEOUT
environment variable (in milliseconds). The variable is read on each request,
so changing it takes effect without a restart. When the call times out, the
API must respond with HTTP 503, because the user can't be verified.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
