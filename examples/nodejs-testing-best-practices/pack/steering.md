---
name: steering
kind: doc
description: enough conventions to be worth stating
version: 1
generated: 2026-10-19
razor_format: 1.0
---

# Steering

Global conventions for this repo. Kept short on purpose.

- Write tests with Jest. Do not add other test runners.
- Use Sequelize for database access. Do not write raw SQL.
- Match the existing lint/format config; do not reformat unrelated code.
- Respect existing config: `jest.config.js`, `tsconfig.json`, `recipes/nestjs/tsconfig.json`, `recipes/friendly-structure-for-reporting/jest.config.js`, `example-application/test/setup/docker-compose.yml`.
