/* rmpd.js — подача заявок RMPD (Польща, SENT/RMPD на PUESC) з кабінету.
   Перевізник: безкоштовно 3 заявки/міс, на платних тарифах — без ліміту.
   Митний брокер: тариф «Преміум» — подає за своїх клієнтів-перевізників.
   Заявку вносить у PUESC оператор; номер RMPD приходить у кабінет і Telegram.
   Потребує config.js і db.js. */
const Rmpd = (() => {
  const PUESC = 'https://puesc.gov.pl/';
  /* Пункти пропуску на кордоні Польща — Україна (вантажні), назви як у PUESC */
  const UA_CROSS = [
    ['Dorohusk', 'Дорогуськ — Ягодин'],
    ['Dołhobyczów', 'Долгобичув — Угринів'],
    ['Hrebenne', 'Хребенне — Рава-Руська'],
    ['Korczowa', 'Корчова — Краковець'],
    ['Medyka', 'Медика — Шегині'],
    ['Budomierz', 'Будомєж — Грушів'],
    ['Krościenko', 'Кросценко — Смільниця'],
    ['Zosin', 'Зосин — Устилуг']
  ];
  /* Інші типові пункти в’їзду/виїзду з Польщі */
  const OTHER_CROSS = ['Świecko', 'Kołbaskowo', 'Jędrzychowice', 'Olszyna', 'Gubinek', 'Lubieszyn', 'Gorzyczki', 'Cieszyn',
    'Chyżne', 'Barwinek', 'Łysa Polana', 'Kudowa-Słone', 'Budzisko', 'Terespol', 'Kukuryki', 'Port Gdańsk', 'Port Gdynia'];
  const COUNTRIES = { UA:'Україна', PL:'Польща', DE:'Німеччина', LT:'Литва', LV:'Латвія', EE:'Естонія', SK:'Словаччина', CZ:'Чехія',
    HU:'Угорщина', RO:'Румунія', MD:'Молдова', AT:'Австрія', NL:'Нідерланди', BE:'Бельгія', FR:'Франція', IT:'Італія', ES:'Іспанія',
    DK:'Данія', SE:'Швеція', FI:'Фінляндія', BG:'Болгарія', GR:'Греція', TR:'Туреччина', GB:'Велика Британія', CH:'Швейцарія', NO:'Норвегія' };
  const PERMIT = { eu_ua:'Угода ЄС–Україна (без дозволу)', bilateral:'Двосторонній дозвіл', transit:'Транзитний дозвіл',
    third:'Дозвіл на перевезення з/у треті країни', ecmt:'Дозвіл ЄКМТ (CEMT)', other:'Інше / не знаю' };
  const GPS = { sent_geo:'Застосунок SENT GEO на телефоні водія', zsl:'Локатор ZSL (сертифікований)', external:'Зовнішня система (GPS-провайдер)' };
  const FIELDS = ['carrier_name','carrier_country','carrier_code','carrier_address','plate','plate_country','trailer_plate','trailer_country',
    'driver_first','driver_last','driver_phone','cargo_desc','cargo_weight_t','sender_name','sender_country','sender_address',
    'recipient_name','recipient_country','recipient_address','load_country','load_place','unload_country','unload_place',
    'entry_point','exit_point','start_date','end_date','permit_type','gps_mode','gps_id','client_note'];
  const LATIN = ['carrier_name','carrier_address','driver_first','driver_last','cargo_desc','sender_name','sender_address',
    'recipient_name','recipient_address','load_place','unload_place','entry_point','exit_point','gps_id'];

  let st = { el: null, broker: null, acc: null, list: [], contacts: [], vehicles: [], editId: null, parent: null, filter: 'active' };
  const $ = id => document.getElementById(id);
  const opt = (o, sel, empty) => (empty ? '<option value="">' + empty + '</option>' : '') +
    Object.entries(o).map(([k, v]) => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtD = d => d ? d.split('-').reverse().join('.') : '—';
  const isCarrier = () => st.broker && st.broker.kind === 'carrier';

  /* ---------- Латиниця: транслітерація за постановою КМУ №55 (2010) ---------- */
  const TR = { а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ie',ж:'zh',з:'z',и:'y',і:'i',ї:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',
    п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'iu',я:'ia',ʼ:'',"'":'','’':'',
    ё:'e',ы:'y',э:'e',ъ:'' };
  const TR_START = { є:'ye', ї:'yi', й:'y', ю:'yu', я:'ya' };
  function translit(s){
    s = String(s || '').replace(/зг/g, 'zgh').replace(/Зг/g, 'Zgh').replace(/ЗГ/g, 'ZGH');
    return s.replace(/[А-Яа-яЁёЄєІіЇїҐґʼ’']/g, (ch, i) => {
      const lo = ch.toLowerCase();
      const start = i === 0 || /[\s\-.,«»"(]/.test(s[i - 1]);
      let r = (start && TR_START[lo]) || TR[lo];
      if (r === undefined) return ch;
      if (ch !== lo && r) {
        const nextUpper = s[i + 1] && s[i + 1] !== s[i + 1].toLowerCase();
        r = nextUpper ? r.toUpperCase() : r[0].toUpperCase() + r.slice(1);
      }
      return r;
    }).replace(/[«»„“”]/g, '"').replace(/[–—]/g, '-').replace(/№/g, 'No');
  }
  /* Держномери: кирилиця, схожа на латиницю → латиниця, без пробілів і дефісів */
  const PLATE_MAP = { А:'A',В:'B',Е:'E',І:'I',К:'K',М:'M',Н:'H',О:'O',Р:'P',С:'C',Т:'T',Х:'X',У:'Y' };
  function normPlate(s){ return String(s || '').toUpperCase().replace(/[\s\-–.]/g, '').replace(/[АВЕІКМНОРСТХУ]/g, c => PLATE_MAP[c]); }
  const notLatin = s => /[^\x20-\x7E -ſ]/.test(String(s || ''));

  /* ---------- Монтування ---------- */
  async function mount(el, { broker }){
    st.el = el; st.broker = broker;
    el.innerHTML = '<div class="empty">Завантаження…</div>';
    const tasks = [rmpdAccess(broker.id), myRmpd(broker.id), rmpdContacts(broker.id)];
    if (broker.kind === 'carrier' && typeof myVehicles === 'function') tasks.push(myVehicles().catch(() => []));
    const [acc, list, contacts, vehicles] = await Promise.all(tasks);
    st.acc = acc; st.list = list; st.contacts = contacts; st.vehicles = (vehicles || []).filter(v => v.status !== 'rejected');
    render();
    badge();
  }
  async function refreshAccess(){ st.acc = await rmpdAccess(st.broker.id); renderTop(); }

  function badge(){
    const b = $('rmBadge'); if (!b) return;
    const n = st.list.filter(r => r.status === 'needs_fix').length;
    b.textContent = n; b.style.display = n ? '' : 'none';
  }

  function render(){
    st.el.innerHTML =
      '<div id="rmTop"></div>' +
      '<div id="rmFormWrap"></div>' +
      '<div class="spread" style="margin:1.5rem 0 .75rem"><div class="card-title" style="margin:0">Мої заявки RMPD</div>' +
        '<div class="pchips">' + [['active','Активні'],['done','Зареєстровані'],['all','Всі']].map(([k, l]) =>
          '<button class="chip' + (st.filter === k ? ' active' : '') + '" onclick="Rmpd.setFilter(\'' + k + '\')">' + l + '</button>').join('') + '</div></div>' +
      '<div id="rmList"></div>' +
      '<div class="card card-tight" style="margin-top:1rem"><div class="card-title">Перевірка на кордоні</div>' +
        '<p class="text-sm text-muted">Водій може сам перевірити, що заявка активна, у формі <strong style="color:var(--text)">RMPD406</strong> на ' +
        '<a href="' + PUESC + '" target="_blank" rel="noopener">puesc.gov.pl</a> (вкладка «Formularze»). Номер RMPD діє 10 днів від реєстрації. ' +
        'Перед в’їздом увімкніть геолокацію — без неї штраф до 10 000 zł навіть при поданій заявці.</p></div>';
    renderTop(); renderForm(); renderList();
  }

  function renderTop(){
    const a = st.acc || {}, top = $('rmTop'); if (!top) return;
    let html = '';
    if (a.reason === 'need_premium'){
      html = '<div class="card" style="border-color:rgba(168,85,247,.4)"><div style="font-weight:600;margin-bottom:6px">💎 Подача RMPD для клієнтів — на тарифі «Преміум»</div>' +
        '<p class="text-sm text-muted" style="margin-bottom:12px">Подавайте заявки RMPD за своїх клієнтів-перевізників без ліміту: форма українською, автоматична латиниця, перевірка помилок, номер RMPD і статус у кабінеті та Telegram. Довідник перевізників, водіїв і контрагентів для повторних заявок.</p>' +
        '<button class="btn btn-primary btn-sm" onclick="pane(\'billing\', document.querySelector(\'[data-pane=billing]\'))">Перейти на Преміум</button></div>';
    } else if (a.reason === 'limit'){
      html = '<div class="msg msg-err show" style="margin:0 0 12px">Використано ' + a.used + ' з ' + a.limit + ' безкоштовних заявок цього місяця. ' +
        '<a href="#" onclick="pane(\'billing\', document.querySelector(\'[data-pane=billing]\'));return false">Оформіть будь-який платний тариф</a> — і подавайте без ліміту. Оновлення поданих заявок — безкоштовно завжди.</div>';
    } else if (a.allowed){
      html = '<div class="text-sm text-muted" style="margin-bottom:12px">' +
        (a.limit ? 'Безкоштовний тариф: використано <strong style="color:var(--text)">' + a.used + ' з ' + a.limit + '</strong> заявок цього місяця.'
                 : 'Подача без ліміту · цього місяця подано <strong style="color:var(--text)">' + a.used + '</strong>.') +
        ' Заявки обробляємо щодня з 8:00 до 22:00, зазвичай протягом 30–60 хвилин.</div>';
    }
    top.innerHTML = html;
  }

  /* ---------- Форма ---------- */
  function sel(id, label, options, attrs = ''){ return '<div class="field"><label class="label" for="rm-' + id + '">' + label + '</label><select class="input" id="rm-' + id + '" ' + attrs + '>' + options + '</select></div>'; }
  function inp(id, label, attrs = ''){ return '<div class="field"><label class="label" for="rm-' + id + '">' + label + '</label><input class="input" id="rm-' + id + '" ' + attrs + '></div>'; }
  const cOpt = v => opt(COUNTRIES, v);
  const contactsOf = k => st.contacts.filter(c => c.kind === k);
  const pickOpt = (k, ph) => '<option value="">' + ph + '</option>' + contactsOf(k).map(c => '<option value="' + c.id + '">' + esc(c.label) + '</option>').join('');

  function canWrite(){ return st.acc && (st.acc.allowed || st.parent || st.editId); }

  function renderForm(){
    const w = $('rmFormWrap'); if (!w) return;
    if (!canWrite()){ w.innerHTML = ''; return; }
    const crossList = '<datalist id="rmCross">' + UA_CROSS.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join('') +
      OTHER_CROSS.map(v => '<option value="' + v + '">').join('') + '</datalist>';
    const head = st.parent ? '🔄 Оновлення заявки ' + esc(st.parent.ref_number || '') : st.editId ? '✏️ Редагування заявки' : 'Нова заявка RMPD';
    w.innerHTML = '<div class="card" id="rmForm">' + crossList +
      '<div class="spread" style="margin-bottom:1rem"><div class="card-title" style="margin:0">' + head + '</div>' +
        ((st.parent || st.editId) ? '<button class="btn-quiet" onclick="Rmpd.reset()">Скасувати</button>' : '') + '</div>' +
      (st.parent ? '<p class="hint" style="margin:-6px 0 1rem">Змінилось авто, водій, дата чи пункт пропуску? Виправте поля — оновимо заявку в PUESC. Оновлення не рахується в ліміт.</p>' : '') +

      '<div class="card-title">1. Перевізник</div>' +
      (!isCarrier() && contactsOf('carrier').length ? sel('pick-carrier', 'Обрати з довідника', pickOpt('carrier', '— новий перевізник —'), 'onchange="Rmpd.pick(\'carrier\', this.value)"') : '') +
      '<div class="field-row">' + inp('carrier_name', 'Назва перевізника латиницею *', 'maxlength="140" placeholder="TOV Forward Trans"') +
        sel('carrier_country', 'Країна реєстрації *', cOpt('UA')) + '</div>' +
      '<div class="field-row">' + inp('carrier_code', 'ЄДРПОУ / ІПН', 'maxlength="20" inputmode="numeric"') +
        inp('carrier_address', 'Адреса латиницею', 'maxlength="200" placeholder="Lutsk, vul. Lesi Ukrainky 1"') + '</div>' +

      '<div class="card-title" style="margin-top:.5rem">2. Транспорт і водій</div>' +
      (st.vehicles.length ? sel('vehicle_id', 'Авто з автопарку', '<option value="">— ввести вручну —</option>' +
        st.vehicles.map(v => '<option value="' + v.id + '">' + esc(v.plate) + (v.trailer_plate ? ' / ' + esc(v.trailer_plate) : '') + (v.make ? ' · ' + esc(v.make) : '') + '</option>').join(''),
        'onchange="Rmpd.pickVehicle(this.value)"') : '') +
      '<div class="field-row">' + inp('plate', 'Номер тягача *', 'maxlength="12" placeholder="AC1234BH" style="text-transform:uppercase"') +
        sel('plate_country', 'Країна реєстрації авто', cOpt('UA')) + '</div>' +
      '<div class="field-row">' + inp('trailer_plate', 'Номер причепа', 'maxlength="12" placeholder="AC5678XT" style="text-transform:uppercase"') +
        sel('trailer_country', 'Країна причепа', '<option value="">—</option>' + cOpt('UA')) + '</div>' +
      (contactsOf('driver').length ? sel('pick-driver', 'Водій з довідника', pickOpt('driver', '— новий водій —'), 'onchange="Rmpd.pick(\'driver\', this.value)"') : '') +
      '<div class="field-row">' + inp('driver_first', 'Імʼя водія *', 'maxlength="60" placeholder="Ivan"') + inp('driver_last', 'Прізвище водія *', 'maxlength="60" placeholder="Petrenko"') + '</div>' +
      '<div class="field" style="max-width:320px"><label class="label" for="rm-driver_phone">Телефон водія</label><input class="input" id="rm-driver_phone" maxlength="20" placeholder="+380…" inputmode="tel">' +
        '<div class="hint">Для звʼязку оператора, якщо треба уточнити дані.</div></div>' +

      '<div class="card-title" style="margin-top:.5rem">3. Маршрут</div>' +
      '<div class="field-row">' + inp('entry_point', 'Пункт вʼїзду в Польщу *', 'list="rmCross" maxlength="60" placeholder="Dorohusk"') +
        inp('exit_point', 'Пункт виїзду з Польщі', 'list="rmCross" maxlength="60" placeholder="Świecko"') + '</div>' +
      '<div class="field-row">' + inp('start_date', 'Дата вʼїзду *', 'type="date" min="' + today() + '"') + inp('end_date', 'Орієнтовна дата виїзду', 'type="date" min="' + today() + '"') + '</div>' +
      sel('permit_type', 'Підстава перевезення', opt(PERMIT, 'eu_ua')) +

      '<div class="card-title" style="margin-top:.5rem">4. Вантаж</div>' +
      '<label class="check-row"><input type="checkbox" id="rm-with_goods" checked onchange="Rmpd.goodsToggle()"> Рейс з вантажем (зніміть для порожнього рейсу)</label>' +
      '<div id="rmGoods">' +
        '<div class="field-row">' + inp('cargo_desc', 'Опис вантажу латиницею *', 'maxlength="200" placeholder="Furniture / Meble"') +
          inp('cargo_weight_t', 'Вага, т', 'type="number" min="0" step="0.01"') + '</div>' +
        (contactsOf('party').length ? '<div class="field-row">' + sel('pick-sender', 'Відправник з довідника', pickOpt('party', '—'), 'onchange="Rmpd.pickParty(\'sender\', this.value)"') +
          sel('pick-recipient', 'Отримувач з довідника', pickOpt('party', '—'), 'onchange="Rmpd.pickParty(\'recipient\', this.value)"') + '</div>' : '') +
        '<div class="field-row">' + inp('sender_name', 'Відправник *', 'maxlength="140" placeholder="Meble Sp. z o.o."') + sel('sender_country', 'Країна відправника *', cOpt('PL')) + '</div>' +
        inp('sender_address', 'Адреса відправника', 'maxlength="200" placeholder="ul. Długa 5, 00-001 Warszawa"') +
        '<div class="field-row">' + inp('recipient_name', 'Отримувач *', 'maxlength="140"') + sel('recipient_country', 'Країна отримувача *', cOpt('UA')) + '</div>' +
        inp('recipient_address', 'Адреса отримувача', 'maxlength="200"') +
        '<div class="field-row">' + sel('load_country', 'Країна завантаження', cOpt('PL')) + inp('load_place', 'Місце завантаження *', 'maxlength="140" placeholder="Warszawa"') + '</div>' +
        '<div class="field-row">' + sel('unload_country', 'Країна розвантаження', cOpt('UA')) + inp('unload_place', 'Місце розвантаження *', 'maxlength="140" placeholder="Lviv"') + '</div>' +
      '</div>' +

      '<div class="card-title" style="margin-top:.5rem">5. Геолокація</div>' +
      '<div class="field-row">' + sel('gps_mode', 'Як передаємо GPS *', opt(GPS, '', 'Оберіть')) +
        inp('gps_id', 'ID локатора / номер у SENT GEO', 'maxlength="60"') + '</div>' +
      '<p class="hint" style="margin:-6px 0 1rem">Для перевізників з-поза ЄС геолокація обовʼязкова весь час руху Польщею.</p>' +

      '<div class="field"><label class="label" for="rm-client_note">Коментар оператору</label><textarea class="input" id="rm-client_note" maxlength="600" style="min-height:70px" placeholder="Напр.: два розвантаження в Польщі, другий отримувач…"></textarea></div>' +
      '<label class="check-row"><input type="checkbox" id="rm-save" checked> Зберегти водія, перевізника й контрагентів для наступних заявок</label>' +
      '<label class="check-row"><input type="checkbox" id="rm-agree"> Дані перевірено й відповідають документам (CMR, техпаспорт). Відповідальність за їх достовірність несе перевізник; оператор переносить їх у PUESC без змін.</label>' +
      '<div class="msg" id="rmMsg"></div>' +
      '<button class="btn btn-primary" id="rmBtn" onclick="Rmpd.submit()">' + (st.parent ? 'Надіслати оновлення' : st.editId ? 'Зберегти й надіслати' : 'Надіслати заявку') + '</button>' +
    '</div>';

    LATIN.forEach(f => { const e = $('rm-' + f); if (e) e.addEventListener('blur', () => { e.value = translit(e.value).replace(/\s{2,}/g, ' ').trim(); }); });
    ['plate', 'trailer_plate'].forEach(f => $('rm-' + f).addEventListener('blur', e => { e.target.value = normPlate(e.target.value); }));
    prefill();
  }

  function prefill(){
    if (st.editId || st.parent) return;
    const last = st.list.find(r => r.status !== 'cancelled');
    if (isCarrier()){
      if (last) setVals({ carrier_name: last.carrier_name, carrier_country: last.carrier_country, carrier_code: last.carrier_code, carrier_address: last.carrier_address,
                          gps_mode: last.gps_mode, gps_id: last.gps_id });
      else setVals({ carrier_name: translit(st.broker.name || '') });
    }
    if (st.vehicles.length === 1 && $('rm-vehicle_id')){ $('rm-vehicle_id').value = st.vehicles[0].id; pickVehicle(st.vehicles[0].id); }
  }

  function setVals(o){
    Object.entries(o).forEach(([k, v]) => { const e = $('rm-' + k); if (e && v !== undefined && v !== null) e.value = v; });
    if ('with_goods' in o && $('rm-with_goods')){ $('rm-with_goods').checked = !!o.with_goods; goodsToggle(); }
    if (o.vehicle_id && $('rm-vehicle_id')) $('rm-vehicle_id').value = o.vehicle_id;
  }
  function goodsToggle(){ const g = $('rmGoods'); if (g) g.style.display = $('rm-with_goods').checked ? '' : 'none'; }

  function pick(kind, id){
    const c = st.contacts.find(x => x.id === id); if (!c) return;
    setVals(c.data);
  }
  function pickParty(side, id){
    const c = st.contacts.find(x => x.id === id); if (!c) return;
    setVals({ [side + '_name']: c.data.name, [side + '_country']: c.data.country, [side + '_address']: c.data.address });
  }
  function pickVehicle(id){
    const v = st.vehicles.find(x => x.id === id); if (!v) return;
    setVals({ plate: normPlate(v.plate), trailer_plate: v.trailer_plate ? normPlate(v.trailer_plate) : '' });
  }

  function read(){
    const r = {};
    FIELDS.forEach(f => { const e = $('rm-' + f); if (e) { const v = String(e.value || '').trim(); r[f] = v === '' ? null : v; } });
    r.with_goods = $('rm-with_goods').checked;
    r.vehicle_id = ($('rm-vehicle_id') && $('rm-vehicle_id').value) || null;
    r.plate = normPlate(r.plate); r.trailer_plate = r.trailer_plate ? normPlate(r.trailer_plate) : null;
    LATIN.forEach(f => { if (r[f]) r[f] = translit(r[f]); });
    r.cargo_weight_t = r.cargo_weight_t ? Number(r.cargo_weight_t) : null;
    if (!r.with_goods){ ['cargo_desc','cargo_weight_t','sender_name','sender_country','sender_address','recipient_name','recipient_country',
      'recipient_address','load_country','load_place','unload_country','unload_place'].forEach(f => r[f] = null); }
    if (!r.trailer_plate) r.trailer_country = null;
    return r;
  }

  function validate(r){
    const err = [], bad = [];
    const need = (f, label) => { if (!r[f]) { err.push(label); bad.push(f); } };
    need('carrier_name', 'назва перевізника'); need('plate', 'номер тягача');
    need('driver_first', 'імʼя водія'); need('driver_last', 'прізвище водія');
    need('entry_point', 'пункт вʼїзду'); need('start_date', 'дата вʼїзду'); need('gps_mode', 'спосіб передачі GPS');
    if (r.with_goods){ need('cargo_desc', 'опис вантажу'); need('sender_name', 'відправник'); need('recipient_name', 'отримувач');
      need('load_place', 'місце завантаження'); need('unload_place', 'місце розвантаження'); }
    const msgs = err.length ? ['Заповніть: ' + err.join(', ') + '.'] : [];
    if (r.plate && !/^[A-Z0-9]{4,10}$/.test(r.plate)){ msgs.push('Номер тягача — лише латинські літери й цифри, 4–10 символів.'); bad.push('plate'); }
    if (r.trailer_plate && !/^[A-Z0-9]{4,10}$/.test(r.trailer_plate)){ msgs.push('Номер причепа — лише латинські літери й цифри.'); bad.push('trailer_plate'); }
    if (r.trailer_plate && r.trailer_plate === r.plate){ msgs.push('Номер причепа збігається з номером тягача.'); bad.push('trailer_plate'); }
    LATIN.forEach(f => { if (r[f] && notLatin(r[f])){ const l = document.querySelector('label[for="rm-' + f + '"]');
      msgs.push('Поле «' + (l ? l.textContent.replace(/\s*\*$/, '') : f) + '» — лише латиниця.'); bad.push(f); } });
    if (r.start_date && r.start_date < today()){ msgs.push('Дата вʼїзду не може бути в минулому.'); bad.push('start_date'); }
    if (r.end_date && r.start_date && r.end_date < r.start_date){ msgs.push('Дата виїзду раніше за дату вʼїзду.'); bad.push('end_date'); }
    if (r.carrier_code && !/^\d{8,10}$/.test(r.carrier_code)){ msgs.push('ЄДРПОУ — 8 цифр, ІПН — 10 цифр.'); bad.push('carrier_code'); }
    if (r.driver_phone && !isValidPhone(r.driver_phone)){ msgs.push('Перевірте телефон водія.'); bad.push('driver_phone'); }
    if (r.gps_mode === 'zsl' && !r.gps_id){ msgs.push('Для локатора ZSL вкажіть його ідентифікатор.'); bad.push('gps_id'); }
    if (r.with_goods && r.sender_country === 'PL' && r.recipient_country === 'PL'){ msgs.push('Відправник і отримувач у Польщі — це каботаж, для перевізника з-поза ЄС він заборонений. Перевірте країни.'); bad.push('sender_country', 'recipient_country'); }
    FIELDS.forEach(f => { const e = $('rm-' + f); if (e) e.style.borderColor = bad.includes(f) ? 'var(--red)' : ''; });
    return msgs;
  }

  function showMsg(text, ok){
    const m = $('rmMsg'); m.className = 'msg show ' + (ok ? 'msg-ok' : 'msg-err'); m.innerHTML = text;
  }

  async function submit(){
    const r = read(), errs = validate(r);
    if (errs.length){ showMsg(errs.map(esc).join('<br>')); return; }
    if (!$('rm-agree').checked){ showMsg('Підтвердіть, що дані перевірено й відповідають документам.'); return; }
    const warn = r.start_date && (new Date(r.start_date) - new Date(today())) / 864e5 > 9;
    if (warn && !confirm('Номер RMPD діє 10 днів від реєстрації. Дата вʼїзду більш ніж через 9 днів — номер може не дожити до кордону. Все одно подати зараз?')) return;
    const btn = $('rmBtn'); btn.disabled = true; btn.textContent = 'Надсилаємо…';
    try{
      let saved;
      if (st.editId) saved = await saveRmpd(r, st.editId);
      else saved = await saveRmpd({ ...r, owner_id: st.broker.id, kind: st.parent ? 'update' : 'new', parent_id: st.parent ? st.parent.id : null });
      if ($('rm-save').checked) await saveContacts(r);
      const i = st.list.findIndex(x => x.id === saved.id);
      if (i >= 0) st.list[i] = saved; else st.list.unshift(saved);
      st.editId = null; st.parent = null;
      track('rmpd_submit', { kind: saved.kind, role: st.broker.kind || 'broker' });
      await refreshAccess();
      renderForm(); renderList(); badge();
      showToast('Заявку прийнято — повідомимо номер RMPD у кабінеті та Telegram');
      const l = $('rmList'); if (l) l.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }catch(e){ showMsg(esc(e.message)); btn.disabled = false; btn.textContent = 'Надіслати заявку'; }
  }

  async function saveContacts(r){
    const has = (kind, label) => st.contacts.some(c => c.kind === kind && c.label.toLowerCase() === label.toLowerCase());
    const add = async (kind, label, data) => { if (!label || has(kind, label)) return; const c = await saveRmpdContact(st.broker.id, kind, label, data); if (c) st.contacts.push(c); };
    await add('driver', r.driver_first + ' ' + r.driver_last, { driver_first: r.driver_first, driver_last: r.driver_last, driver_phone: r.driver_phone });
    if (!isCarrier()) await add('carrier', r.carrier_name, { carrier_name: r.carrier_name, carrier_country: r.carrier_country, carrier_code: r.carrier_code,
      carrier_address: r.carrier_address, plate: r.plate, plate_country: r.plate_country, trailer_plate: r.trailer_plate, trailer_country: r.trailer_country, gps_mode: r.gps_mode, gps_id: r.gps_id });
    if (r.with_goods){
      await add('party', r.sender_name, { name: r.sender_name, country: r.sender_country, address: r.sender_address });
      await add('party', r.recipient_name, { name: r.recipient_name, country: r.recipient_country, address: r.recipient_address });
    }
  }

  /* ---------- Список ---------- */
  function setFilter(f){ st.filter = f; render(); }

  function card(r){
    const s = RMPD_STATUS[r.status] || RMPD_STATUS.new;
    const daysLeft = r.valid_until ? Math.ceil((new Date(r.valid_until) - new Date(today())) / 864e5) : null;
    const expired = daysLeft !== null && daysLeft < 0;
    const route = [r.load_place, r.unload_place].filter(Boolean).join(' → ');
    let actions = '';
    if (r.status === 'new' || r.status === 'needs_fix') actions += '<button class="btn-quiet" onclick="Rmpd.edit(\'' + r.id + '\')">Редагувати</button>';
    if (r.status === 'done' && !expired) actions += '<button class="btn-quiet" onclick="Rmpd.update(\'' + r.id + '\')">Оновити заявку</button>';
    actions += '<button class="btn-quiet" onclick="Rmpd.repeat(\'' + r.id + '\')">Повторити рейс</button>';
    if (r.status !== 'done' && r.status !== 'cancelled') actions += '<button class="btn-quiet" onclick="Rmpd.cancel(\'' + r.id + '\')">Скасувати</button>';
    return '<div class="req' + (r.status === 'needs_fix' ? ' new' : '') + '"' + (r.status === 'needs_fix' ? ' style="border-color:rgba(241,101,75,.5)"' : '') + '>' +
      '<div class="spread" style="align-items:flex-start;gap:10px">' +
        '<div style="min-width:0"><div style="font-weight:600">' + esc(r.plate) + (r.trailer_plate ? ' / ' + esc(r.trailer_plate) : '') +
          ' · ' + esc(r.entry_point) + ' · ' + fmtD(r.start_date) + (r.kind === 'update' ? ' <span class="badge badge-free">оновлення</span>' : '') + '</div>' +
        '<div class="text-xs text-muted" style="margin-top:2px">' + esc(r.driver_first + ' ' + r.driver_last) + ' · ' +
          (r.with_goods ? esc(r.cargo_desc || '') + (route ? ' · ' + esc(route) : '') : 'порожній рейс') +
          (!isCarrier() ? ' · ' + esc(r.carrier_name) : '') + ' · подано ' + timeAgo(r.created_at) + '</div></div>' +
        '<span class="badge" style="background:transparent;border:.5px solid ' + s.color + ';color:' + s.color + '">' + s.label + '</span></div>' +
      (r.ref_number ? '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<div style="font-family:var(--display);font-size:18px;letter-spacing:.5px">' + esc(r.ref_number) + '</div>' +
          '<button class="btn-quiet" onclick="Rmpd.copy(\'' + esc(r.ref_number).replace(/'/g, '') + '\')"><i class="ti ti-copy"></i> Копіювати</button>' +
          (r.valid_until ? '<span class="text-xs" style="color:' + (expired ? 'var(--red)' : daysLeft <= 2 ? 'var(--amber)' : 'var(--muted)') + '">' +
            (expired ? 'Термін дії минув ' + fmtD(r.valid_until) : 'Діє до ' + fmtD(r.valid_until) + ' · ще ' + daysLeft + ' ' + plural(daysLeft, 'день', 'дні', 'днів')) + '</span>' : '') +
        '</div>' : '') +
      (r.admin_note ? '<div class="rv-reply text-sm" style="margin-top:10px;white-space:pre-line">' + (r.status === 'needs_fix' ? '⚠️ ' : '💬 ') + esc(r.admin_note) + '</div>' : '') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' + actions + '</div></div>';
  }

  function renderList(){
    const l = $('rmList'); if (!l) return;
    const list = st.list.filter(r => st.filter === 'all' ? true : st.filter === 'done' ? r.status === 'done' : !['done', 'cancelled'].includes(r.status));
    l.innerHTML = list.length ? list.map(card).join('') :
      '<div class="empty"><strong>' + (st.filter === 'active' ? 'Активних заявок немає' : 'Заявок ще немає') + '</strong>' +
      (st.acc && st.acc.allowed ? 'Заповніть форму вище — оператор внесе дані в PUESC і поверне номер RMPD.' : '') + '</div>';
  }

  function fromRequest(r, keepDates){
    const o = {}; FIELDS.forEach(f => o[f] = r[f]); o.with_goods = r.with_goods; o.vehicle_id = r.vehicle_id;
    if (!keepDates){ o.start_date = ''; o.end_date = ''; o.client_note = ''; }
    return o;
  }
  function openForm(data){
    renderTop(); renderForm(); setVals(data);
    $('rmForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function edit(id){ const r = st.list.find(x => x.id === id); if (!r) return; st.editId = id; st.parent = null; openForm(fromRequest(r, true)); }
  function update(id){ const r = st.list.find(x => x.id === id); if (!r) return; st.parent = r; st.editId = null; openForm(fromRequest(r, true)); }
  function repeat(id){
    const r = st.list.find(x => x.id === id); if (!r) return;
    if (!st.acc.allowed){ showToast(st.acc.reason === 'limit' ? 'Ліміт безкоштовних заявок на цей місяць вичерпано' : 'Подача недоступна на поточному тарифі', 'error'); return; }
    st.editId = null; st.parent = null; openForm(fromRequest(r, false));
  }
  function reset(){ st.editId = null; st.parent = null; renderForm(); }
  async function cancel(id){
    if (!confirm('Скасувати заявку? Якщо її вже зареєстровано в PUESC, оператор анулює її там.')) return;
    try{ await cancelRmpd(id); const r = st.list.find(x => x.id === id); r.status = 'cancelled'; renderList(); badge(); showToast('Заявку скасовано'); }
    catch(e){ showToast(e.message, 'error'); }
  }
  async function copy(t){ try{ await navigator.clipboard.writeText(t); showToast('Номер скопійовано'); }catch(e){ showToast(t); } }

  return { mount, submit, pick, pickParty, pickVehicle, goodsToggle, setFilter, edit, update, repeat, reset, cancel, copy, translit, normPlate };
})();
