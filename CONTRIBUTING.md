# Contributing

## Issues and pull requests

Open an issue in [tote-hq/changuito-tareas](https://github.com/tote-hq/changuito-tareas) before starting work. Every pull request names that issue in the description:

```
Closes tote-hq/changuito-tareas#N
```

Use `Refs tote-hq/changuito-tareas#N` when the pull request does not close the issue.

Name branches `type/short-description`, for example `fix/cart-link-tool-trail`.

Keep the pull request description basic: what changed, and the closing line above.

## Secrets

Never commit secrets, keys, or `.env` files. `.env.example` lists variable names only.

## Before you push

```bash
npm test
npm run typecheck -w @changuito/web
npm run build
```
