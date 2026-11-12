// Supabase Edge Function «vehicle-check»: перевірка авто за номерним знаком або VIN
// з відкритих даних МВС (гілка vehicles репозиторію: p/NNNN.json.gz — події за номером, v/NNN.json.gz — VIN→номери,
// wanted.json.gz — реєстр розшуку). Персональних даних власників у джерелі немає — лише фізична / юридична особа.
//  POST {action:"summary", q}            → безкоштовний короткий звіт (без авторизації)
//  POST {action:"suggest", q}            → схожі номери з реєстру («Можливо, ви мали на увазі»)
//  POST {action:"full", q} + JWT         → повний звіт, списання з балансу кабінету (vehicle_check_charge)
//  POST {action:"checkout", q, email}    → замовлення (vehicle_orders) + поля форми WayForPay
//  POST від WayForPay (serviceUrl)       → позначає замовлення оплаченим
//  GET  ?return=<token>                  → 303 на https://forwardcarua.com/zvit-avto?t=<token>
//  POST {action:"report", token}         → повний звіт за оплаченим замовленням (збирається один раз)
// Деплой без verify_jwt: функція сама перевіряє JWT там, де він потрібен.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const RAW = "https://raw.githubusercontent.com/dimka123494-star/https-forwardcarua.com/vehicles/";
const PSH = 4096, VSH = 1024;
const pick = (...names: string[]) => names.map((n) => Deno.env.get(n)).find((v) => v && v.trim())?.trim() ?? "";
const MERCHANT = pick("WFP_MERCHANT", "WAYFORPAY_MERCHANT", "WAYFORPAY_MERCHANT_ACCOUNT", "WAYFORPAY_LOGIN", "WFP_MERCHANT_ACCOUNT", "MERCHANT_ACCOUNT");
const SECRET = pick("WFP_SECRET", "WAYFORPAY_SECRET", "WAYFORPAY_SECRET_KEY", "WAYFORPAY_MERCHANT_SECRET", "WFP_SECRET_KEY", "MERCHANT_SECRET_KEY");
const hmac = (s: string) => createHmac("md5", SECRET).update(s, "utf8").digest("hex");
const DOMAIN = "forwardcarua.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const REGIONS: Record<string, string> = {
  "01": "АР Крим", "05": "Вінницька обл.", "07": "Волинська обл.", "12": "Дніпропетровська обл.", "14": "Донецька обл.",
  "18": "Житомирська обл.", "21": "Закарпатська обл.", "23": "Запорізька обл.", "26": "Івано-Франківська обл.",
  "32": "Київська обл.", "35": "Кіровоградська обл.", "44": "Луганська обл.", "46": "Львівська обл.", "48": "Миколаївська обл.",
  "51": "Одеська обл.", "53": "Полтавська обл.", "56": "Рівненська обл.", "59": "Сумська обл.", "61": "Тернопільська обл.",
  "63": "Харківська обл.", "65": "Херсонська обл.", "68": "Хмельницька обл.", "71": "Черкаська обл.", "73": "Чернівецька обл.",
  "74": "Чернігівська обл.", "80": "м. Київ", "85": "м. Севастополь",
};

// ---- нормалізація запиту ----
const LAT = "ABCEHIKMOPTXY", CYR = "АВСЕНІКМОРТХУ";
const tr = (s: string, a: string, b: string) => [...s].map((c) => { const i = a.indexOf(c); return i < 0 ? c : b[i]; }).join("");
function parseQ(raw: string): { q: string; vin: boolean } | null {
  const s = String(raw ?? "").toUpperCase().replace(/[\s\-"'.]/g, "");
  if (!s) return null;
  const asVin = tr(s, CYR, LAT);
  if (/^[A-HJ-NPR-Z0-9]{17}$/.test(asVin) && /\d/.test(asVin) && /[A-Z]/.test(asVin)) return { q: asVin, vin: true };
  let p = tr(s, LAT, CYR);
  // формат АА1234ВВ: у цифровому блоці літеру О часто вводять замість нуля
  if (p.length === 8 && /^[А-ЯІЇЄ]{2}.{4}[А-ЯІЇЄ]{2}$/.test(p)) p = p.slice(0, 2) + p.slice(2, 6).replace(/О/g, "0") + p.slice(6);
  if (/^[0-9А-ЯІЇЄ]{4,10}$/.test(p) && /\d/.test(p)) return { q: p, vin: false };
  return null;
}
// «Можливо, ви мали на увазі»: номер АА1234ВВ з однією нестандартною або сплутаною літерою —
// пробуємо всі 12 літер, дозволених на українських номерах, і повертаємо ті, що є в реєстрі
const PLATE_LETTERS = "АВЕІКМНОРСТХ";
async function suggest(raw: string) {
  let s = tr(String(raw ?? "").toUpperCase().replace(/[\s\-"'.]/g, ""), LAT, CYR);
  if (s.length !== 8) return [];
  s = s.slice(0, 2) + s.slice(2, 6).replace(/[ОO]/g, "0").replace(/[ІI]/g, "1").replace(/[ЗZ]/g, "3").replace(/[SЅ]/g, "5").replace(/В/g, "8") + s.slice(6);
  if (!/^\d{4}$/.test(s.slice(2, 6))) return [];
  const pos = [0, 1, 6, 7].filter((i) => !PLATE_LETTERS.includes(s[i]));
  const cands: string[] = [];
  if (pos.length === 0) for (const L of PLATE_LETTERS) { if (L !== s[7]) cands.push(s.slice(0, 7) + L); }   // номер є, але не знайдено — пробуємо останню літеру
  else if (pos.length === 1) for (const L of PLATE_LETTERS) cands.push(s.slice(0, pos[0]) + L + s.slice(pos[0] + 1));
  else return [];
  const out: any[] = [];
  for (const c of cands) {
    // без кешу: до 12 різних шардів за запит, тримаємо в памʼяті лише один
    const evs = ((await gz(`p/${String(crc32(c) % PSH).padStart(4, "0")}.json.gz`))[c] ?? []).map(fixEv);
    if (!evs.length) continue;
    const g = groups(evs)[0];
    const v = vehicleInfo(g.evs);
    out.push({ q: c, brand: v.brand, model: v.model, year: v.year, last: d8(g.evs.at(-1)![0]) });
    if (out.length >= 6) break;
  }
  return out.sort((a, b) => String(b.last).localeCompare(String(a.last)));
}

// ---- джерела ----
// CRC32 як у Python zlib.crc32
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(s: string) { let c = 0xffffffff; for (const b of new TextEncoder().encode(s)) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function gz(path: string, optional = false): Promise<any> {
  const r = await fetch(RAW + path);
  if (optional && r.status === 404) return null;
  if (!r.ok) throw new Error(`source ${path} ${r.status}`);
  return await new Response(r.body!.pipeThrough(new DecompressionStream("gzip"))).json();
}
const shardCache = new Map<string, any>();
async function pshard(key: string) {
  const p = `p/${String(crc32(key) % PSH).padStart(4, "0")}.json.gz`;
  if (!shardCache.has(p)) { if (shardCache.size > 8) shardCache.clear(); shardCache.set(p, await gz(p)); }
  return (shardCache.get(p)[key] ?? []).map(fixEv);
}
// у файлі 2026 р. код операції злитий з назвою («315 - …»), а КОАТУУ немає: код — перші цифри,
// область — з номера ТСЦ (перші дві цифри — код області, як у КОАТУУ: ТСЦ 0744 → 07, Волинська)
function fixEv(e: any[]) {
  const x = e.slice();
  const c = String(x[1] ?? "").match(/^\s*(\d+)/);
  if (c) x[1] = c[1];
  const t = String(x[4] ?? "").match(/^ТСЦ (\d{2})\d{2}$/);
  if (!x[3] && t) x[3] = t[1];
  return x;
}
async function vplates(vin: string): Promise<string[]> {
  const d = await gz(`v/${String(crc32(vin) % VSH).padStart(3, "0")}.json.gz`);
  return d[vin] ?? [];
}
let META: any = null, META_AT = 0;
async function meta() {
  if (!META || Date.now() - META_AT > 3600e3) { META = await (await fetch(RAW + "meta.json")).json(); META_AT = Date.now(); }
  return META;
}
// реєстр розшуку — шарди w/NNN.json.gz за crc32(номер|VIN) % 256; null — джерело недоступне
async function wantedFor(keys: string[]): Promise<any[] | null> {
  try {
    const out: any[] = [];
    for (const k of [...new Set(keys.filter(Boolean))]) {
      const d = await gz(`w/${String(crc32(k) % 256).padStart(3, "0")}.json.gz`);
      out.push(...(d[k] ?? []));
    }
    return out;
  } catch (_) { return null; }
}

// подія: [дата, код, P|J, регіон, ТСЦ, марка, модель, рік, колір, тип, кузов, призначення, пальне, обʼєм, маса, повна, VIN]
type Ev = any[];
const brandKey = (e: Ev) => String(e[5] || "").split(" ")[0].toUpperCase() + "|" + (e[7] ?? "");
// класифікація за кодами операцій ГСЦ МВС (довідник — meta.ops)
const codeSet = (s: string) => new Set(s.split(/\s+/));
const OWNER = codeSet("40 41 48 49 50 51 54 60 61 62 65 67 80 186 218 300 306 307 308 309 310 311 312 313 314 315 316 317 319 320 321 322 323 324 330 331 332");
const IMPORT = codeSet("70 71 72 74 75 76 77 105 172 180 182 221");
const NEWCAR = codeSet("72 74 75 99 100 105 180 184 185");
// операції, з яких починається історія авто в Україні (первинна реєстрація, ввезення, новий з салону)
const FIRST = codeSet("10 11 17 20 30 70 71 72 74 75 76 77 99 100 102 105 150 172 180 182 184 185 221 1000");
const isDereg = (c: string) => /^5\d\d$/.test(c) && c !== "501" && c !== "502" || /^300\d$/.test(c);

function groups(evs: Ev[]) {
  // авто на одному номері в різні роки можуть бути різні: групуємо за VIN, а записи без VIN — за маркою й роком
  const byVin = new Map<string, Ev[]>(), loose = new Map<string, Ev[]>();
  for (const e of evs) {
    if (e[16]) (byVin.get(e[16]) ?? byVin.set(e[16], []).get(e[16])!).push(e);
    else { const k = brandKey(e); (loose.get(k) ?? loose.set(k, []).get(k)!).push(e); }
  }
  const out: { vin: string; evs: Ev[] }[] = [...byVin].map(([vin, e]) => ({ vin, evs: e }));
  for (const [k, e] of loose) {
    const g = out.find((x) => x.vin && brandKey(x.evs[0]) === k);
    if (g) g.evs.push(...e); else out.push({ vin: "", evs: e });
  }
  for (const g of out) g.evs.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return out.sort((a, b) => String(b.evs.at(-1)![0]).localeCompare(String(a.evs.at(-1)![0])));
}

async function collect(pq: { q: string; vin: boolean }) {
  let main: { vin: string; evs: Ev[] } | null = null, other: { vin: string; evs: Ev[] }[] = [];
  if (pq.vin) {
    const evs: Ev[] = [...await pshard("#" + pq.q)];
    const plates = (await vplates(pq.q)).slice(0, 8);
    const per = await Promise.all(plates.map((p) => pshard(p)));
    const own = per.flat().filter((e) => e[16] === pq.q);
    const bk = own[0] ? brandKey(own[0]) : null;
    evs.push(...own, ...per.flat().filter((e) => !e[16] && bk && brandKey(e) === bk));
    if (evs.length) main = { vin: pq.q, evs: dedupe(evs) };
  } else {
    const gs = groups(await pshard(pq.q));
    if (gs.length) { main = gs[0]; other = gs.slice(1); }
    // той самий VIN під іншими номерами (заміна номера, перереєстрація)
    if (main?.vin) {
      const plates = (await vplates(main.vin)).filter((p) => p !== pq.q).slice(0, 8);
      const per = await Promise.all(plates.map((p) => pshard(p)));
      const bk = brandKey(main.evs[0]);
      main.evs = dedupe([...main.evs, ...await pshard("#" + main.vin), ...per.flat().filter((e) => e[16] === main!.vin || (!e[16] && brandKey(e) === bk))]);
    }
  }
  if (main) main.evs.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return { main, other };
}
const dedupe = (evs: Ev[]) => { const s = new Set<string>(); return evs.filter((e) => { const k = JSON.stringify(e); if (s.has(k)) return false; s.add(k); return true; }); };

const d8 = (s: string) => /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : null;
function vehicleInfo(evs: Ev[]) {
  const last = evs.at(-1)!;
  const pickLast = (i: number) => [...evs].reverse().find((e) => e[i] != null && e[i] !== "")?.[i] ?? null;
  return { brand: pickLast(5), model: pickLast(6), year: pickLast(7), color: pickLast(8), kind: pickLast(9), body: pickLast(10), purpose: pickLast(11),
    fuel: pickLast(12), capacity: pickLast(13), own_weight: pickLast(14), total_weight: pickLast(15), last_date: d8(last[0]) };
}

async function buildReport(pq: { q: string; vin: boolean }, full: boolean) {
  const [m, { main, other }] = await Promise.all([meta(), collect(pq)]);
  const ops = m?.ops ?? {};
  const base = { q: pq.q, by: pq.vin ? "vin" : "plate", checked_at: new Date().toISOString(), data_at: m?.generated ?? null,
    data_until: (m?.sources ?? []).map((s: any) => s.year).sort().at(-1) ?? null };
  if (!main) {
    // немає в реєстраційних даних, але є в розшуку (напр. викрадене на окупованій території) — показуємо безкоштовно
    const hits = await wantedFor([pq.q]) ?? [];
    return { ...base, found: false, wanted: hits.length ? { found: true, items: hits.slice(0, 5) } : null };
  }
  const evs = main.evs;
  const opName = (e: Ev) => ops[e[1]] ?? String(e[1] ?? "");
  const owners = evs.filter((e) => OWNER.has(String(e[1]))).length;
  const imported = evs.find((e) => IMPORT.has(String(e[1])));
  const isNew = evs.find((e) => NEWCAR.has(String(e[1])));
  const last = evs.at(-1)!;
  const hits = await wantedFor([pq.q, main.vin]);   // факт розшуку показуємо всім, подробиці — у повному звіті
  const summary = {
    ...base, found: true, vehicle: vehicleInfo(evs),
    vin_masked: main.vin ? main.vin.slice(0, 6) + "•••••" + main.vin.slice(-4) : null,
    first_date: d8(evs[0][0]), events: evs.length, owner_changes: owners,
    imported: imported ? d8(imported[0]) : null, new_in_ua: isNew ? d8(isNew[0]) : null,
    last: { date: d8(last[0]), op: opName(last), region: REGIONS[last[3]] ?? null, owner: last[2] === "J" ? "юридична особа" : last[2] === "P" ? "фізична особа" : null },
    deregistered: isDereg(String(last[1])),
    other_vehicles: other.length,
    // історія починається з перереєстрації — перша реєстрація була раніше під іншим номером, у записах без VIN (до 2021 р.)
    history_partial: !FIRST.has(String(evs[0][1])),
    wanted_flag: hits === null ? null : hits.length > 0,
  };
  if (!full) return summary;
  const allPlates = main.vin ? await vplates(main.vin).catch(() => []) : [];
  return {
    ...summary, full: true, vin: main.vin || null, plates: allPlates.length ? allPlates : (pq.vin ? [] : [pq.q]),
    wanted: hits === null ? null : { found: hits.length > 0, items: hits.slice(0, 5) },
    history: evs.map((e) => ({ date: d8(e[0]), op: opName(e), code: e[1], owner: e[2] === "J" ? "юридична особа" : e[2] === "P" ? "фізична особа" : null,
      region: REGIONS[e[3]] ?? null, tsc: /^ТСЦ/.test(String(e[4] ?? "")) ? e[4] : null, color: e[8] || null, fuel: e[12] || null, capacity: e[13] ?? null, vin: e[16] || null })),
    previous_on_plate: other.map((g) => ({ vehicle: vehicleInfo(g.evs), from: d8(g.evs[0][0]), to: d8(g.evs.at(-1)![0]), events: g.evs.length })),
  };
}

async function readBody(req: Request) {
  const text = await req.text();
  try { return JSON.parse(text); } catch (_) { /* далі */ }
  try { return JSON.parse(decodeURIComponent(text.replace(/\+/g, " "))); } catch (_) { /* далі */ }
  const form = new URLSearchParams(text);
  for (const [k, v] of form) { try { return JSON.parse(v ? k + "=" + v : k); } catch (_) { try { return JSON.parse(k); } catch (_) {} } }
  return {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  const ret = u.searchParams.get("return");
  if (ret) return new Response(null, { status: 303, headers: { Location: `https://forwardcarua.com/zvit-avto?t=${encodeURIComponent(ret)}` } });
  if (req.method !== "POST") return new Response("ok");
  const db = sb();
  const p: Record<string, any> = await readBody(req);

  // ---- підтвердження оплати від WayForPay ----
  if (p.merchantSignature && p.orderReference) {
    const base = [p.merchantAccount, p.orderReference, p.amount, p.currency, p.authCode, p.cardPan, p.transactionStatus, p.reasonCode].join(";");
    if (!SECRET || hmac(base) !== p.merchantSignature) { console.error("bad signature", p.orderReference); return new Response("bad signature", { status: 400 }); }
    const { data: o } = await db.from("vehicle_orders").select("*").eq("order_reference", p.orderReference).maybeSingle();
    if (o && o.status !== "paid") {
      const ok = p.transactionStatus === "Approved" && Number(p.amount) >= Number(o.amount);
      await db.from("vehicle_orders").update(ok ? { status: "paid", paid_at: new Date().toISOString(), raw: p } : { status: String(p.transactionStatus || "declined").toLowerCase(), raw: p }).eq("id", o.id);
    }
    const time = Math.floor(Date.now() / 1000);
    return new Response(JSON.stringify({ orderReference: p.orderReference, status: "accept", time, signature: hmac([p.orderReference, "accept", time].join(";")) }),
      { headers: { "Content-Type": "application/json" } });
  }

  try {
    if (p.action === "suggest") return json({ items: await suggest(p.q) });

    if (p.action === "summary") {
      const pq = parseQ(p.q);
      if (!pq) return json({ error: "bad_query" }, 400);
      return json(await buildReport(pq, false));
    }

    if (p.action === "full") {
      const pq = parseQ(p.q);
      if (!pq) return json({ error: "bad_query" }, 400);
      const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
      const { data: { user } } = await db.auth.getUser(jwt);
      if (!user) return json({ error: "unauthorized" }, 401);
      const rep = await buildReport(pq, true);
      if (!rep.found) return json(rep);           // не знайдено — не списуємо
      const { data: ch, error } = await db.rpc("vehicle_check_charge", { p_user: user.id, p_q: pq.q, p_report: rep });
      if (error) {
        const m = String(error.message || "");
        const k = ["no_cabinet", "balance", "unavailable", "bad_query"].find((x) => m.includes(x));
        if (!k) console.error("charge:", error);
        return json({ error: k || "server_error" }, k === "balance" ? 402 : k ? 400 : 500);
      }
      return json({ ...rep, ...ch });
    }

    if (p.action === "checkout") {
      if (!MERCHANT || !SECRET) return json({ error: "not_configured" }, 503);
      const pq = parseQ(p.q);
      const email = String(p.email ?? "").trim().toLowerCase();
      if (!pq) return json({ error: "bad_query" }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad_email" }, 400);
      if (!(await buildReport(pq, false)).found) return json({ error: "not_found" }, 404);   // не беремо гроші за порожній звіт
      const { data: sp } = await db.from("service_prices").select("price, active").eq("code", "vehicle_check").maybeSingle();
      if (!sp?.active) return json({ error: "unavailable" }, 503);
      const amount = Number(sp.price);
      const { count } = await db.from("vehicle_orders").select("id", { count: "exact", head: true }).eq("email", email).gt("created_at", new Date(Date.now() - 3600e3).toISOString());
      if ((count ?? 0) >= 10) return json({ error: "too_many" }, 429);
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const orderReference = `veh-${Date.now()}-${token.slice(0, 6)}`;
      const { error } = await db.from("vehicle_orders").insert({ token, q: pq.q, email, amount, order_reference: orderReference });
      if (error) { console.error("order insert:", error); return json({ error: "server_error" }, 500); }
      const productName = `Перевірка авто ${pq.q}`;
      const orderDate = Math.floor(Date.now() / 1000);
      const sig = hmac([MERCHANT, DOMAIN, orderReference, orderDate, amount, "UAH", productName, 1, amount].join(";"));
      const base = Deno.env.get("SUPABASE_URL");
      return json({ token, form: {
        merchantAccount: MERCHANT, merchantDomainName: DOMAIN, merchantSignature: sig, orderReference, orderDate, amount, currency: "UAH",
        productName: [productName], productPrice: [amount], productCount: [1], clientEmail: email, language: "UA",
        returnUrl: `${base}/functions/v1/vehicle-check?return=${token}`, serviceUrl: `${base}/functions/v1/vehicle-check`,
      } });
    }

    if (p.action === "report") {
      const token = String(p.token ?? "");
      if (!/^[a-f0-9]{40}$/.test(token)) return json({ error: "not_found" }, 404);
      const { data: o } = await db.from("vehicle_orders").select("*").eq("token", token).maybeSingle();
      if (!o) return json({ error: "not_found" }, 404);
      if (o.status !== "paid") return json({ status: o.status, q: o.q, amount: o.amount });
      if (!o.report) {
        const pq = parseQ(o.q)!;
        o.report = { ...await buildReport(pq, true), price: Number(o.amount), token: true };
        await db.from("vehicle_orders").update({ report: o.report }).eq("id", o.id);
      }
      return json({ status: "paid", report: o.report });
    }
    return json({ error: "bad_request" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String(e).includes("source") ? "unavailable" : "server_error" }, String(e).includes("source") ? 503 : 500);
  }
});
