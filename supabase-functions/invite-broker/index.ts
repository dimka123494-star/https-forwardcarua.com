// Supabase Edge Function: запрошення брокера або перевізника на платформу.
// Звичайне запрошення: профіль прихований (is_active = false), поки компанія не прийме лист.
// publish = true (компанію з реєстру підтверджено адміном по телефону): профіль одразу
// публікується, а компанія отримує лист для доступу до кабінету.
// kind = 'carrier' — перевізник із заявки «Це моя компанія» на /perevizhnyk/{ЄДРПОУ}: профіль привʼязується
// до коду (brokers.edrpou), і сторінка перевізника показує «Профіль підтверджено» та контакти.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://forwardcarua.com";

const CORS = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Тільки адміністратор
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { data: isAdmin } = await admin
      .from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    // 2. Дані профілю
    const p = await req.json();
    const email = String(p.email || "").trim().toLowerCase();
    const name  = String(p.name || "").trim();
    const publish = p.publish === true;
    const kind = p.kind === "carrier" ? "carrier" : "broker";
    const edrpou = /^\d{8,10}$/.test(String(p.edrpou || "")) ? String(p.edrpou) : null;
    if (!email.includes("@")) return json({ error: "bad_email" }, 400);
    if (name.length < 2)      return json({ error: "bad_name" }, 400);
    const now = new Date().toISOString();

    const closeClaims = async (brokerId: string) => {
      if (!edrpou) return;
      if (kind === "broker") {
        await admin.from("prospects").update({ status: "registered", broker_id: brokerId }).eq("edrpou", edrpou);
      }
      await admin.from("registry_claims").update({ status: "invited" })
        .eq("edrpou", edrpou).eq("kind", kind).in("status", ["new", "verified"]);
    };

    // 3. Чи немає вже такого профілю
    const { data: existing } = await admin
      .from("brokers").select("id, claimed_at, is_active, kind, edrpou").eq("email", email).maybeSingle();
    if (existing) {
      // Перевізник уже має кабінет — просто привʼязуємо його до коду ЄДРПОУ
      if (kind === "carrier" && existing.kind === "carrier" && publish) {
        await admin.from("brokers").update({ is_active: true, claimed_at: existing.claimed_at || now, edrpou: edrpou || existing.edrpou })
          .eq("id", existing.id);
        await closeClaims(existing.id);
        return json({ ok: true, broker_id: existing.id, email, published: true, existed: true, linked: true });
      }
      if (existing.kind !== kind) return json({ error: "other_kind", kind: existing.kind }, 409);
      // Запрошений раніше, але прихований профіль — при publish просто публікуємо
      if (publish && (!existing.claimed_at || !existing.is_active)) {
        await admin.from("brokers").update({ is_active: true, claimed_at: existing.claimed_at || now, edrpou: edrpou || existing.edrpou })
          .eq("id", existing.id);
        await closeClaims(existing.id);
        return json({ ok: true, broker_id: existing.id, email, published: true, existed: true });
      }
      return json({ error: "already_exists", claimed: !!existing.claimed_at }, 409);
    }

    // 4. Створюємо акаунт і надсилаємо лист-запрошення
    const { data: invited, error: inviteErr } = await admin.auth.admin
      .inviteUserByEmail(email, {
        redirectTo: `${SITE}/zaproshennya`,
        data: { full_name: name, user_role: kind },
      });

    if (inviteErr) {
      const msg = String(inviteErr.message || "");
      if (/already been registered|already exists/i.test(msg)) {
        return json({ error: "email_registered" }, 409);
      }
      console.error("invite:", inviteErr);
      return json({ error: "invite_failed", detail: msg }, 500);
    }

    // 5. Профіль
    const { data: broker, error: bErr } = await admin.from("brokers").insert({
      user_id:    invited.user.id,
      email,
      name,
      kind,
      edrpou,
      city:       p.city || null,
      region:     p.region || null,
      phone:      p.phone || null,
      telegram:   p.telegram || null,
      about:      p.about || null,
      experience: Number(p.experience) || 0,
      plan:       "free",
      is_active:  publish,           // з реєстру після перевірки — одразу в каталозі
      claimed_at: publish ? now : null,
      invited_by: user.id,
      invited_at: now,
    }).select().single();

    if (bErr) {
      await admin.auth.admin.deleteUser(invited.user.id).catch(() => {});
      console.error("insert broker:", bErr);
      return json({ error: "profile_failed", detail: bErr.message }, 500);
    }

    // 6. Послуги, якщо їх передали (лише брокери)
    const services: string[] = kind === "broker" && Array.isArray(p.services) ? p.services : [];
    if (services.length) {
      await admin.from("broker_services").insert(services.map((n) => ({
        broker_id: broker.id,
        name: n,
        price_from: p.price_from ? Number(p.price_from) : null,
        price_to:   p.price_to ? Number(p.price_to) : null,
      })));
    }

    // 7. Закриваємо заявки «Це моя компанія» / картку залучення за ЄДРПОУ
    await closeClaims(broker.id);

    return json({ ok: true, broker_id: broker.id, email, published: publish });
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
