// Підставляє назву брокера, опис і логотип у <title> та Open Graph для /v/{id} і /broker/{id},
// щоб превʼю в Telegram/Viber/Facebook і сніпет у Google показували конкретного брокера.
import type { Config, Context } from "https://edge.netlify.com";

const SB = "https://ecdfpqhbaqjqurzedunh.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjZGZwcWhiYXFqcXVyemVkdW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzU3NTIsImV4cCI6MjA5NDg1MTc1Mn0.t0ry-slbPVwVHmF1KLzWX6EDonWBMC2Uu3KUobH8oFY";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function setMeta(html: string, attr: "name" | "property", key: string, val: string) {
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*">`);
  const tag = `<meta ${attr}="${key}" content="${esc(val)}">`;
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", tag + "\n</head>");
}

export default async (req: Request, ctx: Context) => {
  const res = await ctx.next();
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const kind = parts[0], id = parts[1] || "";
    if (!UUID.test(id) || !(res.headers.get("content-type") || "").includes("text/html")) return res;

    const r = await fetch(`${SB}/rest/v1/brokers?id=eq.${id}&is_active=eq.true&select=name,city,region,about,card_tagline,logo_url,plan,plan_expires_at`,
      { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    const b = (await r.json())?.[0];
    if (!b) return res;

    const paid = b.plan && b.plan !== "free" && (!b.plan_expires_at || new Date(b.plan_expires_at) > new Date());
    const where = b.city ? `, ${b.city}` : "";
    const title = kind === "v" ? `${b.name} — візитівка митного брокера` : `${b.name} — митний брокер${where} | МитнийБрокер`;
    const desc = (kind === "v" && b.card_tagline ? b.card_tagline + ". " : "") +
      (b.about ? String(b.about).slice(0, 150) : `Митний брокер ${b.name}${b.city ? " у місті " + b.city : ""}. Послуги, ціни, контакти та відгуки клієнтів.`);
    const canonical = `https://forwardcarua.com/${kind === "v" ? "v" : "broker"}/${id}`;

    let html = await res.text();
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    html = setMeta(html, "name", "description", desc);
    html = setMeta(html, "property", "og:title", title);
    html = setMeta(html, "property", "og:description", desc);
    html = setMeta(html, "property", "og:url", canonical);
    if (paid && b.logo_url) {
      html = setMeta(html, "property", "og:image", b.logo_url);
      html = html.replace(/<meta property="og:image:(width|height)" content="[^"]*">\n?/g, "");
      html = setMeta(html, "name", "twitter:card", "summary");
    }
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(html, { status: res.status, headers });
  } catch (_e) {
    return res;
  }
};

export const config: Config = { path: ["/v/*", "/broker/*"] };
