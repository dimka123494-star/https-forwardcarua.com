// Supabase Edge Function «sanctions-search»: безкоштовна перевірка за Державним реєстром санкцій РНБО.
// GET ?q=<ЄДРПОУ 8 цифр | РНОКПП 10 цифр | назва / ПІБ, від 3 символів> → до 20 субʼєктів (спершу чинні санкції).
// Дані — data/sanctions_names.json у репозиторії (з CSV-експорту drs.nsdc.gov.ua, tools/sanctions_import.py). Деплой без verify_jwt.
const URL_ = "https://raw.githubusercontent.com/dimka123494-star/https-forwardcarua.com/main/data/sanctions_names.json";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=600" } });

const norm = (s: string) => String(s || "").toLowerCase().replace(/[ёэ]/g, "е").replace(/[ʼ'’`"«»“”„]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
let rows: any[] | null = null, keys: string[] = [], at = "", loaded = 0;
async function load() {
  if (rows && Date.now() - loaded < 6 * 3600e3) return;
  const r = await fetch(URL_);
  if (!r.ok) throw new Error("source " + r.status);
  const d = await r.json();
  rows = d.rows; at = d._at; loaded = Date.now();
  keys = rows!.map((x) => " " + norm(x[2] + " " + x[3]) + " ");
}
const today = () => new Date().toISOString().slice(0, 10);
function view(x: any[]) {
  const st = x[4] === "active" && x[7] && x[7] < today() ? "expired" : x[4];
  return { kind: x[1] === "P" ? "person" : "legal", name: x[2], aliases: x[3] || null, status: st, decree: x[5], decree_date: x[6],
           end_date: x[7], country: x[8], birth_year: x[9] ? String(x[9]).slice(0, 4) : null, codes: x[10] };
}
const RANK: Record<string, number> = { active: 0, expired: 1, excluded: 2 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sp = new URL(req.url).searchParams;
    const q = (sp.get("q") ?? "").trim().slice(0, 120);
    await load();
    // кілька кодів одразу (список перевізників): ?codes=a,b,c → {code: найгірший статус}
    const cs = (sp.get("codes") ?? "").split(",").map((c) => c.replace(/\D/g, "")).filter((c) => /^\d{8}$|^\d{10}$/.test(c)).slice(0, 50);
    if (cs.length) {
      const set = new Set(cs), out: Record<string, string> = {};
      for (const x of rows!) for (const c of x[10] as string[]) if (set.has(c)) {
        const st = view(x).status;
        if (!out[c] || RANK[st] < RANK[out[c]]) out[c] = st;
      }
      return json({ at, codes: out });
    }
    let hits: any[];
    const digits = q.replace(/\D/g, "");
    if (/^\d{8}$|^\d{10}$/.test(q.replace(/\s/g, ""))) {
      hits = rows!.filter((x) => (x[10] as string[]).includes(digits));
    } else {
      const t = norm(q).split(" ").filter((w) => w.length >= 2);
      if (norm(q).length < 3 || !t.length) return json({ error: "short" }, 400);
      hits = [];
      for (let i = 0; i < rows!.length && hits.length < 200; i++) if (t.every((w) => keys[i].includes(w))) hits.push(rows![i]);
    }
    const items = hits.map(view).sort((a, b) => RANK[a.status] - RANK[b.status]);
    return json({ q, at, total: items.length, items: items.slice(0, 20) });
  } catch (e) {
    console.error(e);
    return json({ error: "unavailable" }, 503);
  }
});
