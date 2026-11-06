// Supabase Edge Function «rmpd-lookup»: автозаповнення реквізитів для заявки RMPD.
//  POST {type:'ua', code}        — ЄДРПОУ → назва й статус ліцензії (реєстр перевізників у базі)
//  POST {type:'pl', code}        — NIP → назва й адреса (Biała lista podatników VAT, wl-api.mf.gov.pl)
//  POST {type:'vat', cc, code}   — EU VAT → назва й адреса (VIES, ec.europa.eu)
// Викликається лише з кабінету (verify_jwt = true).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const EU = ["AT","BE","BG","CY","CZ","DE","DK","EE","EL","ES","FI","FR","HR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK","XI"];

/** "UL. DŁUGA 5/3, 00-950 WARSZAWA" або "STREET 1\n12345 CITY" → частини */
function splitAddress(raw: string) {
  const s = String(raw || "").replace(/\s*\n\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
  const m = s.match(/^(.*?),?\s*\b((?:[A-Z]{1,2}-)?(?:\d{2}-\d{3}|\d{3} \d{2}|\d{4} ?[A-Z]{2}|\d{4,6}))\s+([^,\d][^,]*?)(?:\s+\d{1,2})?$/i);
  if (!m) return { street: s, postcode: "", city: "" };
  return { street: m[1].replace(/,\s*$/, "").trim(), postcode: m[2].trim(), city: m[3].trim() };
}
const title = (s: string) => s.toLowerCase().replace(/(^|[\s\-\/"(.])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
  .replace(/\bSp\. Z O\.o\./gi, "Sp. z o.o.").replace(/\bS\.a\./g, "S.A.");

async function ua(code: string) {
  const { data } = await sb.from("carrier_registry").select("name, status, intl_cargo, is_fop, license_date").eq("edrpou", code).maybeSingle();
  if (!data) return { found: false };
  return { found: true, name: data.name, country: "UA", license: { status: data.status, intl_cargo: data.intl_cargo, is_fop: data.is_fop, date: data.license_date } };
}

async function pl(nip: string) {
  const date = new Date().toISOString().slice(0, 10);
  const r = await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`, { headers: { Accept: "application/json" } });
  if (!r.ok) return { found: false, note: r.status === 400 ? "invalid" : "unavailable" };
  const j = await r.json().catch(() => null);
  const s = j?.result?.subject;
  if (!s) return { found: false };
  return { found: true, name: String(s.name).trim(), country: "PL", vat: s.statusVat, ...splitAddress(title(s.workingAddress || s.residenceAddress || "")) };
}

async function vat(cc: string, num: string) {
  if (cc === "GR") cc = "EL";
  if (!EU.includes(cc)) return { found: false, note: "not_eu" };
  const r = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${cc}/vat/${encodeURIComponent(num)}`, { headers: { Accept: "application/json" } });
  if (!r.ok) return { found: false, note: "unavailable" };
  const j = await r.json().catch(() => null);
  if (!j?.isValid) return { found: false, note: "invalid" };
  const name = j.name && j.name !== "---" ? String(j.name).trim() : "";
  const addr = j.address && j.address !== "---" ? splitAddress(title(j.address)) : { street: "", postcode: "", city: "" };
  return { found: !!name, name, country: cc === "EL" ? "GR" : cc, ...addr };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const b = await req.json().catch(() => ({}));
  const code = String(b.code ?? "").toUpperCase().replace(/[\s\-.]/g, "");
  try {
    if (b.type === "ua" && /^\d{8,10}$/.test(code)) return json(await ua(code));
    if (b.type === "pl") {
      const nip = code.replace(/^PL/, "");
      if (!/^\d{10}$/.test(nip)) return json({ found: false, note: "invalid" });
      return json(await pl(nip));
    }
    if (b.type === "vat") {
      const cc = String(b.cc ?? "").toUpperCase();
      const num = code.startsWith(cc) ? code.slice(cc.length) : code;
      if (!/^[A-Z0-9]{2,14}$/.test(num)) return json({ found: false, note: "invalid" });
      return json(cc === "PL" ? await pl(num) : await vat(cc, num));
    }
    return json({ found: false, note: "bad_request" }, 400);
  } catch (e) {
    console.error("rmpd-lookup", e);
    return json({ found: false, note: "unavailable" });
  }
});
