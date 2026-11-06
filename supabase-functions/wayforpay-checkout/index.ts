// Supabase Edge Function: створює підписаний платіж WayForPay.
//  • {plan, period} — підписка на тариф
//  • {topup: сума}  — поповнення балансу для оплати документів (RMPD тощо)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

// Ключі могли бути збережені під різними назвами — беремо першу задану
const pick = (...names: string[]) => names.map((n) => Deno.env.get(n)).find((v) => v && v.trim())?.trim() ?? "";
const MERCHANT = pick("WFP_MERCHANT", "WAYFORPAY_MERCHANT", "WAYFORPAY_MERCHANT_ACCOUNT", "WAYFORPAY_LOGIN", "WFP_MERCHANT_ACCOUNT", "MERCHANT_ACCOUNT");
const SECRET   = pick("WFP_SECRET", "WAYFORPAY_SECRET", "WAYFORPAY_SECRET_KEY", "WAYFORPAY_MERCHANT_SECRET", "WFP_SECRET_KEY", "MERCHANT_SECRET_KEY");
const DOMAIN   = "forwardcarua.com";
const TOPUP_MIN = 200, TOPUP_MAX = 50000;

const PLANS: Record<string, { label: string; month: number; year: number }> = {
  standard: { label: "Стандарт", month: 299, year: 2870 },
  pro:      { label: "Про",      month: 599, year: 5750 },
  premium:  { label: "Преміум",  month: 999, year: 9590 },
};

const CORS = {
  "Access-Control-Allow-Origin": "https://forwardcarua.com",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return json({ ok: true, merchant: !!MERCHANT, secret: !!SECRET,
    names: Object.keys(Deno.env.toObject()).filter((k) => /WFP|WAYFOR|MERCHANT/i.test(k)) });
  if (!MERCHANT || !SECRET) return json({ error: "not_configured" }, 503);

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { data: broker } = await sb.from("brokers").select("id, name, email").eq("user_id", user.id).maybeSingle();
    if (!broker) return json({ error: "broker_not_found" }, 404);

    const body = await req.json();
    let amount: number, productName: string, plan: string, period: string | null, prefix: string, back: string;
    if (body.topup !== undefined) {
      amount = Math.round(Number(body.topup));
      if (!Number.isFinite(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX) return json({ error: "bad_amount" }, 400);
      productName = "Поповнення балансу МитнийБрокер (оплата документів)";
      plan = "topup"; period = null; prefix = "top"; back = "rmpd";
    } else {
      const cfg = PLANS[body.plan];
      if (!cfg || !["month", "year"].includes(body.period)) return json({ error: "bad_plan" }, 400);
      amount = body.period === "year" ? cfg.year : cfg.month;
      productName = `Підписка «${cfg.label}» — ${body.period === "year" ? "12 місяців" : "1 місяць"}`;
      plan = body.plan; period = body.period; prefix = "sub"; back = "billing";
    }

    const orderReference = `${prefix}-${broker.id}-${Date.now()}`;
    const orderDate = Math.floor(Date.now() / 1000);
    const { error: payErr } = await sb.from("payments").insert({
      broker_id: broker.id, plan, period, amount,
      order_reference: orderReference, wayforpay_order_id: orderReference, status: "pending",
    });
    if (payErr) { console.error("payments insert:", payErr); return json({ error: "server_error" }, 500); }

    const signatureBase = [MERCHANT, DOMAIN, orderReference, orderDate, amount, "UAH", productName, 1, amount].join(";");
    const merchantSignature = createHmac("md5", SECRET).update(signatureBase, "utf8").digest("hex");
    const base = Deno.env.get("SUPABASE_URL");

    return json({
      merchantAccount: MERCHANT, merchantDomainName: DOMAIN, merchantSignature,
      orderReference, orderDate, amount, currency: "UAH",
      productName: [productName], productPrice: [amount], productCount: [1],
      clientEmail: broker.email ?? user.email, language: "UA",
      returnUrl: `${base}/functions/v1/wayforpay-callback?return=1&to=${back}`,
      serviceUrl: `${base}/functions/v1/wayforpay-callback`,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
