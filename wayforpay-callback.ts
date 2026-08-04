// Supabase Edge Function: приймає підтвердження оплати від WayForPay.
// Активує тариф ЛИШЕ після перевірки підпису — фронтенд тариф не вмикає.
// Деплой: supabase functions deploy wayforpay-callback --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const SECRET = Deno.env.get("WFP_SECRET")!;

Deno.serve(async (req) => {
  const p = await req.json();

  // 1. Перевірка підпису відповіді
  const base = [
    p.merchantAccount, p.orderReference, p.amount, p.currency,
    p.authCode, p.cardPan, p.transactionStatus, p.reasonCode,
  ].join(";");
  const expected = createHmac("md5", SECRET).update(base, "utf8").digest("hex");
  if (expected !== p.merchantSignature) {
    return new Response("bad signature", { status: 400 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: payment } = await sb.from("payments")
    .select("*").eq("order_reference", p.orderReference).maybeSingle();

  if (payment && p.transactionStatus === "Approved" && payment.status !== "approved") {
    const until = new Date();
    payment.period === "year" ? until.setFullYear(until.getFullYear() + 1)
                              : until.setMonth(until.getMonth() + 1);
    await sb.from("payments").update({ status: "approved" }).eq("id", payment.id);
    await sb.from("brokers").update({ plan: payment.plan, plan_until: until.toISOString() })
      .eq("id", payment.broker_id);
  } else if (payment && p.transactionStatus !== "Approved") {
    await sb.from("payments").update({ status: String(p.transactionStatus).toLowerCase() })
      .eq("id", payment.id);
  }

  // 2. Обов'язкова відповідь WayForPay
  const time = Math.floor(Date.now() / 1000);
  const answer = [p.orderReference, "accept", time].join(";");
  return new Response(JSON.stringify({
    orderReference: p.orderReference,
    status: "accept",
    time,
    signature: createHmac("md5", SECRET).update(answer, "utf8").digest("hex"),
  }), { headers: { "Content-Type": "application/json" } });
});
