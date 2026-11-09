// /sitemap-perevizhnyky.xml — карта профілів перевізників-компаній (ФОП не індексуємо).
// Список кодів — з RPC carrier_sitemap; CDN кешує на добу.
import type { Config } from "https://edge.netlify.com";

const SB = "https://ecdfpqhbaqjqurzedunh.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjZGZwcWhiYXFqcXVyemVkdW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzU3NTIsImV4cCI6MjA5NDg1MTc1Mn0.t0ry-slbPVwVHmF1KLzWX6EDonWBMC2Uu3KUobH8oFY";

export default async () => {
  const r = await fetch(`${SB}/rest/v1/rpc/carrier_sitemap`, {
    method: "POST", body: "{}",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
  });
  if (!r.ok) return new Response("unavailable", { status: 503, headers: { "retry-after": "3600" } });
  const rows: [string, string][] = await r.json();
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    rows.map(([code, d]) => `<url><loc>https://forwardcarua.com/perevizhnyk/${code}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}</url>`).join("\n") +
    "\n</urlset>\n";
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "netlify-cdn-cache-control": "public, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
};

export const config: Config = { path: "/sitemap-perevizhnyky.xml" };
