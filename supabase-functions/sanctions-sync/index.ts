// Supabase Edge Function «sanctions-sync»: щоденне завантаження юросіб з Державного реєстру санкцій РНБО
// (офіційний API api-drs.nsdc.gov.ua, ключ — секрет NSDC_API_KEY, заголовок x-cota-public-api-key).
// Зберігає в sanctions_legal: id субʼєкта, назву, статус (active / expired / excluded) і всі коди-ідентифікатори.
// Викликається pg_cron щодня (sanctions_sync_call) або вручну адміністратором; без ключа нічого не робить. Деплой без verify_jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KEY = Deno.env.get("NSDC_API_KEY") ?? "";
const API = "https://api-drs.nsdc.gov.ua";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // pg_cron (заголовок x-cron-secret = секрет cron_secret з Vault) або адміністратор
  const cron = req.headers.get("x-cron-secret") ?? "";
  const { data: cronOk } = cron ? await sb.rpc("cron_secret_ok", { p: cron }) : { data: false };
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (!cronOk) {
    const { data: { user } } = await sb.auth.getUser(jwt);
    const { data: adm } = user ? await sb.from("admins").select("user_id").eq("user_id", user.id).maybeSingle() : { data: null };
    if (!adm) return json({ error: "forbidden" }, 403);
  }
  if (!KEY) {
    await sb.from("sanctions_runs").insert({ ok: false, note: "немає ключа NSDC_API_KEY" });
    return json({ error: "no_key" }, 503);
  }
  try {
    const r = await fetch(`${API}/v2/subjects?subjectType=legal`, { headers: { "x-cota-public-api-key": KEY, Accept: "application/json" } });
    if (!r.ok) {
      const note = `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`;
      await sb.from("sanctions_runs").insert({ ok: false, note });
      return json({ error: "api", note }, 502);
    }
    const body = await r.json();
    const list: any[] = Array.isArray(body) ? body : (body.data ?? body.items ?? body.subjects ?? []);
    const t0 = new Date().toISOString();
    const rows = list.map((it) => {
      const codes = new Set<string>();
      for (const idf of it.identifiers ?? []) {
        for (const v of String(idf.code ?? "").split(/[;,\s]+/)) {
          const d = v.replace(/\D/g, "");
          if (d.length >= 8 && d.length <= 10) codes.add(d);
        }
      }
      return {
        subject_id: String(it.sid ?? it.id ?? it.subjectId ?? it.name),
        codes: [...codes], name: it.name ?? null, status: it.status ?? null,
        data: { aliases: it.aliases ?? null, identifiers: it.identifiers ?? null, attributes: it.attributes ?? null,
                actions: it.actions ?? null, note: it.note ?? null },
        synced_at: t0,
      };
    }).filter((x) => x.subject_id);
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from("sanctions_legal").upsert(rows.slice(i, i + 500), { onConflict: "subject_id" });
      if (error) throw error;
    }
    const withCodes = rows.filter((x) => x.codes.length).length;
    await sb.from("sanctions_runs").insert({ ok: true, subjects: rows.length, with_codes: withCodes, note: list.length ? null : "порожня відповідь — перевірити формат: " + JSON.stringify(body).slice(0, 200) });
    return json({ ok: true, subjects: rows.length, with_codes: withCodes });
  } catch (e) {
    console.error(e);
    await sb.from("sanctions_runs").insert({ ok: false, note: String(e).slice(0, 300) });
    return json({ error: "server_error" }, 500);
  }
});
