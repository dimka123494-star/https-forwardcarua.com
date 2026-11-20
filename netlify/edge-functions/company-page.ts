// Безкоштовна картка компанії за ЄДРПОУ:
//   /c/{ЄДРПОУ}            — серверний рендер (шаблон c.html, розмітка company-render.mjs): Google і превʼю в месенджерах
//   /api/company/{ЄДРПОУ}  — JSON { found, code, edr, at } для браузера й застосунку НомерОК
// Дані — шард відкритого ЄДР з GitHub-релізу edr-data (tools/edr_shards.py, щотижня), без Supabase.
import type { Config, Context } from "https://edge.netlify.com";
import { renderCompany, renderNotFound, expandEdr, edrShardUrl, EDR_RELEASE, esc } from "../../assets/js/company-render.mjs";

// невеликий кеш шардів у межах ізолята (шард ≈1,6 МБ JSON)
const cache = new Map<string, { at: number; data: Record<string, any> }>();
const TTL = 6 * 3600e3, MAX = 8;
let meta: { at: number; generated: string | null } = { at: 0, generated: null };

async function shard(code: string): Promise<Record<string, any> | null> {
  const url = edrShardUrl(code);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const r = await fetch(url);
  if (!r.ok || !r.body) return null;
  const text = await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text();
  const data = JSON.parse(text);
  if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
  cache.set(url, { at: Date.now(), data });
  return data;
}
async function generated(): Promise<string | null> {
  if (Date.now() - meta.at < TTL) return meta.generated;
  try {
    const r = await fetch(EDR_RELEASE + "edr-meta.json");
    meta = { at: Date.now(), generated: r.ok ? (await r.json()).generated ?? null : null };
  } catch { meta = { at: Date.now(), generated: null }; }
  return meta.generated;
}
async function lookup(code: string) {
  const [sh, at] = await Promise.all([shard(code), generated()]);
  if (!sh) return null;                     // джерело недоступне
  const edr = expandEdr(sh[code]);
  return { found: !!edr, code, edr, at };
}

function setMeta(html: string, attr: "name" | "property", key: string, val: string) {
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*">`);
  const tag = `<meta ${attr}="${key}" content="${esc(val)}">`;
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", tag + "\n</head>");
}
const CDN = { "cache-control": "public, max-age=0, must-revalidate", "netlify-cdn-cache-control": "public, s-maxage=21600, stale-while-revalidate=86400" };

export default async (req: Request, ctx: Context) => {
  const path = new URL(req.url).pathname;
  const api = path.match(/^\/api\/company\/(\d{8})\/?$/);
  if (api) {
    const d = await lookup(api[1]).catch(() => null);
    return new Response(JSON.stringify(d ?? { error: "unavailable" }), {
      status: d ? 200 : 503, headers: { "content-type": "application/json; charset=utf-8", ...(d ? CDN : {}) } });
  }
  if (path.startsWith("/api/company/")) return new Response('{"error":"bad_code"}', { status: 400, headers: { "content-type": "application/json" } });

  const res = await ctx.next();
  try {
    if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
    const code = (path.match(/^\/c\/(\d{8})\/?$/) || [])[1];
    let html = await res.text();
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    if (!code) {   // /c/ — сторінка пошуку (індексуємо); /c/щось-не-те — 404
      if (path === "/c" || path === "/c/") return new Response(html, { status: 200, headers });
      return new Response(setMeta(html, "name", "robots", "noindex,follow"), { status: 404, headers });
    }
    const d = await lookup(code).catch(() => null);
    if (!d) return new Response(html, { status: 200, headers });   // джерело недоступне — дорендерить браузер
    if (!d.found) {
      html = html.replace(/<main id="cMain">[\s\S]*?<!--\/C--><\/main>/, () => `<main id="cMain" data-ssr="1">${renderNotFound(code)}</main>`);
      return new Response(setMeta(html, "name", "robots", "noindex,follow"), { status: 404, headers });
    }
    const p = renderCompany(d);
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`)
      .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${p.canonical}">`)
      .replace(/<main id="cMain">[\s\S]*?<!--\/C--><\/main>/, () => `<main id="cMain" data-ssr="1">${p.html}</main>`)
      .replace(/<script type="application\/ld\+json" id="cLd">[\s\S]*?<\/script>/,
        () => `<script type="application/ld+json" id="cLd">${JSON.stringify(p.ld).replace(/</g, "\\u003c")}</script>`);
    html = setMeta(html, "name", "description", p.desc);
    html = setMeta(html, "name", "robots", p.index ? "index,follow" : "noindex,follow");
    html = setMeta(html, "property", "og:title", p.title.split(" | ")[0]);
    html = setMeta(html, "property", "og:description", p.desc);
    html = setMeta(html, "property", "og:url", p.canonical);
    for (const [k, v] of Object.entries(CDN)) headers.set(k, v);
    return new Response(html, { status: 200, headers });
  } catch (e) {
    console.error("company-page", e);
    return res;
  }
};

export const config: Config = { path: ["/c/*", "/c", "/api/company/*"] };
