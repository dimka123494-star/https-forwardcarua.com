// Supabase Edge Function «news»: інформаційні листи покупцям НомерОК з відпискою і згодою на новини.
//  POST {action:"unsub", t}   → відписка (посилання з листа веде на /vidpyska?t=…, сторінка викликає цю дію)
//  POST {action:"sub", t}     → згода отримувати новини (кнопка в листі → /vidpyska?a=s&t=…)
//  POST {action:"send", campaign, test} + x-cron-secret → розсилка кампанії: test=true — лише на ADMIN_EMAIL;
//       інакше всім покупцям (оплачені звіти авто, компаній, детальні перевірки), крім відписаних і тих, кому вже надіслано.
// Закон «Про електронну комерцію», ст. 10 ч. 3: без згоди можна, якщо в кожному листі є відписка — лист позначений як рекламний, відписка в один клік.
// Правила: не частіше 1 листа на ~місяць одній людині (marketing_recipients пропускає тих, кому писали за 25 днів);
// розсилки йдуть з окремого піддомену news.forwardcarua.com, щоб скарги на спам не зачепили листи зі звітами (mail.forwardcarua.com).
// Деплой без verify_jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const SITE = "https://forwardcarua.com";
const FROM = Deno.env.get("NEWS_FROM") ?? "НомерОК <news@news.forwardcarua.com>";
const REPLY = "custom@forwardcarua.com";
const ADMIN = Deno.env.get("ADMIN_EMAIL") ?? "dimka123494@gmail.com";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const KEY_SIGN = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const b64u = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
const sig = (email: string) => createHmac("sha256", KEY_SIGN).update("news|" + email).digest("hex").slice(0, 20);
const token = (email: string) => b64u(email) + "." + sig(email);
function readToken(t: string): string | null {
  const [a, s] = String(t ?? "").split(".");
  if (!a || !s) return null;
  try { const e = unb64u(a).toLowerCase(); return sig(e) === s ? e : null; } catch (_) { return null; }
}

// ---- кампанії ----
const CAMPAIGNS: Record<string, (email: string) => { subject: string; html: string; text: string }> = {
  "2026-12-vin-expert": (email) => {
    const t = token(email);
    const unsub = `${SITE}/vidpyska?t=${t}`, sub = `${SITE}/vidpyska?a=s&t=${t}`;
    const utm = "utm_source=email&utm_medium=newsletter&utm_campaign=2026-12-vin-expert";
    const vin = `${SITE}/rozshyfrovka-vin?${utm}`, chk = `${SITE}/perevirka-avto?${utm}`;
    const subject = "НомерОК: безкоштовна розшифровка VIN і детальна перевірка авто";
    const btn = (href: string, label: string, bg = "#10b981") => `<a href="${href}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:10px">${label}</a>`;
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:540px">
<p style="margin:0 0 14px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Новини НомерОК · рекламний лист</p>
<p style="margin:0 0 12px">Добрий день!</p>
<p style="margin:0 0 18px">Ви перевіряли авто на НомерОК (forwardcarua.com). Розповідаємо про два нові інструменти — можуть знадобитися, коли знову купуватимете або продаватимете машину.</p>
<p style="margin:0 0 6px;font-weight:600">🔎 Розшифровка VIN — безкоштовно</p>
<p style="margin:0 0 10px">Введіть VIN і дізнайтеся країну й завод виробника, модельний рік, двигун, коробку та комплектацію.</p>
<p style="margin:0 0 20px">${btn(vin, "Розшифрувати VIN")}</p>
<p style="margin:0 0 6px;font-weight:600">🛡 Детальна перевірка авто за реєстрами — 500 грн</p>
<p style="margin:0 0 10px">Перевіримо авто за VIN: обмеження, застава й обтяження (ДРОРМ), штрафи, виконавчі провадження. Довідку без персональних даних надішлемо на email. Ціна 500 грн з ПДВ.</p>
<p style="margin:0 0 24px">${btn(chk, "Замовити перевірку", "#f5a623")}</p>
<div style="margin:0 0 22px;padding:14px 16px;background:#f3f4f6;border-radius:10px">
<p style="margin:0 0 10px">Хочете отримувати знижки на перевірки й новини сервісу? Без згоди більше рекламних листів не надсилатимемо.</p>
${btn(sub, "Так, хочу отримувати новини", "#111")}</div>
<p style="margin:0;color:#888;font-size:12px">Ви отримали цей лист, бо купували звіт на forwardcarua.com. <a href="${unsub}" style="color:#888">Відписатися</a> — один клік.<br>ТОВ «ФОРВАРД КАР ЮА» · НомерОК · forwardcarua.com</p></div>`;
    const text = `Новини НомерОК · рекламний лист\n\nДобрий день!\n\nВи перевіряли авто на НомерОК (forwardcarua.com). Розповідаємо про два нові інструменти.\n\n` +
      `Розшифровка VIN — безкоштовно: країна й завод, модельний рік, двигун, коробка, комплектація.\n${vin}\n\n` +
      `Детальна перевірка авто за реєстрами — 500 грн з ПДВ: обмеження, ДРОРМ (застава й обтяження), штрафи, виконавчі провадження. Довідка на email.\n${chk}\n\n` +
      `Хочете отримувати знижки й новини? ${sub}\n\nВи отримали цей лист, бо купували звіт на forwardcarua.com. Відписатися: ${unsub}\nТОВ «ФОРВАРД КАР ЮА» · forwardcarua.com`;
    return { subject, html, text };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, KEY_SIGN);
  const p = await req.json().catch(() => ({}));

  if (p.action === "unsub" || p.action === "sub") {
    const email = readToken(p.t);
    if (!email) return json({ error: "bad_token" }, 400);
    const now = new Date().toISOString();
    const row = p.action === "unsub" ? { email, unsubscribed_at: now } : { email, consent_at: now, unsubscribed_at: null, source: "email_button" };
    const { error } = await db.from("marketing_contacts").upsert(row, { onConflict: "email" });
    if (error) { console.error(error); return json({ error: "server_error" }, 500); }
    return json({ ok: true, action: p.action });
  }

  if (p.action === "send") {
    const sec = req.headers.get("x-cron-secret") ?? "";
    const { data: ok } = sec ? await db.rpc("cron_secret_ok", { p: sec }) : { data: false };
    if (!ok) return json({ error: "unauthorized" }, 401);
    const make = CAMPAIGNS[String(p.campaign)];
    if (!make) return json({ error: "bad_campaign" }, 400);
    // окремий ключ Resend лише для news.forwardcarua.com (ключ звітів обмежений доменом mail.forwardcarua.com)
    let KEY = Deno.env.get("RESEND_NEWS_KEY") ?? Deno.env.get("RESEND_API_KEY") ?? "";
    if (!Deno.env.get("RESEND_NEWS_KEY")) KEY = (await db.from("app_secrets").select("value").eq("name", "RESEND_NEWS_KEY").maybeSingle()).data?.value || KEY;
    if (!KEY) KEY = (await db.from("app_secrets").select("value").eq("name", "RESEND_API_KEY").maybeSingle()).data?.value ?? "";
    if (!KEY) return json({ error: "no_resend_key" }, 500);
    let list: string[];
    if (p.test) list = [ADMIN];
    else {
      const { data, error } = await db.rpc("marketing_recipients", { p_campaign: String(p.campaign) });
      if (error) return json({ error: error.message }, 500);
      list = (data ?? []).map((r: any) => r.email);
    }
    let sent = 0; const failed: string[] = [];
    for (const email of list) {
      const m = make(email);
      if (!p.test) {
        // фіксуємо до відправки: повторний запуск не надішле вдруге
        const { error } = await db.from("marketing_sends").insert({ campaign: p.campaign, email });
        if (error) continue;
      }
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [email], reply_to: REPLY, subject: (p.test ? "[ТЕСТ] " : "") + m.subject, html: m.html, text: m.text,
          headers: { "List-Unsubscribe": `<${SITE}/vidpyska?t=${token(email)}>, <mailto:${REPLY}?subject=unsubscribe>` },
          tags: [{ name: "type", value: "newsletter" }] }),
      });
      if (r.ok) sent++; else {
        const body = await r.text();
        failed.push(email); console.error("resend", r.status, body);
        if (!p.test) await db.from("marketing_sends").delete().eq("campaign", p.campaign).eq("email", email);
        // піддомен розсилки ще не підтверджено в Resend — зупиняємось, а не шлемо з адреси звітів
        if (r.status === 403 || /domain/i.test(body)) return json({ error: "news_domain_not_verified", detail: body.slice(0, 200), sent }, 409);
      }
      await new Promise((ok) => setTimeout(ok, 600));   // ліміт Resend — 2 листи/с
    }
    return json({ campaign: p.campaign, test: !!p.test, recipients: list.length, sent, failed: failed.length });
  }
  return json({ error: "bad_request" }, 400);
});
