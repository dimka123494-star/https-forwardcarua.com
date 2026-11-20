// Supabase Edge Function «edr-load»: переносить відкритий ЄДР (≈2 млн юросіб) з GitHub-релізу edr-data у таблицю
// edr_companies — для пошуку компаній за назвою (edr_search). Шарди будує tools/edr_shards.py (workflow «ЄДР», щосереди).
// За один виклик — PER_CALL шардів (3 ≈ 12 тис. рядків; body {n} — інша кількість, до 16), ще не пройдених для
// поточного edr-meta.json → generated. Пише лише нові й змінені рядки (rpc edr_upsert_rows), щоб не витрачати Disk IO.
// Коди з ЄДР не зникають (припинені лишаються зі станом), тому видалення немає.
// Викликається pg_cron (edr-load-night: кожні 5 хв уночі за Києвом) або адміністратором. Деплой без verify_jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REL = "https://github.com/dimka123494-star/https-forwardcarua.com/releases/download/edr-data/";
const SHARDS = 512, PER_CALL = 3, BATCH = 2000;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cron = req.headers.get("x-cron-secret") ?? "";
  const { data: cronOk } = cron ? await sb.rpc("cron_secret_ok", { p: cron }) : { data: false };
  if (!cronOk) {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user } } = await sb.auth.getUser(jwt);
    const { data: adm } = user ? await sb.from("admins").select("user_id").eq("user_id", user.id).maybeSingle() : { data: null };
    if (!adm) return json({ error: "forbidden" }, 403);
  }
  try {
    const mr = await fetch(REL + "edr-meta.json");
    if (!mr.ok) return json({ error: "no_meta", status: mr.status }, 502);
    const meta = await mr.json();
    const gen: string = meta.generated;
    if (!gen || meta.shards !== SHARDS) return json({ error: "bad_meta", meta }, 502);

    const body = await req.json().catch(() => ({}));
    const per = Math.min(Math.max(Number(body?.n) || PER_CALL, 1), 16);
    const { data: done } = await sb.from("edr_load").select("shard").eq("generated", gen);
    const doneSet = new Set((done ?? []).map((r: any) => r.shard));
    const todo = [...Array(SHARDS).keys()].filter((i) => !doneSet.has(i)).slice(0, per);

    if (!todo.length) return json({ ok: true, generated: gen, complete: true });

    let rows = 0, written = 0;
    for (const i of todo) {
      const started = new Date().toISOString();
      const r = await fetch(`${REL}edr-${String(i).padStart(3, "0")}.json.gz`);
      if (!r.ok || !r.body) return json({ error: "shard", shard: i, status: r.status, rows }, 502);
      const sh: Record<string, any> = JSON.parse(await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text());
      const list = Object.entries(sh).map(([code, c]) => ({
        code, name: c.n, short_name: c.sn ?? null, state: c.s ?? null, reg_date: c.d ?? null,
        head: (c.h ?? [])[0] ?? null,
      }));
      for (let k = 0; k < list.length; k += BATCH) {
        const { data: w, error } = await sb.rpc("edr_upsert_rows", { p: list.slice(k, k + BATCH) });
        if (error) return json({ error: "upsert", shard: i, detail: error.message, rows }, 500);
        written += Number(w) || 0;
      }
      await sb.from("edr_load").upsert({ shard: i, generated: gen, rows: list.length, loaded_at: started }, { onConflict: "shard" });
      rows += list.length;
    }
    return json({ ok: true, generated: gen, shards: todo, rows, written, left: SHARDS - doneSet.size - todo.length });
  } catch (e) {
    return json({ error: "exception", detail: String(e) }, 500);
  }
});
