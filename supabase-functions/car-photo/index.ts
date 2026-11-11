// Supabase Edge Function «car-photo»: фото авто від користувачів для сторінок /avto/{номер}.
//  POST multipart {plate, file (JPEG, уже зменшений і без EXIF у браузері), email?, consent=1, w?, h?}
//      → файл у приватний бакет car-photos-inbox, запис vehicle_photos зі статусом pending
//  POST JSON {action:"moderate", id, approve} + JWT адміністратора
//      → схвалене копіюємо в публічний бакет car-photos, відхилене прибираємо з вхідних
// Деплой без verify_jwt: завантажувати можна без кабінету; модерацію функція перевіряє сама.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const LAT = "ABCEHIKMOPTXY", CYR = "АВСЕНІКМОРТХУ";
const toCyr = (s: string) => [...s].map((c) => { const i = LAT.indexOf(c); return i < 0 ? c : CYR[i]; }).join("");
const MAX = 6 * 1024 * 1024;

async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const ct = req.headers.get("content-type") || "";

    // ---- модерація ----
    if (ct.includes("application/json")) {
      const p = await req.json().catch(() => ({}));
      if (p.action !== "moderate") return json({ error: "bad_request" }, 400);
      const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
      const { data: { user } } = await db.auth.getUser(jwt);
      const { data: adm } = user ? await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle() : { data: null };
      if (!adm) return json({ error: "forbidden" }, 403);
      const { data: ph } = await db.from("vehicle_photos").select("*").eq("id", p.id).maybeSingle();
      if (!ph) return json({ error: "not_found" }, 404);
      if (p.approve) {
        const { data: file, error: e1 } = await db.storage.from("car-photos-inbox").download(ph.path);
        if (e1 || !file) return json({ error: "file_missing" }, 410);
        const { error: e2 } = await db.storage.from("car-photos").upload(ph.path, file, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
        if (e2) { console.error(e2); return json({ error: "storage" }, 500); }
      }
      await db.storage.from("car-photos-inbox").remove([ph.path]);
      await db.from("vehicle_photos").update({ status: p.approve ? "approved" : "rejected", moderated_at: new Date().toISOString(), moderated_by: user!.id }).eq("id", ph.id);
      if (!p.approve) await db.storage.from("car-photos").remove([ph.path]);   // якщо раніше було схвалене
      return json({ ok: true, status: p.approve ? "approved" : "rejected" });
    }

    // ---- завантаження ----
    const form = await req.formData();
    const plate = toCyr(String(form.get("plate") ?? "").toUpperCase().replace(/[\s\-.]/g, ""));
    if (!/^[0-9А-ЯІЇЄ]{4,10}$/.test(plate) || !/\d/.test(plate)) return json({ error: "bad_plate" }, 400);
    if (form.get("consent") !== "1") return json({ error: "consent" }, 400);
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "no_file" }, 400);
    if (file.size > MAX) return json({ error: "too_big" }, 413);
    const buf = new Uint8Array(await file.arrayBuffer());
    if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return json({ error: "not_jpeg" }, 415);
    const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const ipHash = await sha(ip + "|" + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(-16));
    const { count } = await db.from("vehicle_photos").select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash).gt("created_at", new Date(Date.now() - 3600e3).toISOString());
    if ((count ?? 0) >= 10) return json({ error: "too_many" }, 429);
    const { count: pend } = await db.from("vehicle_photos").select("id", { count: "exact", head: true }).eq("plate", plate).eq("status", "pending");
    if ((pend ?? 0) >= 20) return json({ error: "too_many" }, 429);

    let userId: string | null = null;
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    if (jwt && jwt.split(".").length === 3) { try { const { data: { user } } = await db.auth.getUser(jwt); userId = user?.id ?? null; } catch (_) { /* гість */ } }

    const id = crypto.randomUUID();
    const path = `${plate}/${id}.jpg`;
    const { error: up } = await db.storage.from("car-photos-inbox").upload(path, buf, { contentType: "image/jpeg" });
    if (up) { console.error(up); return json({ error: "storage" }, 500); }
    const w = Number(form.get("w")) || null, h = Number(form.get("h")) || null;
    const { error } = await db.from("vehicle_photos").insert({ id, plate, path, user_id: userId, author_email: email || null, ip_hash: ipHash, width: w, height: h });
    if (error) { console.error(error); return json({ error: "server_error" }, 500); }
    return json({ ok: true, id });
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
