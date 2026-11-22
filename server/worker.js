// Cellar Book shared journals.
// A tiny API that stores only the journals people choose to share.
// Each shared journal has a random id and a secret key; the key travels in the
// share link and is stored here only as a SHA-256 hash.

const ALLOWED_ORIGINS = [
  "https://liz5tone.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];
const MAX_WINE_BYTES = 1_500_000; // one wine, including its label photo
const MAX_WINES = 3000; // per journal
const MAX_NAME = 60;

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Journal-Key",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    try {
      return await route(req, env, json);
    } catch (e) {
      return json({ error: "Something went wrong" }, 500);
    }
  },
};

async function route(req, env, json) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // api, journals, :id, wines, :wid
  if (parts[0] !== "api" || parts[1] !== "journals") return json({ ok: true, app: "Cellar Book shared journals" });
  const db = env.DB;
  const now = Date.now();

  // Create a new shared journal.
  if (parts.length === 2 && req.method === "POST") {
    const body = await readJson(req, 10_000);
    const id = randomId(12);
    const key = randomId(32);
    await db
      .prepare("INSERT INTO journals(id,key_hash,name,created,updated) VALUES(?,?,?,?,?)")
      .bind(id, await sha256(key), cleanName(body && body.name), now, now)
      .run();
    return json({ id, key });
  }

  const jid = parts[2];
  if (!jid || !/^[A-Za-z0-9]{6,40}$/.test(jid)) return json({ error: "Not found" }, 404);
  const key = req.headers.get("X-Journal-Key") || "";
  const j = await db.prepare("SELECT id,key_hash,name FROM journals WHERE id=?").bind(jid).first();
  if (!j || !key || !(await sameHash(await sha256(key), j.key_hash)))
    return json({ error: "This shared journal link doesn't work any more." }, 404);

  // Read the journal (everything, or only what changed since `since`).
  if (parts.length === 3 && req.method === "GET") {
    const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
    const rows = await db
      .prepare("SELECT id,data,updated,deleted FROM wines WHERE journal_id=? AND updated>=? ORDER BY updated")
      .bind(jid, since)
      .all();
    const wines = rows.results
      .filter((r) => since || !r.deleted)
      .map((r) => (r.deleted ? { id: r.id, deleted: true, updated: r.updated } : { id: r.id, updated: r.updated, wine: safeParse(r.data) }));
    return json({ name: j.name, now, wines });
  }

  // Rename the journal.
  if (parts.length === 3 && req.method === "PATCH") {
    const body = await readJson(req, 10_000);
    const name = cleanName(body && body.name);
    await db.prepare("UPDATE journals SET name=?,updated=? WHERE id=?").bind(name, now, jid).run();
    return json({ name });
  }

  const wid = parts[4];
  if (parts[3] !== "wines" || !wid || !/^[A-Za-z0-9_-]{1,64}$/.test(wid) || parts.length !== 5)
    return json({ error: "Not found" }, 404);

  // Add or update one wine.
  if (req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_WINE_BYTES) return json({ error: "That wine's photo is too large." }, 413);
    const wine = safeParse(text);
    if (!wine || typeof wine !== "object" || Array.isArray(wine)) return json({ error: "Not a wine" }, 400);
    delete wine.id;
    const exists = await db.prepare("SELECT 1 FROM wines WHERE journal_id=? AND id=?").bind(jid, wid).first();
    if (!exists) {
      const c = await db.prepare("SELECT COUNT(*) AS n FROM wines WHERE journal_id=? AND deleted=0").bind(jid).first();
      if (c && c.n >= MAX_WINES) return json({ error: "This shared journal is full." }, 413);
    }
    await db
      .prepare(
        "INSERT INTO wines(journal_id,id,data,updated,deleted) VALUES(?,?,?,?,0) ON CONFLICT(journal_id,id) DO UPDATE SET data=excluded.data,updated=excluded.updated,deleted=0"
      )
      .bind(jid, wid, JSON.stringify(wine), now)
      .run();
    return json({ ok: true, updated: now });
  }

  // Remove one wine (kept as a marker so other phones learn it was removed).
  if (req.method === "DELETE") {
    await db
      .prepare(
        "INSERT INTO wines(journal_id,id,data,updated,deleted) VALUES(?,?,'',?,1) ON CONFLICT(journal_id,id) DO UPDATE SET data='',updated=excluded.updated,deleted=1"
      )
      .bind(jid, wid, now)
      .run();
    return json({ ok: true, updated: now });
  }

  return json({ error: "Not found" }, 404);
}

async function readJson(req, max) {
  const t = await req.text();
  if (t.length > max) return null;
  return safeParse(t);
}
function safeParse(t) {
  try {
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}
function cleanName(n) {
  const s = String(n || "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  return s || "Shared cellar";
}
function randomId(len) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = "";
  for (const b of bytes) s += abc[b % abc.length];
  return s;
}
async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sameHash(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
