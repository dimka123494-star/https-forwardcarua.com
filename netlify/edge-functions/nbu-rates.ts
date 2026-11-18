// Курси НБУ для калькулятора розмитнення й довідки VIN. bank.gov.ua не віддає CORS-заголовок,
// тож браузер не може читати API напряму — проксі на нашому домені з кешем на CDN (1 год).
import type { Config } from "https://edge.netlify.com";

export default async () => {
  try {
    const r = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json", { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("nbu " + r.status);
    const all = await r.json();
    // лише потрібні валюти — у тому ж форматі, що й API НБУ
    const data = all.filter((x: any) => ["EUR", "USD", "PLN", "GBP", "CHF"].includes(x.cc));
    return new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=600", "netlify-cdn-cache-control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch (_) {
    return new Response(JSON.stringify({ error: "unavailable" }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
};

export const config: Config = { path: "/api/nbu-rates" };
