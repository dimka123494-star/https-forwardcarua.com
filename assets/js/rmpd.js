/* rmpd.js — подача заявок RMPD (Польща, SENT/RMPD на PUESC) з кабінету.
   Принцип: клієнт вводить лише те, що знає тільки він (авто, маршрут, дата, контрагенти),
   решту сервіс визначає сам — тип перевезення, підставу, напрямок, дати, попередню RMPD,
   реквізити за кодом (ЄДРПОУ / NIP / EU VAT), латиницю. Профіль перевізника, авто з GPS
   і контрагенти запам'ятовуються автоматично.
   Перевізник: 3 заявки/міс безкоштовно, платні тарифи — без ліміту. Брокер — тариф «Преміум».
   Потребує config.js і db.js. */
const Rmpd = (() => {
  const PUESC = 'https://puesc.gov.pl/';
  const UA_CROSS = [['Dorohusk','Дорогуськ — Ягодин'],['Dołhobyczów','Долгобичув — Угринів'],['Hrebenne','Хребенне — Рава-Руська'],
    ['Korczowa','Корчова — Краковець'],['Medyka','Медика — Шегині'],['Budomierz','Будомєж — Грушів'],['Krościenko','Кросценко — Смільниця'],['Zosin','Зосин — Устилуг']];
  const CROSS_ALIAS = { dorohusk:'Dorohusk', dorohusko:'Dorohusk', dorokhusk:'Dorohusk', dorogusk:'Dorohusk', yahodyn:'Dorohusk', jagodzin:'Dorohusk', iahodyn:'Dorohusk',
    dolhobyczow:'Dołhobyczów', dolhobychuv:'Dołhobyczów', dolhobychiv:'Dołhobyczów', uhryniv:'Dołhobyczów',
    hrebenne:'Hrebenne', khrebenne:'Hrebenne', ravaruska:'Hrebenne', ravaruskaia:'Hrebenne',
    korczowa:'Korczowa', korchova:'Korczowa', korchowa:'Korczowa', krakovets:'Korczowa', krakivets:'Korczowa',
    medyka:'Medyka', shehyni:'Medyka', szeginie:'Medyka',
    budomierz:'Budomierz', budomiezh:'Budomierz', budomezh:'Budomierz', hrushiv:'Budomierz',
    kroscienko:'Krościenko', krostsenko:'Krościenko', smilnytsia:'Krościenko', zosin:'Zosin', ustyluh:'Zosin',
    swiecko:'Świecko', svietsko:'Świecko', kolbaskowo:'Kołbaskowo', jedrzychowice:'Jędrzychowice', budzisko:'Budzisko', terespol:'Terespol', barwinek:'Barwinek', chyzne:'Chyżne' };
  const crossKey = s => translit(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z]/g, '');
  function normCross(s){
    if (!s) return s;
    const k = crossKey(s.split(/[—\-–(]/)[0]); if (CROSS_ALIAS[k]) return CROSS_ALIAS[k];
    const k2 = crossKey(s); if (CROSS_ALIAS[k2]) return CROSS_ALIAS[k2];
    return translit(s).trim();
  }
  const OTHER_CROSS = ['Świecko','Kołbaskowo','Jędrzychowice','Olszyna','Gubinek','Lubieszyn','Gorzyczki','Cieszyn','Chyżne','Barwinek',
    'Łysa Polana','Kudowa-Słone','Budzisko','Terespol','Kukuryki','Port Gdańsk','Port Gdynia','Port Szczecin'];
  /* Польські пункти пропуску для RMPD100 3.7/3.8: адреса, воєводство, координати (OpenStreetMap, PL-бік КПП) */
  const PL_PLACES = {
    'Dorohusk':    { city:'Dorohusk',    zip:'22-175', prov:'lubelskie',    lat:51.18120, lon:23.80180 },
    'Hrebenne':    { city:'Hrebenne',    zip:'22-681', prov:'lubelskie',    lat:50.27620, lon:23.58680 },
    'Zosin':       { city:'Zosin',       zip:'22-523', prov:'lubelskie',    lat:50.85970, lon:24.13580 },
    'Dołhobyczów': { city:'Dołhobyczów', zip:'22-540', prov:'lubelskie',    lat:50.58050, lon:24.08700 },
    'Korczowa':    { city:'Korczowa',    zip:'37-552', prov:'podkarpackie', lat:49.95481, lon:23.11403 },
    'Medyka':      { city:'Medyka',      zip:'37-732', prov:'podkarpackie', lat:49.79967, lon:22.94767 },
    'Krościenko':  { city:'Krościenko',  zip:'38-700', prov:'podkarpackie', lat:49.48140, lon:22.69860 },
    'Budomierz':   { city:'Budomierz',   zip:'37-625', prov:'podkarpackie', lat:50.10028, lon:23.27417 },
    'Kukuryki':    { city:'Kukuryki',    zip:'21-550', prov:'lubelskie',    lat:52.11050, lon:23.56090 },
    'Terespol':    { city:'Terespol',    zip:'21-550', prov:'lubelskie',    lat:52.07085, lon:23.64349 },
    'Sławatycze':  { city:'Sławatycze',  zip:'21-515', prov:'lubelskie',    lat:51.76730, lon:23.58630 },
    'Połowce':     { city:'Połowce',     zip:'17-240', prov:'podlaskie',    lat:52.47480, lon:23.35650 },
    'Bobrowniki':  { city:'Bobrowniki',  zip:'16-040', prov:'podlaskie',    lat:53.12370, lon:23.89090 },
    'Kuźnica':     { city:'Kuźnica',     zip:'16-123', prov:'podlaskie',    lat:53.52100, lon:23.65720 },
    'Budzisko':    { city:'Budzisko',    zip:'16-411', prov:'podlaskie',    lat:54.30833, lon:23.11944 }
  };
  const placeOf = name => { const p = PL_PLACES[normCross(name || '')]; return p ? { ...p, street:'NONE', bld:'NONE', apt:'', src:'cross' } : null; };
  /* «ul. Prosta 5/2» → street «ul. Prosta», bld «5», apt «2» */
  function splitAddr(t){
    t = String(t || '').trim().replace(/\s+/g, ' ');
    if (!t) return { street:'NONE', bld:'NONE', apt:'' };
    const m = t.match(/^(.*?)[\s,]+(\d+[A-Za-z]?)(?:\s*[\/-]\s*(\d+[A-Za-z]?))?$/);
    return m && m[1] ? { street: m[1].replace(/,$/, '').trim(), bld: m[2], apt: m[3] || '' } : { street: t, bld:'NONE', apt:'' };
  }
  const zipOk = z => /^\d{2}-\d{3}$/.test(String(z || ''));
  const normZip = z => { const d = String(z || '').replace(/\D/g, ''); return d.length === 5 ? d.slice(0, 2) + '-' + d.slice(2) : String(z || '').trim(); };
  /* Координати й воєводство для адреси в Польщі (Nominatim / OpenStreetMap); без відповіді — повертаємо як є */
  async function geocode(a){
    if (!a || a.src === 'cross' || (a.lat && a.prov)) return a;
    const get = async q => { const c = new AbortController(), t = setTimeout(() => c.abort(), 6000);
      try{ const r = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ format:'json', limit:'1', addressdetails:'1', 'accept-language':'pl', countrycodes:'pl', ...q }), { signal: c.signal }); return r.ok ? await r.json() : []; }
      catch(e){ return []; } finally{ clearTimeout(t); } };
    const street = [a.street !== 'NONE' ? a.street : '', a.bld !== 'NONE' ? a.bld : ''].join(' ').trim();
    let j = street ? await get({ street, city: a.city || '', postalcode: a.zip || '' }) : [];
    let approx = !j.length;
    if (!j.length) j = await get({ city: a.city || '', postalcode: a.zip || '' });
    if (!j.length && a.city) j = await get({ q: a.city });
    if (!j.length) return a;
    const ad = j[0].address || {};
    const out = { ...a, lat: +(+j[0].lat).toFixed(6), lon: +(+j[0].lon).toFixed(6), prov: a.prov || String(ad.state || '').replace(/^województwo\s+/i, ''), zip: a.zip || ad.postcode || '' };
    if (approx) out.approx = true;
    return out;
  }
  const COUNTRIES = { UA:'Україна', PL:'Польща', DE:'Німеччина', LT:'Литва', LV:'Латвія', EE:'Естонія', SK:'Словаччина', CZ:'Чехія',
    HU:'Угорщина', RO:'Румунія', MD:'Молдова', AT:'Австрія', NL:'Нідерланди', BE:'Бельгія', FR:'Франція', IT:'Італія', ES:'Іспанія',
    DK:'Данія', SE:'Швеція', FI:'Фінляндія', BG:'Болгарія', GR:'Греція', PT:'Португалія', HR:'Хорватія', SI:'Словенія', LU:'Люксембург',
    IE:'Ірландія', TR:'Туреччина', GB:'Велика Британія', CH:'Швейцарія', NO:'Норвегія', GE:'Грузія', KZ:'Казахстан' };
  const EU = ['AT','BE','BG','CY','CZ','DE','DK','EE','GR','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'];
  const TRIP = { bilateral:'Двостороннє (в/з країни перевізника)', transit:'Транзит через Польщу', third:'З/до третьої країни', cabotage:'Каботаж (всередині Польщі)' };
  const PERMIT = { eu_ua:'Без дозволу — Угода ЄС–Україна', bilateral:'Двосторонній дозвіл', transit:'Транзитний дозвіл',
    third:'Дозвіл на перевезення з/до третьої країни', ecmt:'Дозвіл ЄКМТ (CEMT)', other:'Інший дозвіл' };
  const DIR = { there:'Туди (вʼїзд з вантажем / на завантаження)', back:'Назад (повернення)' };
  const IDT = { NIP:'NIP (Польща)', VAT:'EU VAT', INNY:'ЄДРПОУ / інший код', DOK:'Документ особи' };
  const LATIN = ['carrier_name','carrier_city','carrier_street','carrier_building','driver_first','driver_last','cargo_desc',
    'sender_name','sender_city','sender_address','recipient_name','recipient_city','recipient_address','load_place','unload_place',
    'entry_point','exit_point','load_addr','unload_addr','client_note'];
  const ADDR_F = ['load_addr','load_zip','unload_addr','unload_zip'];
  const CARRIER_F = ['carrier_code','carrier_name','carrier_country','carrier_city','carrier_postcode','carrier_street','carrier_building','carrier_email'];

  let st = { el:null, broker:null, acc:null, list:[], contacts:[], vehicles:[], editId:null, parent:null, filter:'active', carrierEdit:false, license:null, vehDocs:[], keepDocs:[], mode:'team', sheet:null, cmr:[], cmrPrice:100 };
  const $ = id => document.getElementById(id);
  const v = id => { const e = $('rm-' + id); return e ? String(e.value || '').trim() : ''; };
  const set = (id, val) => { const e = $('rm-' + id); if (e && val !== undefined && val !== null) e.value = val; };
  const opt = (o, sel, empty) => (empty !== undefined ? '<option value="">' + empty + '</option>' : '') +
    Object.entries(o).map(([k, l]) => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const fmtD = d => d ? d.split('-').reverse().join('.') : '—';
  const isCarrier = () => st.broker && st.broker.kind === 'carrier';
  const OP_FROM = 8, OP_TO = 22; // години роботи оператора, Київ
  const kyivHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Kyiv' }).format(d));
  const offHours = () => { const h = kyivHour(); return h < OP_FROM || h >= OP_TO; };
  const fmtDT = iso => iso ? new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' }) : '';
  const store = (k, val) => { try { if (val === undefined) return localStorage.getItem('rmpd_' + k); localStorage.setItem('rmpd_' + k, val); } catch(e){ return null; } };

  /* ---------- Латиниця (КМУ №55, 2010) і держномери ---------- */
  const TR = { а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ie',ж:'zh',з:'z',и:'y',і:'i',ї:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',
    п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'iu',я:'ia',ʼ:'',"'":'','’':'',ё:'e',ы:'y',э:'e',ъ:'' };
  const TR_START = { є:'ye', ї:'yi', й:'y', ю:'yu', я:'ya' };
  function translit(s){
    s = String(s || '').replace(/зг/g, 'zgh').replace(/Зг/g, 'Zgh').replace(/ЗГ/g, 'ZGH');
    return s.replace(/[А-Яа-яЁёЄєІіЇїҐґʼ’']/g, (ch, i) => {
      const lo = ch.toLowerCase(), start = i === 0 || /[\s\-.,«»"(]/.test(s[i - 1]);
      let r = (start && TR_START[lo]) || TR[lo];
      if (r === undefined) return ch;
      if (ch !== lo && r){ const nu = s[i + 1] && s[i + 1] !== s[i + 1].toLowerCase(); r = nu ? r.toUpperCase() : r[0].toUpperCase() + r.slice(1); }
      return r;
    }).replace(/[«»„“”]/g, '"').replace(/[–—]/g, '-').replace(/№/g, 'No');
  }
  const PLATE_MAP = { А:'A',В:'B',Е:'E',І:'I',К:'K',М:'M',Н:'H',О:'O',Р:'P',С:'C',Т:'T',Х:'X',У:'Y' };
  const normPlate = s => String(s || '').toUpperCase().replace(/[\s\-–.]/g, '').replace(/[АВЕІКМНОРСТХУ]/g, c => PLATE_MAP[c]);
  const normGps = s => { const x = String(s || '').toUpperCase().replace(/[АВЕІКМНОРСТХУ]/g, c => PLATE_MAP[c]).replace(/[\s\-–]/g, '');
    return /^[ZAUM][A-Z0-9]{9}$/.test(x) ? x.slice(0, 3) + '-' + x.slice(3, 9) + '-' + x.slice(9) : x; };
  // Офіційний формат PUESC (STypes.xsd LocatorNumber + SENT_SPEC-ZSL): [ZAUM]РР-ЛЛЦЦЛЛ-К, контрольна цифра — ваги 9,7,3,1, mod 10
  const GPS_RE = /^[ZAUM][0-9]{2}-[ABCEFGHKMNPRSTWXYZ]{2}[0-9]{2}[ABCEFGHKMNPRSTWXYZ]{2}-[0-9]$/;
  const gpsCheck = g => { const c = g.replace(/-/g, ''), w = [9, 7, 3, 1]; let sum = 0;
    for (let i = 0; i < 9; i++){ const ch = c[i]; sum += (/\d/.test(ch) ? +ch : ch.charCodeAt(0) - 55) * w[i % 4]; } return sum % 10 === +c[9]; };
  const notLatin = s => /[^\x20-\x7E -ſ]/.test(String(s || ''));

  /* ---------- Автовизначення ---------- */
  function derive(r){
    const L = r.load_country, U = r.unload_country, C = r.carrier_country || 'UA';
    let trip = null;
    if (L && U){
      if (L === 'PL' && U === 'PL') trip = 'cabotage';
      else if (L !== 'PL' && U !== 'PL') trip = 'transit';
      else trip = (L === 'PL' ? U : L) === C ? 'bilateral' : 'third';
    }
    const noPermit = C === 'UA' && (trip === 'bilateral' || trip === 'transit');
    const direction = L === 'PL' && U !== 'PL' ? 'back' : 'there';
    const needEntry = L !== 'PL', needExit = U !== 'PL';
    const start_place = needEntry ? r.entry_point : r.load_place;
    const end_place = needExit ? r.exit_point : r.unload_place;
    return { trip, noPermit, direction, needEntry, needExit, start_place, end_place };
  }
  function prevRmpdFor(plate){
    const p = st.list.find(x => x.status === 'done' && x.plate === plate && x.ref_number && x.direction !== 'back');
    return p ? p.ref_number : '';
  }

  /* ---------- Довідники ---------- */
  const contactsOf = k => st.contacts.filter(c => c.kind === k);
  function selfCarrier(){ return contactsOf('carrier')[0] || null; }
  function vehicleOptions(){
    const map = new Map();
    contactsOf('vehicle').forEach(c => map.set(c.data.plate, { ...c.data, cid: c.id }));
    st.vehicles.forEach(x => { const p = normPlate(x.plate); if (!map.has(p)) map.set(p, { plate: p, trailer_plate: x.trailer_plate ? normPlate(x.trailer_plate) : '', vehicle_id: x.id, make: x.make }); else map.get(p).vehicle_id = x.id; });
    return [...map.values()];
  }
  async function upsertContact(kind, label, data, match){
    const ex = st.contacts.find(c => c.kind === kind && match(c));
    if (ex){ ex.label = label; ex.data = data; await updateRmpdContact(ex.id, label, data); return; }
    const c = await saveRmpdContact(st.broker.id, kind, label, data); if (c) st.contacts.push(c);
  }

  /* ---------- Монтування ---------- */
  const CSS = '.cab-layout>main{min-width:0}#rmpdMount{min-width:0;max-width:100%;overflow-x:hidden}' +
    '#rmForm .field-row{grid-template-columns:repeat(2,minmax(0,1fr))}#rmForm .field-row>*{min-width:0}' +
    '@media(max-width:768px){#rmForm .field-row{grid-template-columns:minmax(0,1fr)}}' +
    '#rmForm .input{min-width:0;max-width:100%;box-sizing:border-box}' +
    '#rmForm input[type=date],#rmForm input[type=datetime-local]{-webkit-appearance:none;appearance:none;display:block;width:100%;min-height:46px;text-align:left;color:var(--text);color-scheme:dark}' +
    '#rmForm input::-webkit-date-and-time-value{text-align:left;min-height:1.4em;color:var(--text)}' +
    '#rmForm .rm-find{display:flex;gap:6px;align-items:stretch}#rmForm .rm-find .input{flex:1}#rmForm .rm-find .btn{white-space:nowrap;padding:0 14px}' +
    '#rmAuto{flex-wrap:wrap}#rmAuto .chip{white-space:normal;font-size:12px}';
  function injectCss(){ if (document.getElementById('rmpdCss')) return; const e = document.createElement('style'); e.id = 'rmpdCss'; e.textContent = CSS; document.head.appendChild(e); }

  async function mount(el, { broker }){
    injectCss();
    st.el = el; st.broker = broker; st.mode = store('mode') === 'self' ? 'self' : 'team';
    el.innerHTML = '<div class="empty">Завантаження…</div>';
    const tasks = [rmpdAccess(broker.id), myRmpd(broker.id), rmpdContacts(broker.id), myCmr(broker.id).catch(() => []), servicePrices().catch(() => [])];
    if (broker.kind === 'carrier' && typeof myVehicles === 'function') tasks.push(myVehicles().catch(() => []));
    const [acc, list, contacts, cmr, prices, vehicles] = await Promise.all(tasks);
    st.acc = acc; st.list = list; st.contacts = contacts; st.vehicles = (vehicles || []).filter(x => x.status !== 'rejected');
    st.cmr = cmr || []; const cp = (prices || []).find(x => x.code === 'cmr'); st.cmrPrice = cp && cp.active ? Number(cp.price) : null;
    render(); badge();
    if (/[?&]paid=1/.test(location.search) && location.hash === '#rmpd'){ showToast('Дякуємо! Баланс оновиться, щойно WayForPay підтвердить оплату'); setTimeout(refreshAccess, 4000); setTimeout(refreshAccess, 12000); }
  }
  async function refreshAccess(){ st.acc = await rmpdAccess(st.broker.id); renderTop(); }
  function badge(){ const b = $('rmBadge'); if (!b) return; const n = st.list.filter(r => r.status === 'needs_fix').length; b.textContent = n; b.style.display = n ? '' : 'none'; }

  function render(){
    st.el.innerHTML = '<div id="rmTop"></div><div id="rmFormWrap"></div>' +
      '<div class="spread" style="margin:1.5rem 0 .75rem"><div class="card-title" style="margin:0">Мої заявки RMPD</div><div class="pchips">' +
        [['active','Активні'],['done','Зареєстровані'],['all','Всі']].map(([k, l]) => '<button class="chip' + (st.filter === k ? ' active' : '') + '" onclick="Rmpd.setFilter(\'' + k + '\')">' + l + '</button>').join('') +
      '</div></div><div id="rmList"></div>' +
      '<div class="card card-tight" style="margin-top:1rem"><div class="card-title">На кордоні</div><p class="text-sm text-muted">Водій може перевірити, що заявка активна, у формі <strong style="color:var(--text)">RMPD406</strong> на <a href="' + PUESC + '" target="_blank" rel="noopener">puesc.gov.pl</a> або в застосунку e-TOLL PL. Номер RMPD діє 10 днів. Геолокація має працювати весь час руху Польщею — без неї штраф до 10 000 zł навіть при поданій заявці.</p></div>';
    renderTop(); renderForm(); renderList();
  }
  function renderTop(){
    const a = st.acc || {}, top = $('rmTop'); if (!top) return;
    const price = Number(a.price || 0), priceSelf = Number(a.price_self || 0), avail = Number(a.available || 0), hold = Number(a.hold || 0);
    const pm = st.mode === 'self' ? priceSelf : price, enough = pm ? Math.floor(avail / pm) : 0;
    const extra = (a.test ? '<div class="msg show" style="margin:0 0 12px;background:rgba(245,166,35,.12);color:var(--amber);border:.5px solid rgba(245,166,35,.35)">🧪 <strong>Тестовий режим адміністратора.</strong> Заявки позначаються як тестові, не списують кошти й не йдуть у CRM. В адмінці вносьте їх лише на <a href="https://test.puesc.gov.pl/" target="_blank" rel="noopener">test.puesc.gov.pl</a>.</div>' : '') +
      (offHours() && st.mode !== 'self' ? '<div class="msg show" style="margin:0 0 12px;background:rgba(16,185,129,.08);color:var(--muted);border:.5px solid var(--border)">🌙 Зараз неробочий час оператора (працюємо ' + OP_FROM + ':00–' + OP_TO + ':00 за Києвом). Заявку приймемо, але опрацюємо з ' + OP_FROM + ':00. Якщо машина буде на кордоні раніше — подайте заявку самостійно на <a href="' + PUESC + '" target="_blank" rel="noopener">puesc.gov.pl</a>.</div>' : '');
    const wallet = '<div class="card card-tight" style="margin-bottom:12px"><div class="spread" style="gap:12px;flex-wrap:wrap">' +
        '<div><div class="text-xs text-muted">Баланс</div><div style="font-family:var(--display);font-size:26px;line-height:1.1">' + uah(avail) + '</div>' +
          '<div class="text-xs text-muted">' + (hold ? 'ще ' + uah(hold) + ' заморожено за заявки в роботі · ' : '') + 'RMPD: оператор — <strong style="color:var(--text)">' + uah(price) + '</strong>, самостійно — <strong style="color:var(--text)">' + uah(priceSelf) + '</strong>' +
          (pm && !a.test ? ' · вистачить на ' + enough + ' ' + plural(enough, 'заявку', 'заявки', 'заявок') : '') + '</div></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + [1000, 2000, 5000].map(n => '<button class="btn btn-ghost btn-sm" onclick="Rmpd.topup(' + n + ')">+ ' + n.toLocaleString('uk-UA') + '</button>').join('') +
          '<button class="btn btn-ghost btn-sm" onclick="Rmpd.topup()">Інша сума</button>' +
          (typeof REQUISITES !== 'undefined' && REQUISITES.iban ? '<button class="btn btn-ghost btn-sm" onclick="Rmpd.invoice()"><i class="ti ti-file-invoice"></i> Рахунок для ТОВ / ФОП</button>' : '') + '</div></div>' +
      '<p class="hint" style="margin:8px 0 0">Через оператора — оплата лише за результат: сума заморожується й списується, коли заявку зареєстровано, а при скасуванні повертається. «Подаю сам» — списується одразу за перевірку й дані. Оновлення — безкоштовно. <a href="#" onclick="Rmpd.history();return false">Історія операцій</a></p>' +
      '<div id="rmHistory"></div></div>';
    top.innerHTML = extra + wallet + (a.reason === 'balance'
      ? '<div class="msg msg-err show" style="margin:0 0 12px">Щоб подати заявку, поповніть баланс щонайменше на ' + uah(Math.max(Math.min(price || Infinity, priceSelf || Infinity) - avail, 0)) + '. Поповнення — карткою через WayForPay, зараховується одразу після оплати.</div>'
      : a.reason === 'unavailable' ? '<div class="msg msg-err show" style="margin:0 0 12px">Подача RMPD тимчасово недоступна — напишіть нам.</div>' : '');
  }
  async function topup(n){
    if (n === undefined){ const x = prompt('Сума поповнення, грн (від 200 до 50 000):', '1000'); if (x === null) return; n = Number(String(x).replace(/\s/g, '').replace(',', '.')); }
    try{ showToast('Переходимо до оплати…'); await startTopup(n); }catch(e){ showToast(e.message, 'error'); }
  }
  function invoice(){
    const x = prompt('Сума рахунку для оплати з розрахункового рахунку, грн (від 200):', '2000'); if (x === null) return;
    const n = Math.round(Number(String(x).replace(/\s/g, '').replace(',', '.')));
    if (!(n >= 200 && n <= 200000)){ showToast('Вкажіть суму від 200 до 200 000 грн', 'error'); return; }
    window.open('/rakhunok?sum=' + n, '_blank');
  }
  async function history(){
    const box = $('rmHistory'); if (!box) return;
    if (box.innerHTML){ box.innerHTML = ''; return; }
    box.innerHTML = '<div class="text-xs text-muted" style="margin-top:8px">Завантаження…</div>';
    const rows = await walletHistory(st.broker.id);
    const label = t => t.kind === 'topup' ? 'Поповнення' : t.kind === 'bonus' ? 'Зарахування' : t.kind === 'adjust' ? 'Коригування'
      : t.service === 'cmr' ? 'Оплата CMR' : t.status === 'hold' ? 'Заморожено за заявку' : t.status === 'released' ? 'Повернено (скасовано)' : 'Оплата заявки';
    box.innerHTML = rows.length ? '<div style="margin-top:10px">' + rows.map(t => '<div class="svc-line" style="padding:8px 12px;margin-bottom:4px">' +
        '<div><div class="text-sm">' + label(t) + '</div><div class="text-xs text-muted">' + new Date(t.created_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + (t.note ? ' · ' + esc(t.note) : '') + '</div></div>' +
        '<div class="text-sm" style="white-space:nowrap;color:' + (t.status === 'released' || t.status === 'hold' ? 'var(--muted)' : t.amount > 0 ? 'var(--green)' : 'var(--text)') + (t.status === 'released' ? ';text-decoration:line-through' : '') + '">' + (t.amount > 0 ? '+' : '') + uah(t.amount) + '</div></div>').join('') + '</div>'
      : '<div class="text-xs text-muted" style="margin-top:8px">Операцій ще не було.</div>';
  }

  /* ---------- Форма ---------- */
  const fld = (id, label, attrs = '', hint = '') => '<div class="field"><label class="label" for="rm-' + id + '">' + label + '</label><input class="input" id="rm-' + id + '" autocomplete="off" spellcheck="false" ' + attrs + '>' + (hint ? '<div class="hint" id="rm-' + id + '-hint">' + hint + '</div>' : '') + '</div>';
  const findFld = (id, label, attrs, onclick, hint = '') => '<div class="field"><label class="label" for="rm-' + id + '">' + label + '</label><div class="rm-find"><input class="input" id="rm-' + id + '" autocomplete="off" spellcheck="false" ' + attrs + '>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="' + onclick + '"><i class="ti ti-search"></i> Знайти</button></div><div class="hint" id="rm-' + id + '-hint">' + hint + '</div></div>';
  const sel = (id, label, options, attrs = '') => '<div class="field"><label class="label" for="rm-' + id + '">' + label + '</label><select class="input" id="rm-' + id + '" ' + attrs + '>' + options + '</select></div>';
  const row = (...c) => '<div class="field-row">' + c.join('') + '</div>';
  const sec = t => '<div class="card-title" style="margin-top:1.25rem">' + t + '</div>';
  const canWrite = () => st.acc && (st.acc.allowed || st.acc.allowed_self || st.parent || st.editId);
  const modeOf = () => st.editId ? (find(st.editId) || {}).mode || 'team' : st.parent ? st.parent.mode || 'team' : st.mode;
  const isSelf = () => modeOf() === 'self';
  function modeBlock(){
    if (st.editId || st.parent) return isSelf() ? '<p class="hint">Режим: подаєте самі в PUESC.</p>' : '';
    const a = st.acc || {};
    const card = (m, icon, title, price, text, ok) => '<button type="button" class="card card-tight" onclick="Rmpd.setMode(\'' + m + '\')" style="text-align:left;cursor:pointer;flex:1;min-width:150px;margin:0;' +
      (st.mode === m ? 'border-color:var(--green);box-shadow:0 0 0 1px var(--green)' : 'opacity:.85') + '">' +
      '<div style="font-weight:600">' + icon + ' ' + title + '</div><div style="font-family:var(--display);font-size:18px;margin:2px 0">' + uah(price) + '</div>' +
      '<div class="text-xs text-muted">' + text + (ok ? '' : ' <span style="color:var(--red)">· бракує коштів</span>') + '</div></button>';
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px">' +
      card('team', '👨‍💼', 'Подає оператор', a.price, 'Перевіримо, внесемо в PUESC, перевіримо в RMPD406 і надішлемо номер. Оплата — лише за зареєстровану.', a.allowed) +
      card('self', '🙋', 'Подаю сам', a.price_self, 'Перевіримо дані й дамо їх у порядку полів PUESC — вносите самі зі свого акаунта.', a.allowed_self) + '</div>';
  }
  function setMode(m){
    if (st.mode === m) return;
    const keep = readRaw ? (() => { try { return readRaw(); } catch(e){ return null; } })() : null;
    st.mode = m; store('mode', m); renderTop(); renderForm(); if (keep) { setVals(keep); routeChanged(); datesSummary(); }
  }

  function carrierBlock(){
    const self = selfCarrier();
    const complete = isCarrier() && self && CARRIER_F.every(f => f === 'carrier_building' || self.data[f]);
    if (complete && !st.carrierEdit){
      const d = self.data;
      return '<div class="svc-line" style="margin-bottom:0"><div class="text-sm"><strong>' + esc(d.carrier_name) + '</strong> · ' + esc(d.carrier_code) +
        '<div class="text-xs text-muted">' + esc([d.carrier_street, d.carrier_building].filter(Boolean).join(' ') + ', ' + d.carrier_postcode + ' ' + d.carrier_city + ', ' + d.carrier_country) + ' · ' + esc(d.carrier_email) + '</div></div>' +
        '<button class="btn-quiet" onclick="Rmpd.editCarrier()">Змінити</button></div>' + CARRIER_F.map(f => '<input type="hidden" id="rm-' + f + '">').join('');
    }
    return (!isCarrier() && contactsOf('carrier').length ? sel('pick-carrier', 'Перевізник з довідника', '<option value="">— новий перевізник —</option>' +
        contactsOf('carrier').map(c => '<option value="' + c.id + '">' + esc(c.label) + '</option>').join(''), 'onchange="Rmpd.pickCarrier(this.value)"') : '') +
      row(findFld('carrier_code', 'ЄДРПОУ / ІПН *', 'maxlength="10" inputmode="numeric" placeholder="45002097" onchange="Rmpd.lookupCarrier()"', 'Rmpd.lookupCarrier()', 'Назву й статус ліцензії підставимо з реєстру перевізників.'),
          sel('carrier_country', 'Країна реєстрації', opt(COUNTRIES, 'UA'))) +
      fld('carrier_name', 'Назва латиницею *', 'maxlength="140" placeholder="TOV Forward Trans"') +
      row(fld('carrier_city', 'Місто *', 'maxlength="60" placeholder="Lutsk"'), fld('carrier_postcode', 'Індекс *', 'maxlength="10" placeholder="43000"')) +
      row(fld('carrier_street', 'Вулиця *', 'maxlength="100" placeholder="vul. Lesi Ukrainky"'), fld('carrier_building', 'Будинок, офіс', 'maxlength="20" placeholder="1, of. 2"')) +
      fld('carrier_email', 'Email перевізника *', 'type="email" maxlength="120"', 'На нього PUESC надішле копію зареєстрованої заявки.') +
      (isCarrier() ? '<p class="hint" style="margin-top:-6px">Дані перевізника заповнюються один раз — далі підставляються самі.</p>' : '');
  }

  function partyBlock(side, title){
    const parties = contactsOf('party');
    return '<div style="margin-top:.75rem"><div class="text-sm" style="font-weight:600;margin-bottom:8px">' + title + '</div>' +
      (parties.length ? sel('pick-' + side, 'З довідника', '<option value="">—</option>' + parties.map(c => '<option value="' + c.id + '">' + esc(c.label) + (c.data.country ? ' · ' + c.data.country : '') + '</option>').join(''), 'onchange="Rmpd.pickParty(\'' + side + '\', this.value)"') : '') +
      row(sel(side + '_country', 'Країна *', opt(COUNTRIES, side === 'sender' ? 'PL' : 'UA'), 'onchange="this.dataset.touched=1;Rmpd.idHint(\'' + side + '\')"'),
          findFld(side + '_id', 'NIP / VAT / ЄДРПОУ', 'maxlength="20" onchange="Rmpd.lookupParty(\'' + side + '\')"', 'Rmpd.lookupParty(\'' + side + '\')')) +
      fld(side + '_name', 'Назва *', 'maxlength="140"') +
      row(fld(side + '_city', 'Місто *', 'maxlength="60"'), fld(side + '_postcode', 'Індекс', 'maxlength="10"')) +
      fld(side + '_address', 'Вулиця, будинок', 'maxlength="160"') + '</div>';
  }

  function renderForm(){
    const w = $('rmFormWrap'); if (!w) return;
    if (!canWrite()){ w.innerHTML = ''; return; }
    const vehs = vehicleOptions();
    const head = st.parent ? '🔄 Оновлення заявки ' + esc(st.parent.ref_number || '') : st.editId ? '✏️ Редагування заявки' : 'Нова заявка RMPD';
    w.innerHTML = '<div class="card" id="rmForm"><datalist id="rmCross">' + UA_CROSS.map(([x, l]) => '<option value="' + x + '">' + l + '</option>').join('') + OTHER_CROSS.map(x => '<option value="' + x + '">').join('') + '</datalist>' +
      '<div class="spread"><div class="card-title" style="margin:0">' + head + '</div>' + ((st.parent || st.editId) ? '<button class="btn-quiet" onclick="Rmpd.reset()">Скасувати</button>' : '') + '</div>' +
      modeBlock() +
      (st.parent ? '<p class="hint">' + (isSelf() ? 'Змініть те, що змінилось — дамо оновлені дані для форми «RMPD – Aktualizacja».' : 'Змініть те, що змінилось (авто, дата, пункт пропуску) — оновимо заявку в PUESC.') + ' Оновлення безкоштовне.</p>' : '') +

      sec('1. Перевізник') + '<div id="rmCarrier">' + carrierBlock() + '</div><div id="rmLicense"></div>' +

      sec('2. Авто') +
      (vehs.length ? sel('pick-veh', 'Ваше авто', '<option value="">— нове авто —</option>' + vehs.map(x => '<option value="' + esc(x.plate) + '">' + esc(x.plate) + (x.trailer_plate ? ' / ' + esc(x.trailer_plate) : '') + (x.make ? ' · ' + esc(x.make) : '') + (x.gps_id ? ' · GPS ✓' : '') + '</option>').join(''), 'onchange="Rmpd.pickVehicle(this.value)"') : '') +
      '<input type="hidden" id="rm-vehicle_id">' +
      row(fld('plate', 'Номер тягача *', 'maxlength="12" placeholder="AC1234BH" style="text-transform:uppercase"'), fld('trailer_plate', 'Номер причепа', 'maxlength="12" placeholder="AC5678XT" style="text-transform:uppercase"')) +
      fld('gps_id', 'Номер локатора GPS *', 'maxlength="20" placeholder="Z17-AA00AA-3" style="text-transform:uppercase"',
        'Ідентифікатор пристрою в SENT: стаціонарний локатор (ZSL) — Z…, застосунок e-TOLL PL — M…. Запамʼятаємо для цього авто.') +
      '<details style="margin-bottom:1rem"><summary class="text-xs text-muted" style="cursor:pointer">Авто чи причіп зареєстровані не в Україні</summary><div style="margin-top:10px">' +
        row(sel('plate_country', 'Країна тягача', opt(COUNTRIES, 'UA')), sel('trailer_country', 'Країна причепа', opt(COUNTRIES, 'UA'))) + '</div></details>' +

      sec('3. Маршрут і дата') +
      row(sel('load_country', 'Звідки — країна *', opt(COUNTRIES, 'UA'), 'onchange="Rmpd.routeChanged()"'), fld('load_place', 'Місто завантаження *', 'maxlength="80" placeholder="Lviv"')) +
      '<div id="rmLoadAddr" style="display:none">' + row(fld('load_addr', 'Адреса завантаження в Польщі *', 'maxlength="80" placeholder="ul. Prosta 5"', 'Вулиця й номер будинку — PUESC вимагає точне місце старту.'), fld('load_zip', 'Індекс *', 'maxlength="6" placeholder="00-001" inputmode="numeric"')) + '</div>' +
      row(sel('unload_country', 'Куди — країна *', opt(COUNTRIES, 'PL'), 'onchange="Rmpd.routeChanged()"'), fld('unload_place', 'Місто розвантаження *', 'maxlength="80" placeholder="Warszawa"')) +
      '<div id="rmUnloadAddr" style="display:none">' + row(fld('unload_addr', 'Адреса розвантаження в Польщі *', 'maxlength="80" placeholder="ul. Polna 12"', 'Підставимо з адреси отримувача, якщо вона в Польщі.'), fld('unload_zip', 'Індекс *', 'maxlength="6" placeholder="00-001" inputmode="numeric"')) + '</div>' +
      '<div class="field-row"><div id="rmEntryWrap">' + fld('entry_point', 'Пункт вʼїзду в Польщу *', 'list="rmCross" maxlength="60" placeholder="Dorohusk"') + '</div>' +
        '<div id="rmExitWrap">' + fld('exit_point', 'Пункт виїзду з Польщі *', 'list="rmCross" maxlength="60" placeholder="Świecko"') + '</div></div>' +
      row(fld('start_date', 'Дата вʼїзду / початку *', 'type="date" min="' + today() + '" onchange="Rmpd.dateChanged()"'),
          fld('end_date', 'Дата завершення в Польщі', 'type="date" min="' + today() + '"', 'Підставили +3 дні — змініть за потреби. PUESC приймає дати не пізніше ніж через 9 днів від подачі.')) +
      '<div id="rmDates" class="text-sm" style="margin:-6px 0 10px"></div>' +
      '<div id="rmAuto" class="pchips" style="margin:-4px 0 1rem"></div>' +
      '<div id="rmPermit" style="display:none">' +
        row(sel('permit_type', 'Дозвіл *', opt(PERMIT, 'ecmt')), sel('permit_country', 'Країна видачі', opt(COUNTRIES, 'PL'))) +
        row(fld('permit_number', 'Номер дозволу *', 'maxlength="40"'), fld('permit_valid_to', 'Дійсний до', 'type="date"')) + '</div>' +

      sec('4. Вантаж') +
      '<label class="check-row"><input type="checkbox" id="rm-with_goods" checked onchange="Rmpd.goodsToggle()"> Рейс з вантажем (зніміть для порожнього рейсу)</label>' +
      '<div id="rmGoods">' +
        row(fld('cargo_desc', 'Що везете *', 'maxlength="160" placeholder="Meble / Furniture"'), fld('cmr_number', 'Номер CMR', 'maxlength="40" placeholder="якщо немає — залиште порожнім"')) +
        fld('cargo_weight_t', 'Вага, т', 'type="number" min="0" step="0.01" style="max-width:200px"') +
        partyBlock('sender', 'Відправник') + partyBlock('recipient', 'Отримувач') +
      '</div>' +

      '<div id="rmTeamOnly"' + (isSelf() ? ' style="display:none"' : '') + '>' +
      sec('5. Коли на кордоні й документи') +
      fld('border_eta', 'Коли авто буде на кордоні / почне рейс у Польщі', 'type="datetime-local" onchange="Rmpd.etaChanged()"', 'Необовʼязково, але допомагає нам встигнути: термінові заявки опрацьовуємо першими.') +
      '<div id="rmTiming"></div>' +
      '<div class="field"><label class="label" for="rm-doc-tech">Техпаспорт тягача й причепа</label><div id="rmTechSaved" class="hint" style="margin:0 0 6px"></div>' +
        '<input class="input" type="file" id="rm-doc-tech" accept="image/*,application/pdf" multiple onchange="Rmpd.docsChanged()"></div>' +
      '<div class="field"><label class="label" for="rm-doc-cmr">CMR / накладна</label>' +
        '<input class="input" type="file" id="rm-doc-cmr" accept="image/*,application/pdf" multiple onchange="Rmpd.docsChanged()"></div>' +
      '<p class="hint" id="rmDocsHint" style="margin:-6px 0 1rem">Фото документів — за бажанням, але оператор звірить з ними номери, назви й адреси до подачі. Так помилки ловляться до кордону, а не на ньому. Техпаспорт запамʼятаємо для цього авто.</p>' +
      '</div>' +

      '<details id="rmMore" style="margin:1rem 0"><summary class="text-sm" style="cursor:pointer;color:var(--blue)">Додатково: водій, коментар, ручні налаштування</summary><div style="margin-top:12px">' +
        row(fld('driver_first', 'Імʼя водія', 'maxlength="60"'), fld('driver_last', 'Прізвище водія', 'maxlength="60"')) +
        fld('driver_phone', 'Телефон водія', 'maxlength="20" inputmode="tel" placeholder="+380…"', 'Щоб оператор міг швидко уточнити дані.') +
        row(sel('trip_type', 'Тип перевезення', opt(TRIP, '', 'Автоматично')), sel('direction', 'Напрямок (дозвіл)', opt(DIR, '', 'Автоматично'))) +
        row(fld('prev_rmpd', 'Попередній номер RMPD', 'maxlength="40"', 'Для зворотного рейсу підставляємо самі.'), fld('contact_email', 'Email для копії заявки', 'type="email" maxlength="120"', 'За замовчуванням — email перевізника.')) +
        '<div class="field"><label class="label" for="rm-client_note">Коментар оператору</label><textarea class="input" id="rm-client_note" maxlength="600" style="min-height:64px" placeholder="Напр.: два розвантаження в Польщі"></textarea></div>' +
      '</div></details>' +

      (isSelf()
        ? '<label class="check-row"><input type="checkbox" id="rm-agree"' + (store('agree_self') ? ' checked' : '') + '> Дані відповідають документам (CMR, техпаспорт). Заявку в PUESC подаю самостійно зі свого акаунта; за дані й подачу відповідаю сам. ' + uah((st.acc || {}).price_self) + ' списується одразу — за перевірку й підготовку даних.</label>'
        : '<label class="check-row"><input type="checkbox" id="rm-agree"' + (store('agree') ? ' checked' : '') + '> Дані відповідають документам (CMR, техпаспорт). Доручаю МитнийБрокер подати заявку RMPD в PUESC від імені перевізника; відповідальність за достовірність даних несе перевізник.</label>') +
      '<div class="msg" id="rmMsg"></div>' +
      '<button class="btn btn-primary btn-block" id="rmBtn" onclick="Rmpd.submit()">' + (st.parent ? (isSelf() ? 'Отримати оновлені дані' : 'Надіслати оновлення') : st.editId ? 'Зберегти' + (isSelf() ? '' : ' й надіслати') : isSelf() ? 'Перевірити й отримати дані для PUESC' : 'Надіслати заявку') + '</button></div>';

    bind(); prefill(); routeChanged();
  }

  function bind(){
    LATIN.forEach(f => { const e = $('rm-' + f); if (e) e.addEventListener('blur', () => { e.value = translit(e.value).replace(/\s{2,}/g, ' ').trim(); }); });
    ['plate','trailer_plate'].forEach(f => $('rm-' + f).addEventListener('blur', e => { e.target.value = normPlate(e.target.value); }));
    ['entry_point','exit_point'].forEach(f => $('rm-' + f).addEventListener('blur', e => { const x = normCross(e.target.value); if (x !== e.target.value){ e.target.value = x; routeChanged(); } }));
    $('rm-gps_id').addEventListener('blur', e => { e.target.value = normGps(e.target.value); });
    $('rm-plate').addEventListener('change', () => { const x = vehicleOptions().find(o => o.plate === normPlate(v('plate'))); if (x) applyVehicle(x); });
    ['load_country','unload_country','load_place','unload_place','entry_point','exit_point','start_date'].forEach(f => $('rm-' + f).addEventListener('change', routeChanged));
    ['start_date','end_date'].forEach(f => { $('rm-' + f).addEventListener('change', datesSummary); $('rm-' + f).addEventListener('input', datesSummary); });
    ['sender','recipient'].forEach(idHint);
  }

  function setVals(o){
    Object.entries(o).forEach(([k, val]) => set(k, val));
    if ('with_goods' in o){ $('rm-with_goods').checked = !!o.with_goods; goodsToggle(); }
  }

  function prefill(){
    const self = selfCarrier();
    if (isCarrier()){
      if (self) setVals(self.data);
      else setVals({ carrier_name: translit(st.broker.name || ''), carrier_email: st.broker.email || '', carrier_city: translit(st.broker.city || '') });
    }
    if (st.editId || st.parent) return;
    const last = st.list.find(r => r.status !== 'cancelled');
    if (last) setVals({ entry_point: last.entry_point, exit_point: last.exit_point });
    if (isCarrier()){
      const vs = vehicleOptions(), x = (last && vs.find(o => o.plate === last.plate)) || (vs.length === 1 ? vs[0] : null);
      if (x){ if ($('rm-pick-veh')) $('rm-pick-veh').value = x.plate; applyVehicle(x); }
    }
    set('start_date', addDays(today(), 1));
    dateChanged();
  }

  function goodsToggle(){ $('rmGoods').style.display = $('rm-with_goods').checked ? '' : 'none'; }
  const wd = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('uk-UA', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  function datesSummary(){ const e = $('rmDates'); if (e) e.innerHTML = '📅 Вʼїзд: <strong>' + wd(v('start_date')) + '</strong> · завершення: <strong>' + wd(v('end_date')) + '</strong>'; }
  function dateChanged(){ const s = v('start_date'); if (s && (!v('end_date') || v('end_date') < s)){ const e = addDays(s, 3), lim = addDays(today(), 9); set('end_date', e > lim && s <= lim ? lim : e); } datesSummary(); routeChanged(); timing(); }

  function routeChanged(){
    const r = readRaw(), d = derive(r);
    $('rmEntryWrap').style.display = d.needEntry ? '' : 'none';
    $('rmExitWrap').style.display = d.needExit ? '' : 'none';
    $('rmLoadAddr').style.display = d.needEntry ? 'none' : '';
    $('rmUnloadAddr').style.display = d.needExit ? 'none' : '';
    plFill();
    const trip = r.trip_type || d.trip, noPermit = r.carrier_country === 'UA' && ['bilateral','transit'].includes(trip);
    $('rmPermit').style.display = trip && !noPermit && trip !== 'cabotage' ? '' : 'none';
    if (!$('rm-sender_country').dataset.touched && r.load_country) set('sender_country', r.load_country);
    if (!$('rm-recipient_country').dataset.touched && r.unload_country) set('recipient_country', r.unload_country);
    const chips = [];
    if (trip) chips.push('<span class="chip" style="cursor:default">' + (trip === 'cabotage' ? '⛔ ' : '✓ ') + esc(TRIP[trip]) + '</span>');
    if (trip && trip !== 'cabotage') chips.push('<span class="chip" style="cursor:default">✓ ' + (noPermit ? 'Без дозволу (Угода ЄС–Україна)' : 'Потрібен дозвіл') + '</span>');
    const dir = r.direction || d.direction;
    chips.push('<span class="chip" style="cursor:default">✓ ' + (dir === 'back' ? 'Зворотний рейс' : 'Рейс туди') + '</span>');
    const prev = dir === 'back' && r.plate ? (v('prev_rmpd') || prevRmpdFor(r.plate)) : '';
    if (prev){ if (!v('prev_rmpd')) set('prev_rmpd', prev); chips.push('<span class="chip" style="cursor:default">✓ Попередня RMPD ' + esc(prev) + '</span>'); }
    $('rmAuto').innerHTML = chips.join('') + '<span class="text-xs text-muted" style="align-self:center">визначено автоматично</span>';
    ['sender','recipient'].forEach(idHint);
  }

  /* Порожні поля адреси в Польщі заповнюємо адресою відправника / отримувача, якщо вони в Польщі */
  function plFill(){
    [['load','sender'],['unload','recipient']].forEach(([k, p]) => {
      if (v(p + '_country') !== 'PL' || !$('rm-' + k + '_addr')) return;
      if (!v(k + '_addr') && v(p + '_address')) set(k + '_addr', v(p + '_address'));
      if (!v(k + '_zip') && v(p + '_postcode')) set(k + '_zip', v(p + '_postcode'));
    });
  }
  function idHint(side){
    const c = v(side + '_country'), h = $('rm-' + side + '_id-hint'); if (!h) return;
    $('rm-' + side + '_id').placeholder = c === 'PL' ? 'NIP або номер KRS' : EU.includes(c) ? 'VAT, напр. ' + (c === 'GR' ? 'EL' : c) + '123456789' : c === 'UA' ? 'ЄДРПОУ' : 'Код компанії';
    if (h.dataset.busy || h.dataset.result === c) return;
    delete h.dataset.result;
    h.textContent = c === 'PL' ? 'NIP або номер KRS (0000…) → «Знайти»: назву й адресу заповнимо з держреєстру.'
      : EU.includes(c) ? 'Введіть код і натисніть «Знайти» — назву й адресу заповнимо з держреєстру.'
      : c === 'UA' ? 'Для українських компаній автоматично знаходимо лише ліцензованих перевізників; інші — заповніть вручну.' : '';
  }

  async function lookupParty(side){
    const c = v(side + '_country'), code = v(side + '_id').toUpperCase().replace(/[\s\-.]/g, ''); if (!code) return;
    const h = $('rm-' + side + '_id-hint'); h.dataset.busy = '1'; h.textContent = 'Шукаємо…';
    const type = c === 'PL' ? 'pl' : EU.includes(c) ? 'vat' : c === 'UA' ? 'ua' : null;
    if (!type){ h.textContent = 'Для цієї країни автозаповнення немає — заповніть вручну.'; delete h.dataset.busy; return; }
    const r = await rmpdLookup(type, code, c === 'GR' ? 'EL' : c);
    delete h.dataset.busy; h.dataset.result = c;
    if (r.found){
      setVals({ [side + '_name']: translit(r.name), [side + '_city']: r.city || v(side + '_city'), [side + '_postcode']: r.postcode || v(side + '_postcode'), [side + '_address']: r.street || v(side + '_address') });
      if (r.source === 'krs' && r.nip) setVals({ [side + '_id']: r.nip, [side + '_id_type']: 'NIP' });
      const W = { likwidacja: 'фірма в ліквідації', no_address: 'у KRS немає адреси — впишіть фактичну вручну', deleted: 'фірму викреслено з KRS' };
      const warn = (r.warn || []).map(x => W[x]).filter(Boolean);
      h.innerHTML = '<span style="color:var(--green)">✓ Знайдено в ' + (r.source === 'krs' ? 'KRS' + (r.nip ? ' (NIP ' + esc(r.nip) + ')' : '') : 'реєстрі') + (r.vat && r.vat !== 'Czynny' ? ' · статус VAT: ' + esc(r.vat) : '') + '</span>' +
        (warn.length ? ' <span style="color:var(--amber)">⚠ ' + esc(warn.join('; ')) + '</span>' : '');
    } else h.innerHTML = '<span style="color:var(--amber)">' + (r.note === 'unavailable' ? 'Реєстр зараз не відповідає — спробуйте ще раз або заповніть вручну.'
      : r.note === 'invalid' ? 'Код недійсний або не знайдений — перевірте цифри' + (type === 'vat' ? ' (EU VAT — з префіксом країни, напр. DE123456789)' : '') + '.'
      : c === 'PL' && !/^00/.test(code) ? 'За NIP не знайшли — фірма може не бути платником VAT. Спробуйте її номер KRS (0000…) або заповніть вручну.'
      : type === 'ua' ? 'Серед ліцензованих перевізників не знайшли — для звичайних компаній заповніть назву й адресу вручну.' : 'Не знайшли в реєстрі — заповніть вручну.') + '</span>';
  }

  async function lookupCarrier(){
    const code = v('carrier_code').replace(/\D/g, ''), h = $('rm-carrier_code-hint');
    if (!/^(\d{8}|\d{10})$/.test(code)){ if (h) h.innerHTML = '<span style="color:var(--amber)">ЄДРПОУ — 8 цифр, ІПН — 10 цифр.</span>'; return; }
    if (h) h.textContent = 'Шукаємо в реєстрі перевізників…';
    const r = await rmpdLookup('ua', code);
    const box = $('rmLicense');
    if (r.found){
      set('carrier_name', translit(r.name).replace(/^([A-Za-z]{2,5})\s*"/, '$1 "'));
      st.license = r.license;
      if (h) h.innerHTML = '<span style="color:var(--green)">✓ ' + esc(r.name) + ' · ліцензія ' + esc(r.license ? r.license.status : '—') + (r.license && r.license.intl_cargo ? ', міжнародні вантажні ✓' : '') + '</span> Адресу впишіть один раз — у реєстрі її немає.';
      const bad = r.license && (r.license.status !== 'Чинна' || !r.license.intl_cargo);
      box.innerHTML = bad ? '<div class="msg msg-err show" style="margin:-4px 0 1rem">Увага: ліцензія ' + (r.license.status !== 'Чинна' ? '— статус «' + esc(r.license.status) + '»' : 'не включає міжнародні вантажні перевезення') + '. Без чинної ліцензії на міжнародні перевезення в’їзд можуть не дозволити.</div>' : '';
    } else { if (h) h.innerHTML = '<span style="color:var(--amber)">' + (r.note === 'unavailable' ? 'Реєстр зараз не відповідає — спробуйте ще раз.' : 'У реєстрі ліцензованих перевізників цього коду немає — перевірте ЄДРПОУ. Без ліцензії на міжнародні перевезення вʼїзд можуть не дозволити.') + '</span>'; box.innerHTML = ''; }
  }

  function pickCarrier(id){ const c = st.contacts.find(x => x.id === id); if (c){ setVals(c.data); routeChanged(); } }
  function editCarrier(){ st.carrierEdit = true; const keep = readRaw(); $('rmCarrier').innerHTML = carrierBlock(); setVals(selfCarrier().data); bind(); setVals(keep); }
  function pickParty(side, id){
    const c = st.contacts.find(x => x.id === id); if (!c) return;
    setVals({ [side + '_name']: c.data.name, [side + '_country']: c.data.country, [side + '_id']: c.data.id, [side + '_city']: c.data.city, [side + '_postcode']: c.data.postcode, [side + '_address']: c.data.address });
  }
  function applyVehicle(x){
    st.vehDocs = (x.docs || []).filter(d => d.kind === 'tech'); techSavedHint();
    setVals({ plate: x.plate, trailer_plate: x.trailer_plate || '', gps_id: x.gps_id || '', plate_country: x.plate_country || 'UA', trailer_country: x.trailer_country || 'UA', vehicle_id: x.vehicle_id || '' });
    if (x.driver_first && !v('driver_first')) setVals({ driver_first: x.driver_first, driver_last: x.driver_last, driver_phone: x.driver_phone });
    routeChanged();
  }
  function pickVehicle(plate){ const x = vehicleOptions().find(o => o.plate === plate); if (x) applyVehicle(x); else { st.vehDocs = []; techSavedHint(); setVals({ plate: '', trailer_plate: '', gps_id: '', vehicle_id: '' }); } }
  function techSavedHint(){
    const e = $('rmTechSaved'); if (!e) return;
    const kept = st.keepDocs.filter(d => d.kind === 'tech').length, saved = st.vehDocs.length;
    e.innerHTML = kept ? '✓ Уже додано до заявки: ' + kept + ' ' + plural(kept, 'файл', 'файли', 'файлів') + '. Можна додати ще.'
      : saved ? '<span style="color:var(--green)">✓ Техпаспорт цього авто вже є (' + saved + ' ' + plural(saved, 'файл', 'файли', 'файлів') + ') — додамо до заявки автоматично.</span> Оберіть файли, лише якщо документ змінився.' : '';
  }
  function docsChanged(){
    const n = ['tech','cmr'].reduce((a, k) => a + (($('rm-doc-' + k) || {}).files || []).length, 0);
    $('rmDocsHint').innerHTML = n ? '📎 Обрано ' + n + ' ' + plural(n, 'файл', 'файли', 'файлів') + ' — завантажимо разом із заявкою.' : $('rmDocsHint').innerHTML;
  }
  function timing(){
    const box = $('rmTiming'); if (!box) return { urgent: false, eta: null };
    const raw = v('border_eta'), eta = raw ? new Date(raw) : null, start = v('start_date');
    const hours = eta ? (eta - Date.now()) / 36e5 : null;
    const urgent = (hours !== null && hours <= 6) || start === today();
    let msg = '', cls = '';
    if (eta && hours < 0){ msg = 'Цей час уже минув — перевірте дату й годину.'; cls = 'msg-err'; }
    else if (eta){
      const opensIn = offHours() ? ((kyivHour() >= OP_TO ? 24 - kyivHour() + OP_FROM : OP_FROM - kyivHour())) : 0;
      if (opensIn && hours < opensIn + 1){ msg = '⛔ Оператор почне роботу о ' + OP_FROM + ':00 за Києвом — до кордону можемо не встигнути. Подайте заявку самостійно на puesc.gov.pl або змініть час.'; cls = 'msg-err'; }
      else if (hours < 2){ msg = '⚠️ До кордону менше 2 годин. Після відправки зателефонуйте оператору: +38 093 110 46 62.'; cls = 'msg-err'; }
      else if (urgent){ msg = '🔥 Позначимо як термінову — опрацюємо в першу чергу.'; cls = 'msg-ok'; }
    } else if (start === today()){ msg = '🔥 Вʼїзд сьогодні — позначимо як термінову. Вкажіть годину, щоб ми точно встигли.'; cls = 'msg-ok'; }
    box.innerHTML = msg ? '<div class="msg show ' + cls + '" style="margin:-6px 0 1rem">' + esc(msg) + '</div>' : '';
    return { urgent, eta, hours, blocked: cls === 'msg-err' && /⛔|минув/.test(msg) };
  }
  function etaChanged(){
    const raw = v('border_eta'); if (raw){ const d = raw.slice(0, 10); if (d >= today() && d !== v('start_date')){ set('start_date', d); dateChanged(); } }
    timing();
  }

  /* ---------- Збір, перевірка, відправка ---------- */
  const ALL = ['carrier_code','carrier_name','carrier_country','carrier_city','carrier_postcode','carrier_street','carrier_building','carrier_email',
    'vehicle_id','plate','trailer_plate','plate_country','trailer_country','gps_id','load_country','load_place','unload_country','unload_place',
    'entry_point','exit_point','load_addr','load_zip','unload_addr','unload_zip','start_date','end_date','permit_type','permit_country','permit_number','permit_valid_to','cargo_desc','cmr_number','cargo_weight_t',
    'sender_country','sender_id','sender_name','sender_city','sender_postcode','sender_address',
    'recipient_country','recipient_id','recipient_name','recipient_city','recipient_postcode','recipient_address',
    'driver_first','driver_last','driver_phone','trip_type','direction','prev_rmpd','contact_email','client_note'];
  function readRaw(){ const r = {}; ALL.forEach(f => { r[f] = v(f) || null; }); r.with_goods = $('rm-with_goods') ? $('rm-with_goods').checked : true; return r; }

  function read(){
    const r = readRaw(), d = derive(r);
    r.plate = normPlate(r.plate); r.trailer_plate = r.trailer_plate ? normPlate(r.trailer_plate) : null; r.gps_id = r.gps_id ? normGps(r.gps_id) : null;
    LATIN.forEach(f => { if (r[f]) r[f] = translit(r[f]).replace(/\s{2,}/g, ' ').trim(); });
    r.carrier_code = r.carrier_code ? r.carrier_code.replace(/\D/g, '') : null;
    r.carrier_id_type = 'INNY';
    r.trip_type = r.trip_type || d.trip;
    r.direction = r.direction || d.direction;
    const noPermit = r.carrier_country === 'UA' && ['bilateral','transit'].includes(r.trip_type);
    if (noPermit){ r.permit_type = 'eu_ua'; r.permit_number = null; r.permit_country = null; r.permit_valid_to = null; }
    r.entry_point = normCross(r.entry_point); r.exit_point = normCross(r.exit_point);
    if (!d.needEntry) r.entry_point = null;
    if (!d.needExit) r.exit_point = null;
    r.start_place = d.needEntry ? r.entry_point : r.load_place;
    r.end_place = d.needExit ? r.exit_point : r.unload_place;
    const plA = (city, zip, addr) => ({ city, zip: normZip(zip), ...splitAddr(addr), src:'addr' });
    if (!r.load_addr && r.with_goods && r.sender_country === 'PL'){ r.load_addr = r.sender_address; r.load_zip = r.load_zip || r.sender_postcode; }
    if (!r.unload_addr && r.with_goods && r.recipient_country === 'PL'){ r.unload_addr = r.recipient_address; r.unload_zip = r.unload_zip || r.recipient_postcode; }
    r.start_addr = d.needEntry ? (placeOf(r.entry_point) || (r.entry_point ? { city: r.entry_point, src:'cross' } : null)) : plA(r.load_place, r.load_zip, r.load_addr);
    r.end_addr = d.needExit ? (placeOf(r.exit_point) || (r.exit_point ? { city: r.exit_point, src:'cross' } : null)) : plA(r.unload_place, r.unload_zip, r.unload_addr);
    r.carrier_address = [r.carrier_street, r.carrier_building].filter(Boolean).join(' ') + ', ' + [r.carrier_postcode, r.carrier_city].filter(Boolean).join(' ');
    r.contact_email = r.contact_email || r.carrier_email;
    r.cargo_weight_t = r.cargo_weight_t ? Number(r.cargo_weight_t) : null;
    r.cmr_type = 'CMR'; r.cmr_number = r.with_goods ? (r.cmr_number || 'BRAK') : null;
    if (r.with_goods){
      ['sender','recipient'].forEach(s => {
        const c = r[s + '_country'], id = (r[s + '_id'] || '').toUpperCase().replace(/[\s\-.]/g, '');
        r[s + '_id'] = id || null;
        r[s + '_id_type'] = !id ? null : c === 'PL' ? 'NIP' : EU.includes(c) ? 'VAT' : 'INNY';
      });
    } else {
      ['cargo_desc','cargo_weight_t','sender_name','sender_country','sender_address','sender_id','sender_id_type','sender_city','sender_postcode',
       'recipient_name','recipient_country','recipient_address','recipient_id','recipient_id_type','recipient_city','recipient_postcode'].forEach(f => r[f] = null);
    }
    if (!r.trailer_plate) r.trailer_country = null;
    if (r.vehicle_id === '') r.vehicle_id = null;
    return r;
  }

  function validate(r){
    const d = derive(r), miss = [], bad = [], msgs = [];
    const need = (f, l) => { if (!r[f]) { miss.push(l); bad.push(f); } };
    ['carrier_code:ЄДРПОУ перевізника','carrier_name:назва перевізника','carrier_city:місто перевізника','carrier_postcode:індекс перевізника','carrier_street:вулиця перевізника','carrier_email:email перевізника',
     'plate:номер тягача','gps_id:номер локатора GPS','load_place:місто завантаження','unload_place:місто розвантаження','start_date:дата'].forEach(x => { const [f, l] = x.split(':'); need(f, l); });
    if (d.needEntry) need('entry_point', 'пункт вʼїзду');
    if (d.needExit) need('exit_point', 'пункт виїзду');
    if (!d.needEntry){ need('load_addr', 'адреса завантаження в Польщі'); need('load_zip', 'індекс завантаження'); }
    if (!d.needExit){ need('unload_addr', 'адреса розвантаження в Польщі'); need('unload_zip', 'індекс розвантаження'); }
    if (r.with_goods){ need('cargo_desc', 'що везете'); need('sender_name', 'відправник'); need('sender_city', 'місто відправника'); need('recipient_name', 'отримувач'); need('recipient_city', 'місто отримувача'); }
    if (!['eu_ua'].includes(r.permit_type) && r.trip_type !== 'cabotage' && $('rmPermit').style.display !== 'none') need('permit_number', 'номер дозволу');
    if (miss.length) msgs.push('Заповніть: ' + miss.join(', ') + '.');
    if (r.trip_type === 'cabotage') { msgs.push('Завантаження й розвантаження в Польщі — це каботаж; для перевізника з-поза ЄС він заборонений без окремого дозволу ГІТД. Перевірте країни.'); bad.push('load_country','unload_country'); }
    if (r.plate && !/^[A-Z0-9]{4,10}$/.test(r.plate)){ msgs.push('Номер тягача — латинські літери й цифри, 4–10 символів.'); bad.push('plate'); }
    if (r.trailer_plate && !/^[A-Z0-9]{4,10}$/.test(r.trailer_plate)){ msgs.push('Номер причепа — латинські літери й цифри.'); bad.push('trailer_plate'); }
    if (r.trailer_plate && r.trailer_plate === r.plate){ msgs.push('Номер причепа збігається з тягачем.'); bad.push('trailer_plate'); }
    if (r.carrier_code && !/^(\d{8}|\d{10})$/.test(r.carrier_code)){ msgs.push('ЄДРПОУ — 8 цифр, ІПН — 10 цифр.'); bad.push('carrier_code'); }
    if (r.carrier_email && !isValidEmail(r.carrier_email)){ msgs.push('Перевірте email перевізника.'); bad.push('carrier_email'); }
    if (r.contact_email && !isValidEmail(r.contact_email)){ msgs.push('Перевірте email для копії.'); bad.push('contact_email'); }
    if (r.start_date && r.start_date < today()){ msgs.push('Дата не може бути в минулому.'); bad.push('start_date'); }
    if (r.end_date && r.start_date && r.end_date < r.start_date){ msgs.push('Дата завершення раніше за дату початку.'); bad.push('end_date'); }
    if (r.end_date && r.start_date && (new Date(r.end_date) - new Date(r.start_date)) / 864e5 > 10){ msgs.push('Між датою початку й завершення — не більше 10 днів.'); bad.push('end_date'); }
    [['load', !d.needEntry], ['unload', !d.needExit]].forEach(([k, on]) => { if (on && r[k + '_zip'] && !zipOk(normZip(r[k + '_zip']))){ msgs.push('Польський індекс — у форматі 00-000.'); bad.push(k + '_zip'); } });
    const lim = addDays(today(), 9), limT = lim.split('-').reverse().join('.');
    if (r.start_date && r.start_date > lim){ msgs.push('PUESC приймає заявку не раніше ніж за 9 днів до рейсу — подайте її ближче до дати (дата початку не пізніше ' + limT + ').'); bad.push('start_date'); }
    else if (r.end_date && r.end_date > lim){ msgs.push('Дата завершення — не пізніше ' + limT + ' (9 днів від сьогодні): так вимагає PUESC.'); bad.push('end_date'); }
    if (r.driver_phone && !isValidPhone(r.driver_phone)){ msgs.push('Перевірте телефон водія.'); bad.push('driver_phone'); }
    LATIN.forEach(f => { if (r[f] && notLatin(r[f])){ const l = document.querySelector('label[for="rm-' + f + '"]'); msgs.push('«' + (l ? l.textContent.replace(/\s*\*$/, '') : f) + '» — лише латиниця.'); bad.push(f); } });
    if (r.with_goods && r.sender_country === 'PL' && r.sender_id && !/^\d{10}$/.test(r.sender_id.replace(/^PL/, ''))){ msgs.push('NIP відправника — 10 цифр.'); bad.push('sender_id'); }
    if (r.with_goods && r.recipient_country === 'PL' && r.recipient_id && !/^\d{10}$/.test(r.recipient_id.replace(/^PL/, ''))){ msgs.push('NIP отримувача — 10 цифр.'); bad.push('recipient_id'); }
    ALL.forEach(f => { const e = $('rm-' + f); if (e) e.style.borderColor = bad.includes(f) ? 'var(--red)' : ''; });
    if (bad.some(f => ['driver_phone','contact_email','prev_rmpd','trip_type','direction'].includes(f))) $('rmMore').open = true;
    if (bad.some(f => f.startsWith('carrier_')) && $('rm-carrier_code') && $('rm-carrier_code').type === 'hidden') editCarrier();
    return msgs;
  }
  function gpsWarn(r){ return r.gps_id && (!GPS_RE.test(r.gps_id) || !gpsCheck(r.gps_id)); }
  function showMsg(t, ok){ const m = $('rmMsg'); m.className = 'msg show ' + (ok ? 'msg-ok' : 'msg-err'); m.innerHTML = t; }

  async function submit(){
    const r = read(), errs = validate(r);
    if (errs.length){ showMsg(errs.map(esc).join('<br>')); $('rmMsg').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (!$('rm-agree').checked){ showMsg(isSelf() ? 'Підтвердіть, що дані відповідають документам.' : 'Підтвердіть доручення й відповідність даних документам.'); return; }
    const self = isSelf();
    if (!st.editId && !st.parent && !(self ? st.acc.allowed_self : st.acc.allowed)){ showMsg('Недостатньо коштів на балансі для цього варіанту — поповніть баланс або оберіть інший.'); return; }
    if (gpsWarn(r) && !confirm('Номер локатора «' + r.gps_id + '» не проходить перевірку формату SENT (напр. Z17-AA00AA-3: літера, 2 цифри, 2 літери, 2 цифри, 2 літери, контрольна цифра). Найчастіше це помилка в одному символі — перевірте з договором оператора локатора. Все одно надіслати?')) return;
    const t = self ? { urgent: false, eta: null } : timing();
    if (t.eta && t.hours < 0){ showMsg('Час на кордоні вже минув — виправте дату й годину.'); return; }
    if (t.blocked && !confirm('Оператор може не встигнути подати заявку до вашого часу на кордоні. Все одно надіслати? (Безпечніше подати самостійно на puesc.gov.pl)')) return;
    store(self ? 'agree_self' : 'agree', '1');
    const btn = $('rmBtn'); btn.disabled = true; btn.textContent = 'Надсилаємо…';
    try{
      const files = { tech: [...(($('rm-doc-tech') || {}).files || [])], cmr: [...(($('rm-doc-cmr') || {}).files || [])] };
      if (files.tech.length || files.cmr.length) btn.textContent = 'Завантажуємо документи…';
      const newTech = files.tech.length ? await uploadRmpdDocs(files.tech, 'tech') : [];
      const newCmr = files.cmr.length ? await uploadRmpdDocs(files.cmr, 'cmr') : [];
      const techForVehicle = newTech.length ? newTech : st.vehDocs;
      const keep = st.keepDocs.filter(d => !(newTech.length && d.kind === 'tech'));
      const docs = [...keep, ...(keep.some(d => d.kind === 'tech') || newTech.length ? newTech : st.vehDocs), ...newCmr];
      r.docs = docs; r.urgent = t.urgent; r.border_eta = t.eta ? t.eta.toISOString() : null;
      r._techForVehicle = techForVehicle;
      btn.textContent = 'Визначаємо координати…';
      [r.start_addr, r.end_addr] = await Promise.all([geocode(r.start_addr), geocode(r.end_addr)]);
      btn.textContent = 'Надсилаємо…';
      const row = { ...r }; delete row._techForVehicle; ADDR_F.forEach(f => delete row[f]);
      const saved = st.editId ? await saveRmpd(row, st.editId)
        : await saveRmpd({ ...row, owner_id: st.broker.id, kind: st.parent ? 'update' : 'new', parent_id: st.parent ? st.parent.id : null, prev_rmpd: r.prev_rmpd || (st.parent ? st.parent.ref_number : null), mode: modeOf() });
      saveContacts(r).catch(e => console.error(e));
      const i = st.list.findIndex(x => x.id === saved.id); if (i >= 0) st.list[i] = saved; else st.list.unshift(saved);
      st.editId = null; st.parent = null; st.carrierEdit = false; st.keepDocs = [];
      track('rmpd_submit', { id: saved.id, test: !!saved.is_test, kind: saved.kind, mode: saved.mode, value: Number(saved.price) || 0, role: st.broker.kind || 'broker' });
      await refreshAccess(); renderForm(); renderList(); badge();
      if (saved.mode === 'self'){ openSheet(saved.id); showToast('Дані перевірено — переносьте в PUESC'); return; }
      showToast('Заявку прийнято — номер RMPD прийде в кабінет і Telegram');
      $('rmList').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }catch(e){ showMsg(esc(e.message)); btn.disabled = false; btn.textContent = 'Надіслати заявку'; }
  }

  async function saveContacts(r){
    const carrier = {}; CARRIER_F.forEach(f => carrier[f] = r[f]);
    await upsertContact('carrier', r.carrier_name, carrier, c => c.data.carrier_code === r.carrier_code || (isCarrier() && c === selfCarrier()));
    await upsertContact('vehicle', r.plate + (r.trailer_plate ? ' / ' + r.trailer_plate : ''),
      { plate: r.plate, trailer_plate: r.trailer_plate, plate_country: r.plate_country, trailer_country: r.trailer_country, gps_id: r.gps_id, vehicle_id: r.vehicle_id,
        driver_first: r.driver_first, driver_last: r.driver_last, driver_phone: r.driver_phone, carrier_code: r.carrier_code, docs: r._techForVehicle || [] }, c => c.data.plate === r.plate);
    if (r.with_goods) for (const s of ['sender','recipient']){
      const d = { name: r[s + '_name'], country: r[s + '_country'], id: r[s + '_id'], city: r[s + '_city'], postcode: r[s + '_postcode'], address: r[s + '_address'] };
      await upsertContact('party', d.name, d, c => (d.id && c.data.id === d.id) || c.label.toLowerCase() === String(d.name).toLowerCase());
    }
  }

  /* ---------- «Подаю сам»: дані в порядку полів PUESC ---------- */
  const P_TRIP = { bilateral:'dwustronny', transit:'tranzyt', third:'z/do państwa trzeciego', cabotage:'kabotaż' };
  const P_PERMIT = { eu_ua:'bez zezwolenia — umowa UE–Ukraina', bilateral:'zezwolenie dwustronne', transit:'zezwolenie tranzytowe', third:'zezwolenie na przewóz z/do państwa trzeciego', ecmt:'zezwolenie EKMT (CEMT)', other:'inne zezwolenie' };
  const P_DIR = { there:'tam', back:'powrót' };
  const P_IDT = { NIP:'NIP', VAT:'VAT UE', INNY:'INNY', DOK:'dokument tożsamości' };
  function pRow(label, val){
    if (val === null || val === undefined || val === '') return '';
    const t = String(val);
    return '<div class="svc-line" style="padding:8px 12px;margin-bottom:4px;cursor:pointer;gap:10px" onclick="Rmpd.copyEl(this)" data-v="' + esc(t) + '">' +
      '<span class="text-xs text-muted">' + label + '</span><span class="text-sm" style="text-align:right;word-break:break-word">' + esc(t) + ' <i class="ti ti-copy" style="opacity:.5"></i></span></div>';
  }
  /* Рядки розділів 3.7/3.8 PUESC: країна PL, місто, індекс, вулиця, будинок, воєводство, координати */
  function placeRows(a, fallback, row){
    a = a || placeOf(fallback) || (fallback ? { city: fallback } : null);
    if (!a) return [];
    return [row('Kraj', 'PL'), row('Miejscowość', a.city), row('Kod pocztowy', a.zip), row('Ulica', a.street || 'NONE'), row('Nr budynku', a.bld || 'NONE'), row('Nr lokalu', a.apt),
      row('Województwo', a.prov), row('Szerokość (lat)', a.lat != null ? Number(a.lat).toFixed(6) : ''), row('Długość (lon)', a.lon != null ? Number(a.lon).toFixed(6) : '')];
  }
  function puescSections(r){
    const d = x => x ? x.split('-').reverse().join('.') : '';
    const sec2 = (t, rows) => { const h = rows.join(''); return h ? '<div class="card-title" style="margin:14px 0 6px">' + t + '</div>' + h : ''; };
    const party = p => [pRow('Typ identyfikatora', P_IDT[r[p + '_id_type']] || r[p + '_id_type']), pRow('Numer identyfikatora', r[p + '_id']), pRow('Nazwa', r[p + '_name']),
      pRow('Kraj', r[p + '_country']), pRow('Miejscowość', r[p + '_city']), pRow('Kod pocztowy', r[p + '_postcode']), pRow('Ulica, nr', r[p + '_address'])];
    return [
      sec2('1. Przewoźnik', [pRow('Typ identyfikatora', r.carrier_id_type || 'INNY'), pRow('Numer', r.carrier_code), pRow('Nazwa', r.carrier_name), pRow('Kraj', r.carrier_country),
        pRow('Miejscowość', r.carrier_city), pRow('Kod pocztowy', r.carrier_postcode), pRow('Ulica', r.carrier_street), pRow('Nr budynku / lokalu', r.carrier_building)]),
      sec2('2. Pojazd', [pRow('Kraj rejestracji ciągnika', r.plate_country), pRow('Nr rej. ciągnika', r.plate), pRow('Kraj rejestracji naczepy', r.trailer_country), pRow('Nr rej. naczepy', r.trailer_plate),
        pRow('Nr lokalizatora', r.gps_id), pRow('E-mail przewoźnika', r.carrier_email)]),
      sec2('3.1 Daty', [pRow('Data rozpoczęcia', d(r.start_date)), pRow('Data zakończenia', d(r.end_date))]),
      sec2('3.2 Przewóz', [pRow('Kraj załadunku', r.load_country), pRow('Kraj rozładunku', r.unload_country), pRow('Przewóz z towarem', r.with_goods ? 'TAK' : 'NIE'),
        pRow('Dokument przewozowy', r.with_goods ? (r.cmr_type || 'CMR') : ''), pRow('Nr dokumentu', r.cmr_number), pRow('Rodzaj przewozu', P_TRIP[r.trip_type] || r.trip_type),
        pRow('Rodzaj zezwolenia', P_PERMIT[r.permit_type] || r.permit_type), pRow('Kraj wydania zezwolenia', r.permit_country), pRow('Nr zezwolenia', r.permit_number), pRow('Ważne do', d(r.permit_valid_to))]),
      sec2('3.6 Dane przejazdu', [pRow('Poprzedni nr RMPD', r.prev_rmpd), pRow('Kierunek', P_DIR[r.direction] || r.direction)]),
      sec2('3.7 Miejsce rozpoczęcia', placeRows(r.start_addr, r.start_place || r.entry_point, pRow)),
      sec2('3.8 Miejsce docelowe', placeRows(r.end_addr, r.end_place || r.exit_point, pRow)),
      r.with_goods ? sec2('4. Nadawca', party('sender')) : '',
      r.with_goods ? sec2('5. Odbiorca', party('recipient')) : '',
      sec2('7. E-mail do potwierdzenia', [pRow('E-mail', r.contact_email || r.carrier_email)])
    ].join('');
  }
  function openSheet(id){
    const r = find(id); if (!r) return;
    st.sheet = id;
    const w = $('rmFormWrap');
    const done = r.status === 'done';
    w.innerHTML = '<div class="card" id="rmSheet">' +
      '<div class="spread"><div class="card-title" style="margin:0">📋 ' + (r.kind === 'update' ? 'Оновлення — форма «RMPD – Aktualizacja»' : 'Дані для форми RMPD100') + ' · ' + esc(r.plate) + '</div>' +
        '<button class="btn-quiet" onclick="Rmpd.closeSheet()">Закрити</button></div>' +
      (done ? '' : '<ol class="text-sm" style="margin:12px 0 4px 18px;line-height:1.6">' +
        '<li>Увійдіть на <a href="' + PUESC + '" target="_blank" rel="noopener">puesc.gov.pl</a> зі свого акаунта (реєстрація безкоштовна).</li>' +
        '<li>Відкрийте форму <strong>' + (r.kind === 'update' ? 'RMPD – Aktualizacja' : 'RMPD100') + '</strong>.</li>' +
        '<li>Заповнюйте зверху вниз: натисніть на рядок нижче — значення скопіюється, вставте його в однойменне поле.</li>' +
        '<li>У розділі 8 поставте позначку про повноваження й впишіть своє імʼя.</li>' +
        '<li>Після відправки PUESC покаже номер RMPD — перевірте його у формі <strong>RMPD406</strong> і впишіть нижче.</li></ol>') +
      '<div style="margin:10px 0;display:flex;gap:6px;flex-wrap:wrap">' + ((typeof PuescFill !== "undefined") && r.kind !== 'update' ? '<button class="btn btn-primary btn-sm" onclick="Rmpd.fill(\'' + r.id + '\')">⚡ Автозаповнення PUESC</button>' : '') +
        '<button class="btn btn-ghost btn-sm" onclick="Rmpd.copyAll(\'' + r.id + '\')"><i class="ti ti-clipboard-text"></i> Скопіювати все текстом</button></div>' +
      ((typeof PuescFill !== "undefined") && r.kind !== 'update' ? PuescFill.howto() : '') +
      puescSections(r) +
      (done ? '<div class="msg msg-ok show" style="margin-top:14px">✓ Зареєстровано: <strong>' + esc(r.ref_number) + '</strong>' + (r.valid_until ? ' · діє до ' + fmtD(r.valid_until) : '') + '</div>'
        : '<div class="card-title" style="margin:16px 0 6px">Номер після реєстрації</div>' +
          '<div class="field"><input class="input" id="rmSelfRef" placeholder="Номер RMPD з PUESC" autocomplete="off" spellcheck="false" style="text-transform:uppercase"></div>' +
          '<label class="check-row"><input type="checkbox" id="rmSelf406"> Перевірив у RMPD406 — заявка з цим номером активна</label>' +
          '<div class="msg" id="rmSelfMsg"></div>' +
          '<button class="btn btn-primary btn-block" onclick="Rmpd.saveSelfRef(\'' + r.id + '\')">Зберегти номер</button>' +
          '<p class="hint" style="margin-top:8px">Після збереження номер буде в історії, а за день до кінця строку дії прийде нагадування в Telegram.</p>') +
      '</div>';
    w.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeSheet(){ st.sheet = null; renderForm(); }
  async function copyEl(el){ try{ await navigator.clipboard.writeText(el.dataset.v); showToast('Скопійовано: ' + el.dataset.v.slice(0, 60)); el.style.borderColor = 'var(--green)'; }catch(e){ showToast(el.dataset.v); } }
  async function fill(id){ const r = find(id); if (!r || !(typeof PuescFill !== "undefined")) return;
    showToast(await PuescFill.copy(r) ? 'Скопійовано — відкрийте форму RMPD100 на PUESC і натисніть закладку «MB → PUESC»' : 'Не вдалося скопіювати', 'info'); }
  async function copyAll(id){
    const r = find(id); if (!r) return;
    const tmp = document.createElement('div'); tmp.innerHTML = puescSections(r);
    const text = [...tmp.querySelectorAll('.card-title, .svc-line')].map(e => e.classList.contains('card-title') ? '\n' + e.textContent : e.querySelector('.text-xs').textContent + ': ' + e.dataset.v).join('\n').trim();
    try{ await navigator.clipboard.writeText(text); showToast('Усі дані скопійовано'); }catch(e){}
  }
  async function saveSelfRef(id){
    const ref = ($('rmSelfRef').value || '').trim().toUpperCase(), ok = $('rmSelf406').checked, m = $('rmSelfMsg');
    const err = t => { m.className = 'msg show msg-err'; m.textContent = t; };
    if (ref.length < 6) return err('Впишіть номер RMPD, який показав PUESC.');
    if (!ok) return err('Перевірте заявку у формі RMPD406 і поставте позначку.');
    try{
      const saved = await saveRmpd({ status: 'done', ref_number: ref, rmpd406_ok: true }, id);
      const i = st.list.findIndex(x => x.id === id); if (i >= 0) st.list[i] = saved;
      renderList(); openSheet(id); showToast('Номер збережено — гарної дороги!');
    }catch(e){ err(e.message); }
  }

  /* ---------- Список ---------- */
  function setFilter(f){ st.filter = f; render(); }
  function card(r){
    const s = r.mode === 'self' && ['new','needs_fix'].includes(r.status) ? { label: 'Чекає вашого номера', color: 'var(--amber)' } : (RMPD_STATUS[r.status] || RMPD_STATUS.new);
    const left = r.valid_until ? Math.ceil((new Date(r.valid_until) - new Date(today())) / 864e5) : null, expired = left !== null && left < 0;
    const route = [r.load_place && r.load_place + (r.load_country ? ' (' + r.load_country + ')' : ''), r.unload_place && r.unload_place + (r.unload_country ? ' (' + r.unload_country + ')' : '')].filter(Boolean).join(' → ');
    let a = '';
    if (r.mode === 'self' && r.status !== 'cancelled') a += '<button class="btn-quiet" onclick="Rmpd.openSheet(\'' + r.id + '\')">📋 ' + (r.status === 'done' ? 'Дані' : 'Дані для PUESC і номер') + '</button>';
    if (r.status === 'new' || r.status === 'needs_fix') a += '<button class="btn-quiet" onclick="Rmpd.edit(\'' + r.id + '\')">' + (r.status === 'needs_fix' ? '✏️ Виправити' : 'Редагувати') + '</button>';
    if (r.status === 'done' && !expired) a += '<button class="btn-quiet" onclick="Rmpd.update(\'' + r.id + '\')">Оновити заявку</button>';
    if (r.status === 'done' && r.direction !== 'back') a += '<button class="btn-quiet" onclick="Rmpd.back(\'' + r.id + '\')">↩ Зворотний рейс</button>';
    if (r.status !== 'cancelled' && (st.cmrPrice !== null || cmrOf(r.id))) a += '<button class="btn-quiet" onclick="Rmpd.cmr(\'' + r.id + '\')">📄 ' + (cmrOf(r.id) ? 'CMR' : 'Створити CMR') + '</button>';
    if (r.status !== 'cancelled' && window.Sent) a += '<button class="btn-quiet" onclick="Rmpd.sent(\'' + r.id + '\')">📦 SENT</button>';
    if (r.status !== 'cancelled' && window.Deleg && r.trip_type !== 'transit') a += '<button class="btn-quiet" onclick="Rmpd.deleg(\'' + r.id + '\')">👤 Відрядження</button>';
    a += '<button class="btn-quiet" onclick="Rmpd.repeat(\'' + r.id + '\')">Повторити</button>';
    if (r.status !== 'done' && r.status !== 'cancelled') a += '<button class="btn-quiet" onclick="Rmpd.cancel(\'' + r.id + '\')">Скасувати</button>';
    return '<div class="req"' + (r.status === 'needs_fix' ? ' style="border-color:rgba(241,101,75,.55)"' : '') + '><div class="spread" style="align-items:flex-start;gap:10px"><div style="min-width:0">' +
      '<div style="font-weight:600">' + esc(r.plate) + (r.trailer_plate ? ' / ' + esc(r.trailer_plate) : '') + ' · ' + esc(r.entry_point || r.exit_point || r.load_place || '') + ' · ' + fmtD(r.start_date) +
        (r.kind === 'update' ? ' <span class="badge badge-free">оновлення</span>' : '') + (r.direction === 'back' ? ' <span class="badge badge-free">зворотний</span>' : '') +
        (r.urgent && !['done','cancelled'].includes(r.status) ? ' <span class="badge" style="background:rgba(241,101,75,.15);color:var(--red)">🔥 терміново</span>' : '') +
        (r.is_test ? ' <span class="badge" style="background:rgba(245,166,35,.15);color:var(--amber)">🧪 тест</span>' : '') +
        (r.mode === 'self' ? ' <span class="badge badge-free">подаю сам</span>' : '') + '</div>' +
      '<div class="text-xs text-muted" style="margin-top:2px">' + (r.with_goods ? esc(r.cargo_desc || '') + (route ? ' · ' + esc(route) : '') : 'порожній рейс' + (route ? ' · ' + esc(route) : '')) +
        (!isCarrier() ? ' · ' + esc(r.carrier_name) : '') + (r.border_eta ? ' · на кордоні ' + fmtDT(r.border_eta) : '') + ((r.docs || []).length ? ' · 📎 ' + r.docs.length : '') + ' · подано ' + timeAgo(r.created_at) + '</div></div>' +
      '<span class="badge" style="background:transparent;border:.5px solid ' + s.color + ';color:' + s.color + '">' + s.label + '</span></div>' +
      (r.ref_number ? '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><div style="font-family:var(--display);font-size:18px;letter-spacing:.5px">' + esc(r.ref_number) + '</div>' +
        '<button class="btn-quiet" onclick="Rmpd.copy(this.dataset.v)" data-v="' + esc(r.ref_number) + '"><i class="ti ti-copy"></i> Копіювати</button>' +
        '<button class="btn-quiet" onclick="Rmpd.share(\'' + r.id + '\')"><i class="ti ti-send"></i> Водію</button>' +
        (r.valid_until ? '<span class="text-xs" style="color:' + (expired ? 'var(--red)' : left <= 2 ? 'var(--amber)' : 'var(--muted)') + '">' + (expired ? 'Термін дії минув ' + fmtD(r.valid_until) : 'Діє до ' + fmtD(r.valid_until) + ' · ще ' + left + ' ' + plural(left, 'день', 'дні', 'днів')) + '</span>' : '') + '</div>' : '') +
      (r.admin_note ? '<div class="rv-reply text-sm" style="margin-top:10px;white-space:pre-line">' + (r.status === 'needs_fix' ? '⚠️ ' : '💬 ') + esc(r.admin_note) + '</div>' : '') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' + a + '</div></div>';
  }
  function renderList(){
    const l = $('rmList'); if (!l) return;
    const list = st.list.filter(r => st.filter === 'all' || (st.filter === 'done' ? r.status === 'done' : !['done','cancelled'].includes(r.status)));
    l.innerHTML = list.length ? list.map(card).join('') : '<div class="empty"><strong>' + (st.filter === 'active' ? 'Активних заявок немає' : 'Заявок ще немає') + '</strong>' + (st.acc && st.acc.allowed ? 'Заповніть форму вище — номер RMPD прийде сюди й у Telegram.' : '') + '</div>';
  }

  const addrText = a => a && a.src === 'addr' ? [a.street !== 'NONE' ? a.street : '', a.bld !== 'NONE' ? a.bld + (a.apt ? '/' + a.apt : '') : ''].filter(Boolean).join(' ') : '';
  const copyFields = r => { const o = {}; ALL.forEach(f => o[f] = r[f] === undefined ? null : r[f]); o.with_goods = r.with_goods;
    o.load_addr = addrText(r.start_addr); o.load_zip = r.start_addr && r.start_addr.src === 'addr' ? r.start_addr.zip || '' : '';
    o.unload_addr = addrText(r.end_addr); o.unload_zip = r.end_addr && r.end_addr.src === 'addr' ? r.end_addr.zip || '' : ''; return o; };
  function openForm(data, src){
    st.keepDocs = src && (st.editId || st.parent) ? (src.docs || []) : [];
    renderTop(); renderForm(); setVals(data); routeChanged();
    if (src && st.editId && src.border_eta){ const d = new Date(src.border_eta); set('border_eta', new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16)); }
    techSavedHint(); timing(); datesSummary();
    if (data.driver_first || data.client_note) $('rmMore').open = true;
    $('rmForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const find = id => st.list.find(x => x.id === id);
  function needAccess(){ if (st.acc.allowed) return true; showToast(st.acc.reason === 'balance' ? 'Недостатньо коштів — поповніть баланс' : 'Подача зараз недоступна', 'error'); return false; }
  function edit(id){ const r = find(id); if (!r) return; st.editId = id; st.parent = null; openForm(copyFields(r), r); }
  function update(id){ const r = find(id); if (!r) return; st.parent = r; st.editId = null; openForm(copyFields(r), r); }
  function repeat(id){
    const r = find(id); if (!r || !needAccess()) return; st.editId = null; st.parent = null;
    const d = copyFields(r); d.start_date = addDays(today(), 1); d.end_date = addDays(d.start_date, 3); d.cmr_number = ''; d.client_note = ''; d.prev_rmpd = ''; d.trip_type = ''; d.direction = '';
    openForm(d);
  }
  function back(id){
    const r = find(id); if (!r || !needAccess()) return; st.editId = null; st.parent = null;
    const d = copyFields(r);
    Object.assign(d, { load_country: r.unload_country, load_place: r.unload_place, unload_country: r.load_country, unload_place: r.load_place,
      entry_point: r.exit_point, exit_point: r.entry_point, load_addr: d.unload_addr, load_zip: d.unload_zip, unload_addr: d.load_addr, unload_zip: d.load_zip, with_goods: false, cargo_desc: '', cmr_number: '', prev_rmpd: r.ref_number, trip_type: '', direction: '',
      start_date: r.end_date && r.end_date >= today() ? r.end_date : addDays(today(), 1), end_date: '', client_note: '' });
    ['sender','recipient'].forEach(s => ['name','country','id','city','postcode','address'].forEach(k => d[s + '_' + k] = ''));
    openForm(d); dateChanged();
    showToast('Зворотний рейс: маршрут розвернули, попередню RMPD підставили. Якщо везете вантаж — увімкніть «Рейс з вантажем».');
  }
  function reset(){ st.editId = null; st.parent = null; st.keepDocs = []; renderForm(); }
  async function cancel(id){
    if (!confirm('Скасувати заявку? Якщо її вже зареєстровано, оператор анулює її в PUESC.')) return;
    try{ await cancelRmpd(id); find(id).status = 'cancelled'; renderList(); badge(); showToast('Заявку скасовано'); }catch(e){ showToast(e.message, 'error'); }
  }
  async function copy(t){ try{ await navigator.clipboard.writeText(t); showToast('Номер скопійовано'); }catch(e){ showToast(t); } }
  async function share(id){
    const r = find(id); if (!r) return;
    const text = 'RMPD ' + r.ref_number + '\n' + r.plate + (r.trailer_plate ? ' / ' + r.trailer_plate : '') + ' · ' + (r.entry_point || r.load_place || '') + ' · ' + fmtD(r.start_date) +
      (r.valid_until ? '\nДіє до ' + fmtD(r.valid_until) : '') + '\nУвімкни геолокацію (' + (r.gps_id || 'локатор') + ') перед кордоном.';
    try{ if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); showToast('Текст для водія скопійовано'); } }catch(e){}
  }

  /* ---------- CMR ---------- */
  const cmrOf = rid => st.cmr.find(c => c.rmpd_id === rid);
  const joinA = (...p) => p.filter(x => x && String(x).trim()).join(', ');
  const CNAME = { UA:'Україна', PL:'Polska', DE:'Deutschland', CZ:'Česko', SK:'Slovensko', LT:'Lietuva', LV:'Latvija', EE:'Eesti', HU:'Magyarország', RO:'România', MD:'Moldova', NL:'Nederland', BE:'Belgique', FR:'France', IT:'Italia', AT:'Österreich', ES:'España', BG:'България', TR:'Türkiye' };
  const cc = c => c ? (CNAME[c] ? c + ' — ' + CNAME[c] : c) : '';
  function cmrDefaults(r){
    const party = p => ({ name: r[p + '_name'] || '', address: joinA(r[p + '_address'], [r[p + '_postcode'], r[p + '_city']].filter(Boolean).join(' '), cc(r[p + '_country'])) });
    const kg = r.cargo_weight_t ? String(Math.round(Number(r.cargo_weight_t) * 1000)) : '';
    return {
      number: r.cmr_number || '',
      sender: party('sender'), consignee: party('recipient'),
      delivery_place: joinA(r.unload_place, cc(r.unload_country)),
      taking_place: joinA(r.load_place, cc(r.load_country)), taking_date: r.start_date || '',
      docs: '', goods: [{ marks: '', packages: '', packing: '', nature: r.cargo_desc || '', stat: '', gross: kg, volume: '' }],
      instructions: '', payment: 'frei', cod: '',
      carrier: { name: r.carrier_name || '', address: joinA(r.carrier_address || joinA([r.carrier_street, r.carrier_building].filter(Boolean).join(' '), [r.carrier_postcode, r.carrier_city].filter(Boolean).join(' ')), cc(r.carrier_country)) },
      plate: r.plate || '', trailer: r.trailer_plate || '', successive: '', reservations: '', special: '',
      issue_place: r.load_place || '', issue_date: r.start_date || today()
    };
  }
  async function cmr(rid){
    const r = find(rid); if (!r) return;
    const ex = cmrOf(rid); let d = cmrDefaults(r);
    if (ex){ const full = await getCmr(ex.id); if (full) d = Object.assign(d, full.data || {}, { number: full.number || '' }); }
    st.cmrEdit = { rid, id: ex && ex.id };
    const w = $('rmFormWrap'); st.sheet = 'cmr';
    const f = (k, label, v, ph = '', area = false) => '<div class="field"><label class="label" for="cm-' + k + '">' + label + '</label>' +
      (area ? '<textarea class="input" rows="2" id="cm-' + k + '" placeholder="' + esc(ph) + '">' + esc(v || '') + '</textarea>' : '<input class="input" id="cm-' + k + '" value="' + esc(v || '') + '" placeholder="' + esc(ph) + '" autocomplete="off" spellcheck="false">') + '</div>';
    const g = d.goods || [{}];
    const goodsRow = (x, i) => '<div class="card card-tight" style="margin:0 0 8px"><div class="text-xs text-muted" style="margin-bottom:6px">Позиція ' + (i + 1) + '</div>' +
      f('g' + i + '_nature', '9 · Назва вантажу', x.nature, 'напр. Furniture / Meble') +
      row(f('g' + i + '_packages', '7 · Кількість місць', x.packages, '33'), f('g' + i + '_packing', '8 · Упаковка', x.packing, 'палети / pallets')) +
      row(f('g' + i + '_gross', '11 · Вага брутто, кг', x.gross, '20000'), f('g' + i + '_volume', '12 · Обʼєм, м³', x.volume, '')) +
      row(f('g' + i + '_marks', '6 · Знаки й номери', x.marks, ''), f('g' + i + '_stat', '10 · Код УКТЗЕД/HS', x.stat, '9403')) + '</div>';
    const paid = !ex && st.cmrPrice > 0 && !(st.acc && st.acc.test);
    w.innerHTML = '<div class="card" id="rmCmr"><div class="spread"><div class="card-title" style="margin:0">📄 CMR · ' + esc(r.plate) + '</div><button class="btn-quiet" onclick="Rmpd.closeSheet()">Закрити</button></div>' +
      '<p class="hint" style="margin:6px 0 12px">Ми підставили дані з заявки. Перевірте й допишіть упаковку та кількість місць — далі відкриється готова накладна на 3 примірники для друку або збереження в PDF. ' +
        (ex ? 'Правки цієї CMR — безкоштовно.' : paid ? 'Вартість — <strong>' + uah(st.cmrPrice) + '</strong> з балансу, наступні правки безкоштовні.' : '') + '</p>' +
      sec('Сторони') +
      f('sender_name', '1 · Відправник — назва', d.sender.name) + f('sender_address', 'Адреса відправника', d.sender.address, '', true) +
      f('consignee_name', '2 · Одержувач — назва', d.consignee.name) + f('consignee_address', 'Адреса одержувача', d.consignee.address, '', true) +
      f('carrier_name', '16 · Перевізник', d.carrier.name) + f('carrier_address', 'Адреса перевізника', d.carrier.address, '', true) +
      row(f('plate', 'Тягач', d.plate), f('trailer', 'Причіп', d.trailer)) +
      sec('Маршрут') +
      f('delivery_place', '3 · Місце розвантаження', d.delivery_place) +
      row(f('taking_place', '4 · Місце завантаження', d.taking_place), '<div class="field"><label class="label" for="cm-taking_date">Дата завантаження</label><input type="date" class="input" id="cm-taking_date" value="' + esc(d.taking_date || '') + '"></div>') +
      sec('Вантаж') + '<div id="cmGoods">' + g.map(goodsRow).join('') + '</div>' +
      (g.length < 4 ? '<button type="button" class="btn btn-ghost btn-sm" onclick="Rmpd.cmrAddGoods()">+ Ще позиція</button>' : '') +
      sec('Документи та умови') +
      f('docs', '5 · Додані документи', d.docs, 'Invoice №…, packing list, T1/EX…', true) +
      f('instructions', '13 · Вказівки відправника', d.instructions, 'митне оформлення в …, температура …', true) +
      row('<div class="field"><label class="label" for="cm-payment">14 · Оплата перевезення</label><select class="input" id="cm-payment"><option value="frei"' + (d.payment !== 'unfrei' ? ' selected' : '') + '>Frei — сплачує відправник</option><option value="unfrei"' + (d.payment === 'unfrei' ? ' selected' : '') + '>Unfrei — сплачує одержувач</option></select></div>',
        f('cod', '15 · Накладений платіж', d.cod, '')) +
      f('successive', '17 · Наступні перевізники', d.successive) +
      f('reservations', '18 · Застереження перевізника', d.reservations, '', true) +
      f('special', '19 · Особливі умови', d.special, '', true) +
      sec('Оформлення') +
      row(f('number', '№ CMR', d.number, 'необовʼязково'), f('issue_place', '21 · Місце складання', d.issue_place)) +
      '<div class="field"><label class="label" for="cm-issue_date">Дата складання</label><input type="date" class="input" id="cm-issue_date" value="' + esc(d.issue_date || '') + '"></div>' +
      '<div class="msg" id="cmMsg"></div>' +
      '<button class="btn btn-primary btn-block" id="cmSave" onclick="Rmpd.cmrSave()">' + (ex ? 'Зберегти й відкрити CMR' : paid ? 'Створити CMR · ' + uah(st.cmrPrice) : 'Створити CMR') + '</button>' +
      (ex ? '<a class="btn btn-ghost btn-block" style="margin-top:8px" href="/cmr?id=' + ex.id + '" target="_blank" rel="noopener">Відкрити без змін</a>' : '') + '</div>';
    st.cmrGoods = g.length;
    w.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function cmrAddGoods(){
    const box = $('cmGoods'); if (!box || st.cmrGoods >= 4) return;
    const i = st.cmrGoods++;
    const f = (k, label, ph = '') => '<div class="field"><label class="label" for="cm-' + k + '">' + label + '</label><input class="input" id="cm-' + k + '" placeholder="' + ph + '" autocomplete="off"></div>';
    box.insertAdjacentHTML('beforeend', '<div class="card card-tight" style="margin:0 0 8px"><div class="text-xs text-muted" style="margin-bottom:6px">Позиція ' + (i + 1) + '</div>' +
      f('g' + i + '_nature', '9 · Назва вантажу') + row(f('g' + i + '_packages', '7 · Кількість місць'), f('g' + i + '_packing', '8 · Упаковка')) +
      row(f('g' + i + '_gross', '11 · Вага брутто, кг'), f('g' + i + '_volume', '12 · Обʼєм, м³')) + row(f('g' + i + '_marks', '6 · Знаки й номери'), f('g' + i + '_stat', '10 · Код УКТЗЕД/HS')) + '</div>');
  }
  async function cmrSave(){
    const v = k => { const e = $('cm-' + k); return e ? e.value.trim() : ''; };
    const msg = $('cmMsg'), btn = $('cmSave');
    const goods = [];
    for (let i = 0; i < st.cmrGoods; i++){
      const x = { marks: v('g' + i + '_marks'), packages: v('g' + i + '_packages'), packing: v('g' + i + '_packing'), nature: v('g' + i + '_nature'), stat: v('g' + i + '_stat'), gross: v('g' + i + '_gross').replace(',', '.'), volume: v('g' + i + '_volume').replace(',', '.') };
      if (Object.values(x).some(Boolean)) goods.push(x);
    }
    const data = { sender: { name: v('sender_name'), address: v('sender_address') }, consignee: { name: v('consignee_name'), address: v('consignee_address') },
      carrier: { name: v('carrier_name'), address: v('carrier_address') }, plate: normPlate(v('plate')), trailer: normPlate(v('trailer')),
      delivery_place: v('delivery_place'), taking_place: v('taking_place'), taking_date: v('taking_date'), goods,
      docs: v('docs'), instructions: v('instructions'), payment: v('payment') || 'frei', cod: v('cod'), successive: v('successive'),
      reservations: v('reservations'), special: v('special'), issue_place: v('issue_place'), issue_date: v('issue_date') };
    const miss = [];
    if (!data.sender.name) miss.push('відправник'); if (!data.consignee.name) miss.push('одержувач'); if (!data.carrier.name) miss.push('перевізник');
    if (!data.delivery_place) miss.push('місце розвантаження'); if (!data.taking_place) miss.push('місце завантаження');
    if (!goods.some(x => x.nature)) miss.push('назва вантажу'); if (!data.plate) miss.push('номер тягача');
    if (miss.length){ msg.className = 'msg msg-err show'; msg.textContent = 'Заповніть: ' + miss.join(', '); return; }
    const ed = st.cmrEdit || {};
    const win = window.open('about:blank', '_blank');
    btn.disabled = true;
    try{
      const saved = await saveCmr({ owner_id: st.broker.id, rmpd_id: ed.rid, number: v('number') || null, data }, ed.id);
      const i = st.cmr.findIndex(c => c.id === saved.id); if (i >= 0) st.cmr[i] = saved; else st.cmr.unshift(saved);
      if (!ed.id){ refreshAccess(); try { track('cmr_create', { id: saved.id, test: !!saved.is_test, value: Number(saved.price) || 0, currency: 'UAH' }); } catch(e){} }
      const url = '/cmr?id=' + saved.id;
      if (win) win.location.href = url; else location.href = url;
      showToast(ed.id ? 'CMR оновлено' : 'CMR створено'); closeSheet(); renderList();
    }catch(e){ if (win) win.close(); msg.className = 'msg msg-err show'; msg.textContent = e.message; btn.disabled = false; }
  }

  return { mount, submit, invoice, cmr, cmrAddGoods, cmrSave, topup, history, setMode, openSheet, closeSheet, copyEl, copyAll, fill, saveSelfRef, routeChanged, dateChanged, etaChanged, docsChanged, goodsToggle, idHint, lookupParty, lookupCarrier, pickCarrier, editCarrier, pickParty, pickVehicle,
    setFilter, edit, update, repeat, back, reset, cancel, copy, share, translit, normPlate, derive, sent: id => window.Sent && Sent.fromRmpd(find(id)), deleg: id => window.Deleg && Deleg.fromRmpd(find(id)),
    normGps, gpsOk: g => GPS_RE.test(g) && gpsCheck(g), normCross, placeOf, placeRows, geocode, crossings: () => UA_CROSS.map(c => c[0]).concat(OTHER_CROSS), COUNTRIES };
})();
