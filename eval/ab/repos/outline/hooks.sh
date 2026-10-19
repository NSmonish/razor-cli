#!/usr/bin/env bash
# Per-repo environment hooks for the Razor A/B harness (outline).
#
#   hooks.sh patch    <workspace> <slot>  point .env.test at this slot's Postgres + Redis
#   hooks.sh up       <workspace> <slot>  start them, create the test DB, run migrations
#   hooks.sh pregrade <workspace> <slot>  recreate the DB from the workspace's migrations
#   hooks.sh down     <workspace> <slot>  stop and remove them
#
# Server tests read DATABASE_URL / REDIS_URL from .env.test (127.0.0.1:5432 and
# :6379). Both arms run at once, so each slot gets its own ports and containers.
# The patch happens before the workspace's git init, so the agent sees it as the
# repo's normal config.
set -euo pipefail

cmd="$1" ws="$2" slot="$3"
pg_port=$((55500 + slot))
redis_port=$((56500 + slot))
pg="razor-ab-outline-pg-$slot"
redis="razor-ab-outline-redis-$slot"

migrate() {
  # the repo's own `make test` recipe: drop, create, migrate
  (cd "$ws" && NODE_ENV=test corepack yarn sequelize db:drop >/dev/null 2>&1 || true)
  (cd "$ws" && NODE_ENV=test corepack yarn sequelize db:create >/dev/null)
  (cd "$ws" && NODE_ENV=test corepack yarn sequelize db:migrate >/dev/null)
}

case "$cmd" in
  patch)
    perl -pi -e "s{^DATABASE_URL=.*}{DATABASE_URL=postgres://user:pass\@127.0.0.1:$pg_port/outline-test}; s{^REDIS_URL=.*}{REDIS_URL=redis://127.0.0.1:$redis_port}" "$ws/.env.test"
    ;;
  up)
    docker rm -f "$pg" "$redis" >/dev/null 2>&1 || true
    docker run -d --name "$pg" -p "127.0.0.1:$pg_port:5432" -e POSTGRES_USER=user -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=outline postgres:16 >/dev/null
    docker run -d --name "$redis" -p "127.0.0.1:$redis_port:6379" redis:7 >/dev/null
    for _ in $(seq 1 60); do
      docker exec "$pg" pg_isready -U user >/dev/null 2>&1 && break
      sleep 1
    done
    sleep 2
    migrate
    ;;
  pregrade)
    docker exec "$redis" redis-cli FLUSHALL >/dev/null
    migrate
    ;;
  down)
    docker rm -f "$pg" "$redis" >/dev/null 2>&1 || true
    ;;
  *)
    echo "unknown hook command: $cmd" >&2; exit 2 ;;
esac
