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
  const OTHER_CROSS = ['Świecko','Kołbaskowo','Jędrzychowice','Olszyna','Gubinek','Lubieszyn','Gorzyczki','Cieszyn','Chyżne','Barwinek',
    'Łysa Polana','Kudowa-Słone','Budzisko','Terespol','Kukuryki','Port Gdańsk','Port Gdynia','Port Szczecin'];
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
    'entry_point','exit_point','client_note'];
  const CARRIER_F = ['carrier_code','carrier_name','carrier_country','carrier_city','carrier_postcode','carrier_street','carrier_building','carrier_email'];

  let st = { el:null, broker:null, acc:null, list:[], contacts:[], vehicles:[], editId:null, parent:null, filter:'active', carrierEdit:false, license:null, vehDocs:[], keepDocs:[] };
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
    return /^[ZM][A-Z0-9]{9}$/.test(x) ? x.slice(0, 3) + '-' + x.slice(3, 9) + '-' + x.slice(9) : x; };
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
  async function mount(el, { broker }){
    st.el = el; st.broker = broker;
    el.innerHTML = '<div class="empty">Завантаження…</div>';
    const tasks = [rmpdAccess(broker.id), myRmpd(broker.id), rmpdContacts(broker.id)];
    if (broker.kind === 'carrier' && typeof myVehicles === 'function') tasks.push(myVehicles().catch(() => []));
    const [acc, list, contacts, vehicles] = await Promise.all(tasks);
    st.acc = acc; st.list = list; st.contacts = contacts; st.vehicles = (vehicles || []).filter(x => x.status !== 'rejected');
    render(); badge();
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
    const toBilling = 'pane(\'billing\', document.querySelector(\'[data-pane=billing]\'))';
    const extra = (a.test ? '<div class="msg show" style="margin:0 0 12px;background:rgba(245,166,35,.12);color:var(--amber);border:.5px solid rgba(245,166,35,.35)">🧪 <strong>Тестовий режим адміністратора.</strong> Заявки позначаються як тестові, не йдуть у CRM і не рахуються в ліміт. В адмінці вносьте їх лише на <a href="https://test.puesc.gov.pl/" target="_blank" rel="noopener">test.puesc.gov.pl</a>, не в справжній PUESC.</div>' : '') +
      (a.allowed && offHours() ? '<div class="msg show" style="margin:0 0 12px;background:rgba(16,185,129,.08);color:var(--muted);border:.5px solid var(--border)">🌙 Зараз неробочий час оператора (працюємо ' + OP_FROM + ':00–' + OP_TO + ':00 за Києвом). Заявку приймемо, але опрацюємо з ' + OP_FROM + ':00. Якщо машина буде на кордоні раніше — подайте заявку самостійно на <a href="' + PUESC + '" target="_blank" rel="noopener">puesc.gov.pl</a>.</div>' : '');
    top.innerHTML = extra + (a.reason === 'need_premium'
      ? '<div class="card" style="border-color:rgba(168,85,247,.4)"><div style="font-weight:600;margin-bottom:6px">💎 Подача RMPD за клієнтів — на тарифі «Преміум»</div><p class="text-sm text-muted" style="margin-bottom:12px">Без ліміту заявок: реквізити підтягуються за ЄДРПОУ, NIP і EU VAT, тип перевезення й підстава визначаються автоматично, номер RMPD і статус — у кабінеті та Telegram. Довідник ваших перевізників, авто й контрагентів — повторна заявка за хвилину.</p><button class="btn btn-primary btn-sm" onclick="' + toBilling + '">Перейти на Преміум</button></div>'
      : a.reason === 'limit'
      ? '<div class="msg msg-err show" style="margin:0 0 12px">Використано ' + a.used + ' з ' + a.limit + ' безкоштовних заявок цього місяця. <a href="#" onclick="' + toBilling + ';return false">Будь-який платний тариф</a> — без ліміту. Оновлення поданих заявок безкоштовні завжди.</div>'
      : a.allowed ? '<div class="text-sm text-muted" style="margin-bottom:12px">' + (a.limit ? 'Безкоштовно: використано <strong style="color:var(--text)">' + a.used + ' з ' + a.limit + '</strong> заявок цього місяця.' : 'Без ліміту · цього місяця подано <strong style="color:var(--text)">' + a.used + '</strong>.') + ' Обробляємо щодня 8:00–22:00, зазвичай за 30–60 хвилин.</div>' : '');
  }

  /* ---------- Форма ---------- */
  const fld = (id, label, attrs = '', hint = '') => '<div class="field"><label class="label" for="rm-' + id + '">' + label + '</label><input class="input" id="rm-' + id + '" ' + attrs + '>' + (hint ? '<div class="hint" id="rm-' + id + '-hint">' + hint + '</div>' : '') + '</div>';
  const sel = (id, label, options, attrs = '') => '<div class="field"><label class="label" for="rm-' + id + '">' + label + '</label><select class="input" id="rm-' + id + '" ' + attrs + '>' + options + '</select></div>';
  const row = (...c) => '<div class="field-row">' + c.join('') + '</div>';
  const sec = t => '<div class="card-title" style="margin-top:1.25rem">' + t + '</div>';
  const canWrite = () => st.acc && (st.acc.allowed || st.parent || st.editId);

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
      row(fld('carrier_code', 'ЄДРПОУ / ІПН *', 'maxlength="10" inputmode="numeric" placeholder="45002097" onchange="Rmpd.lookupCarrier()"', 'Назву підставимо з реєстру перевізників автоматично.'),
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
          fld(side + '_id', 'NIP / VAT / ЄДРПОУ', 'maxlength="20" onchange="Rmpd.lookupParty(\'' + side + '\')"', '')) +
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
      (st.parent ? '<p class="hint">Змініть те, що змінилось (авто, дата, пункт пропуску) — оновимо заявку в PUESC. Оновлення не рахується в ліміт.</p>' : '') +

      sec('1. Перевізник') + '<div id="rmCarrier">' + carrierBlock() + '</div><div id="rmLicense"></div>' +

      sec('2. Авто') +
      (vehs.length ? sel('pick-veh', 'Ваше авто', '<option value="">— нове авто —</option>' + vehs.map(x => '<option value="' + esc(x.plate) + '">' + esc(x.plate) + (x.trailer_plate ? ' / ' + esc(x.trailer_plate) : '') + (x.make ? ' · ' + esc(x.make) : '') + (x.gps_id ? ' · GPS ✓' : '') + '</option>').join(''), 'onchange="Rmpd.pickVehicle(this.value)"') : '') +
      '<input type="hidden" id="rm-vehicle_id">' +
      row(fld('plate', 'Номер тягача *', 'maxlength="12" placeholder="AC1234BH" style="text-transform:uppercase"'), fld('trailer_plate', 'Номер причепа', 'maxlength="12" placeholder="AC5678XT" style="text-transform:uppercase"')) +
      fld('gps_id', 'Номер локатора GPS *', 'maxlength="20" placeholder="Z12-345678-9" style="text-transform:uppercase"',
        'Ідентифікатор пристрою в SENT: стаціонарний локатор (ZSL) — Z…, застосунок e-TOLL PL — M…. Запамʼятаємо для цього авто.') +
      '<details style="margin-bottom:1rem"><summary class="text-xs text-muted" style="cursor:pointer">Авто чи причіп зареєстровані не в Україні</summary><div style="margin-top:10px">' +
        row(sel('plate_country', 'Країна тягача', opt(COUNTRIES, 'UA')), sel('trailer_country', 'Країна причепа', opt(COUNTRIES, 'UA'))) + '</div></details>' +

      sec('3. Маршрут і дата') +
      row(sel('load_country', 'Звідки — країна *', opt(COUNTRIES, 'UA'), 'onchange="Rmpd.routeChanged()"'), fld('load_place', 'Місто завантаження *', 'maxlength="80" placeholder="Lviv"')) +
      row(sel('unload_country', 'Куди — країна *', opt(COUNTRIES, 'PL'), 'onchange="Rmpd.routeChanged()"'), fld('unload_place', 'Місто розвантаження *', 'maxlength="80" placeholder="Warszawa"')) +
      '<div class="field-row"><div id="rmEntryWrap">' + fld('entry_point', 'Пункт вʼїзду в Польщу *', 'list="rmCross" maxlength="60" placeholder="Dorohusk"') + '</div>' +
        '<div id="rmExitWrap">' + fld('exit_point', 'Пункт виїзду з Польщі *', 'list="rmCross" maxlength="60" placeholder="Świecko"') + '</div></div>' +
      row(fld('start_date', 'Дата вʼїзду / початку *', 'type="date" min="' + today() + '" onchange="Rmpd.dateChanged()"'),
          fld('end_date', 'Дата завершення в Польщі', 'type="date" min="' + today() + '"', 'Підставили +3 дні — змініть за потреби. Не пізніше 10 днів.')) +
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

      sec('5. Коли на кордоні й документи') +
      fld('border_eta', 'Коли авто буде на кордоні / почне рейс у Польщі', 'type="datetime-local" onchange="Rmpd.etaChanged()"', 'Необовʼязково, але допомагає нам встигнути: термінові заявки опрацьовуємо першими.') +
      '<div id="rmTiming"></div>' +
      '<div class="field"><label class="label" for="rm-doc-tech">Техпаспорт тягача й причепа</label><div id="rmTechSaved" class="hint" style="margin:0 0 6px"></div>' +
        '<input class="input" type="file" id="rm-doc-tech" accept="image/*,application/pdf" multiple onchange="Rmpd.docsChanged()"></div>' +
      '<div class="field"><label class="label" for="rm-doc-cmr">CMR / накладна</label>' +
        '<input class="input" type="file" id="rm-doc-cmr" accept="image/*,application/pdf" multiple onchange="Rmpd.docsChanged()"></div>' +
      '<p class="hint" id="rmDocsHint" style="margin:-6px 0 1rem">Фото документів — за бажанням, але оператор звірить з ними номери, назви й адреси до подачі. Так помилки ловляться до кордону, а не на ньому. Техпаспорт запамʼятаємо для цього авто.</p>' +

      '<details id="rmMore" style="margin:1rem 0"><summary class="text-sm" style="cursor:pointer;color:var(--blue)">Додатково: водій, коментар, ручні налаштування</summary><div style="margin-top:12px">' +
        row(fld('driver_first', 'Імʼя водія', 'maxlength="60"'), fld('driver_last', 'Прізвище водія', 'maxlength="60"')) +
        fld('driver_phone', 'Телефон водія', 'maxlength="20" inputmode="tel" placeholder="+380…"', 'Щоб оператор міг швидко уточнити дані.') +
        row(sel('trip_type', 'Тип перевезення', opt(TRIP, '', 'Автоматично')), sel('direction', 'Напрямок (дозвіл)', opt(DIR, '', 'Автоматично'))) +
        row(fld('prev_rmpd', 'Попередній номер RMPD', 'maxlength="40"', 'Для зворотного рейсу підставляємо самі.'), fld('contact_email', 'Email для копії заявки', 'type="email" maxlength="120"', 'За замовчуванням — email перевізника.')) +
        '<div class="field"><label class="label" for="rm-client_note">Коментар оператору</label><textarea class="input" id="rm-client_note" maxlength="600" style="min-height:64px" placeholder="Напр.: два розвантаження в Польщі"></textarea></div>' +
      '</div></details>' +

      '<label class="check-row"><input type="checkbox" id="rm-agree"' + (store('agree') ? ' checked' : '') + '> Дані відповідають документам (CMR, техпаспорт). Доручаю МитнийБрокер подати заявку RMPD в PUESC від імені перевізника; відповідальність за достовірність даних несе перевізник.</label>' +
      '<div class="msg" id="rmMsg"></div>' +
      '<button class="btn btn-primary btn-block" id="rmBtn" onclick="Rmpd.submit()">' + (st.parent ? 'Надіслати оновлення' : st.editId ? 'Зберегти й надіслати' : 'Надіслати заявку') + '</button></div>';

    bind(); prefill(); routeChanged();
  }

  function bind(){
    LATIN.forEach(f => { const e = $('rm-' + f); if (e) e.addEventListener('blur', () => { e.value = translit(e.value).replace(/\s{2,}/g, ' ').trim(); }); });
    ['plate','trailer_plate'].forEach(f => $('rm-' + f).addEventListener('blur', e => { e.target.value = normPlate(e.target.value); }));
    $('rm-gps_id').addEventListener('blur', e => { e.target.value = normGps(e.target.value); });
    $('rm-plate').addEventListener('change', () => { const x = vehicleOptions().find(o => o.plate === normPlate(v('plate'))); if (x) applyVehicle(x); });
    ['load_country','unload_country','load_place','unload_place','entry_point','exit_point','start_date'].forEach(f => $('rm-' + f).addEventListener('change', routeChanged));
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
  function dateChanged(){ const s = v('start_date'); if (s && (!v('end_date') || v('end_date') < s)) set('end_date', addDays(s, 3)); routeChanged(); timing(); }

  function routeChanged(){
    const r = readRaw(), d = derive(r);
    $('rmEntryWrap').style.display = d.needEntry ? '' : 'none';
    $('rmExitWrap').style.display = d.needExit ? '' : 'none';
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

  function idHint(side){
    const c = v(side + '_country'), h = $('rm-' + side + '_id-hint') || (() => { const e = document.createElement('div'); e.className = 'hint'; e.id = 'rm-' + side + '_id-hint'; $('rm-' + side + '_id').after(e); return e; })();
    $('rm-' + side + '_id').placeholder = c === 'PL' ? 'NIP, 10 цифр' : EU.includes(c) ? 'VAT, напр. ' + (c === 'GR' ? 'EL' : c) + '123456789' : c === 'UA' ? 'ЄДРПОУ' : 'Код компанії';
    if (!h.dataset.busy) h.textContent = c === 'PL' || EU.includes(c) ? 'Введіть код — назву й адресу заповнимо з держреєстру.' : '';
  }

  async function lookupParty(side){
    const c = v(side + '_country'), code = v(side + '_id').toUpperCase().replace(/[\s\-.]/g, ''); if (!code) return;
    const h = $('rm-' + side + '_id-hint'); h.dataset.busy = '1'; h.textContent = 'Шукаємо…';
    const type = c === 'PL' ? 'pl' : EU.includes(c) ? 'vat' : c === 'UA' ? 'ua' : null;
    if (!type){ h.textContent = ''; delete h.dataset.busy; return; }
    const r = await rmpdLookup(type, code, c === 'GR' ? 'EL' : c);
    delete h.dataset.busy;
    if (r.found){
      setVals({ [side + '_name']: translit(r.name), [side + '_city']: r.city || v(side + '_city'), [side + '_postcode']: r.postcode || v(side + '_postcode'), [side + '_address']: r.street || v(side + '_address') });
      h.innerHTML = '<span style="color:var(--green)">✓ Знайдено в реєстрі' + (r.vat && r.vat !== 'Czynny' ? ' · статус VAT: ' + esc(r.vat) : '') + '</span>';
    } else h.textContent = r.note === 'unavailable' ? 'Реєстр тимчасово недоступний — заповніть вручну.' : r.note === 'invalid' ? 'Код не знайдено або недійсний — перевірте.' : 'Не знайшли в реєстрі — заповніть вручну.';
  }

  async function lookupCarrier(){
    const code = v('carrier_code').replace(/\D/g, ''); if (!/^\d{8,10}$/.test(code)) return;
    const h = $('rm-carrier_code-hint'); if (h) h.textContent = 'Шукаємо в реєстрі перевізників…';
    const r = await rmpdLookup('ua', code);
    const box = $('rmLicense');
    if (r.found){
      if (!v('carrier_name') || !isCarrier()) set('carrier_name', translit(r.name));
      st.license = r.license;
      if (h) h.innerHTML = '<span style="color:var(--green)">✓ ' + esc(r.name) + '</span>';
      const bad = r.license && (r.license.status !== 'Чинна' || !r.license.intl_cargo);
      box.innerHTML = bad ? '<div class="msg msg-err show" style="margin:-4px 0 1rem">Увага: ліцензія ' + (r.license.status !== 'Чинна' ? '— статус «' + esc(r.license.status) + '»' : 'не включає міжнародні вантажні перевезення') + '. Без чинної ліцензії на міжнародні перевезення в’їзд можуть не дозволити.</div>' : '';
    } else { if (h) h.textContent = 'У реєстрі перевізників не знайшли — впишіть назву латиницею.'; box.innerHTML = ''; }
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
    'entry_point','exit_point','start_date','end_date','permit_type','permit_country','permit_number','permit_valid_to','cargo_desc','cmr_number','cargo_weight_t',
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
    if (!d.needEntry) r.entry_point = null;
    if (!d.needExit) r.exit_point = null;
    r.start_place = d.needEntry ? r.entry_point : r.load_place;
    r.end_place = d.needExit ? r.exit_point : r.unload_place;
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
    if (r.driver_phone && !isValidPhone(r.driver_phone)){ msgs.push('Перевірте телефон водія.'); bad.push('driver_phone'); }
    LATIN.forEach(f => { if (r[f] && notLatin(r[f])){ const l = document.querySelector('label[for="rm-' + f + '"]'); msgs.push('«' + (l ? l.textContent.replace(/\s*\*$/, '') : f) + '» — лише латиниця.'); bad.push(f); } });
    if (r.with_goods && r.sender_country === 'PL' && r.sender_id && !/^\d{10}$/.test(r.sender_id.replace(/^PL/, ''))){ msgs.push('NIP відправника — 10 цифр.'); bad.push('sender_id'); }
    if (r.with_goods && r.recipient_country === 'PL' && r.recipient_id && !/^\d{10}$/.test(r.recipient_id.replace(/^PL/, ''))){ msgs.push('NIP отримувача — 10 цифр.'); bad.push('recipient_id'); }
    ALL.forEach(f => { const e = $('rm-' + f); if (e) e.style.borderColor = bad.includes(f) ? 'var(--red)' : ''; });
    if (bad.some(f => ['driver_phone','contact_email','prev_rmpd','trip_type','direction'].includes(f))) $('rmMore').open = true;
    if (bad.some(f => f.startsWith('carrier_')) && $('rm-carrier_code') && $('rm-carrier_code').type === 'hidden') editCarrier();
    return msgs;
  }
  function gpsWarn(r){ return r.gps_id && !/^[ZM][A-Z0-9]{2}-[A-Z0-9]{6}-[A-Z0-9]$/.test(r.gps_id); }
  function showMsg(t, ok){ const m = $('rmMsg'); m.className = 'msg show ' + (ok ? 'msg-ok' : 'msg-err'); m.innerHTML = t; }

  async function submit(){
    const r = read(), errs = validate(r);
    if (errs.length){ showMsg(errs.map(esc).join('<br>')); $('rmMsg').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (!$('rm-agree').checked){ showMsg('Підтвердіть доручення й відповідність даних документам.'); return; }
    if (gpsWarn(r) && !confirm('Номер локатора «' + r.gps_id + '» не схожий на формат SENT (Z… або M…, напр. Z12-345678-9). Все одно надіслати?')) return;
    if ((new Date(r.start_date) - new Date(today())) / 864e5 > 9 && !confirm('Номер RMPD діє 10 днів від реєстрації, а дата — більш ніж через 9 днів. Подати зараз?')) return;
    const t = timing();
    if (t.eta && t.hours < 0){ showMsg('Час на кордоні вже минув — виправте дату й годину.'); return; }
    if (t.blocked && !confirm('Оператор може не встигнути подати заявку до вашого часу на кордоні. Все одно надіслати? (Безпечніше подати самостійно на puesc.gov.pl)')) return;
    store('agree', '1');
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
      btn.textContent = 'Надсилаємо…';
      const row = { ...r }; delete row._techForVehicle;
      const saved = st.editId ? await saveRmpd(row, st.editId)
        : await saveRmpd({ ...row, owner_id: st.broker.id, kind: st.parent ? 'update' : 'new', parent_id: st.parent ? st.parent.id : null, prev_rmpd: r.prev_rmpd || (st.parent ? st.parent.ref_number : null) });
      saveContacts(r).catch(e => console.error(e));
      const i = st.list.findIndex(x => x.id === saved.id); if (i >= 0) st.list[i] = saved; else st.list.unshift(saved);
      st.editId = null; st.parent = null; st.carrierEdit = false; st.keepDocs = [];
      track('rmpd_submit', { kind: saved.kind, role: st.broker.kind || 'broker' });
      await refreshAccess(); renderForm(); renderList(); badge();
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

  /* ---------- Список ---------- */
  function setFilter(f){ st.filter = f; render(); }
  function card(r){
    const s = RMPD_STATUS[r.status] || RMPD_STATUS.new;
    const left = r.valid_until ? Math.ceil((new Date(r.valid_until) - new Date(today())) / 864e5) : null, expired = left !== null && left < 0;
    const route = [r.load_place && r.load_place + (r.load_country ? ' (' + r.load_country + ')' : ''), r.unload_place && r.unload_place + (r.unload_country ? ' (' + r.unload_country + ')' : '')].filter(Boolean).join(' → ');
    let a = '';
    if (r.status === 'new' || r.status === 'needs_fix') a += '<button class="btn-quiet" onclick="Rmpd.edit(\'' + r.id + '\')">' + (r.status === 'needs_fix' ? '✏️ Виправити' : 'Редагувати') + '</button>';
    if (r.status === 'done' && !expired) a += '<button class="btn-quiet" onclick="Rmpd.update(\'' + r.id + '\')">Оновити заявку</button>';
    if (r.status === 'done' && r.direction !== 'back') a += '<button class="btn-quiet" onclick="Rmpd.back(\'' + r.id + '\')">↩ Зворотний рейс</button>';
    a += '<button class="btn-quiet" onclick="Rmpd.repeat(\'' + r.id + '\')">Повторити</button>';
    if (r.status !== 'done' && r.status !== 'cancelled') a += '<button class="btn-quiet" onclick="Rmpd.cancel(\'' + r.id + '\')">Скасувати</button>';
    return '<div class="req"' + (r.status === 'needs_fix' ? ' style="border-color:rgba(241,101,75,.55)"' : '') + '><div class="spread" style="align-items:flex-start;gap:10px"><div style="min-width:0">' +
      '<div style="font-weight:600">' + esc(r.plate) + (r.trailer_plate ? ' / ' + esc(r.trailer_plate) : '') + ' · ' + esc(r.entry_point || r.exit_point || r.load_place || '') + ' · ' + fmtD(r.start_date) +
        (r.kind === 'update' ? ' <span class="badge badge-free">оновлення</span>' : '') + (r.direction === 'back' ? ' <span class="badge badge-free">зворотний</span>' : '') +
        (r.urgent && !['done','cancelled'].includes(r.status) ? ' <span class="badge" style="background:rgba(241,101,75,.15);color:var(--red)">🔥 терміново</span>' : '') +
        (r.is_test ? ' <span class="badge" style="background:rgba(245,166,35,.15);color:var(--amber)">🧪 тест</span>' : '') + '</div>' +
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

  const copyFields = r => { const o = {}; ALL.forEach(f => o[f] = r[f] === undefined ? null : r[f]); o.with_goods = r.with_goods; return o; };
  function openForm(data, src){
    st.keepDocs = src && (st.editId || st.parent) ? (src.docs || []) : [];
    renderTop(); renderForm(); setVals(data); routeChanged();
    if (src && st.editId && src.border_eta){ const d = new Date(src.border_eta); set('border_eta', new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16)); }
    techSavedHint(); timing();
    if (data.driver_first || data.client_note) $('rmMore').open = true;
    $('rmForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const find = id => st.list.find(x => x.id === id);
  function needAccess(){ if (st.acc.allowed) return true; showToast(st.acc.reason === 'limit' ? 'Ліміт безкоштовних заявок на цей місяць вичерпано' : 'Подача недоступна на поточному тарифі', 'error'); return false; }
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
      entry_point: r.exit_point, exit_point: r.entry_point, with_goods: false, cargo_desc: '', cmr_number: '', prev_rmpd: r.ref_number, trip_type: '', direction: '',
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

  return { mount, submit, routeChanged, dateChanged, etaChanged, docsChanged, goodsToggle, idHint, lookupParty, lookupCarrier, pickCarrier, editCarrier, pickParty, pickVehicle,
    setFilter, edit, update, repeat, back, reset, cancel, copy, share, translit, normPlate, derive };
})();
