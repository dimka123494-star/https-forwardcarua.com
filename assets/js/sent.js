/* sent.js — доповнення заявки SENT перевізником (PUESC).
   Польська сторона створює заявку й дає перевізнику номер SENT + ключ KD-…;
   перевізник доповнює свої дані, авто, локатор GPS, дати, пункти, документ.
   Більшість полів підставляється з картки RMPD, профілю перевізника й авто.
   Режими: «Подає оператор» (сума заморожується, списується при «Подано») і «Подаю сам».
   Потребує config.js, db.js і rmpd.js (довідники, латиниця, перевірка локатора). */
const Sent = (() => {
  const PUESC = 'https://puesc.gov.pl/';
  const DIRS = {
    import: { t: 'Ввезення в Польщу з-поза ЄС або транзит', f: 'SENT-301', entry: true, exit: 'opt' },
    eu_in: { t: 'Ввезення в Польщу з країни ЄС', f: 'SENT-202', entry: true, exit: false },
    export: { t: 'Вивезення з Польщі', f: 'SENT-102', entry: false, exit: true }
  };
  const STATUS = { new: { label: 'Нова', color: 'var(--blue, #3b82f6)' }, in_progress: { label: 'В роботі', color: 'var(--amber)' },
    needs_fix: { label: 'Потрібне уточнення', color: 'var(--red)' }, done: { label: 'Подано в PUESC', color: 'var(--green)' }, cancelled: { label: 'Скасовано', color: 'var(--muted)' } };
  const SENT_RE = /^SENT\d{14}$/, KEY_RE = /^KD-[1-9]{2}[XLANTCYDRUEFZPHMJSKW]{2}$/, BACKUP_RE = /^[AMU]\d{2}-[ABCEFGHKMNPRSTWXYZ]{2}\d{2}[ABCEFGHKMNPRSTWXYZ]{2}-\d$/;
  const LATIN = ['carrier_name','carrier_city','carrier_street','carrier_building','entry_point','exit_point','signer_first','signer_last','client_note'];

  let st = { el: null, broker: null, acc: null, prices: {}, list: [], contacts: [], rmpd: [], editId: null, rmpdId: null, mode: 'team', filter: 'active', sheet: null };
  const $ = id => document.getElementById(id);
  const v = id => { const e = $('sn-' + id); return e ? String(e.value || '').trim() : ''; };
  const set = (id, val) => { const e = $('sn-' + id); if (e && val !== undefined && val !== null) e.value = val; };
  const tr = s => Rmpd.translit(s);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const fmtD = d => d ? d.split('-').reverse().join('.') : '—';
  const normSent = s => String(s || '').toUpperCase().replace(/[\s\-_.]/g, '').replace(/^CEHT|^СЕНТ/, 'SENT');
  const normKey = s => { const x = String(s || '').toUpperCase().replace(/\s/g, '').replace(/[КК]/g, 'K').replace(/Д/g, 'D'); return /^KD\w{4}$/.test(x) ? 'KD-' + x.slice(2) : x; };
  const normPhonePL = s => { const d = String(s || '').replace(/\D/g, ''); return d.length === 11 && d.startsWith('48') ? d.slice(2) : d; };
  const store = (k, val) => { try { if (val === undefined) return localStorage.getItem('sent_' + k); localStorage.setItem('sent_' + k, val); } catch(e){ return null; } };
  const price = m => Number(st.prices[m === 'self' ? 'sent_self' : 'sent'] || 0);

  /* ---------- Монтування ---------- */
  async function mount(el, { broker }){
    st.el = el; st.broker = broker; st.mode = store('mode') === 'self' ? 'self' : 'team';
    el.innerHTML = '<div class="empty">Завантаження…</div>';
    const [acc, list, contacts, rmpd, prices] = await Promise.all([rmpdAccess(broker.id), mySent(broker.id), rmpdContacts(broker.id), myRmpd(broker.id), servicePrices().catch(() => [])]);
    st.acc = acc || {}; st.list = list; st.contacts = contacts; st.rmpd = rmpd;
    (prices || []).forEach(p => { if (p.active) st.prices[p.code] = Number(p.price); });
    render(); badge();
    if (st.pending){ const r = st.pending; st.pending = null; fromRmpd(r); }
  }
  function badge(){ const b = $('snBadge'); if (!b) return; const n = st.list.filter(r => r.status === 'needs_fix').length; b.textContent = n; b.style.display = n ? '' : 'none'; }
  async function refreshAcc(){ st.acc = await rmpdAccess(st.broker.id); renderTop(); }

  function render(){
    st.el.innerHTML = '<div id="snTop"></div><div id="snFormWrap"></div>' +
      '<div class="spread" style="margin:1.5rem 0 .75rem"><div class="card-title" style="margin:0">Мої заявки SENT</div><div class="pchips">' +
        [['active','Активні'],['done','Подані'],['all','Всі']].map(([k, l]) => '<button class="chip' + (st.filter === k ? ' active' : '') + '" onclick="Sent.setFilter(\'' + k + '\')">' + l + '</button>').join('') +
      '</div></div><div id="snList"></div>' +
      '<div class="card card-tight" style="margin-top:1rem"><div class="card-title">Що важливо знати</div><p class="text-sm text-muted">SENT — це польський контроль перевезень «чутливих» товарів (паливо, олії, алкоголь, тютюн, сухофрукти тощо). Заявку створює польська сторона — відправник або одержувач — і передає перевізнику <strong style="color:var(--text)">номер SENT</strong> і <strong style="color:var(--text)">ключ перевізника KD-…</strong>. Перевізник доповнює її до початку руху Польщею. Локатор GPS має бути увімкнений весь час руху Польщею — без цього штраф навіть за правильно поданої заявки. Якщо попросите партнера, він може вписати дані перевізника сам — тоді доповнювати не треба.</p></div>';
    renderTop(); renderForm(); renderList();
  }
  function renderTop(){
    const a = st.acc || {}, top = $('snTop'); if (!top) return;
    const avail = Number(a.available || 0), need = price(st.mode);
    top.innerHTML = (a.test ? '<div class="msg show" style="margin:0 0 12px;background:rgba(245,166,35,.12);color:var(--amber);border:.5px solid rgba(245,166,35,.35)">🧪 <strong>Тестовий режим адміністратора.</strong> Заявки тестові й безкоштовні.</div>' : '') +
      '<div class="card card-tight" style="margin-bottom:12px"><div class="spread" style="gap:12px;flex-wrap:wrap"><div><div class="text-xs text-muted">Баланс</div>' +
        '<div style="font-family:var(--display);font-size:26px;line-height:1.1">' + uah(avail) + '</div>' +
        '<div class="text-xs text-muted">SENT: оператор — <strong style="color:var(--text)">' + uah(price('team')) + '</strong>, самостійно — <strong style="color:var(--text)">' + uah(price('self')) + '</strong>. Баланс спільний з RMPD і CMR.</div></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + [1000, 2000].map(n => '<button class="btn btn-ghost btn-sm" onclick="Rmpd.topup(' + n + ')">+ ' + n.toLocaleString('uk-UA') + '</button>').join('') +
        '<button class="btn btn-ghost btn-sm" onclick="Rmpd.topup()">Інша сума</button></div></div></div>' +
      (!a.test && need && avail < need ? '<div class="msg msg-err show" style="margin:0 0 12px">Щоб подати заявку, поповніть баланс щонайменше на ' + uah(need - avail) + '.</div>' : '');
  }

  /* ---------- Форма ---------- */
  const fld = (id, label, attrs = '', hint = '') => '<div class="field"><label class="label" for="sn-' + id + '">' + label + '</label><input class="input" id="sn-' + id + '" autocomplete="off" spellcheck="false" ' + attrs + '>' +
    '<div class="hint" id="sn-' + id + '-hint">' + hint + '</div></div>';
  const sel = (id, label, options, attrs = '') => '<div class="field"><label class="label" for="sn-' + id + '">' + label + '</label><select class="input" id="sn-' + id + '" ' + attrs + '>' + options + '</select></div>';
  const row = (...c) => '<div class="field-row">' + c.join('') + '</div>';
  const sec = t => '<div class="card-title" style="margin-top:1.25rem">' + t + '</div>';
  const modeOf = () => st.editId ? ((find(st.editId) || {}).mode || 'team') : st.mode;
  function modeBlock(){
    if (st.editId) return modeOf() === 'self' ? '<p class="hint">Режим: подаєте самі в PUESC.</p>' : '';
    const card = (m, icon, title, text) => '<button type="button" class="card card-tight" onclick="Sent.setMode(\'' + m + '\')" style="text-align:left;cursor:pointer;flex:1;min-width:150px;margin:0;' +
      (st.mode === m ? 'border-color:var(--green);box-shadow:0 0 0 1px var(--green)' : 'opacity:.85') + '"><div style="font-weight:600">' + icon + ' ' + title + '</div>' +
      '<div style="font-family:var(--display);font-size:18px;margin:2px 0">' + uah(price(m)) + '</div><div class="text-xs text-muted">' + text + '</div></button>';
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px">' +
      card('team', '👨‍💼', 'Подає оператор', 'Перевіримо й внесемо дані в PUESC від вашого імені. Оплата — лише коли подано.') +
      card('self', '🙋', 'Подаю сам', 'Перевіримо дані й дамо їх у порядку полів PUESC — вносите самі.') + '</div>';
  }
  function setMode(m){ if (st.mode === m) return; const keep = readForm(); st.mode = m; store('mode', m); renderTop(); renderForm(); fill(keep); }
  function renderForm(){
    const w = $('snFormWrap'); if (!w) return; st.sheet = null;
    const crossings = Rmpd.crossings(), C = Rmpd.COUNTRIES;
    const cOpts = (selv) => Object.entries(C).map(([k, n]) => '<option value="' + k + '"' + (k === selv ? ' selected' : '') + '>' + k + ' — ' + n + '</option>').join('');
    const rm = st.rmpd.filter(r => r.status !== 'cancelled').slice(0, 15);
    w.innerHTML = '<div class="card" id="snForm"><div class="spread"><div class="card-title" style="margin:0">' + (st.editId ? '✏️ Редагування заявки SENT' : '📦 Доповнити заявку SENT') + '</div>' +
        (st.editId ? '<button class="btn-quiet" onclick="Sent.reset()">Скасувати редагування</button>' : '') + '</div>' +
      modeBlock() +
      (!st.editId && rm.length ? sel('pick', 'Підставити дані з рейсу RMPD', '<option value="">— заповнити вручну —</option>' + rm.map(r => '<option value="' + r.id + '"' + (r.id === st.rmpdId ? ' selected' : '') + '>' + esc(r.plate) + ' · ' + esc(r.entry_point || r.load_place || '') + ' · ' + fmtD(r.start_date) + '</option>').join(''), 'onchange="Sent.pickRmpd(this.value)"') : '') +
      sec('1. Від польського партнера') +
      row(fld('sent_number', 'Номер заявки SENT *', 'placeholder="SENT20261107123456" style="text-transform:uppercase" inputmode="text"'),
          fld('carrier_key', 'Ключ перевізника *', 'placeholder="KD-12XL" style="text-transform:uppercase"', 'Партнер бачить його у своїй заявці SENT')) +
      sel('direction', 'Напрямок', Object.entries(DIRS).map(([k, d]) => '<option value="' + k + '">' + d.t + ' (' + d.f + ')</option>').join(''), 'onchange="Sent.dirChanged()"') +
      sec('2. Перевізник') +
      fld('carrier_name', 'Назва латиницею *', 'placeholder="TOV FORVARD KAR IUA"') +
      row(sel('carrier_id_type', 'Тип ідентифікатора', '<option value="INNY">ЄДРПОУ / інший код</option><option value="VAT">EU VAT</option><option value="NIP">NIP (Польща)</option>'),
          fld('carrier_id', 'Номер *', 'inputmode="numeric" placeholder="45002097"')) +
      row(sel('carrier_country', 'Країна', cOpts('UA')), fld('carrier_city', 'Місто *', 'placeholder="Kyiv"')) +
      row(fld('carrier_street', 'Вулиця *', 'placeholder="Kyivska"'), fld('carrier_building', 'Будинок *', 'placeholder="1"')) +
      fld('carrier_postcode', 'Індекс *', 'inputmode="numeric" placeholder="01001"') +
      sec('3. Авто й локатор') +
      row(fld('plate', 'Тягач *', 'style="text-transform:uppercase" placeholder="AA1234BB"'), fld('trailer_plate', 'Причіп', 'style="text-transform:uppercase"')) +
      fld('gps_id', 'Номер локатора GPS (ZSL) *', 'maxlength="20" placeholder="Z17-AA00AA-3" style="text-transform:uppercase"', 'З договору з оператором локатора. Перевіряємо формат і контрольну цифру.') +
      fld('gps_backup', 'Резервний локатор (застосунок SENT GEO)', 'maxlength="20" placeholder="M26-AB12CD-5" style="text-transform:uppercase"', 'Необовʼязково. Номер з мобільного застосунку на випадок збою основного.') +
      row(fld('carrier_email', 'Email перевізника', 'type="email" inputmode="email"', 'На нього прийдуть повідомлення PUESC'),
          fld('sms_phone', 'Польський телефон для SMS', 'inputmode="numeric" placeholder="501234567"', 'Лише польський номер (9 цифр), якщо є')) +
      fld('permit_number', 'Номер дозволу / ліцензії', '', 'Якщо для перевезення потрібен дозвіл') +
      sec('4. Рейс') +
      row(fld('start_date', 'Дата початку *', 'type="date"'), fld('end_date', 'Запланована дата завершення *', 'type="date"')) +
      '<datalist id="snCross">' + crossings.map(c => '<option value="' + c + '">').join('') + '</datalist>' +
      row(fld('entry_point', 'Пункт вʼїзду в Польщу *', 'list="snCross" placeholder="Dorohusk"'), fld('exit_point', 'Пункт виїзду з Польщі', 'list="snCross"')) +
      sec('5. Документ') +
      row(fld('doc_type', 'Вид документа', 'value="CMR"'), fld('doc_number', 'Номер документа *', 'placeholder="№ CMR"')) +
      (modeOf() === 'self' ? sec('6. Хто подає') + row(fld('signer_first', 'Імʼя латиницею *'), fld('signer_last', 'Прізвище латиницею *')) : '') +
      '<details style="margin-top:12px"><summary class="text-sm" style="cursor:pointer">Коментар для оператора</summary><div class="field" style="margin-top:8px"><textarea class="input" id="sn-client_note" rows="2"></textarea></div></details>' +
      '<div class="msg" id="snMsg"></div>' +
      '<button class="btn btn-primary btn-block" id="snSave" onclick="Sent.submit()">' + submitLabel() + '</button>' +
      '<p class="hint" style="margin-top:8px">Подаючи заявку через оператора, ви доручаєте нам внести ці дані в PUESC від імені перевізника.</p></div>';
    ['sent_number'].forEach(k => $('sn-' + k).addEventListener('blur', e => { e.target.value = normSent(e.target.value); hint('sent_number', e.target.value && !SENT_RE.test(e.target.value) ? '⚠️ Має бути SENT і 14 цифр' : ''); }));
    $('sn-carrier_key').addEventListener('blur', e => { e.target.value = normKey(e.target.value); hint('carrier_key', e.target.value && !KEY_RE.test(e.target.value) ? '⚠️ Формат: KD-12XL (дві цифри 1–9 і дві літери)' : 'Партнер бачить його у своїй заявці SENT'); });
    ['plate', 'trailer_plate'].forEach(k => $('sn-' + k).addEventListener('blur', e => { e.target.value = Rmpd.normPlate(e.target.value); }));
    $('sn-gps_id').addEventListener('blur', e => { e.target.value = Rmpd.normGps(e.target.value); gpsHint(); });
    $('sn-gps_backup').addEventListener('blur', e => { e.target.value = Rmpd.normGps(e.target.value); hint('gps_backup', e.target.value && !BACKUP_RE.test(e.target.value) ? '⚠️ Резервний номер починається з A, M або U, напр. M26-AB12CD-5' : 'Необовʼязково. Номер з мобільного застосунку на випадок збою основного.'); });
    $('sn-sms_phone').addEventListener('blur', e => { e.target.value = normPhonePL(e.target.value); });
    ['entry_point', 'exit_point'].forEach(k => $('sn-' + k).addEventListener('blur', e => { e.target.value = Rmpd.normCross(e.target.value); }));
    LATIN.forEach(k => { const e = $('sn-' + k); if (e && !['entry_point','exit_point'].includes(k)) e.addEventListener('blur', () => { e.value = tr(e.value); }); });
    $('sn-start_date').addEventListener('change', () => { if (!v('end_date') || v('end_date') < v('start_date')) set('end_date', addDays(v('start_date'), 3)); });
    if (!st.editId) prefillCarrier();
    dirChanged();
  }
  function submitLabel(){ const m = modeOf(); if (st.editId) return 'Зберегти зміни'; const p = price(m); return (m === 'self' ? 'Перевірити й отримати дані' : 'Надіслати оператору') + (p && !(st.acc || {}).test ? ' · ' + uah(p) : ''); }
  function hint(id, t){ const h = $('sn-' + id + '-hint'); if (h){ h.textContent = t; h.style.color = /⚠️/.test(t) ? 'var(--amber)' : ''; } }
  function gpsHint(){ const g = v('gps_id'); hint('gps_id', !g ? 'З договору з оператором локатора. Перевіряємо формат і контрольну цифру.' : Rmpd.gpsOk(g) ? '✓ Формат і контрольна цифра правильні' : '⚠️ Номер не проходить перевірку PUESC — звірте кожен символ із договором'); }
  function dirChanged(){
    const d = DIRS[v('direction')] || DIRS.import;
    const en = $('sn-entry_point'), ex = $('sn-exit_point');
    if (en) en.closest('.field').style.display = d.entry ? '' : 'none';
    if (ex){ ex.closest('.field').style.display = d.exit ? '' : 'none'; ex.closest('.field').querySelector('.label').textContent = d.exit === true ? 'Пункт виїзду з Польщі *' : 'Пункт виїзду з Польщі (для транзиту)'; }
  }

  function prefillCarrier(){
    const c = st.contacts.find(x => x.kind === 'carrier'); if (!c) return;
    const d = c.data || {};
    fill({ carrier_name: d.carrier_name, carrier_id: d.carrier_code, carrier_country: d.carrier_country, carrier_city: d.carrier_city,
      carrier_postcode: d.carrier_postcode, carrier_street: d.carrier_street, carrier_building: d.carrier_building, carrier_email: d.carrier_email });
  }
  function fill(o){ if (!o) return; Object.entries(o).forEach(([k, val]) => { if (val !== undefined && val !== null && val !== '') set(k, val); }); if ($('sn-gps_id')) gpsHint(); dirChanged(); }
  const FIELDS = ['sent_number','carrier_key','direction','carrier_name','carrier_id_type','carrier_id','carrier_country','carrier_city','carrier_street','carrier_building','carrier_postcode',
    'plate','trailer_plate','gps_id','gps_backup','carrier_email','sms_phone','permit_number','start_date','end_date','entry_point','exit_point','doc_type','doc_number','signer_first','signer_last','client_note'];
  function readForm(){ const o = {}; FIELDS.forEach(f => { if ($('sn-' + f)) o[f] = v(f); }); return o; }
  function fromRmpdData(r){
    return { carrier_name: r.carrier_name, carrier_id: r.carrier_code, carrier_id_type: r.carrier_id_type === 'VAT' || r.carrier_id_type === 'NIP' ? r.carrier_id_type : 'INNY',
      carrier_country: r.carrier_country, carrier_city: r.carrier_city, carrier_postcode: r.carrier_postcode, carrier_street: r.carrier_street, carrier_building: r.carrier_building,
      carrier_email: r.carrier_email || r.contact_email, plate: r.plate, trailer_plate: r.trailer_plate, gps_id: r.gps_id, permit_number: r.permit_number,
      start_date: r.start_date, end_date: r.end_date, entry_point: r.entry_point, exit_point: r.exit_point, doc_type: r.cmr_type || 'CMR', doc_number: r.cmr_number,
      direction: r.load_country === 'PL' ? 'export' : (r.load_country && ['AT','BE','BG','CY','CZ','DE','DK','EE','GR','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PT','RO','SE','SI','SK'].includes(r.load_country) ? 'eu_in' : 'import') };
  }
  function pickRmpd(id){ st.rmpdId = id || null; const r = st.rmpd.find(x => x.id === id); if (r) fill(fromRmpdData(r)); }
  function fromRmpd(r){
    if (!r) return;
    const btn = document.querySelector('[data-pane=sent]'); if (typeof pane === 'function' && btn) pane('sent', btn);
    if (!st.el || !$('snFormWrap')){ st.pending = r; return; }
    st.editId = null; st.rmpdId = r.id; renderForm(); fill(fromRmpdData(r));
    const p = $('sn-pick'); if (p) p.value = r.id;
    $('snFormWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Дані з рейсу підставлено — впишіть номер SENT і ключ від польського партнера');
  }

  function validate(r, mode){
    const miss = [], d = DIRS[r.direction] || DIRS.import;
    const need = (f, l) => { if (!r[f]) miss.push(l); };
    need('sent_number', 'номер SENT'); need('carrier_key', 'ключ перевізника'); need('carrier_name', 'назва перевізника'); need('carrier_id', 'код перевізника');
    need('carrier_city', 'місто'); need('carrier_street', 'вулиця'); need('carrier_building', 'будинок'); need('carrier_postcode', 'індекс');
    need('plate', 'тягач'); need('gps_id', 'локатор GPS'); need('start_date', 'дата початку'); need('end_date', 'дата завершення'); need('doc_number', 'номер документа');
    if (d.entry) need('entry_point', 'пункт вʼїзду'); if (d.exit === true) need('exit_point', 'пункт виїзду');
    if (mode === 'self'){ need('signer_first', 'імʼя'); need('signer_last', 'прізвище'); }
    if (miss.length) return 'Заповніть: ' + miss.join(', ');
    if (!SENT_RE.test(r.sent_number)) return 'Номер SENT має вигляд SENT і 14 цифр, напр. SENT20261107123456 — перепишіть його з повідомлення партнера';
    if (!KEY_RE.test(r.carrier_key)) return 'Ключ перевізника має вигляд KD-12XL — перепишіть його з повідомлення партнера';
    if (r.end_date < r.start_date) return 'Дата завершення раніше за дату початку';
    if (r.start_date < addDays(today(), -1)) return 'Дата початку вже минула — уточніть її в партнера';
    if (r.gps_backup && !BACKUP_RE.test(r.gps_backup)) return 'Резервний локатор має вигляд M26-AB12CD-5 (починається з A, M або U)';
    if (r.sms_phone && !/^\d{9}$/.test(r.sms_phone)) return 'Телефон для SMS — лише польський номер з 9 цифр';
    if (r.carrier_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.carrier_email)) return 'Перевірте email перевізника';
    return '';
  }
  async function submit(){
    const msg = $('snMsg'), btn = $('snSave');
    const r = readForm(), mode = modeOf();
    r.sent_number = normSent(r.sent_number); r.carrier_key = normKey(r.carrier_key);
    r.plate = Rmpd.normPlate(r.plate); r.trailer_plate = r.trailer_plate ? Rmpd.normPlate(r.trailer_plate) : '';
    r.gps_id = Rmpd.normGps(r.gps_id); r.gps_backup = r.gps_backup ? Rmpd.normGps(r.gps_backup) : ''; r.sms_phone = normPhonePL(r.sms_phone);
    LATIN.forEach(k => { if (r[k] && !['entry_point','exit_point'].includes(k)) r[k] = tr(r[k]); });
    r.entry_point = Rmpd.normCross(r.entry_point); r.exit_point = Rmpd.normCross(r.exit_point);
    const d = DIRS[r.direction] || DIRS.import; if (!d.entry) r.entry_point = ''; if (!d.exit) r.exit_point = '';
    const e = validate(r, mode);
    if (e){ msg.className = 'msg msg-err show'; msg.textContent = e; return; }
    if (!Rmpd.gpsOk(r.gps_id) && !confirm('Номер локатора «' + r.gps_id + '» не проходить перевірку формату PUESC. Найчастіше це помилка в одному символі. Все одно надіслати?')) return;
    Object.keys(r).forEach(k => { if (r[k] === '') r[k] = null; });
    btn.disabled = true; msg.className = 'msg';
    try{
      let saved;
      if (st.editId) saved = await saveSent(r, st.editId);
      else saved = await saveSent(Object.assign({ owner_id: st.broker.id, rmpd_id: st.rmpdId, mode }, r));
      const i = st.list.findIndex(x => x.id === saved.id); if (i >= 0) st.list[i] = saved; else st.list.unshift(saved);
      const wasEdit = !!st.editId; st.editId = null; st.rmpdId = null;
      if (!wasEdit){ refreshAcc(); try { track('sent_submit', { id: saved.id, test: !!saved.is_test, mode: saved.mode, value: Number(saved.price) || 0, currency: 'UAH' }); } catch(e){} }
      renderList(); badge();
      if (saved.mode === 'self'){ openSheet(saved.id); showToast('Дані перевірено — вносьте в PUESC'); }
      else { renderForm(); showToast(wasEdit ? 'Зміни надіслано оператору' : 'Заявку надіслано — повідомимо в Telegram, щойно подамо'); }
    }catch(err){ msg.className = 'msg msg-err show'; msg.textContent = err.message; btn.disabled = false; }
  }

  /* ---------- Дані для PUESC (польські назви полів) ---------- */
  function sections(r){
    const d = x => x ? x.split('-').reverse().join('.') : '';
    const dir = DIRS[r.direction] || DIRS.import;
    return [
      ['Zgłoszenie (' + dir.f + ')', [['Numer referencyjny zgłoszenia', r.sent_number], ['Klucz przewoźnika', r.carrier_key]]],
      ['Przewoźnik', [['Nazwa', r.carrier_name], ['Typ identyfikatora', r.carrier_id_type], ['Numer identyfikatora', r.carrier_id], ['Ulica', r.carrier_street], ['Nr domu', r.carrier_building],
        ['Miejscowość', r.carrier_city], ['Kod pocztowy', r.carrier_postcode], ['Kraj', r.carrier_country]]],
      ['Środek transportu', [['Nr rejestracyjny pojazdu', r.plate], ['Nr rejestracyjny przyczepy / naczepy', r.trailer_plate], ['Nr zezwolenia / licencji', r.permit_number],
        ['Nr lokalizatora (ZSL)', r.gps_id], ['Zapasowy nr lokalizatora', r.gps_backup], ['E-mail przewoźnika', r.carrier_email], ['Telefon do powiadomień SMS', r.sms_phone]]],
      ['Przewóz', [['Data rozpoczęcia przewozu', d(r.start_date)], ['Planowana data zakończenia', d(r.end_date)], ['Miejsce wjazdu na terytorium Polski', r.entry_point], ['Miejsce wyjazdu poza terytorium Polski', r.exit_point]]],
      ['Dokument przewozowy', [['Rodzaj dokumentu', r.doc_type], ['Numer dokumentu', r.doc_number]]],
      ['Oświadczenie', [['Imię', r.signer_first], ['Nazwisko', r.signer_last]]]
    ].map(([t, rows]) => [t, rows.filter(x => x[1])]).filter(x => x[1].length);
  }
  const plain = r => sections(r).map(([t, rows]) => t + '\n' + rows.map(x => x[0] + ': ' + x[1]).join('\n')).join('\n\n');
  function openSheet(id){
    const r = find(id); if (!r) return; st.sheet = id;
    const done = r.status === 'done', dir = DIRS[r.direction] || DIRS.import;
    $('snFormWrap').innerHTML = '<div class="card"><div class="spread"><div class="card-title" style="margin:0">📋 Дані для ' + dir.f + ' · ' + esc(r.plate) + '</div><button class="btn-quiet" onclick="Sent.closeSheet()">Закрити</button></div>' +
      (done ? '' : '<ol class="text-sm" style="margin:12px 0 4px 18px;line-height:1.6"><li>Увійдіть на <a href="' + PUESC + '" target="_blank" rel="noopener">puesc.gov.pl</a> зі свого акаунта.</li>' +
        '<li>Відкрийте форму <strong>' + dir.f + '</strong> («Uzupełnienie zgłoszenia przez przewoźnika»).</li><li>Натисніть на рядок нижче — значення скопіюється, вставте його в однойменне поле.</li>' +
        '<li>Після відправки PUESC підтвердить прийняття — натисніть «Я подав» нижче.</li></ol>') +
      '<div style="margin:10px 0"><button class="btn btn-ghost btn-sm" onclick="Sent.copyAll(\'' + r.id + '\')"><i class="ti ti-clipboard-text"></i> Скопіювати все текстом</button></div>' +
      sections(r).map(([t, rows]) => '<div class="card-title" style="margin:10px 0 6px">' + t + '</div>' + rows.map(x => '<div class="svc-line" style="padding:6px 12px;margin-bottom:4px;cursor:pointer" onclick="Sent.copy(this.dataset.v)" data-v="' + esc(x[1]) + '">' +
        '<span class="text-xs text-muted">' + x[0] + '</span><span class="text-sm" style="text-align:right;word-break:break-word">' + esc(x[1]) + ' <i class="ti ti-copy" style="opacity:.5"></i></span></div>').join('')).join('') +
      (done ? '<div class="msg msg-ok show" style="margin-top:14px">✓ Подано ' + (r.done_at ? new Date(r.done_at).toLocaleString('uk-UA') : '') + '</div>'
        : r.mode === 'self' ? '<button class="btn btn-primary btn-block" style="margin-top:14px" onclick="Sent.markDone(\'' + r.id + '\')">✓ Я подав у PUESC</button>' : '') + '</div>';
    $('snFormWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeSheet(){ st.sheet = null; renderForm(); }
  async function copy(t){ try{ await navigator.clipboard.writeText(t); showToast('Скопійовано: ' + String(t).slice(0, 40)); }catch(e){ showToast(t); } }
  async function copyAll(id){ const r = find(id); if (!r) return; try{ await navigator.clipboard.writeText(plain(r)); showToast('Усі дані скопійовано'); }catch(e){} }
  async function markDone(id){
    if (!confirm('Підтверджуєте, що PUESC прийняв доповнення заявки?')) return;
    try{ const s = await setSentStatus(id, 'done'); const i = st.list.findIndex(x => x.id === id); if (i >= 0) st.list[i] = s; renderList(); openSheet(id); showToast('Гарної дороги! Не забудьте увімкнути локатор'); }catch(e){ showToast(e.message, 'error'); }
  }

  /* ---------- Список ---------- */
  const find = id => st.list.find(x => x.id === id);
  function setFilter(f){ st.filter = f; render(); }
  function card(r){
    const s = r.mode === 'self' && ['new','needs_fix'].includes(r.status) ? { label: 'Чекає подачі вами', color: 'var(--amber)' } : (STATUS[r.status] || STATUS.new);
    const dir = DIRS[r.direction] || DIRS.import;
    let a = '';
    if (r.mode === 'self' && r.status !== 'cancelled') a += '<button class="btn-quiet" onclick="Sent.openSheet(\'' + r.id + '\')">📋 Дані для PUESC</button>';
    if (r.mode !== 'self' && r.status === 'done') a += '<button class="btn-quiet" onclick="Sent.openSheet(\'' + r.id + '\')">📋 Подані дані</button>';
    if (['new','needs_fix'].includes(r.status)) a += '<button class="btn-quiet" onclick="Sent.edit(\'' + r.id + '\')">' + (r.status === 'needs_fix' ? '✏️ Виправити' : 'Редагувати') + '</button>';
    a += '<button class="btn-quiet" onclick="Sent.repeat(\'' + r.id + '\')">Повторити</button>';
    if (!['done','cancelled'].includes(r.status)) a += '<button class="btn-quiet" onclick="Sent.cancel(\'' + r.id + '\')">Скасувати</button>';
    return '<div class="req"' + (r.status === 'needs_fix' ? ' style="border-color:rgba(241,101,75,.55)"' : '') + '><div class="spread" style="align-items:flex-start;gap:10px"><div style="min-width:0">' +
      '<div style="font-weight:600">' + esc(r.plate) + (r.trailer_plate ? ' / ' + esc(r.trailer_plate) : '') + ' · ' + esc(r.entry_point || r.exit_point || '') + ' · ' + fmtD(r.start_date) +
        (r.is_test ? ' <span class="badge" style="background:rgba(245,166,35,.15);color:var(--amber)">🧪 тест</span>' : '') + (r.mode === 'self' ? ' <span class="badge badge-free">подаю сам</span>' : '') + '</div>' +
      '<div class="text-xs text-muted" style="margin-top:2px">' + esc(r.sent_number) + ' · ' + dir.f + ' · ' + dir.t.toLowerCase() + ' · створено ' + timeAgo(r.created_at) + '</div></div>' +
      '<span class="badge" style="background:transparent;border:.5px solid ' + s.color + ';color:' + s.color + '">' + s.label + '</span></div>' +
      (r.admin_note ? '<div class="rv-reply text-sm" style="margin-top:10px;white-space:pre-line">' + (r.status === 'needs_fix' ? '⚠️ ' : '💬 ') + esc(r.admin_note) + '</div>' : '') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' + a + '</div></div>';
  }
  function renderList(){
    const l = $('snList'); if (!l) return;
    const list = st.list.filter(r => st.filter === 'all' || (st.filter === 'done' ? r.status === 'done' : !['done','cancelled'].includes(r.status)));
    l.innerHTML = list.length ? list.map(card).join('') : '<div class="empty"><strong>' + (st.filter === 'active' ? 'Активних заявок немає' : 'Заявок ще немає') + '</strong>Отримали від польського партнера номер SENT і ключ KD-…? Заповніть форму вище.</div>';
  }
  function edit(id){ const r = find(id); if (!r) return; st.editId = id; st.rmpdId = null; renderForm(); fill(r); $('snFormWrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function repeat(id){
    const r = find(id); if (!r) return; st.editId = null; st.rmpdId = null; renderForm();
    const d = Object.assign({}, r, { sent_number: '', carrier_key: '', doc_number: '', client_note: '', start_date: addDays(today(), 1), end_date: addDays(today(), 4) });
    fill(d); $('snFormWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Дані авто й перевізника підставлено — впишіть новий номер SENT і ключ');
  }
  function reset(){ st.editId = null; st.rmpdId = null; renderForm(); }
  async function cancel(id){
    if (!confirm('Скасувати заявку SENT? Заморожені кошти повернуться на баланс.')) return;
    try{ const s = await setSentStatus(id, 'cancelled'); const i = st.list.findIndex(x => x.id === id); if (i >= 0) st.list[i] = s; renderList(); badge(); refreshAcc(); showToast('Заявку скасовано'); }catch(e){ showToast(e.message, 'error'); }
  }

  return { mount, setMode, submit, dirChanged, pickRmpd, fromRmpd, openSheet, closeSheet, copy, copyAll, markDone, setFilter, edit, repeat, reset, cancel, sections, plain, DIRS, STATUS };
})();
window.Sent = Sent;
