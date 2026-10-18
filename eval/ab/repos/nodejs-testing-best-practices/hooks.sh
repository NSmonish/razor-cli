#!/usr/bin/env bash
# Per-repo environment hooks for the Razor A/B harness.
#
#   hooks.sh patch <workspace> <slot>   rewrite hardcoded DB port/container so each slot is isolated
#   hooks.sh up    <workspace> <slot>   start this slot's Postgres, migrate + seed
#   hooks.sh pregrade <workspace> <slot> recreate the DB from the workspace's migrations before grading
#   hooks.sh down  <workspace> <slot>   stop and remove this slot's Postgres
#
# The repo hardcodes Postgres on :54310 (config.js, global-setup.js,
# docker-compose.yml) and a fixed container name, and its global teardown
# randomly truncates the orders table. Two arms sharing one DB could fail each
# other's tests, so every slot gets its own port + container. The MQ tests use
# a fake provider, so only the `database` service is started.
set -euo pipefail

cmd="$1" ws="$2" slot="$3"
port=$((55430 + slot))
project="razor-ab-$slot"
compose="$ws/example-application/test/setup/docker-compose.yml"

dc() { docker compose -p "$project" -f "$compose" "$@"; }

case "$cmd" in
  patch)
    perl -pi -e "s/port: 54310/port: $port/" "$ws/example-application/data-access/config/config.js"
    perl -pi -e "s/isPortReachable\(54310\)/isPortReachable($port)/" "$ws/example-application/test/setup/global-setup.js"
    perl -pi -e "s/'54310:5432'/'$port:5432'/; s/container_name: 'postgres-for-testing'/container_name: 'pg-$project'/; s/container_name: 'rabbitmq'/container_name: 'rabbitmq-$project'/" "$compose"
    ;;
  up|pregrade)
    # pregrade: a fresh DB built from the workspace's own migrations (as CI would)
    dc down -v >/dev/null 2>&1 || true
    dc up -d database >/dev/null
    for _ in $(seq 1 60); do
      dc exec -T database pg_isready -U myuser -d shop >/dev/null 2>&1 && break
      sleep 1
    done
    dc exec -T database pg_isready -U myuser -d shop >/dev/null
    (cd "$ws" && npm run --silent db:migrate >/dev/null && npm run --silent db:seed >/dev/null)
    ;;
  down)
    dc down -v >/dev/null 2>&1 || true
    ;;
  *)
    echo "unknown hook command: $cmd" >&2; exit 2 ;;
esac
