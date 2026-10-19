---
name: db-migrations
kind: skill
description: Create and apply database migrations (Sequelize). Use when changing the data model.
version: 1
generated: 2026-10-19
razor_format: 1.0
evidence: package.json dep: sequelize; example-application/data-access/migrations/
---

# db-migrations

## Steps
1. Generate/apply migrations with `npm run db:migrate`.
2. Never edit the database schema by hand — go through a migration.
3. Review the generated migration before applying it.
