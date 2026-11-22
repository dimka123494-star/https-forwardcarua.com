// Supabase Edge Function «vehicle-watch»: безкоштовне стеження за авто в Telegram (MVP).
//  POST {action:"create", q}                     — з сайту: номер або VIN → посилання t.me/<бот>?start=w_<код>
//  POST {action:"link", code, chat, username}    — від функції tg (Authorization: service role), коли людина натиснула Start
//  POST {action:"stop", chat}                    — від tg (/stop): вимкнути всі стеження чату
//  POST {action:"scan"}                          — pg_cron (x-cron-secret): порівняти останні операції МВС і розшук зі збереженими, надіслати зміни
// Дані — ті самі відкриті дані МВС, що й у vehicle-check (гілка vehicles: p/ — операції за номером, v/ — номери за VIN, w/ — розшук).
// Ліміт MVP: до 3 активних стежень на Telegram-чат, кожне — 180 днів. Деплой без verify_jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RAW = "https://raw.githubusercontent.com/dimka123494-star/https-forwardcarua.com/vehicles/";
const PSH = 4096, VSH = 1024, MAX_PER_CHAT = 3, DAYS = 180;
const SITE = "https://forwardcarua.com";
const TOKEN = (Deno.env.get("TG_BOT_TOKEN") ?? "").trim();
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const REGIONS: Record<string, string> = {
  "01": "АР Крим", "05": "Вінницька обл.", "07": "Волинська обл.", "12": "Дніпропетровська обл.", "14": "Донецька обл.",
  "18": "Житомирська обл.", "21": "Закарпатська обл.", "23": "Запорізька обл.", "26": "Івано-Франківська обл.",
  "32": "Київська обл.", "35": "Кіровоградська обл.", "44": "Луганська обл.", "46": "Львівська обл.", "48": "Миколаївська обл.",
  "51": "Одеська обл.", "53": "Полтавська обл.", "56": "Рівненська обл.", "59": "Сумська обл.", "61": "Тернопільська обл.",
  "63": "Харківська обл.", "65": "Херсонська обл.", "68": "Хмельницька обл.", "71": "Черкаська обл.", "73": "Чернівецька обл.",
  "74": "Чернігівська обл.", "80": "м. Київ", "85": "м. Севастополь",
};
const LAT = "ABCEHIKMOPTXY", CYR = "АВСЕНІКМОРТХУ";
const tr = (s: string, a: string, b: string) => [...s].map((c) => { const i = a.indexOf(c); return i < 0 ? c : b[i]; }).join("");
function parseQ(raw: string): { q: string; vin: boolean } | null {
  const s = String(raw ?? "").toUpperCase().replace(/[\s\-"'.]/g, "");
  if (!s) return null;
  const asVin = tr(s, CYR, LAT);
  if (/^[A-HJ-NPR-Z0-9]{17}$/.test(asVin) && /\d/.test(asVin) && /[A-Z]/.test(asVin)) return { q: asVin, vin: true };
  let p = tr(s, LAT, CYR);
  if (p.length === 8 && /^[А-ЯІЇЄ]{2}.{4}[А-ЯІЇЄA-Z]{2}$/.test(p)) p = p.slice(0, 2) + p.slice(2, 6).replace(/О/g, "0") + p.slice(6);
  if (/^[0-9А-ЯІЇЄA-Z]{4,10}$/.test(p) && /\d/.test(p)) return { q: p, vin: false };
  return null;
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(s: string) { let c = 0xffffffff; for (const b of new TextEncoder().encode(s)) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const cache = new Map<string, any>();
async function gz(path: string): Promise<any> {
  if (cache.has(path)) return cache.get(path);
  const r = await fetch(RAW + path);
  if (r.status === 404) return {};
  if (!r.ok) throw new Error(`source ${path} ${r.status}`);
  const d = await new Response(r.body!.pipeThrough(new DecompressionStream("gzip"))).json();
  if (cache.size > 12) cache.clear();
  cache.set(path, d);
  return d;
}
function fixEv(e: any[]) {
  const x = e.slice();
  const c = String(x[1] ?? "").match(/^\s*(\d+)/);
  if (c) x[1] = c[1];
  const t = String(x[4] ?? "").match(/^ТСЦ (\d{2})\d{2}$/);
  if (!x[3] && t) x[3] = t[1];
  return x;
}
const pev = async (k: string) => ((await gz(`p/${String(crc32(k) % PSH).padStart(4, "0")}.json.gz`))[k] ?? []).map(fixEv);
let META: any = null;
async function ops() { if (!META) META = await (await fetch(RAW + "meta.json")).json().catch(() => ({})); return META?.ops ?? {}; }
const d8 = (d: unknown) => { const s = String(d ?? ""); return /^\d{8}$/.test(s) ? `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(0, 4)}` : s; };

// стан авто: усі операції (за номером — останнє авто на номері; за VIN — усі номери цього VIN) + розшук
async function state(key: string, vin: boolean) {
  let evs: any[] = [];
  if (vin) {
    const plates: string[] = (await gz(`v/${String(crc32(key) % VSH).padStart(3, "0")}.json.gz`))[key] ?? [];
    for (const p of plates.slice(0, 10)) evs.push(...(await pev(p)).filter((e: any[]) => String(e[16] ?? "").toUpperCase() === key));
    evs.push(...(await pev("#" + key)));
  } else {
    evs = await pev(key);
    // на номері могли бути різні авто — беремо останнє (за VIN або маркою/роком)
    const last = evs.at(-1);
    if (last) {
      const id = (e: any[]) => e[16] ? "V" + e[16] : "B" + String(e[5] ?? "").split(" ")[0] + "|" + (e[7] ?? "");
      const cur = id(last);
      evs = evs.filter((e) => id(e) === cur);
    }
  }
  evs.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const w = (await gz(`w/${String(crc32(key) % 256).padStart(3, "0")}.json.gz`))[key] ?? [];
  const last = evs.at(-1);
  const O = await ops();
  return {
    n: evs.length, wanted: w.length > 0,
    sig: `${evs.length}|${last?.[0] ?? ""}|${last?.[1] ?? ""}|w${w.length}`,
    car: last ? [last[5], last[6], last[7]].filter(Boolean).join(" ") : "",
    last: last ? { date: d8(last[0]), op: O[last[1]] ?? String(last[1] ?? ""), region: REGIONS[String(last[3] ?? "")] ?? "" } : null,
  };
}

let BOT = "";
async function botName() {
  if (!BOT && TOKEN) BOT = (await (await fetch(`https://api.telegram.org/bot${TOKEN}/getMe`)).json()).result?.username ?? "";
  return BOT;
}
async function send(chat: number, text: string, button?: [string, string]) {
  const r = await (await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true,
      ...(button ? { reply_markup: { inline_keyboard: [[{ text: button[0], url: button[1] }]] } } : {}) }),
  })).json().catch(() => ({ ok: false }));
  if (!r.ok && r.error_code === 403) await sb.from("vehicle_watch").update({ active: false }).eq("chat_id", chat);   // бота заблоковано
  return r.ok;
}
const reportBtn = (key: string): [string, string] => ["Повний звіт про авто", `${SITE}/perevirka-avto?q=${encodeURIComponent(key)}`];
const lastLine = (s: any) => s.last ? `${esc(s.last.date)} — ${esc(s.last.op.toLowerCase())}${s.last.region ? ", " + esc(s.last.region) : ""}` : "записів поки немає";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({}));
  const internal = req.headers.get("Authorization") === `Bearer ${SERVICE}`;
  try {
    // ---- з сайту: створити стеження й дати посилання на бота ----
    if (body.action === "create") {
      const p = parseQ(body.q);
      if (!p) return json({ error: "bad_query" }, 400);
      if (!TOKEN) return json({ error: "not_configured" }, 503);
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
      const { count } = await sb.from("vehicle_watch").select("id", { count: "exact", head: true }).eq("ip", ip).gt("created_at", new Date(Date.now() - 3600e3).toISOString());
      if (ip && (count ?? 0) >= 20) return json({ error: "too_many" }, 429);
      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const { error } = await sb.from("vehicle_watch").insert({ code, key: p.q, by_vin: p.vin, ip, source: String(body.source ?? "").slice(0, 40) || null });
      if (error) { console.error(error); return json({ error: "server_error" }, 500); }
      return json({ ok: true, link: `https://t.me/${await botName()}?start=w_${code}`, key: p.q });
    }

    // ---- від бота: людина натиснула Start ----
    if (body.action === "link" && internal) {
      const chat = Number(body.chat);
      const { data: w } = await sb.from("vehicle_watch").select("*").eq("code", String(body.code ?? "")).maybeSingle();
      if (!w || (w.chat_id && w.chat_id !== chat)) { await send(chat, "Посилання застаріло. Відкрийте перевірку авто на forwardcarua.com і натисніть «Стежити» ще раз."); return json({ ok: false }); }
      if (!w.chat_id) {
        const { data: mine } = await sb.from("vehicle_watch").select("id, key").eq("chat_id", chat).eq("active", true);
        if ((mine ?? []).some((x: any) => x.key === w.key)) { await send(chat, `Ви вже стежите за <b>${esc(w.key)}</b>.`); return json({ ok: true }); }
        if ((mine ?? []).length >= MAX_PER_CHAT) {
          await send(chat, `Безкоштовно можна стежити за ${MAX_PER_CHAT} авто одночасно. Зараз: ${(mine ?? []).map((x: any) => esc(x.key)).join(", ")}.\nЩоб звільнити місце — /stop (вимкне всі стеження).`);
          return json({ ok: false });
        }
      }
      const s = await state(w.key, w.by_vin);
      await sb.from("vehicle_watch").update({ chat_id: chat, tg_username: body.username ?? null, active: true, sig: s.sig, car: s.car || null,
        linked_at: new Date().toISOString(), expires_at: new Date(Date.now() + DAYS * 864e5).toISOString() }).eq("id", w.id);
      await send(chat, `✅ <b>Стежимо за ${esc(w.key)}</b>${s.car ? " — " + esc(s.car) : ""}\n` +
        `Остання операція в реєстрі МВС: ${lastLine(s)}.\n${s.wanted ? "🚨 Авто зараз у базі розшуку МВС.\n" : ""}\n` +
        `Напишемо, щойно з’явиться нова реєстраційна операція (перереєстрація, зняття з обліку, нові номери) або авто потрапить у розшук. ` +
        `МВС публікує дані пакетами, зазвичай раз на місяць, тому сповіщення приходить після публікації, а не в день операції.\n\n` +
        `Стеження діє ${DAYS} днів. /stop — вимкнути.`, reportBtn(w.key));
      return json({ ok: true });
    }

    if (body.action === "stop" && internal) {
      await sb.from("vehicle_watch").update({ active: false }).eq("chat_id", Number(body.chat));
      return json({ ok: true });
    }

    // ---- pg_cron: перевірити всі активні стеження ----
    if (body.action === "scan") {
      const cron = req.headers.get("x-cron-secret") ?? "";
      const { data: ok } = cron ? await sb.rpc("cron_secret_ok", { p: cron }) : { data: false };
      if (!ok && !internal) return json({ error: "forbidden" }, 403);
      await sb.from("vehicle_watch").update({ active: false }).eq("active", true).lt("expires_at", new Date().toISOString());
      const { data: rows } = await sb.from("vehicle_watch").select("*").eq("active", true).not("chat_id", "is", null).order("key").limit(2000);
      let checked = 0, sent = 0;
      const memo = new Map<string, any>();
      for (const w of rows ?? []) {
        const k = (w.by_vin ? "V" : "P") + w.key;
        if (!memo.has(k)) memo.set(k, await state(w.key, w.by_vin).catch(() => null));
        const s = memo.get(k);
        checked++;
        if (!s || s.sig === w.sig) { await sb.from("vehicle_watch").update({ checked_at: new Date().toISOString() }).eq("id", w.id); continue; }
        const wasWanted = /\|w[1-9]/.test(w.sig ?? "");
        const text = s.wanted && !wasWanted
          ? `🚨 <b>${esc(w.key)} — у базі розшуку МВС</b>${s.car ? "\n" + esc(s.car) : ""}\nАвто з’явилося в реєстрі транспорту в розшуку.`
          : `🔔 <b>${esc(w.key)}: нова операція в реєстрі МВС</b>${s.car ? "\n" + esc(s.car) : ""}\n${lastLine(s)}` + (!s.wanted && wasWanted ? "\n✅ Авто більше не значиться в розшуку." : "");
        if (await send(w.chat_id, text, reportBtn(w.key))) sent++;
        await sb.from("vehicle_watch").update({ sig: s.sig, car: s.car || w.car, checked_at: new Date().toISOString(), notified_at: new Date().toISOString() }).eq("id", w.id);
      }
      return json({ ok: true, checked, sent });
    }
    return json({ error: "bad_request" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
