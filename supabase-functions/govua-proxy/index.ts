// Supabase Edge Function «govua-proxy»: проксі до data.gov.ua для GitHub Actions (портал віддає 403 адресам GitHub).
// GET ?url=https://data.gov.ua/... з заголовком x-cron-secret (vault cron_secret, перевірка через cron_secret_ok).
// Лише домени data.gov.ua / *.data.gov.ua; відповідь стрімиться як є (великі файли — частинами через Range).
// Деплой без verify_jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
Deno.serve(async (req) => {
  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: ok } = secret ? await sb.rpc("cron_secret_ok", { p: secret }) : { data: false };
  if (!ok) return new Response("forbidden", { status: 403 });
  const target = new URL(req.url).searchParams.get("url") ?? "";
  let u: URL;
  try { u = new URL(target); } catch { return new Response("bad url", { status: 400 }); }
  if (u.protocol !== "https:" || !(u.hostname === "data.gov.ua" || u.hostname.endsWith(".data.gov.ua"))) return new Response("host not allowed", { status: 400 });
  const h: Record<string, string> = { "User-Agent": UA };
  const range = req.headers.get("range"); if (range) h["Range"] = range;
  let r = await fetch(u, { headers: h, redirect: "manual" });
  // редиректи — лише в межах data.gov.ua (файли ресурсів віддаються з піддоменів)
  for (let i = 0; i < 5 && r.status >= 300 && r.status < 400 && r.headers.get("location"); i++) {
    const nu = new URL(r.headers.get("location")!, u);
    if (!(nu.hostname === "data.gov.ua" || nu.hostname.endsWith(".data.gov.ua"))) return new Response(JSON.stringify({ redirect: nu.href }), { status: 409 });
    u = nu; r = await fetch(u, { headers: h, redirect: "manual" });
  }
  const out = new Headers();
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"]) { const v = r.headers.get(k); if (v) out.set(k, v); }
  out.set("x-final-url", u.href);
  return new Response(r.body, { status: r.status, headers: out });
});
