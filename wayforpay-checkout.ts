// Supabase Edge Function: створює підписаний платіж WayForPay.
// Секретний ключ живе ТІЛЬКИ тут (supabase secrets set WFP_SECRET=...).
// Деплой: supabase functions deploy wayforpay-checkout
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const MERCHANT = Deno.env.get("WFP_MERCHANT")!;      // напр. forwardcarua_com
const SECRET   = Deno.env.get("WFP_SECRET")!;        // секретний ключ WayForPay
const DOMAIN   = "forwardcarua.com";

const PLANS: Record<string, { label: string; month: number; year: number }> = {
  standard: { label: "Стандарт", month: 299, year: 2870 },
  pro:      { label: "Про",      month: 599, year: 5750 },
  premium:  { label: "Преміум",  month: 999, year: 9590 },
};

const CORS = {
  "Access-Control-Allow-Origin": "https://forwardcarua.com",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // 1. Авторизація: платити може лише залогінений брокер
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { data: broker } = await sb.from("brokers")
      .select("id, name, email").eq("user_id", user.id).maybeSingle();
    if (!broker) return json({ error: "broker_not_found" }, 404);

    // 2. Ціну беремо з сервера, а не з браузера
    const { plan, period } = await req.json();
    const cfg = PLANS[plan];
    if (!cfg || !["month", "year"].includes(period)) return json({ error: "bad_plan" }, 400);
    const amount = period === "year" ? cfg.year : cfg.month;
    const productName = `Підписка «${cfg.label}» — ${period === "year" ? "12 місяців" : "1 місяць"}`;

    // 3. Фіксуємо намір оплати
    const orderReference = `sub-${broker.id}-${Date.now()}`;
    const orderDate = Math.floor(Date.now() / 1000);
    await sb.from("payments").insert({
      broker_id: broker.id, plan, period, amount,
      order_reference: orderReference, status: "pending",
    });

    // 4. Підпис HMAC_MD5 за специфікацією WayForPay
    const signatureBase = [
      MERCHANT, DOMAIN, orderReference, orderDate, amount, "UAH",
      productName, 1, amount,
    ].join(";");
    const merchantSignature = createHmac("md5", SECRET).update(signatureBase, "utf8").digest("hex");

    return json({
      merchantAccount: MERCHANT,
      merchantDomainName: DOMAIN,
      merchantSignature,
      orderReference,
      orderDate,
      amount,
      currency: "UAH",
      productName: [productName],
      productPrice: [amount],
      productCount: [1],
      clientEmail: broker.email ?? user.email,
      language: "UA",
      returnUrl: "https://forwardcarua.com/kabinet",
      serviceUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/wayforpay-callback`,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}
