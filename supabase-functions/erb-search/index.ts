// Supabase Edge Function «erb-search»: безкоштовна перевірка за Єдиним реєстром боржників (відкриті дані Мін'юсту).
//  GET ?code=<ЄДРПОУ 8 цифр>                  → {found, n, cats} — лише кількість і категорії (деталі — у платному звіті)
//  GET ?name=<ПІБ>[&birth=YYYY-MM-DD]          → фізособи / ФОП з таким ПІБ: кількість проваджень, категорії, рік народження
// Дані — гілка opendata (erb/NNN.json за кодом, erbp/NNN.json за ПІБ; tools/opendata_import.py). Деплой без verify_jwt.
const RAW = "https://raw.githubusercontent.com/dimka123494-star/https-forwardcarua.com/opendata/";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=600" } });

const cache = new Map<string, { at: number; v: any }>();
async function get(path: string) {
  const c = cache.get(path);
  if (c && Date.now() - c.at < 3 * 3600e3) return c.v;
  const r = await fetch(RAW + path);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(path + " " + r.status);
  const v = await r.json();
  if (cache.size > 16) cache.delete(cache.keys().next().value!);
  cache.set(path, { at: Date.now(), v });
  return v;
}
// так само, як person_key / fnv у tools/opendata_import.py
function personKey(name: string) {
  let n = String(name || "").toLowerCase().replace(/ё/g, "е").replace(/\(не діє\)/g, "");
  n = n.replace(/[ʼ'’`"«»]/g, "").replace(/[^0-9a-zа-яіїєґ]+/g, " ").trim();
  return n.split(" ").length >= 2 ? n : "";
}
function fnv(s: string) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sp = new URL(req.url).searchParams;
    const meta = await get("meta.json");
    const at = meta?.generated ?? null;
    const code = (sp.get("code") ?? "").replace(/\D/g, "");
    if (code) {
      if (!/^\d{8}$/.test(code)) return json({ error: "bad_code" }, 400);
      const sh = await get(`erb/${String(Number(code) % (meta?.shards ?? 128)).padStart(3, "0")}.json`);
      const x = sh?.[code];
      return json({ at, code, found: !!x, n: x?.n ?? 0, cats: x?.cats ?? null });
    }
    const name = (sp.get("name") ?? "").slice(0, 120);
    const k = personKey(name);
    if (!k) return json({ error: "need_full_name" }, 400);
    if (!meta?.pshards) return json({ error: "not_ready" }, 503);
    const birth = (sp.get("birth") ?? "").trim();
    const [sh, cats] = await Promise.all([get(`erbp/${String(fnv(k) % meta.pshards).padStart(3, "0")}.json`), get("erbp/cats.json")]);
    let list: any[] = sh?.[k] ?? [];
    if (/^\d{4}-\d{2}-\d{2}$/.test(birth)) list = list.filter((x) => !x[0] || x[0].split(".").reverse().join("-") === birth);
    const title = k.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    const items = list.sort((a, b) => b[1] - a[1]).slice(0, 20).map((x) => ({
      name: title, birth_year: (String(x[0] || "").match(/\d{4}/) ?? [null])[0], n: x[1],
      cats: Object.fromEntries(Object.entries(x[2] as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([i, c]) => [cats?.[Number(i)] ?? "інше", c])),
    }));
    return json({ at, name, found: items.length > 0, items });
  } catch (e) {
    console.error(e);
    return json({ error: "unavailable" }, 503);
  }
});
