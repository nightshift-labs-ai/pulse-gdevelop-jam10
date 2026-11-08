// PULSE ward board (GDevelop BIG Game Jam #10, written during the jam, Nov 7 2026).
// Anonymous global leaderboard: each browser = random id; best score per id per mode.
// No names are stored or shown (nothing to moderate). No IP or personal data stored.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store" };
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

export class Board {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS b (id TEXT, mode TEXT, score INTEGER, t REAL, at INTEGER, PRIMARY KEY (id, mode))");
    this.sql.exec("CREATE INDEX IF NOT EXISTS bs ON b (mode, score DESC)");
  }
  stats(mode, score) {
    const total = this.sql.exec("SELECT COUNT(*) AS c FROM b WHERE mode = ?", mode).one().c;
    const top = this.sql.exec("SELECT score FROM b WHERE mode = ? ORDER BY score DESC LIMIT 5", mode).toArray().map(r => r.score);
    const rank = score == null ? null : this.sql.exec("SELECT COUNT(*) AS c FROM b WHERE mode = ? AND score > ?", mode, score).one().c + 1;
    // s69: score just above this one (index seek, 1 row) → game shows "+N to pass #rank-1"
    const ab = score == null || rank <= 1 ? null : this.sql.exec("SELECT MIN(score) AS s FROM b WHERE mode = ? AND score > ?", mode, score).one().s;
    return ab == null ? { total, top, rank } : { total, top, rank, above: ab };
  }
  async fetch(req) {
    const u = new URL(req.url), m = u.searchParams.get("mode"), mode = m === "relaxed" || m === "qa" ? m : "normal"; // qa = test bucket for automated checks
    if (req.method !== "POST") return j(this.stats(mode, null));
    let b; try { b = await req.json(); } catch { return j({ error: "bad json" }, 400); }
    const id = String(b.id || ""), score = Math.floor(+b.score), t = +b.t;
    if (!/^[a-z0-9]{8,24}$/.test(id)) return j({ error: "bad id" }, 400);
    // plausibility: score grows with time (speed x combo); generous cap, rejects obvious fakes
    if (!(score > 0 && t > 0 && t < 7200 && score <= 40 * t * t / 10 + 120 * t + 300)) return j({ error: "implausible" }, 400);
    const prev = this.sql.exec("SELECT score FROM b WHERE id = ? AND mode = ?", id, mode).toArray()[0];
    if (!prev || score > prev.score) this.sql.exec("INSERT INTO b VALUES (?,?,?,?,?) ON CONFLICT(id, mode) DO UPDATE SET score = excluded.score, t = excluded.t, at = excluded.at", id, mode, score, t, Date.now());
    const best = Math.max(score, prev ? prev.score : 0);
    return j({ ...this.stats(mode, score), you: best, youRank: this.stats(mode, best).rank });
  }
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (u.pathname === "/health") return j({ ok: true });
    if (u.pathname !== "/v1/board") return j({ error: "not found" }, 404);
    if (req.method === "POST" && +(req.headers.get("content-length") || 0) > 512) return j({ error: "too big" }, 413);
    const stub = env.BOARD.get(env.BOARD.idFromName("pulse-v1"));
    // s58: if the Durable Object fails (e.g. account-wide free-tier cap), answer with CORS so the game just hides the rank line
    try { return await stub.fetch(req); } catch (e) { return j({ error: "board unavailable, try later", unavailable: true }); /* 200 on purpose: keeps the browser console clean; game treats a body without rank/top as no board */ }
  },
};
