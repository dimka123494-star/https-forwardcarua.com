// Карта сторінок авто: /sitemap-avto.xml (індекс) і /sitemap-avto-N.xml (до 40 000 номерів кожна).
// Список номерів — гілка vehicles (sm/NNN.txt: «номер\tYYYYMMDD»), будує tools/vehicles_import.py; CDN кешує на добу.
import type { Config } from "https://edge.netlify.com";

const RAW = "https://raw.githubusercontent.com/dimka123494-star/https-forwardcarua.com/vehicles/";
const XML = { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600",
  "netlify-cdn-cache-control": "public, s-maxage=86400, stale-while-revalidate=86400" };
const d = (s: string) => /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : "";

export default async (req: Request) => {
  const path = new URL(req.url).pathname;
  const n = (path.match(/^\/sitemap-avto-(\d+)\.xml$/) || [])[1];
  if (n === undefined) {
    const m = await fetch(RAW + "meta.json").then((r) => r.ok ? r.json() : null).catch(() => null);
    if (!m) return new Response("unavailable", { status: 503, headers: { "retry-after": "3600" } });
    const lastmod = String(m.generated || "").slice(0, 10);
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      Array.from({ length: m.sitemaps || 0 }, (_, i) => `<sitemap><loc>https://forwardcarua.com/sitemap-avto-${i}.xml</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</sitemap>`).join("\n") +
      "\n</sitemapindex>\n";
    return new Response(body, { headers: XML });
  }
  const r = await fetch(`${RAW}sm/${String(n).padStart(3, "0")}.txt`);
  if (r.status === 404) return new Response("not found", { status: 404 });
  if (!r.ok) return new Response("unavailable", { status: 503, headers: { "retry-after": "3600" } });
  const rows = (await r.text()).split("\n").filter(Boolean).map((l) => l.split("\t"));
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    rows.map(([p, t]) => `<url><loc>https://forwardcarua.com/avto/${encodeURIComponent(p)}</loc>${d(t) ? `<lastmod>${d(t)}</lastmod>` : ""}</url>`).join("\n") +
    "\n</urlset>\n";
  return new Response(body, { headers: XML });
};

export const config: Config = { path: ["/sitemap-avto.xml", "/sitemap-avto-*"] };
