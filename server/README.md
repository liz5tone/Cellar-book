# Cellar Book sharing server

A small Cloudflare Worker with a D1 database. It stores only the journals people choose to share. Private journals never reach it.

Each shared journal has a random id and a secret key. The key travels inside the share link (`…/Cellar-book/#join=<id>.<key>`) and is stored here only as a hash, so anyone who has the link can see and edit that journal.

## One-time setup

```sh
cd server
npx wrangler d1 create cellar-book-share-db      # copy the database_id it prints into wrangler.toml
npx wrangler d1 execute cellar-book-share-db --remote --file=schema.sql
npx wrangler deploy                              # prints the worker's URL
```

Then put that URL in `SHARE_API` near the top of the script in `index.html`, for example:

```js
const SHARE_API="https://cellar-book-share.example.workers.dev";
```

Until `SHARE_API` is set, the app still has several journals and **Send the app**. The **Shared journal** option says it isn't switched on yet.

## API

All requests except creating a journal send the key in an `X-Journal-Key` header.

- `POST /api/journals` `{name}` creates a journal and returns `{id, key}`
- `GET /api/journals/:id?since=<ms>` returns `{name, now, wines}`, with only the changes since `since`
- `PATCH /api/journals/:id` `{name}` renames the journal
- `PUT /api/journals/:id/wines/:wineId` adds or replaces one wine (the body is the wine's JSON)
- `DELETE /api/journals/:id/wines/:wineId` removes one wine

Browsers may call it only from `https://liz5tone.github.io` and from localhost (see `ALLOWED_ORIGINS` in `worker.js`).
