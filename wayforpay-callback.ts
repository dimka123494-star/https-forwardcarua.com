// Supabase Edge Function: приймає підтвердження оплати від WayForPay (serviceUrl).
// Активує тариф ЛИШЕ після перевірки підпису — фронтенд тариф не вмикає.
// Деплой без перевірки JWT: WayForPay надсилає запит без токена.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const SECRET = Deno.env.get("WFP_SECRET") ?? "";
const hmac = (s: string) => createHmac("md5", SECRET).update(s, "utf8").digest("hex");

// WayForPay шле JSON у тілі, інколи з Content-Type form-urlencoded — тоді весь JSON стає ключем форми
async function readBody(req: Request) {
  const text = await req.text();
  try { return JSON.parse(text); } catch (_) { /* далі */ }
  const form = new URLSearchParams(text);
  for (const [k, v] of form) { try { return JSON.parse(v ? k + "=" + v : k); } catch (_) { try { return JSON.parse(k); } catch (_) {} } }
  throw new Error("bad body");
}

const STATUS: Record<string, string> = {
  Approved: "approved", Declined: "declined", Refunded: "refunded", Expired: "expired", Voided: "voided",
  InProcessing: "inprocessing", WaitingAuthComplete: "inprocessing", Pending: "pending", RefundInProcessing: "inprocessing",
};

Deno.serve(async (req) => {
  // Повернення клієнта після оплати → кабінет
  if (new URL(req.url).searchParams.get("return")) {
    return new Response(null, { status: 303, headers: { Location: "https://forwardcarua.com/kabinet?paid=1#billing" } });
  }
  if (req.method !== "POST") return new Response("ok");
  let p: Record<string, any>;
  try { p = await readBody(req); } catch (_) { return new Response("bad request", { status: 400 }); }

  // 1. Перевірка підпису відповіді
  const base = [p.merchantAccount, p.orderReference, p.amount, p.currency,
                p.authCode, p.cardPan, p.transactionStatus, p.reasonCode].join(";");
  if (!SECRET || hmac(base) !== p.merchantSignature) {
    console.error("bad signature for", p.orderReference);
    return new Response("bad signature", { status: 400 });
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: payment } = await sb.from("payments").select("*").eq("order_reference", p.orderReference).maybeSingle();

  if (payment) {
    const st = STATUS[p.transactionStatus] ?? "declined";
    if (st === "approved" && payment.status !== "approved") {
      // Сума має збігтися з тією, що ми виставили
      if (Number(p.amount) < Number(payment.amount)) {
        console.error("amount mismatch", p.orderReference, p.amount, payment.amount);
      } else {
        const { data: b } = await sb.from("brokers").select("plan, plan_expires_at").eq("id", payment.broker_id).maybeSingle();
        // Продовження того ж тарифу — від дати закінчення поточного, інакше — від сьогодні
        const now = new Date();
        const cur = b?.plan_expires_at ? new Date(b.plan_expires_at) : null;
        const from = b?.plan === payment.plan && cur && cur > now ? cur : now;
        const until = new Date(from);
        payment.period === "year" ? until.setFullYear(until.getFullYear() + 1) : until.setMonth(until.getMonth() + 1);
        await sb.from("payments").update({ status: "approved", paid_at: now.toISOString(),
          wayforpay_transaction_id: p.authCode ?? null, raw: p }).eq("id", payment.id);
        const { error } = await sb.from("brokers").update({ plan: payment.plan, plan_expires_at: until.toISOString() }).eq("id", payment.broker_id);
        if (error) console.error("plan update:", error);
      }
    } else if (payment.status !== "approved") {
      await sb.from("payments").update({ status: st, raw: p }).eq("id", payment.id);
    }
  } else {
    console.error("payment not found", p.orderReference);
  }

  // 2. Обов'язкова відповідь WayForPay — інакше він повторюватиме запит
  const time = Math.floor(Date.now() / 1000);
  return new Response(JSON.stringify({
    orderReference: p.orderReference, status: "accept", time,
    signature: hmac([p.orderReference, "accept", time].join(";")),
  }), { headers: { "Content-Type": "application/json" } });
});
