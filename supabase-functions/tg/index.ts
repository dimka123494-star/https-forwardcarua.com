// Supabase Edge Function «tg»: Telegram-бот сповіщень ВантажПоруч / МитнийБрокер.
// Секрет TG_BOT_TOKEN задається в Supabase → Edge Functions → Secrets (у код не потрапляє).
//  • POST від Telegram (вебхук, перевірка secret_token) — /start <код> привʼязує акаунт, /stop відключає
//  • POST {event, id} від тригерів бази — функція сама перечитує дані й надсилає повідомлення
//  • GET — стан бота; GET ?setup=1 — встановити вебхук
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN = (Deno.env.get("TG_BOT_TOKEN") ?? "").trim();
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = "https://forwardcarua.com";
const SELF = `${SB_URL}/functions/v1/tg`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function hookSecret() {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("tg-hook:" + TOKEN));
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
async function tg(method: string, body: Record<string, unknown>) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return await r.json().catch(() => ({ ok: false }));
}
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (v: unknown, c?: string) => v == null || v === "" ? "" : Number(v).toLocaleString("uk-UA") + " " + (c || "UAH");
const route = (x: any) => `${[x.from_city, x.from_country].filter(Boolean).join(", ")} → ${[x.to_city, x.to_country].filter(Boolean).join(", ")}`;
const fmtD = (d?: string) => d ? d.split("-").reverse().join(".") : "";

async function send(chatId: number, text: string, button?: [string, string]) {
  const r = await tg("sendMessage", {
    chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
    ...(button ? { reply_markup: { inline_keyboard: [[{ text: button[0], url: button[1] }]] } } : {}),
  });
  // користувач заблокував бота — прибираємо підписку
  if (!r.ok && r.error_code === 403) await sb.from("tg_subs").delete().eq("chat_id", chatId);
  return r.ok;
}
async function subsFor(userIds: (string | null | undefined)[], pref: string) {
  const ids = [...new Set(userIds.filter(Boolean))] as string[];
  if (!ids.length) return [];
  const { data } = await sb.from("tg_subs").select("user_id, chat_id, prefs").in("user_id", ids);
  return (data ?? []).filter((s: any) => s.prefs?.[pref] !== false);
}
async function once(key: string) {
  const { error } = await sb.from("notify_log").insert({ key });
  return !error; // дубль ключа — вже надсилали
}
async function ownerUsers(cargo: any) {
  const ids = [cargo.owner_user];
  if (cargo.posted_by) {
    const { data } = await sb.from("brokers").select("user_id").eq("id", cargo.posted_by).maybeSingle();
    ids.push(data?.user_id);
  }
  return ids;
}

/* ---------------- події з бази ---------------- */
async function handleEvent(ev: string, id: string) {
  if (!TOKEN || !id) return 0;
  let sent = 0;

  if (ev === "cargo_new") {
    const { data: c } = await sb.from("cargo_requests").select("*").eq("id", id).maybeSingle();
    if (!c || c.status !== "open" || Date.now() - new Date(c.created_at).getTime() > 15 * 60e3) return 0;
    if (!(await once("cargo_new:" + id))) return 0;
    const { data: carriers } = await sb.from("brokers").select("id, user_id, routes, transport")
      .eq("kind", "carrier").eq("is_active", true).not("user_id", "is", null).limit(2000);
    const match = (carriers ?? []).filter((b: any) => b.id !== c.posted_by &&
      (!b.routes?.length || b.routes.includes(c.from_country) || b.routes.includes(c.to_country)) &&
      (!c.transport || !b.transport?.length || b.transport.includes(c.transport)));
    const subs = await subsFor(match.map((b: any) => b.user_id), "cargo");
    const text = `🚚 <b>Новий вантаж на вашому напрямку</b>\n${esc(route(c))}\n${esc(c.cargo)}` +
      `\n${[c.distance_km ? c.distance_km + " км" : "", c.weight_t ? c.weight_t + " т" : "", c.volume_m3 ? c.volume_m3 + " м³" : "",
        c.length_m && c.width_m && c.height_m ? `${c.length_m}×${c.width_m}×${c.height_m} м` : "", c.places ? c.places + " місць" : "", c.transport || "будь-який транспорт",
        c.load_date ? "завантаження " + fmtD(c.load_date) : ""].filter(Boolean).map(esc).join(" · ")}` +
      `\n${c.price ? "Ставка: <b>" + esc(money(c.price, c.currency)) + "</b>" : "Запит ставок"}${c.customs ? " · митне оформлення" : ""}`;
    for (const s of subs.slice(0, 500)) if (await send(s.chat_id, text, ["Запропонувати ставку", `${SITE}/kabinet#cargo`])) sent++;
    return sent;
  }

  if (ev === "offer_new" || ev === "offer_updated" || ev === "offer_accepted") {
    const { data: r } = await sb.from("cargo_responses").select("*, cargo_requests(*), brokers(name, city, rating_avg, rating_count, user_id)").eq("id", id).maybeSingle();
    if (!r) return 0;
    const c = r.cargo_requests, b = r.brokers;
    if (ev === "offer_accepted") {
      if (r.status !== "accepted" || !(await once("offer_accepted:" + id))) return 0;
      for (const s of await subsFor([b?.user_id], "offers"))
        if (await send(s.chat_id, `✅ <b>Вас обрали перевізником</b>\n${esc(route(c))}\n${esc(c.cargo)}\nВаша ставка: ${esc(money(r.price, r.currency) || "за домовленістю")}\n\nЗателефонуйте вантажовласнику, щоб підтвердити рейс.`,
          ["Відкрити вантаж", `${SITE}/kabinet#cargo`])) sent++;
      return sent;
    }
    if (ev === "offer_new" && !(await once("offer_new:" + id))) return 0;
    if (ev === "offer_updated" && (r.status !== "new" || !(await once(`offer_updated:${id}:${r.price}:${r.currency}`)))) return 0;
    const users = await ownerUsers(c);
    const rate = b?.rating_count ? ` · ★ ${Number(b.rating_avg).toFixed(1)} (${b.rating_count})` : "";
    const text = `💬 <b>${ev === "offer_new" ? "Нова ставка" : "Перевізник оновив ставку"}</b> на ваш вантаж\n${esc(route(c))} · ${esc(c.cargo)}\n\n` +
      `<b>${esc(money(r.price, r.currency) || "ціна за домовленістю")}</b> — ${esc(b?.name)}${esc(b?.city ? ", " + b.city : "")}${esc(rate)}` +
      (r.comment ? `\n${esc(r.comment)}` : "") + `\n\nУсього пропозицій: ${c.responses_count}`;
    for (const s of await subsFor(users, "offers")) if (await send(s.chat_id, text, ["Порівняти ставки", `${SITE}/moi-zayavky#cargo`])) sent++;
    return sent;
  }

  if (ev === "request_new") {
    const { data: q } = await sb.from("requests").select("*, brokers(user_id)").eq("id", id).maybeSingle();
    if (!q || Date.now() - new Date(q.created_at).getTime() > 15 * 60e3 || !(await once("request_new:" + id))) return 0;
    const car = [q.car_make, q.car_model, q.car_year].filter(Boolean).join(" ");
    const text = `📩 <b>Нова заявка від клієнта</b>\n${esc(q.service || "Загальний запит")}${car ? "\n" + esc(car) : ""}` +
      (q.comment ? `\n${esc(String(q.comment).slice(0, 300))}` : "") + `\n\nКонтакти клієнта — у кабінеті.`;
    for (const s of await subsFor([q.brokers?.user_id], "requests")) if (await send(s.chat_id, text, ["Відкрити заявки", `${SITE}/kabinet#requests`])) sent++;
    return sent;
  }

  if (ev === "vehicle_verified" || ev === "vehicle_rejected") {
    const { data: v } = await sb.from("vehicles").select("*, brokers(user_id)").eq("id", id).maybeSingle();
    if (!v || "vehicle_" + v.status !== ev || !(await once(`${ev}:${id}:${Math.floor(Date.now() / 36e5)}`))) return 0;
    const text = ev === "vehicle_verified"
      ? `🛡 <b>Авто перевірено</b>: ${esc(v.plate)}${v.kind ? " · " + esc(v.kind) : ""}\nПозначка «авто перевірено» вже у вашому профілі та пропозиціях транспорту.`
      : `⚠️ <b>Авто не підтверджено</b>: ${esc(v.plate)}${v.admin_note ? "\nПричина: " + esc(v.admin_note) : ""}\nВиправте дані в кабінеті — авто повернеться на перевірку.`;
    for (const s of await subsFor([v.brokers?.user_id], "cargo")) if (await send(s.chat_id, text, ["Автопарк", `${SITE}/kabinet#fleet`])) sent++;
    return sent;
  }
  return 0;
}

/* ---------------- вебхук Telegram ---------------- */
async function handleUpdate(u: any) {
  const m = u.message;
  if (!m?.chat?.id || typeof m.text !== "string") return;
  const chat = m.chat.id, text = m.text.trim();
  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1] ?? "";
    if (code) {
      const { data: row } = await sb.from("tg_link_codes").select("user_id, created_at").eq("code", code).maybeSingle();
      if (!row || Date.now() - new Date(row.created_at).getTime() > 24 * 36e5) {
        await send(chat, "Посилання застаріло. Відкрийте кабінет на forwardcarua.com і натисніть «Підключити Telegram» ще раз.");
        return;
      }
      await sb.from("tg_subs").upsert({ user_id: row.user_id, chat_id: chat, tg_username: m.from?.username ?? null }, { onConflict: "user_id" });
      await sb.from("tg_link_codes").delete().eq("code", code);
      await send(chat, "✅ <b>Сповіщення підключено.</b>\nСюди приходитимуть нові ставки на ваші вантажі, нові вантажі на ваших напрямках і заявки клієнтів.\n\nНалаштувати або вимкнути — у кабінеті, або командою /stop.",
        ["Відкрити кабінет", `${SITE}/vhid`]);
      return;
    }
    await send(chat, "Вітаємо! Це бот сповіщень біржі ВантажПоруч і каталогу МитнийБрокер.\nЩоб отримувати сповіщення, увійдіть у кабінет і натисніть «Підключити Telegram».",
      ["Увійти в кабінет", `${SITE}/vhid`]);
    return;
  }
  if (text === "/stop") {
    await sb.from("tg_subs").delete().eq("chat_id", chat);
    await send(chat, "Сповіщення вимкнено. Підключити знову можна в кабінеті.");
    return;
  }
  await send(chat, "Я лише надсилаю сповіщення. Усе керування — у кабінеті на forwardcarua.com. /stop — вимкнути сповіщення.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (!TOKEN) return json({ ok: true, configured: false });
    const me = await tg("getMe", {});
    if (url.searchParams.get("setup") === "1") {
      const r = await tg("setWebhook", { url: SELF, secret_token: await hookSecret(), allowed_updates: ["message"], drop_pending_updates: true });
      return json({ ok: r.ok, configured: true, username: me.result?.username, webhook: r.description });
    }
    const wh = await tg("getWebhookInfo", {});
    return json({ ok: true, configured: !!me.ok, username: me.result?.username ?? null, webhook: wh.result?.url === SELF });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({}));

  if (req.headers.get("x-telegram-bot-api-secret-token")) {
    if (!TOKEN || req.headers.get("x-telegram-bot-api-secret-token") !== await hookSecret()) return json({ error: "forbidden" }, 403);
    try { await handleUpdate(body); } catch (e) { console.error("update", e); }
    return json({ ok: true });
  }

  if (typeof body.event === "string") {
    try { return json({ ok: true, sent: await handleEvent(body.event, String(body.id ?? "")) }); }
    catch (e) { console.error("event", body.event, e); return json({ ok: false }, 500); }
  }
  return json({ error: "bad_request" }, 400);
});
