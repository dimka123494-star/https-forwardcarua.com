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
// ЄДР усіх юросіб: шарди .json.gz у GitHub-релізі edr-data (tools/edr_shards.py); короткі ключі → формат carrier_edr
const EDR = "https://github.com/dimka123494-star/https-forwardcarua.com/releases/download/edr-data/";
async function edrFor(code: string) {
  const r = await fetch(`${EDR}edr-${String(Number(code) % 512).padStart(3, "0")}.json.gz`);
  if (!r.ok || !r.body) return null;
  const c = JSON.parse(await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text())[code];
  if (!c) return null;
  return {
    name: c.n || null, short_name: c.sn || null, opf: c.o || null, state: c.s || null, reg_date: c.d || null,
    capital: c.c ?? null, heads: (c.h || []).map((name: string) => ({ name, role: "керівник" })),
    founders_total: c.fn || 0, founder_orgs: (c.fo || []).map(([name, code]: string[]) => ({ name, code })),
    branches: c.b || 0, termination: c.t || null, bankruptcy: c.bk || null,
    taxes: (c.x || []).map(([type, date, end]: string[]) => ({ type, date, end })),
  };
}
async function buildReport(db: any, code: string) {
  const [meta, erb, bankrupt, courts, decisions, licenses] = await Promise.all([
    fetch(RAW + "meta.json").then((r) => r.json()), shard("erb", code), shard("bankrupt", code), shard("courts", code), shard("decisions", code, true), shard("lic", code, true).catch(() => null)]);
  const [{ data: lic }, { data: edr }, sanctions, aeo] = await Promise.all([
    db.from("carrier_registry").select("name, status, intl_cargo, dangerous").eq("edrpou", code).maybeSingle(),
    db.from("carrier_edr").select("data").eq("edrpou", code).maybeSingle(),
    sanctionsFor(db, code).catch(() => null), aeoFor(code).catch(() => null)]);
  const [edrData, extract] = await Promise.all([edr?.data ? Promise.resolve(edr.data) : edrFor(code).catch(() => null),
    extFor(db, code).catch((e) => { console.error("edrx:", e); return null; })]);   // джерела ЄДР необовʼязкові
  return {
    code, checked_at: new Date().toISOString(), data_at: meta?.generated ?? null,
    name: edrData?.name || lic?.name || erb?.name || bankrupt?.name || courts?.name || null,
    erb, bankrupt: bankrupt?.items ?? null, courts, decisions: decisions ?? null, edr: edrData, extract,
    license: lic ? { status: lic.status, intl_cargo: lic.intl_cargo, dangerous: lic.dangerous } : null,
      sanctions, aeo, licenses: licenses ?? [],
  };
}

// Санкції РНБО: таблиця sanctions_legal (наповнює sanctions-sync через API, коли є ключ NSDC_API_KEY);
// поки її немає — індекс із CSV-експорту drs.nsdc.gov.ua (data/sanctions.json у репозиторії, tools/sanctions_import.py)
const SANC_URL = "https://raw.githubusercontent.com/dimka123494-star/https-forwardcarua.com/main/data/sanctions.json";
let sancIdx: any = null, sancAt = 0;
async function sanctionsFor(db: any, code: string) {
  const { data: run } = await db.from("sanctions_runs").select("at").eq("ok", true).gt("subjects", 0).order("id", { ascending: false }).limit(1).maybeSingle();
  if (run) {
    const { data } = await db.from("sanctions_legal").select("name, status, data").contains("codes", [code]);
    return { at: run.at, items: (data ?? []).map((x: any) => ({ name: x.name, status: x.status })) };
  }
  if (!sancIdx || Date.now() - sancAt > 6 * 3600e3) {
    const r = await fetch(SANC_URL);
    if (!r.ok) return null;
    sancIdx = await r.json(); sancAt = Date.now();
  }
  const today = new Date().toISOString().slice(0, 10);
  const items = (sancIdx.codes?.[code] ?? []).map((x: any) => ({
    name: x.n, status: x.s === "active" && x.e && x.e < today ? "expired" : x.s,
    kind: x.k, decree: x.d, decree_date: x.dd, term: x.t, end_date: x.e,
  }));
  return { at: sancIdx._at, source: "csv", items };
}
// Розширені дані для «Витягу з ЄДР» (засновники з частками, бенефіціари, представники, номер запису, філії):
// зашифровані шарди edrx-NN.bin (код % 64) в окремому релізі edrx-data (tools/edr_shards.py). Приватний ключ — app_secrets.EDRX_PRIVATE_KEY.
const EDRX = "https://github.com/dimka123494-star/https-forwardcarua.com/releases/download/edrx-data/";
let edrxKey: CryptoKey | null = null;
async function extFor(db: any, code: string) {
  if (!edrxKey) {
    const { data } = await db.from("app_secrets").select("value").eq("name", "EDRX_PRIVATE_KEY").maybeSingle();
    if (!data?.value) return null;
    const der = Uint8Array.from(atob(String(data.value).replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
    edrxKey = await crypto.subtle.importKey("pkcs8", der, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  }
  const r = await fetch(`${EDRX}edrx-${String(Number(code) % 64).padStart(2, "0")}.bin`);   // 64 файли
  if (!r.ok) return null;
  const b = new Uint8Array(await r.arrayBuffer());
  const wl = (b[0] << 8) | b[1];
  const aes = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, edrxKey, b.slice(2, 2 + wl));
  const k = await crypto.subtle.importKey("raw", aes, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(2 + wl, 14 + wl) }, k, b.slice(14 + wl));
  const x = JSON.parse(await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text())[code];
  if (!x) return null;
  return {
    reg_number: x.rn ?? null, record_date: x.rd ?? null, management: x.m ?? null,
    signers: (x.sg || []).map(([name, role]: string[]) => ({ name, role })),
    founders: (x.f || []).map(([name, code, share]: any[]) => ({ name, code, share })),
    beneficiaries: x.bf || [], branches: (x.br || []).map(([name, code]: string[]) => ({ name, code })), successors: x.pr || [],
  };
}
async function aeoFor(code: string) {
  const r = await fetch(RAW + "aeo.json");
  if (!r.ok) return null;
  return (await r.json())[code] ?? null;
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
