// Supabase Edge Function «check-pay»: перевірка компанії з оплатою карткою (WayForPay) — без кабінету.
//  POST {action:"checkout", code, email} → замовлення (check_orders) + поля форми WayForPay
//  POST від WayForPay (serviceUrl, підписаний)  → позначає замовлення оплаченим
//  GET  ?return=<token> (returnUrl WayForPay)    → 303 на https://forwardcarua.com/zvit?t=<token>
//  POST {action:"report", token}                 → звіт, якщо оплачено (збирається один раз і зберігається)
// Деплой без перевірки JWT: і відвідувач, і WayForPay приходять без токена; доступ до звіту — за випадковим токеном.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const pick = (...names: string[]) => names.map((n) => Deno.env.get(n)).find((v) => v && v.trim())?.trim() ?? "";
const MERCHANT = pick("WFP_MERCHANT", "WAYFORPAY_MERCHANT", "WAYFORPAY_MERCHANT_ACCOUNT", "WAYFORPAY_LOGIN", "WFP_MERCHANT_ACCOUNT", "MERCHANT_ACCOUNT");
const SECRET = pick("WFP_SECRET", "WAYFORPAY_SECRET", "WAYFORPAY_SECRET_KEY", "WAYFORPAY_MERCHANT_SECRET", "WFP_SECRET_KEY", "MERCHANT_SECRET_KEY");
const hmac = (s: string) => createHmac("md5", SECRET).update(s, "utf8").digest("hex");
const DOMAIN = "forwardcarua.com";
const RAW = "https://raw.githubusercontent.com/dimka123494-star/https-forwardcarua.com/opendata/";
const SHARDS = 128;
const CORS = {
  "Access-Control-Allow-Origin": "https://forwardcarua.com",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function shard(kind: string, code: string, optional = false): Promise<any> {
  const n = String(Number(code) % SHARDS).padStart(3, "0");
  const r = await fetch(`${RAW}${kind}/${n}.json`);
  if (optional && r.status === 404) return null;
  if (!r.ok) throw new Error(`source ${kind} ${r.status}`);
  return (await r.json())[code] ?? null;
}
async function buildReport(db: any, code: string) {
  const [meta, erb, bankrupt, courts, decisions] = await Promise.all([
    fetch(RAW + "meta.json").then((r) => r.json()), shard("erb", code), shard("bankrupt", code), shard("courts", code), shard("decisions", code, true)]);
  const [{ data: lic }, { data: edr }] = await Promise.all([
    db.from("carrier_registry").select("name, status, intl_cargo, dangerous").eq("edrpou", code).maybeSingle(),
    db.from("carrier_edr").select("data").eq("edrpou", code).maybeSingle()]);
  return {
    code, checked_at: new Date().toISOString(), data_at: meta?.generated ?? null,
    name: edr?.data?.name || lic?.name || erb?.name || bankrupt?.name || courts?.name || null,
    erb, bankrupt: bankrupt?.items ?? null, courts, decisions: decisions ?? null, edr: edr?.data ?? null,
    license: lic ? { status: lic.status, intl_cargo: lic.intl_cargo, dangerous: lic.dangerous } : null,
  };
}

async function readBody(req: Request) {
  const text = await req.text();
  try { return JSON.parse(text); } catch (_) { /* далі */ }
  try { return JSON.parse(decodeURIComponent(text.replace(/\+/g, " "))); } catch (_) { /* далі */ }
  const form = new URLSearchParams(text);
  for (const [k, v] of form) { try { return JSON.parse(v ? k + "=" + v : k); } catch (_) { try { return JSON.parse(k); } catch (_) {} } }
  return {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  const ret = u.searchParams.get("return");
  if (ret) return new Response(null, { status: 303, headers: { Location: `https://forwardcarua.com/zvit?t=${encodeURIComponent(ret)}` } });
  if (req.method !== "POST") return new Response("ok");
  const db = sb();
  const p: Record<string, any> = await readBody(req);

  // ---- підтвердження оплати від WayForPay ----
  if (p.merchantSignature && p.orderReference) {
    const base = [p.merchantAccount, p.orderReference, p.amount, p.currency, p.authCode, p.cardPan, p.transactionStatus, p.reasonCode].join(";");
    if (!SECRET || hmac(base) !== p.merchantSignature) { console.error("bad signature", p.orderReference); return new Response("bad signature", { status: 400 }); }
    const { data: o } = await db.from("check_orders").select("*").eq("order_reference", p.orderReference).maybeSingle();
    if (o && o.status !== "paid") {
      if (p.transactionStatus === "Approved" && Number(p.amount) >= Number(o.amount)) {
        await db.from("check_orders").update({ status: "paid", paid_at: new Date().toISOString(), raw: p }).eq("id", o.id);
      } else {
        await db.from("check_orders").update({ status: String(p.transactionStatus || "declined").toLowerCase(), raw: p }).eq("id", o.id);
      }
    }
    const time = Math.floor(Date.now() / 1000);
    return new Response(JSON.stringify({ orderReference: p.orderReference, status: "accept", time, signature: hmac([p.orderReference, "accept", time].join(";")) }),
      { headers: { "Content-Type": "application/json" } });
  }

  try {
    // ---- нове замовлення ----
    if (p.action === "checkout") {
      if (!MERCHANT || !SECRET) return json({ error: "not_configured" }, 503);
      const code = String(p.code ?? "").replace(/\D/g, "");
      const email = String(p.email ?? "").trim().toLowerCase();
      if (!/^\d{8}$/.test(code)) return json({ error: "bad_code" }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad_email" }, 400);
      const { data: sp } = await db.from("service_prices").select("price, active").eq("code", "company_check").maybeSingle();
      if (!sp?.active) return json({ error: "unavailable" }, 503);
      const amount = Number(sp.price);
      const { count } = await db.from("check_orders").select("id", { count: "exact", head: true }).eq("email", email).gt("created_at", new Date(Date.now() - 3600e3).toISOString());
      if ((count ?? 0) >= 10) return json({ error: "too_many" }, 429);
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const orderReference = `chk-${code}-${Date.now()}`;
      const { error } = await db.from("check_orders").insert({ token, code, email, amount, order_reference: orderReference });
      if (error) { console.error("order insert:", error); return json({ error: "server_error" }, 500); }
      const productName = `Перевірка компанії ЄДРПОУ ${code}`;
      const orderDate = Math.floor(Date.now() / 1000);
      const sig = hmac([MERCHANT, DOMAIN, orderReference, orderDate, amount, "UAH", productName, 1, amount].join(";"));
      const base = Deno.env.get("SUPABASE_URL");
      return json({
        token,
        form: {
          merchantAccount: MERCHANT, merchantDomainName: DOMAIN, merchantSignature: sig,
          orderReference, orderDate, amount, currency: "UAH",
          productName: [productName], productPrice: [amount], productCount: [1],
          clientEmail: email, language: "UA",
          returnUrl: `${base}/functions/v1/check-pay?return=${token}`,
          serviceUrl: `${base}/functions/v1/check-pay`,
        },
      });
    }

    // ---- звіт за токеном ----
    if (p.action === "report") {
      const token = String(p.token ?? "");
      if (!/^[a-f0-9]{40}$/.test(token)) return json({ error: "not_found" }, 404);
      const { data: o } = await db.from("check_orders").select("*").eq("token", token).maybeSingle();
      if (!o) return json({ error: "not_found" }, 404);
      if (o.status !== "paid") return json({ status: o.status, code: o.code, amount: o.amount });
      if (!o.report) {
        const rep = await buildReport(db, o.code);
        o.report = { ...rep, price: Number(o.amount), repeat: false };
        await db.from("check_orders").update({ report: o.report }).eq("id", o.id);
      }
      return json({ status: "paid", report: o.report });
    }
    return json({ error: "bad_request" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
