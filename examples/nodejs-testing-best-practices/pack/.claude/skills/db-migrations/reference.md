# db-migrations — reference

Extra context for this skill (loaded only when needed).

> Evidence: package.json dep: sequelize; example-application/data-access/migrations/

- ORM in use: Sequelize.
- Always run migrations in a transaction where the tool supports it.
- Keep a rollback path; test the migration on a scratch DB before prod.
