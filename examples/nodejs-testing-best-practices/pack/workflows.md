---
name: workflows
kind: doc
description: has build/test/deploy workflows
version: 1
generated: 2026-10-19
razor_format: 1.0
---

# Workflows

Common development workflows, using the repo's real commands.

## Available scripts
- test: `npm test` (runs `jest`)
- lint: `npm run lint` (runs `eslint .`)
- migrate: `npm run db:migrate` (runs `cd example-application/data-access && sequelize-cli db:migrate`)

## CI
- CI is configured (.github/workflows/). Changes should keep CI green.

## Containers
- Docker is present (recipes/db-optimization/docker-compose-mongo.yml). Use it for a reproducible local env.

## Database migrations
- Migrations exist (example-application/data-access/migrations/). See the db-migrations skill.
