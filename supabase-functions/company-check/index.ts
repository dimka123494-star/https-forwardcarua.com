// Supabase Edge Function «company-check»: платна перевірка компанії за ЄДРПОУ.
// POST {code} з JWT користувача → бере зі свіжих відкритих даних (гілка opendata репозиторію, шарди по коду):
//   erb/NNN.json — Єдиний реєстр боржників, bankrupt/NNN.json — справи про банкрутство, courts/NNN.json — судові справи;
// додає ЄДР і ліцензію (якщо перевізник), списує ціну з балансу (company_check_charge) і зберігає звіт.
// Повторний перегляд тієї ж компанії протягом 30 днів — без оплати.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RAW = "https://raw.githubusercontent.com/dimka123494-star/https-forwardcarua.com/opendata/";
const SHARDS = 128;
const CORS = {
  "Access-Control-Allow-Origin": "https://forwardcarua.com",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function shard(kind: string, code: string): Promise<any> {
  const n = String(Number(code) % SHARDS).padStart(3, "0");
  const r = await fetch(`${RAW}${kind}/${n}.json`);
  if (!r.ok) throw new Error(`source ${kind} ${r.status}`);
  return (await r.json())[code] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user } } = await sb.auth.getUser(jwt);
    if (!user) return json({ error: "unauthorized" }, 401);
    const code = String((await req.json().catch(() => ({}))).code ?? "").replace(/\D/g, "");
    if (!/^\d{8}$/.test(code)) return json({ error: "bad_code" }, 400);

    // спершу дані — гроші списуємо, лише якщо звіт зібрано
    let meta: any, erb: any, bankrupt: any, courts: any;
    try {
      [meta, erb, bankrupt, courts] = await Promise.all([
        fetch(RAW + "meta.json").then((r) => r.json()), shard("erb", code), shard("bankrupt", code), shard("courts", code)]);
    } catch (e) {
      console.error("sources:", e);
      return json({ error: "unavailable" }, 503);
    }
    const [{ data: lic }, { data: edr }] = await Promise.all([
      sb.from("carrier_registry").select("name, status, intl_cargo, dangerous").eq("edrpou", code).maybeSingle(),
      sb.from("carrier_edr").select("data").eq("edrpou", code).maybeSingle()]);
    const report = {
      code, checked_at: new Date().toISOString(), data_at: meta?.generated ?? null,
      name: edr?.data?.name || lic?.name || erb?.name || bankrupt?.name || null,
      erb, bankrupt: bankrupt?.items ?? null, courts,
      edr: edr?.data ?? null,
      license: lic ? { status: lic.status, intl_cargo: lic.intl_cargo, dangerous: lic.dangerous } : null,
    };
    const { data: ch, error } = await sb.rpc("company_check_charge", { p_user: user.id, p_code: code, p_report: report });
    if (error) {
      const m = String(error.message || "");
      const k = ["no_cabinet", "balance", "unavailable", "bad_code"].find((x) => m.includes(x));
      if (!k) console.error("charge:", error);
      return json({ error: k || "server_error" }, k === "balance" ? 402 : k ? 400 : 500);
    }
    return json({ ...report, ...ch });
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
