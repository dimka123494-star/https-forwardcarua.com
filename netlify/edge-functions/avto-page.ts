// Серверний рендер сторінки авто /avto/{номер}: Google бачить марку, рік, історію й JSON-LD Vehicle.
// Дані — безкоштовна довідка функції vehicle-check (відкриті дані МВС), шаблон — avto.html, розмітка — vehicle-render.mjs.
import type { Config, Context } from "https://edge.netlify.com";
import { renderVehicle, esc } from "../../assets/js/vehicle-render.mjs";

const SB = "https://ecdfpqhbaqjqurzedunh.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjZGZwcWhiYXFqcXVyemVkdW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzU3NTIsImV4cCI6MjA5NDg1MTc1Mn0.t0ry-slbPVwVHmF1KLzWX6EDonWBMC2Uu3KUobH8oFY";
const LAT = "ABCEHIKMOPTXY", CYR = "АВСЕНІКМОРТХУ";
const toCyr = (s: string) => [...s].map((c) => { const i = LAT.indexOf(c); return i < 0 ? c : CYR[i]; }).join("");

function setMeta(html: string, attr: "name" | "property", key: string, val: string) {
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*">`);
  const tag = `<meta ${attr}="${key}" content="${esc(val)}">`;
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", tag + "\n</head>");
}

export default async (req: Request, ctx: Context) => {
  const url = new URL(req.url);
  let raw = "";
  try { raw = decodeURIComponent((url.pathname.match(/^\/avto\/([^/]+)\/?$/) || [])[1] || ""); } catch (_) { /* битий URL */ }
  const clean = raw.toUpperCase().replace(/[\s\-.]/g, "");
  // VIN — на сторінку пошуку; номер латиницею чи з пробілами — 301 на канонічний кириличний
  if (/^[A-HJ-NPR-Z0-9]{17}$/.test(clean)) return Response.redirect(`${url.origin}/perevirka-avto?q=${clean}`, 302);
  const plate = toCyr(clean);
  if (plate && plate !== raw) return Response.redirect(`${url.origin}/avto/${encodeURIComponent(plate)}`, 301);

  const res = await ctx.next();
  try {
    if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
    let html = await res.text();
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    if (!/^[0-9А-ЯІЇЄ]{4,10}$/.test(plate)) return new Response(setMeta(html, "name", "robots", "noindex,follow"), { status: 404, headers });
    const r = await fetch(`${SB}/functions/v1/vehicle-check`, {
      method: "POST", body: JSON.stringify({ action: "summary", q: plate }),
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    });
    const d = r.ok ? await r.json() : null;
    if (!d) return new Response(html, { status: 200, headers });       // джерело недоступне — дорендерить браузер
    if (!d.found) return new Response(setMeta(html, "name", "robots", "noindex,follow"), { status: 404, headers });
    const p = renderVehicle(d);
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`)
      .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${p.canonical}">`)
      .replace(/<main id="avMain">[\s\S]*?<!--\/AV--><\/main>/, () => `<main id="avMain" data-ssr="1">${p.html}</main>` +
        `<script type="application/json" id="avData">${JSON.stringify(d).replace(/</g, "\\u003c")}</script>`)
      .replace(/<script type="application\/ld\+json" id="avLd">[\s\S]*?<\/script>/,
        () => `<script type="application/ld+json" id="avLd">${JSON.stringify(p.ld).replace(/</g, "\\u003c")}</script>`);
    html = setMeta(html, "name", "description", p.desc);
    html = setMeta(html, "name", "robots", "index,follow");
    html = setMeta(html, "property", "og:title", p.title.split(" | ")[0]);
    html = setMeta(html, "property", "og:description", p.desc);
    html = setMeta(html, "property", "og:url", p.canonical);
    headers.set("cache-control", "public, max-age=0, must-revalidate");
    headers.set("netlify-cdn-cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return new Response(html, { status: 200, headers });
  } catch (e) {
    console.error("avto-page", e);
    return res;
  }
};

export const config: Config = { path: ["/avto/*"] };
