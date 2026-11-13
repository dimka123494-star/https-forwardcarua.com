// Розмітка сторінки авто /avto/{номер} — спільна для серверного рендеру (netlify/edge-functions/avto-page.ts)
// і браузера (avto.html). Вхід — безкоштовна довідка функції vehicle-check (action: summary).
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const date = (d) => !d ? "—" : String(d).split("-").reverse().join(".");
const cap = (s) => s ? String(s).charAt(0) + String(s).slice(1).toLowerCase() : "";
const title = (s) => String(s || "").toLowerCase().replace(/(^|[\s\-])(\S)/g, (m, a, b) => a + b.toUpperCase());

// серії номерних знаків → область і сторінка митних брокерів
const SERIES = [
  ["АА КА ТТ", "м. Київ", "kyiv"], ["АІ КІ ТІ", "Київська область", "kyivska"], ["АВ КВ", "Вінницька область", "vinnytska"],
  ["АС КС", "Волинська область", "volynska"], ["АЕ КЕ", "Дніпропетровська область", "dnipropetrovska"], ["АН КН", "Донецька область", "donetska"],
  ["АМ КМ", "Житомирська область", "zhytomyrska"], ["АО КО", "Закарпатська область", "zakarpatska"], ["АР КР", "Запорізька область", "zaporizka"],
  ["АТ КТ", "Івано-Франківська область", "ivano-frankivska"], ["ВА НА", "Кіровоградська область", "kirovohradska"], ["ВВ НВ", "Луганська область", "luhanska"],
  ["ВС НС", "Львівська область", "lvivska"], ["ВЕ НЕ", "Миколаївська область", "mykolaivska"], ["ВН НН", "Одеська область", "odeska"],
  ["ВІ НІ", "Полтавська область", "poltavska"], ["ВК НК", "Рівненська область", "rivnenska"], ["ВМ НМ", "Сумська область", "sumska"],
  ["ВО НО", "Тернопільська область", "ternopilska"], ["АХ КХ", "Харківська область", "kharkivska"], ["ВТ НТ", "Херсонська область", "khersonska"],
  ["ВХ НХ", "Хмельницька область", "khmelnytska"], ["СА ІА", "Черкаська область", "cherkaska"], ["СВ ІВ", "Чернігівська область", "chernihivska"],
  ["СЕ ІЕ", "Чернівецька область", "chernivetska"], ["АК КК", "АР Крим", null], ["СН ІН", "м. Севастополь", null],
];
export function plateRegion(plate) {
  const m = String(plate || "").match(/^([А-ЯІЇЄ]{2})\d{4}[А-ЯІЇЄZV][А-ЯІЇЄ]$/);
  if (!m) return null;
  const s = SERIES.find((x) => x[0].split(" ").includes(m[1]));
  return s ? { series: m[1], name: s[1], slug: s[2] } : null;
}
const REG_SLUG = Object.fromEntries(SERIES.map((s) => [s[1].replace(" область", " обл."), s[2]]));

export function renderVehicle(r) {
  const v = r.vehicle || {};
  const plate = r.q;
  const name = [title(v.brand), v.model].filter(Boolean).join(" ");
  const nameYear = name + (v.year ? " " + v.year : "");
  const canonical = "https://forwardcarua.com/avto/" + encodeURIComponent(plate);
  const reg = plateRegion(plate);
  const lastReg = r.last && r.last.region;
  const brokerSlug = (lastReg && REG_SLUG[lastReg]) || (reg && reg.slug);
  const facts = [
    ["Марка й модель", name], ["Рік випуску", v.year], ["Колір", cap(v.color)], ["Пальне", cap(v.fuel)],
    ["Обʼєм двигуна", v.capacity ? v.capacity + " см³" : ""], ["Тип / кузов", [cap(v.kind), cap(v.body)].filter(Boolean).join(", ")],
    ["Власна / повна маса", v.own_weight ? v.own_weight + " / " + (v.total_weight || "—") + " кг" : ""],
    ["Операцій у реєстрі МВС", r.events],
  ].filter((f) => f[1] !== "" && f[1] != null);
  const vi = r.vin_info || {};
  const tile = (l, val, ic) => `<div class="vc-tile"><span><i class="ti ti-${ic}"></i>${esc(l)}</span><b>${esc(val)}</b></div>`;
  // під замком — розмитий приклад (не справжні дані); клік веде до оплати повного звіту
  const lock = (l, fake, ic) => `<a class="vc-tile vc-locked" href="#vcBuyMount"><span><i class="ti ti-${ic}"></i>${esc(l)}</span><b><em>${fake}</em><i class="ti ti-lock"></i></b></a>`;
  const ORIGIN = { import: ["Ввезено з-за кордону", "world"], new: ["Новим · перша реєстрація в Україні", "sparkles"], dealer: ["Куплено в автосалоні", "building-store"] };
  const o = ORIGIN[r.origin];
  const histTiles = [lock(r.history_partial ? "Перший запис з цим номером" : "Дата першої реєстрації", "12.03.2019", "calendar-event"), lock("Змін власника", "3", "users"),
    o ? lock(o[0], "05.08.2018", o[1]) : "", r.locked && r.locked.euro ? lock("Екологічний стандарт", "Євро-5", "leaf") : ""].join("");
  const vinTiles = [r.vin_masked ? `<a class="vc-tile vc-locked" href="#vcBuyMount"><span><i class="ti ti-barcode"></i>VIN</span><b>${esc(r.vin_masked)}<i class="ti ti-lock"></i></b></a>` : "",
    vi.country ? tile("Країна виробництва", [vi.country, vi.plant_city ? title(vi.plant_city) : ""].filter(Boolean).join(", "), "world") : "",
    vi.maker ? tile("Виробник", title(vi.maker), "building-factory") : "", vi.model_year ? tile("Модельний рік", vi.model_year, "calendar") : "",
    vi.market_known ? lock("Авто для ринку", "Північна Америка", "map-pin") : ""].join("");
  const flags = [];
  if (r.wanted_flag) flags.push('<span class="vc-flag bad"><b>У базі розшуку МВС</b></span>');
  else if (r.wanted_flag === false) flags.push('<span class="vc-flag ok">Не в розшуку</span>');
  if (r.deregistered) flags.push('<span class="vc-flag bad">Знято з обліку</span>');
  if (r.other_vehicles) flags.push(`<span class="vc-flag">Цей номер мали ще ${r.other_vehicles} авто</span>`);

  // звʼязний опис — Google бачить унікальний текст, людина — коротку історію
  const story = [
    `Номерний знак <b>${esc(plate)}</b> належить авто <b>${esc(nameYear)}</b>${v.color ? ", колір — " + esc(cap(v.color).toLowerCase()) : ""}${v.fuel ? ", пальне — " + esc(cap(v.fuel).toLowerCase()) : ""}${v.capacity ? ", двигун " + esc(v.capacity) + " см³" : ""}.`,
    r.origin === "import" ? "Авто ввезене з-за кордону." : r.origin === "new" ? "Авто вперше зареєстроване в Україні новим." : r.origin === "dealer" ? "Авто придбане в автосалоні (торговельній організації)." : "",
    vi.country ? `Країна виробництва за VIN — ${esc(vi.country)}${vi.maker ? " (" + esc(title(vi.maker)) + ")" : ""}${vi.model_year ? ", модельний рік — " + vi.model_year : ""}.` : "",
    `У реєстрі МВС за цим авто ${r.events} ${r.events === 1 ? "операція" : r.events < 5 ? "операції" : "операцій"}; дати, кількість власників і повна історія — у звіті.`,
    r.last ? `Остання операція — ${date(r.last.date)}${r.last.op ? ": " + esc(cap(r.last.op).toLowerCase().replace(/(^|[\s(])тз(?=[\s,.)]|$)/g, "$1ТЗ")) : ""}${r.last.region ? " (" + esc(r.last.region) + ")" : ""}${r.last.owner ? ", власник — " + esc(r.last.owner) : ""}.` : "",
    reg ? `Серія ${esc(reg.series)} — номери, які видають у ${esc(reg.name === "м. Київ" ? "Києві" : reg.name === "м. Севастополь" ? "Севастополі" : reg.name.replace("ська область", "ській області").replace("цька область", "цькій області").replace("зька область", "зькій області"))}.` : "",
  ].filter(Boolean).join(" ");

  const html =
    `<section class="container-narrow page-hero" style="padding-bottom:.5rem">` +
    `<div class="crumbs"><a href="/">МитнийБрокер</a> › <a href="/perevirka-avto">Перевірка авто</a> › ${esc(plate)}</div>` +
    `<h1 class="h-lg" style="font-size:clamp(26px,5vw,40px)">${esc(plate)}<br><span style="color:var(--green)">${esc(nameYear)}</span></h1>` +
    (v.brand ? `<figure class="vc-photo" data-b="${esc(v.brand)}" data-m="${esc(String(v.model || "").split(/[\s\-]/)[0])}"></figure>` : "") +
    `<p class="lead">${story}</p>` +
    `<div class="vc-flags">${flags.join("")}</div>` +
    `<div class="vc-specs" style="margin-top:1rem">${facts.map((f) => `<div><span>${esc(f[0])}</span><b>${esc(f[1])}</b></div>`).join("")}</div>` +
    `<h2 class="vc-h">Історія авто</h2><div class="vc-tiles">${histTiles}</div>` +
    (vinTiles ? `<h2 class="vc-h">Розшифрування VIN</h2><div class="vc-tiles">${vinTiles}</div>` : "") +
    `<a class="btn btn-ghost btn-block vc-histbtn" href="#vcBuyMount"><i class="ti ti-lock"></i>Історія реєстрацій · ${r.events} ${r.events === 1 ? "запис" : r.events < 5 ? "записи" : "записів"}</a>` +
    `<div class="card" style="margin-top:1rem;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap"><i class="ti ti-shield-check" style="font-size:28px;color:var(--green)"></i>` +
    `<div style="flex:1;min-width:200px"><b>Автоцивілка (ОСЦПВ)</b><div class="text-sm text-muted">Чинність поліса на ${esc(plate)} можна перевірити в базі МТСБУ — безкоштовно.</div></div>` +
    `<a class="btn btn-ghost" href="https://policy.mtsbu.ua/" target="_blank" rel="noopener">Перевірити в МТСБУ</a></div>` +
    `<div class="cp-mount" data-plate="${esc(plate)}" style="margin-top:1rem"></div>` +
    `</section>` +
    `<section class="container-narrow" style="padding-top:1rem"><div id="vcBuyMount"></div></section>` +
    `<section class="container-narrow seo" style="padding-top:1.5rem">` +
    `<h2>Що ще перевірити перед купівлею ${esc(name)}</h2>` +
    `<div class="rm-checks">` +
    `<div><i class="ti ti-check"></i>Порівняйте VIN, рік і обʼєм двигуна зі свідоцтвом про реєстрацію</div>` +
    `<div><i class="ti ti-check"></i>Перевірте обтяження (заставу, арешт) у Державному реєстрі обтяжень рухомого майна</div>` +
    `<div><i class="ti ti-check"></i>Подивіться всю історію перереєстрацій у повному звіті — часті продажі є приводом розпитати продавця</div>` +
    `<div><i class="ti ti-check"></i>Для авто з-за кордону — історію за VIN у Carfax чи аналогах</div></div>` +
    `<div class="rm-more">` +
    `<a class="card" href="/perevirka-avto"><i class="ti ti-search"></i><b>Перевірити інше авто</b><div class="text-sm text-muted">За номером або VIN</div></a>` +
    `<a class="card" href="/app?source=avto"><i class="ti ti-device-mobile"></i><b>Застосунок НомерОК</b><div class="text-sm text-muted">Перевірка номера камерою телефона</div></a><a class="card" href="/kalkulyator-rozmytnennya"><i class="ti ti-calculator"></i><b>Калькулятор розмитнення</b><div class="text-sm text-muted">Мито, акциз і ПДВ</div></a>` +
    (brokerSlug ? `<a class="card" href="/brokery/${brokerSlug}"><i class="ti ti-users"></i><b>Митні брокери${lastReg ? " — " + esc(lastReg) : reg ? " — " + esc(reg.name) : ""}</b><div class="text-sm text-muted">Розмитнення й оформлення авто</div></a>` : "") +
    `</div><p class="text-xs text-muted" style="margin-top:1.5rem">Джерело — відкриті дані Головного сервісного центру МВС (data.gov.ua) станом на ${date(String(r.data_at || "").slice(0, 10))}. Імена й адреси власників у відкритих даних не публікуються.</p></section>`;

  const desc = `${plate}: ${nameYear}${v.color ? ", " + cap(v.color).toLowerCase() : ""}${v.fuel ? ", " + cap(v.fuel).toLowerCase() : ""}. ` +
    (r.origin === "import" ? "Ввезене з-за кордону. " : "") + (vi.country ? `Країна виробництва — ${vi.country}. ` : "") +
    `Операцій у реєстрі МВС: ${r.events}. ${r.wanted_flag ? "У розшуку. " : ""}Історія реєстрацій МВС і перевірка розшуку.`;
  const ld = {
    "@context": "https://schema.org", "@type": "Vehicle", name: nameYear, url: canonical,
    brand: v.brand ? { "@type": "Brand", name: title(v.brand) } : undefined, model: v.model || undefined,
    vehicleModelDate: v.year ? String(v.year) : undefined, color: v.color ? cap(v.color) : undefined,
    fuelType: v.fuel ? cap(v.fuel) : undefined, bodyType: v.body ? cap(v.body) : undefined,
    vehicleEngine: v.capacity ? { "@type": "EngineSpecification", engineDisplacement: { "@type": "QuantitativeValue", value: v.capacity, unitCode: "CMQ" } } : undefined,
  };
  return { title: `${plate} — ${nameYear}: перевірка авто за номером | МитнийБрокер`, desc, html, ld, canonical, index: true };
}
