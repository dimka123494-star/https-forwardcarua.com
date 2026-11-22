// Supabase Edge Function «ria-harvest»: поповнює архів оголошень AUTO.RIA (ria_ads_archive) парами «номер → VIN»
// з найновіших оголошень. Потрібно, бо з 1.07.2026 МВС не публікує номерні знаки у відкритих даних:
// за номером авто, вперше зареєстроване після цього, знаходимо через VIN з оголошення.
// Офіційний API developers.ria.com (той самий ключ RIA_API_KEY, що й у vehicle-check), з бюджетом запитів на запуск.
//  POST {action:"run"} — pg_cron (x-cron-secret) або service role; ?probe=1 — повернути заголовки лімітів RIA
//  POST {action:"lookup", q:номер} — публічно, з сайту: номера немає в МВС → шукаємо оголошення з цим номером на AUTO.RIA (omni_id),
//    зберігаємо пару в архів. 2–4 запити до API; кеш 3 дні; ліміти: 300 пошуків на добу, 10 на годину з одного IP
// Деплой без verify_jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RIA = "https://developers.ria.com/auto";
const KEY = Deno.env.get("RIA_API_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE);
const LAT = "ABCEHIKMOPTXY", CYR = "АВСЕНІКМОРТХУ";
const normPlate = (s: string) => [...String(s || "").toUpperCase().replace(/[\s\-]/g, "")].map((c) => { const i = LAT.indexOf(c); return i < 0 ? c : CYR[i]; }).join("");
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
async function bump(key: string, max: number, days: number) {   // лічильник у ria_cache; false — ліміт вичерпано
  const { data } = await sb.from("ria_cache").select("data, checked_at").eq("key", key).maybeSingle();
  const n = data && Date.now() - new Date(data.checked_at).getTime() < days * 864e5 ? Number(data.data) || 0 : 0;
  if (n >= max) return false;
  await sb.from("ria_cache").upsert({ key, data: n + 1, checked_at: n ? data!.checked_at : new Date().toISOString() });
  return true;
}

let limitHeaders: Record<string, string> = {};
async function riaGet(path: string, qs = "") {
  const r = await fetch(`${RIA}${path}?api_key=${encodeURIComponent(KEY)}${qs ? "&" + qs : ""}`, { signal: AbortSignal.timeout(10000) });
  limitHeaders = Object.fromEntries([...r.headers].filter(([k]) => /limit|remain|quota/i.test(k)));
  if (r.status === 429) throw new Error("ria_limit");
  if (!r.ok) throw new Error("ria " + r.status);
  return await r.json();
}
function compact(id: string, m: any) {
  return { id, url: m.linkToView ? "https://auto.ria.com/uk" + m.linkToView : null, title: m.title ?? null,
    usd: m.USD ?? null, uah: m.UAH ?? null, mileage_k: m.autoData?.raceInt ?? null, added: m.addDate ?? null, updated: m.updateDate ?? null,
    sold: m.soldDate || null, city: m.locationCityName ?? null, gearbox: m.autoData?.gearboxName ?? null, fuel: m.autoData?.fuelName ?? null,
    photos: m.photoData?.seoLinkF ? [m.photoData.seoLinkF] : [], main_photo: m.photoData?.seoLinkF ?? null, photo_count: m.photoData?.count ?? null };
}

let DEBUG = false; const dbg: any[] = [];
async function lookup(req: Request, q: string) {
  const plate = normPlate(q).replace(/[^0-9А-ЯІЇЄA-Z]/g, "");
  if (!/^[0-9А-ЯІЇЄA-Z]{4,10}$/.test(plate) || !/\d/.test(plate)) return json({ error: "bad_query" }, 400);
  const have = async () => (await sb.from("ria_ads_archive").select("vin").eq("plate", plate).not("vin", "is", null).limit(1).maybeSingle()).data?.vin ?? null;
  let vin = await have();
  if (vin) return json({ ok: true, vin, cached: true });
  const ck = "lk:" + plate;
  const { data: c } = await sb.from("ria_cache").select("data, checked_at").eq("key", ck).maybeSingle();
  if (c && Date.now() - new Date(c.checked_at).getTime() < 3 * 864e5) return json({ ok: true, vin: c.data?.vin ?? null, cached: true });
  if (!KEY) return json({ ok: true, vin: null });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  const day = new Date().toISOString().slice(0, 10), hour = new Date().toISOString().slice(0, 13);
  if (!(await bump("lkip:" + ip + ":" + hour, 10, 1 / 24))) return json({ error: "too_many" }, 429);
  if (!(await bump("lkq:" + day, 300, 1))) return json({ ok: true, vin: null, skipped: "daily_cap" });
  try {
    // omni_id — номер кирилицею без пробілів; AUTO.RIA знаходить лише оголошення, де продавець вказав номер
    const s: any = await riaGet("/search", `category_id=1&omni_id=${encodeURIComponent(plate)}&countpage=10`);
    const n = Number(s?.result?.search_result?.count ?? 0);
    const ids: string[] = n > 0 && n < 50 ? (s?.result?.search_result?.ids ?? []).map(String).slice(0, 3) : [];
    if (DEBUG) dbg.push({ n, ids });
    for (const id of ids) {
      const m: any = await riaGet("/info", `auto_id=${id}`).catch(() => null);
      if (!m) continue;
      const v = m.VIN ? String(m.VIN).toUpperCase() : null, p = m.plateNumberData?.text ? normPlate(m.plateNumberData.text) : null;
      await sb.from("ria_ads_archive").upsert({ auto_id: id, vin: v, plate: p, data: compact(id, m), last_seen: new Date().toISOString() }, { onConflict: "auto_id" });
      if (p === plate && v) { vin = v; break; }
    }
  } catch (e) {
    console.error("lookup:", String(e));
    return json({ ok: false, vin: null });
  }
  await sb.from("ria_cache").upsert({ key: ck, data: { vin }, checked_at: new Date().toISOString() });
  return json({ ok: true, vin, ...(DEBUG ? { dbg } : {}) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (new URL(req.url).searchParams.get("a") === "lookup") return lookup(req, String((await req.json().catch(() => ({}))).q ?? ""));
  const cron = req.headers.get("x-cron-secret") ?? "";
  const internal = req.headers.get("Authorization") === `Bearer ${SERVICE}`;
  const { data: ok } = cron ? await sb.rpc("cron_secret_ok", { p: cron }) : { data: false };
  if (!ok && !internal) return json({ error: "forbidden" }, 403);
  if (!KEY) return json({ error: "not_configured" }, 503);
  const body = await req.json().catch(() => ({}));
  // бюджет: 1 запит пошуку + до N запитів /info за запуск (налаштування — ria_cache key «harvest:cfg» {per_run, off})
  const { data: cfgRow } = await sb.from("ria_cache").select("data").eq("key", "harvest:cfg").maybeSingle();
  const cfg = { per_run: 8, off: false, ...(cfgRow?.data ?? {}) };
  if (cfg.off && !body.force) return json({ ok: true, skipped: "off" });
  let used = 0, added = 0, pairs = 0;
  try {
    // найновіші оголошення легкових (вживані), по 100 на сторінку; сторінку беремо по колу, щоб не впиратись у ті самі id
    const { data: st } = await sb.from("ria_cache").select("data").eq("key", "harvest:state").maybeSingle();
    const page = Number(st?.data?.page ?? 0) % 5;
    const s: any = await riaGet("/search", `category_id=1&searchType=4&order_by=7&withVIN=1&plateNumber.length.gte=1&countpage=100&page=${page}`); used++;
    const ids: string[] = (s?.result?.search_result?.ids ?? []).map(String);
    const { data: seen } = ids.length ? await sb.from("ria_ads_archive").select("auto_id").in("auto_id", ids) : { data: [] };
    const fresh = ids.filter((id) => !(seen ?? []).some((x: any) => x.auto_id === id)).slice(0, Math.max(0, Number(cfg.per_run) || 0));
    for (const id of fresh) {
      const m: any = await riaGet("/info", `auto_id=${id}`).catch((e) => { if (String(e).includes("ria_limit")) throw e; return null; }); used++;
      if (!m) continue;
      const vin = m.VIN ? String(m.VIN).toUpperCase() : null, plate = m.plateNumberData?.text ? normPlate(m.plateNumberData.text) : null;
      const { error } = await sb.from("ria_ads_archive").upsert({ auto_id: id, vin, plate, data: compact(id, m), last_seen: new Date().toISOString() }, { onConflict: "auto_id" });
      if (!error) { added++; if (vin && plate) pairs++; }
    }
    // усі id сторінки вже бачили — наступного разу глибша сторінка, інакше знову перша (найновіші)
    await sb.from("ria_cache").upsert({ key: "harvest:state", data: { page: fresh.length ? 0 : page + 1, at: new Date().toISOString() }, checked_at: new Date().toISOString() });
  } catch (e) {
    console.error("harvest:", String(e));
    return json({ ok: false, error: String(e), used, added, pairs, limits: limitHeaders });
  }
  return json({ ok: true, used, added, pairs, limits: body.probe ? limitHeaders : undefined });
});
