/* deleg.js — відрядження водія з України до Польщі (Delegowanie, PIP через biznes.gov.pl).
   Два документи: zgłoszenie до PIP (онлайн, до початку відрядження) і паперове
   Potwierdzenie delegowania за бланком Dz.U. 2023 poz. 1638 (у кабіні, підписи перевізника й водія).
   Потрібне для двосторонніх перевезень, cross-trade і каботажу; транзит — ні.
   Режими: «Подає оператор» (з довіреністю, 250 грн) і «Подаю сам» (бланк + дані, 100 грн).
   Водії й контактна особа запамʼятовуються. Потребує config.js, db.js, rmpd.js. */
const Deleg = (() => {
  const BIZ = 'https://www.biznes.gov.pl/pl/portal/ou1670';
  const TYPES = { goods_intl: 'Міжнародне перевезення вантажів', goods_cabotage: 'Каботаж (вантажі)', pass_intl: 'Міжнародне перевезення пасажирів', pass_cabotage: 'Каботаж (пасажири)' };
  const TYPES_PL = { goods_intl: 'przewóz rzeczy, przewóz międzynarodowy / carriage of goods, international carriage', goods_cabotage: 'przewóz rzeczy, przewóz kabotażowy / carriage of goods, cabotage operation',
    pass_intl: 'przewóz osób, przewóz międzynarodowy / carriage of passengers, international carriage', pass_cabotage: 'przewóz osób, przewóz kabotażowy / carriage of passengers, cabotage operation' };
  const STATUS = { new: { label: 'Нова', color: 'var(--blue, #3b82f6)' }, in_progress: { label: 'В роботі', color: 'var(--amber)' },
    needs_fix: { label: 'Потрібне уточнення', color: 'var(--red)' }, done: { label: 'Подано до PIP', color: 'var(--green)' }, cancelled: { label: 'Скасовано', color: 'var(--muted)' } };
  const LATIN = ['carrier_name','carrier_street','carrier_city','contact_first','contact_last','contact_address','driver_first','driver_last','driver_address','issue_place','client_note'];

  let st = { el: null, broker: null, acc: null, prices: {}, list: [], contacts: [], rmpd: [], editId: null, rmpdId: null, mode: 'team', filter: 'active' };
  const $ = id => document.getElementById(id);
  const v = id => { const e = $('dl-' + id); return e ? (e.type === 'checkbox' ? e.checked : String(e.value || '').trim()) : ''; };
  const set = (id, val) => { const e = $('dl-' + id); if (!e || val === undefined || val === null) return; if (e.type === 'checkbox') e.checked = !!val; else e.value = val; };
  const tr = s => Rmpd.translit(s);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const fmtD = d => d ? d.split('-').reverse().join('.') : '—';
  const store = (k, val) => { try { if (val === undefined) return localStorage.getItem('deleg_' + k); localStorage.setItem('deleg_' + k, val); } catch(e){ return null; } };
  const price = m => Number(st.prices[m === 'self' ? 'deleg_self' : 'deleg'] || 0);
  const normPhone = s => { let x = String(s || '').replace(/[^\d+]/g, ''); if (/^0\d{9}$/.test(x)) x = '+38' + x; else if (/^380\d{9}$/.test(x)) x = '+' + x; return x; };
  const normLic = s => String(s || '').toUpperCase().replace(/\s/g, '').replace(/[АВЕІКМНОРСТХ]/g, c => ({ А:'A',В:'B',Е:'E',І:'I',К:'K',М:'M',Н:'H',О:'O',Р:'P',С:'C',Т:'T',Х:'X' })[c]);

  /* ---------- Монтування ---------- */
  async function mount(el, { broker }){
    st.el = el; st.broker = broker; st.mode = store('mode') === 'self' ? 'self' : 'team';
    el.innerHTML = '<div class="empty">Завантаження…</div>';
    const [acc, list, contacts, rmpd, prices] = await Promise.all([rmpdAccess(broker.id), myDeleg(broker.id), rmpdContacts(broker.id), myRmpd(broker.id), servicePrices().catch(() => [])]);
    st.acc = acc || {}; st.list = list; st.contacts = contacts; st.rmpd = rmpd;
    (prices || []).forEach(p => { if (p.active) st.prices[p.code] = Number(p.price); });
    render(); badge();
    if (st.pending){ const r = st.pending; st.pending = null; fromRmpd(r); }
  }
  function badge(){ const b = $('dlBadge'); if (!b) return; const n = st.list.filter(r => r.status === 'needs_fix').length; b.textContent = n; b.style.display = n ? '' : 'none'; }
  async function refreshAcc(){ st.acc = await rmpdAccess(st.broker.id); renderTop(); }
  const drivers = () => st.contacts.filter(c => c.kind === 'driver' && c.data && c.data.deleg);
  const contactPerson = () => st.contacts.find(c => c.kind === 'party' && c.data && c.data.role === 'deleg_contact');

  function render(){
    st.el.innerHTML = '<div id="dlTop"></div><div id="dlFormWrap"></div>' +
      '<div class="spread" style="margin:1.5rem 0 .75rem"><div class="card-title" style="margin:0">Мої відрядження</div><div class="pchips">' +
        [['active','Активні'],['done','Подані'],['all','Всі']].map(([k, l]) => '<button class="chip' + (st.filter === k ? ' active' : '') + '" onclick="Deleg.setFilter(\'' + k + '\')">' + l + '</button>').join('') +
      '</div></div><div id="dlList"></div>' +
      '<div class="card card-tight" style="margin-top:1rem"><div class="card-title">Коли потрібне відрядження</div><p class="text-sm text-muted">Для перевізників з України — на кожне відрядження водія в Польщу: <strong style="color:var(--text)">двосторонні рейси</strong> (Україна ↔ Польща), cross-trade і каботаж. Транзит Польщею без завантаження й розвантаження — не потрібно. Подати треба <strong style="color:var(--text)">не пізніше початку відрядження</strong>. У кабіні водій має мати підписаний паперовий бланк Potwierdzenie delegowania, CMR (або дозвіл) і записи тахографа. Штраф: водію — 500 zł, перевізнику — від 4 000 до 7 000 zł за кожне порушення.</p></div>';
    renderTop(); renderForm(); renderList();
  }
  function renderTop(){
    const a = st.acc || {}, top = $('dlTop'); if (!top) return;
    const avail = Number(a.available || 0), need = price(st.mode);
    top.innerHTML = (a.test ? '<div class="msg show" style="margin:0 0 12px;background:rgba(245,166,35,.12);color:var(--amber);border:.5px solid rgba(245,166,35,.35)">🧪 <strong>Тестовий режим адміністратора.</strong> Заявки тестові й безкоштовні.</div>' : '') +
      '<div class="card card-tight" style="margin-bottom:12px"><div class="spread" style="gap:12px;flex-wrap:wrap"><div><div class="text-xs text-muted">Баланс</div>' +
        '<div style="font-family:var(--display);font-size:26px;line-height:1.1">' + uah(avail) + '</div>' +
        '<div class="text-xs text-muted">Відрядження: оператор — <strong style="color:var(--text)">' + uah(price('team')) + '</strong>, самостійно — <strong style="color:var(--text)">' + uah(price('self')) + '</strong>. Баланс спільний з RMPD, SENT і CMR.</div></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + [1000, 2000].map(n => '<button class="btn btn-ghost btn-sm" onclick="Rmpd.topup(' + n + ')">+ ' + n.toLocaleString('uk-UA') + '</button>').join('') +
        '<button class="btn btn-ghost btn-sm" onclick="Rmpd.topup()">Інша сума</button></div></div></div>' +
      (!a.test && need && avail < need ? '<div class="msg msg-err show" style="margin:0 0 12px">Щоб подати заявку, поповніть баланс щонайменше на ' + uah(need - avail) + '.</div>' : '');
  }

  /* ---------- Форма ---------- */
  const fld = (id, label, attrs = '', hint = '') => '<div class="field"><label class="label" for="dl-' + id + '">' + label + '</label><input class="input" id="dl-' + id + '" autocomplete="off" spellcheck="false" ' + attrs + '>' +
    (hint ? '<div class="hint" id="dl-' + id + '-hint">' + hint + '</div>' : '') + '</div>';
  const sel = (id, label, options, attrs = '') => '<div class="field"><label class="label" for="dl-' + id + '">' + label + '</label><select class="input" id="dl-' + id + '" ' + attrs + '>' + options + '</select></div>';
  const row = (...c) => '<div class="field-row">' + c.join('') + '</div>';
  const sec = t => '<div class="card-title" style="margin-top:1.25rem">' + t + '</div>';
  const modeOf = () => st.editId ? ((find(st.editId) || {}).mode || 'team') : st.mode;
  function modeBlock(){
    if (st.editId) return modeOf() === 'self' ? '<p class="hint">Режим: подаєте самі на biznes.gov.pl.</p>' : '';
    const card = (m, icon, title, text) => '<button type="button" class="card card-tight" onclick="Deleg.setMode(\'' + m + '\')" style="text-align:left;cursor:pointer;flex:1;min-width:150px;margin:0;' +
      (st.mode === m ? 'border-color:var(--green);box-shadow:0 0 0 1px var(--green)' : 'opacity:.85') + '"><div style="font-weight:600">' + icon + ' ' + title + '</div>' +
      '<div style="font-family:var(--display);font-size:18px;margin:2px 0">' + uah(price(m)) + '</div><div class="text-xs text-muted">' + text + '</div></button>';
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px">' +
      card('team', '👨‍💼', 'Подає оператор', 'Подамо zgłoszenie до PIP за довіреністю. Готовий бланк для водія — одразу. Оплата — коли подано.') +
      card('self', '🙋', 'Подаю сам', 'Готовий бланк Potwierdzenie і дані в порядку майстра biznes.gov.pl — подаєте зі свого акаунта.') + '</div>';
  }
  function setMode(m){ if (st.mode === m) return; const keep = readForm(); st.mode = m; store('mode', m); renderTop(); renderForm(); fill(keep); }
  function renderForm(){
    const w = $('dlFormWrap'); if (!w) return;
    const C = Rmpd.COUNTRIES, cOpts = s => Object.entries(C).map(([k, n]) => '<option value="' + k + '"' + (k === s ? ' selected' : '') + '>' + k + ' — ' + n + '</option>').join('');
    const ds = drivers(), rm = st.rmpd.filter(r => r.status !== 'cancelled').slice(0, 15), self = modeOf() === 'self';
    w.innerHTML = '<div class="card" id="dlForm"><div class="spread"><div class="card-title" style="margin:0">' + (st.editId ? '✏️ Редагування відрядження' : '👤 Відрядження водія в Польщу') + '</div>' +
        (st.editId ? '<button class="btn-quiet" onclick="Deleg.reset()">Скасувати редагування</button>' : '') + '</div>' +
      modeBlock() +
      (!st.editId && rm.length ? sel('pick', 'Підставити з рейсу RMPD', '<option value="">— заповнити вручну —</option>' + rm.map(r => '<option value="' + r.id + '"' + (r.id === st.rmpdId ? ' selected' : '') + '>' + esc(r.plate) + ' · ' + esc(r.entry_point || r.load_place || '') + ' · ' + fmtD(r.start_date) + (r.driver_last ? ' · ' + esc(r.driver_last) : '') + '</option>').join(''), 'onchange="Deleg.pickRmpd(this.value)"') : '') +
      sec('1. Водій') +
      (ds.length ? sel('pick_driver', 'Збережений водій', '<option value="">— новий водій —</option>' + ds.map(d => '<option value="' + d.id + '">' + esc(d.data.driver_first + ' ' + d.data.driver_last) + (d.data.driver_licence ? ' · ' + esc(d.data.driver_licence) : '') + '</option>').join(''), 'onchange="Deleg.pickDriver(this.value)"') : '') +
      row(fld('driver_first', 'Імʼя латиницею *', 'placeholder="Ivan"'), fld('driver_last', 'Прізвище латиницею *', 'placeholder="Petrenko"')) +
      fld('driver_address', 'Адреса проживання водія *', 'placeholder="Shevchenka 1, 79000 Lviv, Ukraine"', 'Вулиця й номер, індекс, місто, країна — як у паспорті, латиницею') +
      row(fld('driver_licence', 'Номер посвідчення водія *', 'placeholder="AAA123456" style="text-transform:uppercase"'),
          fld('contract_start', 'Дата трудового договору *', 'type="date"', 'З якої дати водій працює у перевізника')) +
      fld('contract_law', 'Право, що регулює договір', 'value="Ukrainian law / prawo ukraińskie"') +
      sec('2. Відрядження') +
      row(fld('date_from', 'Початок відрядження *', 'type="date"'), fld('date_to', 'Кінець відрядження *', 'type="date"')) +
      row(fld('plate', 'Тягач *', 'style="text-transform:uppercase" placeholder="AA1234BB"'),
          sel('carriage_type', 'Вид перевезення', Object.entries(TYPES).map(([k, t]) => '<option value="' + k + '">' + t + '</option>').join(''))) +
      fld('permit_number', 'Номер дозволу або formularza jazdy', '', 'Лише якщо для рейсу потрібен дозвіл. За Угодою ЄС–Україна для вантажів — не потрібен, залиште порожнім.') +
      sec('3. Перевізник') +
      fld('carrier_name', 'Назва латиницею *', 'placeholder="TOV FORVARD KAR IUA"') +
      row(fld('carrier_street', 'Вулиця й номер *', 'placeholder="Kyivska 1"'), fld('carrier_postcode', 'Індекс *', 'inputmode="numeric"')) +
      row(fld('carrier_city', 'Місто *', 'placeholder="Kyiv"'), sel('carrier_country', 'Країна', cOpts('UA'))) +
      row(fld('carrier_phone', 'Службовий телефон *', 'type="tel" placeholder="+380981234567"'), fld('carrier_email', 'Службовий email *', 'type="email" inputmode="email"')) +
      sec('4. Контактна особа для PIP') +
      '<p class="hint" style="margin:-4px 0 8px">Людина, з якою контактує інспекція праці й яка представляє перевізника з питань умов праці (зазвичай директор або менеджер). Запамʼятаємо для наступних заявок.</p>' +
      row(fld('contact_first', 'Імʼя латиницею *'), fld('contact_last', 'Прізвище латиницею *')) +
      fld('contact_address', 'Адреса (проживання або для листування) *') +
      row(fld('contact_phone', 'Телефон *', 'type="tel"'), fld('contact_email', 'Email *', 'type="email" inputmode="email"')) +
      sec('5. Бланк для водія') +
      row(fld('issue_place', 'Місце складання бланка', 'placeholder="Kyiv"'), fld('issue_date', 'Дата складання', 'type="date"')) +
      (self ? '' : '<label class="check-row" style="margin-top:8px"><input type="checkbox" id="dl-poa_ok"> <span>Доручаю МитнийБрокер подати zgłoszenie delegowania до PIP від імені перевізника. Підпишу довіреність (pełnomocnictwo) — бланк сформуємо автоматично.</span></label>') +
      '<details style="margin-top:12px"><summary class="text-sm" style="cursor:pointer">Коментар для оператора</summary><div class="field" style="margin-top:8px"><textarea class="input" id="dl-client_note" rows="2"></textarea></div></details>' +
      '<div class="msg" id="dlMsg"></div>' +
      '<button class="btn btn-primary btn-block" id="dlSave" onclick="Deleg.submit()">' + submitLabel() + '</button></div>';
    LATIN.forEach(k => { const e = $('dl-' + k); if (e) e.addEventListener('blur', () => { e.value = tr(e.value); }); });
    $('dl-plate').addEventListener('blur', e => { e.target.value = Rmpd.normPlate(e.target.value); });
    $('dl-driver_licence').addEventListener('blur', e => { e.target.value = normLic(e.target.value); });
    ['carrier_phone','contact_phone'].forEach(k => $('dl-' + k).addEventListener('blur', e => { e.target.value = normPhone(e.target.value); }));
    $('dl-date_from').addEventListener('change', () => { if (!v('date_to') || v('date_to') < v('date_from')) set('date_to', addDays(v('date_from'), 10)); if (!v('issue_date')) set('issue_date', v('date_from') < today() ? today() : v('date_from')); });
    if (!st.editId) prefill();
  }
  function submitLabel(){ const m = modeOf(); if (st.editId) return 'Зберегти зміни'; const p = price(m); return (m === 'self' ? 'Сформувати бланк і дані' : 'Надіслати оператору') + (p && !(st.acc || {}).test ? ' · ' + uah(p) : ''); }

  function prefill(){
    const c = st.contacts.find(x => x.kind === 'carrier'), d = (c && c.data) || {};
    fill({ carrier_name: d.carrier_name, carrier_street: [d.carrier_street, d.carrier_building].filter(Boolean).join(' '), carrier_postcode: d.carrier_postcode, carrier_city: d.carrier_city,
      carrier_country: d.carrier_country, carrier_email: d.carrier_email, issue_place: d.carrier_city, issue_date: today() });
    const cp = contactPerson(); if (cp) fill(cp.data);
    const last = st.list[0]; if (last) fill({ carrier_phone: last.carrier_phone, carrier_email: last.carrier_email });
  }
  function fill(o){ if (!o) return; Object.entries(o).forEach(([k, val]) => { if (val !== undefined && val !== null && val !== '') set(k, val); }); }
  const FIELDS = ['carrier_name','carrier_street','carrier_postcode','carrier_city','carrier_country','carrier_phone','carrier_email','permit_number',
    'contact_first','contact_last','contact_address','contact_phone','contact_email','driver_first','driver_last','driver_address','driver_licence','contract_start','contract_law',
    'date_from','date_to','plate','carriage_type','issue_place','issue_date','poa_ok','client_note'];
  function readForm(){ const o = {}; FIELDS.forEach(f => { if ($('dl-' + f)) o[f] = v(f); }); return o; }
  function pickDriver(id){ const d = st.contacts.find(c => c.id === id); if (d) fill(d.data); }
  function rmpdData(r){
    const o = { plate: r.plate, date_from: r.start_date, date_to: r.end_date || (r.start_date ? addDays(r.start_date, 10) : ''), driver_first: r.driver_first, driver_last: r.driver_last,
      issue_place: r.load_place || r.carrier_city, issue_date: r.start_date && r.start_date > today() ? today() : today(),
      carriage_type: r.trip_type === 'cabotage' ? 'goods_cabotage' : 'goods_intl', permit_number: r.permit_type && r.permit_type !== 'eu_ua' ? r.permit_number : '' };
    const known = drivers().find(d => d.data.driver_last && r.driver_last && d.data.driver_last.toLowerCase() === String(r.driver_last).toLowerCase() && (!r.driver_first || d.data.driver_first.toLowerCase() === String(r.driver_first).toLowerCase()));
    return known ? Object.assign(o, known.data) : o;
  }
  function pickRmpd(id){ st.rmpdId = id || null; const r = st.rmpd.find(x => x.id === id); if (r) fill(rmpdData(r)); }
  function fromRmpd(r){
    if (!r) return;
    const btn = document.querySelector('[data-pane=deleg]'); if (typeof pane === 'function' && btn) pane('deleg', btn);
    if (!st.el || !$('dlFormWrap')){ st.pending = r; return; }
    st.editId = null; st.rmpdId = r.id; renderForm(); fill(rmpdData(r));
    const p = $('dl-pick'); if (p) p.value = r.id;
    $('dlFormWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (r.trip_type === 'transit') showToast('Для транзиту без завантаження в Польщі відрядження не потрібне', 'error');
    else showToast('Дані рейсу підставлено — перевірте водія й контактну особу');
  }

  function validate(r, mode){
    const miss = [], need = (f, l) => { if (!r[f]) miss.push(l); };
    need('driver_first', 'імʼя водія'); need('driver_last', 'прізвище водія'); need('driver_address', 'адреса водія'); need('driver_licence', 'посвідчення водія'); need('contract_start', 'дата договору');
    need('date_from', 'початок'); need('date_to', 'кінець'); need('plate', 'тягач');
    need('carrier_name', 'назва перевізника'); need('carrier_street', 'вулиця'); need('carrier_postcode', 'індекс'); need('carrier_city', 'місто'); need('carrier_phone', 'телефон перевізника'); need('carrier_email', 'email перевізника');
    need('contact_first', 'імʼя контактної особи'); need('contact_last', 'прізвище контактної особи'); need('contact_address', 'адреса контактної особи'); need('contact_phone', 'телефон контактної особи'); need('contact_email', 'email контактної особи');
    if (miss.length) return 'Заповніть: ' + miss.join(', ');
    if (r.date_to < r.date_from) return 'Кінець відрядження раніше за початок';
    if (r.date_from < addDays(today(), -1)) return 'Відрядження треба подати не пізніше його початку — дата початку вже минула';
    if (r.contract_start > r.date_from) return 'Дата трудового договору пізніша за початок відрядження — перевірте';
    for (const k of ['carrier_email','contact_email']) if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r[k])) return 'Перевірте email';
    for (const k of ['carrier_phone','contact_phone']) if (!/^\+\d{9,15}$/.test(r[k])) return 'Телефон — у міжнародному форматі, напр. +380981234567';
    if (!/^[A-Z0-9]{5,20}$/.test(r.driver_licence)) return 'Номер посвідчення водія — лише латинські літери й цифри, без пробілів';
    const lat = LATIN.find(k => r[k] && /[А-Яа-яЁёЄєІіЇїҐґ]/.test(r[k])); if (lat) return 'Поле має бути латиницею — перевірте кирилицю';
    if (mode === 'team' && !r.poa_ok) return 'Поставте позначку доручення, щоб ми могли подати за вас';
    return '';
  }
  async function submit(){
    const msg = $('dlMsg'), btn = $('dlSave'), mode = modeOf();
    const r = readForm();
    LATIN.forEach(k => { if (r[k]) r[k] = tr(r[k]); });
    r.plate = Rmpd.normPlate(r.plate); r.driver_licence = normLic(r.driver_licence); r.carrier_phone = normPhone(r.carrier_phone); r.contact_phone = normPhone(r.contact_phone);
    if (mode === 'self') r.poa_ok = false;
    const e = validate(r, mode);
    if (e){ msg.className = 'msg msg-err show'; msg.textContent = e; return; }
    Object.keys(r).forEach(k => { if (r[k] === '') r[k] = null; });
    btn.disabled = true; msg.className = 'msg';
    try{
      const saved = st.editId ? await saveDeleg(r, st.editId) : await saveDeleg(Object.assign({ owner_id: st.broker.id, rmpd_id: st.rmpdId, mode }, r));
      const i = st.list.findIndex(x => x.id === saved.id); if (i >= 0) st.list[i] = saved; else st.list.unshift(saved);
      const wasEdit = !!st.editId; st.editId = null; st.rmpdId = null;
      remember(saved).catch(() => {});
      if (!wasEdit) refreshAcc();
      renderList(); badge();
      if (saved.mode === 'self') openSheet(saved.id);
      else { renderForm(); openSheet(saved.id); }
      showToast(wasEdit ? 'Зміни збережено' : saved.mode === 'self' ? 'Бланк і дані готові' : 'Заявку надіслано оператору — бланк для водія вже можна друкувати');
    }catch(err){ msg.className = 'msg msg-err show'; msg.textContent = err.message; btn.disabled = false; }
  }
  async function remember(r){
    const dd = { deleg: true, driver_first: r.driver_first, driver_last: r.driver_last, driver_address: r.driver_address, driver_licence: r.driver_licence, contract_start: r.contract_start, contract_law: r.contract_law };
    const ex = st.contacts.find(c => c.kind === 'driver' && c.data && c.data.deleg && c.data.driver_licence === r.driver_licence);
    if (ex){ ex.data = Object.assign({}, ex.data, dd); await updateRmpdContact(ex.id, r.driver_first + ' ' + r.driver_last, ex.data); }
    else { const c = await saveRmpdContact(st.broker.id, 'driver', r.driver_first + ' ' + r.driver_last, dd); if (c) st.contacts.push(c); }
    const cd = { role: 'deleg_contact', contact_first: r.contact_first, contact_last: r.contact_last, contact_address: r.contact_address, contact_phone: r.contact_phone, contact_email: r.contact_email };
    const cp = contactPerson();
    if (cp){ cp.data = cd; await updateRmpdContact(cp.id, 'Контактна особа (відрядження)', cd); }
    else { const c = await saveRmpdContact(st.broker.id, 'party', 'Контактна особа (відрядження)', cd); if (c) st.contacts.push(c); }
  }

  /* ---------- Дані в порядку майстра biznes.gov.pl ---------- */
  function sections(r){
    const d = x => x ? x.split('-').reverse().join('.') : '';
    const addr = [r.carrier_street, [r.carrier_postcode, r.carrier_city].filter(Boolean).join(' '), r.carrier_country].filter(Boolean).join(', ');
    return [
      ['Przewoźnik drogowy z państwa trzeciego', [['Nazwa', r.carrier_name], ['Adres siedziby', addr], ['Ulica i numer', r.carrier_street], ['Kod pocztowy', r.carrier_postcode], ['Miejscowość', r.carrier_city], ['Państwo', r.carrier_country],
        ['Nr zezwolenia / formularza jazdy', r.permit_number], ['Telefon służbowy', r.carrier_phone], ['E-mail służbowy', r.carrier_email]]],
      ['Osoba do kontaktów (reprezentuje przewoźnika)', [['Imię', r.contact_first], ['Nazwisko', r.contact_last], ['Adres zamieszkania / do korespondencji', r.contact_address], ['Telefon', r.contact_phone], ['E-mail', r.contact_email]]],
      ['Kierowca', [['Imię', r.driver_first], ['Nazwisko', r.driver_last], ['Adres zamieszkania', r.driver_address], ['Numer prawa jazdy', r.driver_licence]]],
      ['Delegowanie', [['Data rozpoczęcia', d(r.date_from)], ['Data zakończenia', d(r.date_to)], ['Data rozpoczęcia umowy', d(r.contract_start)], ['Prawo właściwe dla umowy', r.contract_law],
        ['Nr rejestracyjny pojazdu silnikowego', r.plate], ['Rodzaj przewozu', TYPES_PL[r.carriage_type]]]]
    ].map(([t, rows]) => [t, rows.filter(x => x[1])]).filter(x => x[1].length);
  }
  const plain = r => sections(r).map(([t, rows]) => t + '\n' + rows.map(x => x[0] + ': ' + x[1]).join('\n')).join('\n\n');
  function openSheet(id){
    const r = find(id); if (!r) return;
    const done = r.status === 'done', self = r.mode === 'self';
    $('dlFormWrap').innerHTML = '<div class="card"><div class="spread"><div class="card-title" style="margin:0">👤 ' + esc(r.driver_first + ' ' + r.driver_last) + ' · ' + fmtD(r.date_from) + '–' + fmtD(r.date_to) + '</div><button class="btn-quiet" onclick="Deleg.closeSheet()">Закрити</button></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">' +
        '<a class="btn btn-primary btn-sm" href="/delegowanie?id=' + r.id + '" target="_blank" rel="noopener"><i class="ti ti-printer"></i> Бланк для водія (Potwierdzenie)</a>' +
        (!self ? '<a class="btn btn-ghost btn-sm" href="/delegowanie?id=' + r.id + '&doc=poa" target="_blank" rel="noopener"><i class="ti ti-signature"></i> Довіреність (pełnomocnictwo)</a>' : '') + '</div>' +
      '<p class="hint" style="margin:0 0 10px">Бланк роздрукуйте, підпишіть (перевізник і водій) і покладіть у кабіну разом із CMR і записами тахографа.' + (!self && !done ? ' Довіреність підпишіть і надішліть нам фото або скан у Telegram чи на пошту — без неї ми не зможемо подати.' : '') + '</p>' +
      (self && !done ? '<ol class="text-sm" style="margin:8px 0 4px 18px;line-height:1.6"><li>Відкрийте <a href="' + BIZ + '" target="_blank" rel="noopener">послугу на biznes.gov.pl</a> → «Załatw online» і увійдіть.</li>' +
        '<li>Пройдіть майстер: натисніть на рядок нижче — значення скопіюється, вставте його в однойменне поле.</li><li>Підпишіть Profilem Zaufanym або кваліфікованим підписом («Podpis kwalifikowany» → «Pobierz dokument» → підписати у програмі підпису у форматі XAdES → «Dodaj podpisany dokument») і натисніть «Wyślij» — не пізніше початку відрядження. Немає польського профілю — увійдіть через «Zaloguj się przez e-mail».</li>' +
        '<li>PIP підтвердження не надсилає — після відправки натисніть «Я подав».</li></ol>' : '') +
      '<div style="margin:10px 0"><button class="btn btn-ghost btn-sm" onclick="Deleg.copyAll(\'' + r.id + '\')"><i class="ti ti-clipboard-text"></i> Скопіювати все текстом</button></div>' +
      sections(r).map(([t, rows]) => '<div class="card-title" style="margin:10px 0 6px">' + t + '</div>' + rows.map(x => '<div class="svc-line" style="padding:6px 12px;margin-bottom:4px;cursor:pointer" onclick="Deleg.copy(this.dataset.v)" data-v="' + esc(x[1]) + '">' +
        '<span class="text-xs text-muted">' + x[0] + '</span><span class="text-sm" style="text-align:right;word-break:break-word">' + esc(x[1]) + ' <i class="ti ti-copy" style="opacity:.5"></i></span></div>').join('')).join('') +
      (done ? '<div class="msg msg-ok show" style="margin-top:14px">✓ Подано ' + (r.done_at ? new Date(r.done_at).toLocaleString('uk-UA') : '') + '</div>'
        : self ? '<button class="btn btn-primary btn-block" style="margin-top:14px" onclick="Deleg.markDone(\'' + r.id + '\')">✓ Я подав на biznes.gov.pl</button>'
        : '<div class="msg show" style="margin-top:14px">Заявка в черзі оператора — повідомимо в Telegram, щойно подамо.</div>') + '</div>';
    $('dlFormWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeSheet(){ renderForm(); }
  async function copy(t){ try{ await navigator.clipboard.writeText(t); showToast('Скопійовано: ' + String(t).slice(0, 40)); }catch(e){ showToast(t); } }
  async function copyAll(id){ const r = find(id); if (!r) return; try{ await navigator.clipboard.writeText(plain(r)); showToast('Усі дані скопійовано'); }catch(e){} }
  async function markDone(id){
    if (!confirm('Підтверджуєте, що zgłoszenie надіслано на biznes.gov.pl?')) return;
    try{ const s = await setDelegStatus(id, 'done'); const i = st.list.findIndex(x => x.id === id); if (i >= 0) st.list[i] = s; renderList(); openSheet(id); showToast('Готово! Не забудьте підписаний бланк у кабіні'); }catch(e){ showToast(e.message, 'error'); }
  }

  /* ---------- Список ---------- */
  const find = id => st.list.find(x => x.id === id);
  function setFilter(f){ st.filter = f; render(); }
  function card(r){
    const s = r.mode === 'self' && ['new','needs_fix'].includes(r.status) ? { label: 'Чекає подачі вами', color: 'var(--amber)' } : (STATUS[r.status] || STATUS.new);
    let a = '<button class="btn-quiet" onclick="Deleg.openSheet(\'' + r.id + '\')">📋 Бланк і дані</button>';
    if (['new','needs_fix'].includes(r.status)) a += '<button class="btn-quiet" onclick="Deleg.edit(\'' + r.id + '\')">' + (r.status === 'needs_fix' ? '✏️ Виправити' : 'Редагувати') + '</button>';
    a += '<button class="btn-quiet" onclick="Deleg.repeat(\'' + r.id + '\')">Наступний період</button>';
    if (!['done','cancelled'].includes(r.status)) a += '<button class="btn-quiet" onclick="Deleg.cancel(\'' + r.id + '\')">Скасувати</button>';
    return '<div class="req"' + (r.status === 'needs_fix' ? ' style="border-color:rgba(241,101,75,.55)"' : '') + '><div class="spread" style="align-items:flex-start;gap:10px"><div style="min-width:0">' +
      '<div style="font-weight:600">' + esc(r.driver_first + ' ' + r.driver_last) + ' · ' + esc(r.plate) + ' · ' + fmtD(r.date_from) + '–' + fmtD(r.date_to) +
        (r.is_test ? ' <span class="badge" style="background:rgba(245,166,35,.15);color:var(--amber)">🧪 тест</span>' : '') + (r.mode === 'self' ? ' <span class="badge badge-free">подаю сам</span>' : '') + '</div>' +
      '<div class="text-xs text-muted" style="margin-top:2px">' + esc(TYPES[r.carriage_type] || '') + ' · ' + esc(r.carrier_name) + ' · створено ' + timeAgo(r.created_at) + '</div></div>' +
      '<span class="badge" style="background:transparent;border:.5px solid ' + s.color + ';color:' + s.color + '">' + s.label + '</span></div>' +
      (r.admin_note ? '<div class="rv-reply text-sm" style="margin-top:10px;white-space:pre-line">' + (r.status === 'needs_fix' ? '⚠️ ' : '💬 ') + esc(r.admin_note) + '</div>' : '') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' + a + '</div></div>';
  }
  function renderList(){
    const l = $('dlList'); if (!l) return;
    const list = st.list.filter(r => st.filter === 'all' || (st.filter === 'done' ? r.status === 'done' : !['done','cancelled'].includes(r.status)));
    l.innerHTML = list.length ? list.map(card).join('') : '<div class="empty"><strong>' + (st.filter === 'active' ? 'Активних відряджень немає' : 'Відряджень ще немає') + '</strong>Заповніть форму вище — водій і контактна особа запамʼятаються.</div>';
  }
  function edit(id){ const r = find(id); if (!r) return; st.editId = id; st.rmpdId = null; renderForm(); fill(r); $('dlFormWrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function repeat(id){
    const r = find(id); if (!r) return; st.editId = null; st.rmpdId = null; renderForm();
    const from = r.date_to && r.date_to >= today() ? addDays(r.date_to, 1) : today();
    fill(Object.assign({}, r, { date_from: from, date_to: addDays(from, 10), issue_date: today(), client_note: '', poa_ok: false }));
    $('dlFormWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Дані підставлено — перевірте дати нового періоду');
  }
  function reset(){ st.editId = null; st.rmpdId = null; renderForm(); }
  async function cancel(id){
    if (!confirm('Скасувати заявку? Заморожені кошти повернуться на баланс.')) return;
    try{ const s = await setDelegStatus(id, 'cancelled'); const i = st.list.findIndex(x => x.id === id); if (i >= 0) st.list[i] = s; renderList(); badge(); refreshAcc(); showToast('Заявку скасовано'); }catch(e){ showToast(e.message, 'error'); }
  }

  return { mount, setMode, submit, pickRmpd, pickDriver, fromRmpd, openSheet, closeSheet, copy, copyAll, markDone, setFilter, edit, repeat, reset, cancel, sections, plain, STATUS, TYPES, TYPES_PL };
})();
window.Deleg = Deleg;
