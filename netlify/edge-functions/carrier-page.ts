// Серверний рендер профілю перевізника /perevizhnyk/{ЄДРПОУ}: Google і превʼю в месенджерах
// одразу бачать назву, статус ліцензії й JSON-LD. Шаблон — perevizhnyk.html, розмітка — carrier-render.mjs.
import type { Config, Context } from "https://edge.netlify.com";
import { renderCarrier, esc } from "../../assets/js/carrier-render.mjs";

const SB = "https://ecdfpqhbaqjqurzedunh.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjZGZwcWhiYXFqcXVyemVkdW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzU3NTIsImV4cCI6MjA5NDg1MTc1Mn0.t0ry-slbPVwVHmF1KLzWX6EDonWBMC2Uu3KUobH8oFY";

function setMeta(html: string, attr: "name" | "property", key: string, val: string) {
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*">`);
  const tag = `<meta ${attr}="${key}" content="${esc(val)}">`;
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", tag + "\n</head>");
}

export default async (req: Request, ctx: Context) => {
  const res = await ctx.next();
  try {
    const code = (new URL(req.url).pathname.match(/^\/perevizhnyk\/(\d{8,10})\/?$/) || [])[1];
    if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
    let html = await res.text();
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    if (!code) {
      html = setMeta(html, "name", "robots", "noindex,follow");
      return new Response(html, { status: 404, headers });
    }
    const r = await fetch(`${SB}/rest/v1/rpc/carrier_public`, {
      method: "POST", body: JSON.stringify({ code }),
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    });
    const d = r.ok ? await r.json() : null;
    if (!d) return new Response(html, { status: 200, headers }); // база недоступна — дорендерить браузер
    if (!d.found) {
      html = setMeta(html, "name", "robots", "noindex,follow");
      return new Response(html, { status: 404, headers });
    }
    const p = renderCarrier(d);
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`)
      .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${p.canonical}">`)
      .replace(/<main id="cpMain">[\s\S]*?<!--\/CP--><\/main>/, () => `<main id="cpMain" data-ssr="1">${p.html}</main>`)
      .replace(/<!--CPFAQ-->[\s\S]*?<!--\/CPFAQ-->/, "")
      .replace(/<script type="application\/ld\+json" id="cpLd">[\s\S]*?<\/script>/,
        () => `<script type="application/ld+json" id="cpLd">${JSON.stringify(p.ld).replace(/</g, "\\u003c")}</script>`);
    html = setMeta(html, "name", "description", p.desc);
    html = setMeta(html, "name", "robots", p.index ? "index,follow" : "noindex,follow");
    html = setMeta(html, "property", "og:title", p.title.split(" | ")[0]);
    html = setMeta(html, "property", "og:description", p.desc);
    html = setMeta(html, "property", "og:url", p.canonical);
    html = setMeta(html, "property", "og:type", "profile");
    headers.set("cache-control", "public, max-age=0, must-revalidate");
    headers.set("netlify-cdn-cache-control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return new Response(html, { status: 200, headers });
  } catch (e) {
    console.error("carrier-page", e);
    return res;
  }
};

export const config: Config = { path: ["/perevizhnyk/*"] };
