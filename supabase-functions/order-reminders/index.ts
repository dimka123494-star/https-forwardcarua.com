// Supabase Edge Function «order-reminders»: один лист-нагадування тим, хто почав оплату звіту про авто карткою, але не завершив.
// Викликає pg_cron кожні 15 хв. Беремо замовлення 1–24 год тому, без оплати й без нагадування, і пропускаємо, якщо та сама
// людина (email) потім оплатила той самий номер. Лист — через Resend (домен mail.forwardcarua.com підтверджений у Resend).
// Також (POST {paid: 'vehicle_orders'|'check_orders', id} від тригера order_paid_notify) — лист із посиланням на оплачений звіт.
// Повторний виклик безпечний: кожне замовлення позначається reminded_at і більше не отримує листів. Деплой без verify_jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ключ Resend лише для відправки з mail.forwardcarua.com: секрет RESEND_API_KEY або таблиця app_secrets (лише service role)
let KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("REMINDER_FROM") ?? "НомерОК <noreply@mail.forwardcarua.com>";
const REPLY = Deno.env.get("REMINDER_REPLY_TO") ?? "custom@forwardcarua.com";
const SITE = "https://forwardcarua.com";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const LAT = "ABCEHIKMOPTXY", CYR = "АВСЕНІКМОРТХУ";
const toLat = (s: string) => [...s].map((c) => { const i = CYR.indexOf(c); return i < 0 ? c : LAT[i]; }).join("");

async function summary(q: string) {
  try {
    const r = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/vehicle-check", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "summary", q }), signal: AbortSignal.timeout(20000) });
    return r.ok ? await r.json() : null;
  } catch (_) { return null; }
}

function letter(q: string, s: any, price: number) {
  const v = s?.vehicle ?? {};
  const name = [v.brand, v.model].filter(Boolean).join(" ") + (v.year ? ", " + v.year : "");
  const plate = toLat(q);
  const items = [
    s?.events ? `${s.events} записів з реєстру МВС: дати, області, зміни власника` : "Уся історія реєстрацій з реєстру МВС",
    "Повний VIN і всі номерні знаки авто",
    s?.ria_teaser ? `Оголошення з AUTO.RIA: ${s.ria_teaser.photo_count ? s.ria_teaser.photo_count + " фото, " : "фото, "}ціна, пробіг` : "Пошук оголошень про продаж на AUTO.RIA: фото, ціна, пробіг",
    "Перевірка в базі розшуку МВС",
  ];
  const mp = s?.market_price?.usd ? `<p style="margin:0 0 16px">Ринкова ціна такого авто ≈ <b>$${Number(s.market_price.usd).toLocaleString("uk-UA")}</b>.</p>` : "";
  const url = `${SITE}/perevirka-avto?q=${encodeURIComponent(plate)}&utm_source=email&utm_medium=reminder#vcBuy`;
  const subject = name ? `Ваш звіт про ${name} (${plate}) чекає` : `Ваш звіт про авто ${plate} чекає`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:520px">
<p style="margin:0 0 12px">Добрий день!</p>
<p style="margin:0 0 12px">Ви почали перевірку авто <b>${esc(plate)}${name ? " — " + esc(name) : ""}</b> у НомерОК, але оплата не завершилась.</p>
<p style="margin:0 0 6px">У повному звіті на це авто:</p>
<ul style="margin:0 0 12px;padding-left:20px">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
${mp}
<p style="margin:0 0 20px"><a href="${url}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">Відкрити звіт · ${price} грн</a></p>
<p style="margin:0 0 20px;color:#444">Якщо картка не пройшла або є питання — просто дайте відповідь на цей лист.</p>
<p style="margin:0;color:#888;font-size:12px">НомерОК · forwardcarua.com<br>Ви отримали цей лист, бо вказали email під час перевірки авто. Більше листів про це замовлення не буде.</p></div>`;
  const text = `Добрий день!\n\nВи почали перевірку авто ${plate}${name ? " — " + name : ""} у НомерОК, але оплата не завершилась.\n\nУ повному звіті:\n- ${items.join("\n- ")}\n\nВідкрити звіт · ${price} грн: ${url}\n\nЯкщо картка не пройшла або є питання — дайте відповідь на цей лист.\n\nНомерОК · forwardcarua.com\nВи отримали цей лист, бо вказали email під час перевірки авто. Більше листів про це замовлення не буде.`;
  return { subject, html, text };
}

// лист після оплати: посилання на звіт (доступ — за випадковим токеном замовлення)
async function paidMail(db: any, table: string, id: string) {
  if (table !== "vehicle_orders" && table !== "check_orders") return { error: "bad_table" };
  // emailed_at ставимо атомарно — другий виклик нічого не надішле
  const { data: o } = await db.from(table).update({ emailed_at: new Date().toISOString() }).eq("id", id).eq("status", "paid").is("emailed_at", null).select("*").maybeSingle();
  if (!o) return { skipped: "already_or_not_paid" };
  const veh = table === "vehicle_orders";
  const url = `${SITE}/${veh ? "zvit-avto" : "zvit"}?t=${o.token}`;
  let subject: string, what: string;
  if (veh) {
    const s = await summary(o.q);
    const v = s?.vehicle ?? {};
    const name = [v.brand, v.model].filter(Boolean).join(" ") + (v.year ? ", " + v.year : "");
    what = `авто ${toLat(o.q)}${name ? " — " + name : ""}`;
    subject = `Звіт про ${name || "авто"} (${toLat(o.q)}) готовий`;
  } else {
    what = `компанію з кодом ЄДРПОУ ${o.code}`;
    subject = `Звіт про компанію ${o.code} готовий`;
  }
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:520px">
<p style="margin:0 0 12px">Дякуємо за оплату!</p>
<p style="margin:0 0 16px">Ваш повний звіт про ${esc(what)} готовий. Посилання постійне — звіт можна відкрити будь-коли й завантажити в PDF.</p>
<p style="margin:0 0 20px"><a href="${url}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">Відкрити звіт</a></p>
<p style="margin:0 0 20px;color:#444">Оплачено ${esc(o.amount)} грн. Не пересилайте посилання стороннім: будь-хто з ним може переглянути звіт. Питання — просто дайте відповідь на цей лист.</p>
<p style="margin:0;color:#888;font-size:12px">НомерОК · forwardcarua.com</p></div>`;
  const text = `Дякуємо за оплату!\n\nВаш повний звіт про ${what} готовий: ${url}\nПосилання постійне — звіт можна відкрити будь-коли й завантажити в PDF.\n\nОплачено ${o.amount} грн. Не пересилайте посилання стороннім.\n\nНомерОК · forwardcarua.com`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Idempotency-Key": `paid-${table}-${id}` },
    body: JSON.stringify({ from: FROM, to: [o.email], reply_to: REPLY, subject, html, text, tags: [{ name: "type", value: "report_paid" }] }),
  });
  if (!r.ok) { console.error("resend paid:", r.status, await r.text()); await db.from(table).update({ emailed_at: null }).eq("id", id); return { error: r.status }; }
  return { sent: 1 };
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!KEY) KEY = (await db.from("app_secrets").select("value").eq("name", "RESEND_API_KEY").maybeSingle()).data?.value ?? "";
  if (!KEY) return json({ skipped: "no_resend_key" });
  const body = await req.json().catch(() => ({}));
  if (body?.paid) return json(await paidMail(db, String(body.paid), String(body.id ?? "")));
  const now = Date.now();
  const { data: pend, error } = await db.from("vehicle_orders").select("id, q, email, amount, created_at")
    .neq("status", "paid").is("reminded_at", null)
    .lt("created_at", new Date(now - 3600e3).toISOString()).gt("created_at", new Date(now - 24 * 3600e3).toISOString())
    .order("created_at").limit(50);
  if (error) return json({ error: error.message }, 500);
  const done = new Set<string>();
  let sent = 0, skipped = 0;
  for (const o of pend ?? []) {
    const k = o.email + "|" + o.q;
    // позначаємо одразу: навіть якщо лист не піде, повторно не надсилаємо
    await db.from("vehicle_orders").update({ reminded_at: new Date().toISOString() }).eq("id", o.id);
    if (done.has(k)) { skipped++; continue; }
    done.add(k);
    // той самий email уже оплатив цей номер (у будь-який момент) — нагадування не потрібне
    const { count } = await db.from("vehicle_orders").select("id", { count: "exact", head: true }).eq("email", o.email).eq("q", o.q).eq("status", "paid");
    if ((count ?? 0) > 0) { skipped++; continue; }
    const s = await summary(o.q);
    if (s && s.found === false) { skipped++; continue; }
    const m = letter(o.q, s, Number(o.amount));
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [o.email], reply_to: REPLY, subject: m.subject, html: m.html, text: m.text,
        headers: { "X-Entity-Ref-ID": "veh-" + o.id }, tags: [{ name: "type", value: "vehicle_reminder" }] }),
    });
    if (r.ok) sent++; else console.error("resend:", r.status, await r.text());
  }
  return json({ checked: (pend ?? []).length, sent, skipped });
});
