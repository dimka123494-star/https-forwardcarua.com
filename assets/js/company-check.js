/* company-check.js — платна «Перевірка компанії» за ЄДРПОУ (Реєстр боржників, банкрутство, судові справи).
   Оплата — з балансу кабінету (RPC company_check, ціна в service_prices.company_check).
   CompanyCheck.open(code, name) — вікно з кнопкою оплати і звітом; CompanyCheck.mountHistory(el) — історія в кабінеті. */
const CompanyCheck = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // «2021-03-18» — календарна дата без часу: не пропускаємо через часовий пояс браузера
  const date = d => !d ? '—' : /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).split('-').reverse().join('.') : new Date(d).toLocaleDateString('uk-UA');
  let price = 50;

  function shell(){
    let o = document.getElementById('ccOverlay');
    if (o) return o;
    o = document.createElement('div');
    o.className = 'overlay'; o.id = 'ccOverlay';
    o.innerHTML = '<div class="modal modal-wide"><button class="modal-close" aria-label="Закрити" onclick="CompanyCheck.close()"><i class="ti ti-x"></i></button><div id="ccBody"></div></div>';
    o.addEventListener('click', e => { if (e.target === o) close(); });
    document.body.appendChild(o);
    return o;
  }
  function close(){ const o = document.getElementById('ccOverlay'); if (o) o.classList.remove('open'); }

  async function loadPrice(){
    try{ const sb = await sbReady(); const { data } = await sb.from('service_prices').select('price').eq('code', 'company_check').maybeSingle(); if (data) price = Number(data.price); }catch(e){}
    return price;
  }

  async function open(code, name){
    code = String(code || '').replace(/\D/g, '');
    const o = shell(), body = document.getElementById('ccBody');
    o.classList.add('open');
    if (!/^\d{8}$/.test(code)){ body.innerHTML = '<div class="modal-title">Перевірка компанії</div><p class="text-sm">Перевірка доступна для юридичних осіб — 8-значний код ЄДРПОУ.</p>'; return; }
    await loadPrice();
    body.innerHTML =
      '<div class="modal-title">Аналіз компанії + витяг з ЄДР</div>' +
      '<div class="modal-sub">' + esc(name || '') + ' · ЄДРПОУ ' + esc(code) + '</div>' +
      '<ul class="text-sm" style="margin:0 0 1rem;padding-left:18px;line-height:1.7">' +
        '<li><b>Висновок про ризики</b> — що насторожує, а що свідчить на користь компанії, одним списком</li>' +
        '<li><b>Виконавчі провадження</b> — кількість, категорії стягнень, хто стягувач і виконавець</li>' +
        '<li><b>Банкрутство</b> — справи про банкрутство та їхні етапи</li>' +
        '<li><b>Судові справи</b> — де компанія позивач чи відповідач, з посиланнями на рішення</li>' +
        '<li><b>Витяг з ЄДР</b> — засновники з частками, бенефіціари, керівник і представники, номер запису, облік у ДПС</li>' +
        '<li><b>Ліцензії, AEO, санкції РНБО</b></li>' +
        '<li><b>PDF</b> — повний звіт і окремо витяг з ЄДР</li></ul>' +
      '<p class="text-xs text-muted" style="margin:0 0 1rem">Джерела — відкриті дані Мін’юсту та Державної судової адміністрації, оновлюються двічі на тиждень. Повторний перегляд цієї компанії протягом 30 днів — безкоштовно.</p>' +
      '<div class="msg" id="ccMsg"></div>' +
      '<div id="ccCab" style="display:none;margin-bottom:12px"><button class="btn btn-primary btn-block" id="ccBtn" onclick="CompanyCheck.run(\'' + code + '\')"><i class="ti ti-wallet"></i>Списати ' + price + ' грн з балансу кабінету</button></div>' +
      '<div id="ccCard"><div class="field"><label class="label" for="ccEmail">Email для чека й посилання на звіт</label><input class="input" id="ccEmail" type="email" autocomplete="email" placeholder="you@example.com"></div>' +
        '<button class="btn btn-block" id="ccPay" style="background:var(--green);color:#06120c;font-weight:600" onclick="CompanyCheck.payCard(\'' + code + '\')"><i class="ti ti-credit-card"></i>Оплатити карткою ' + price + ' грн</button>' +
        '<p class="text-xs text-muted" style="margin:.5rem 0 0">Оплата через WayForPay (Visa, Mastercard, Apple Pay, Google Pay). Після оплати одразу відкриється звіт із кнопкою «Завантажити PDF», а посилання на нього прийде на email.</p></div>';
    // є кабінет — пропонуємо списати з балансу
    try{ const u = await currentUser(); if (u){ const b = await getMyBroker(); if (b){ document.getElementById('ccCab').style.display = ''; const e = document.getElementById('ccEmail'); if (e) e.value = u.email || ''; } else { const e = document.getElementById('ccEmail'); if (e) e.value = u.email || ''; } } }catch(e){}
  }

  async function payCard(code){
    const btn = document.getElementById('ccPay'), m = document.getElementById('ccMsg');
    const email = (document.getElementById('ccEmail').value || '').trim();
    if (typeof adsUserData === 'function') adsUserData(email);
    const fail = t => { m.className = 'msg show msg-err'; m.textContent = t; btn.disabled = false; btn.innerHTML = '<i class="ti ti-credit-card"></i>Оплатити карткою ' + price + ' грн'; };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Вкажіть email — на нього прийде чек, а звіт буде за посиланням');
    btn.disabled = true; btn.textContent = 'Переходимо до оплати…';
    try{
      const res = await fetch(SUPABASE_URL + '/functions/v1/check-pay', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
        body: JSON.stringify({ action: 'checkout', code, email }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return fail(d.error === 'too_many' ? 'Забагато замовлень з цього email — спробуйте за годину' : d.error === 'bad_email' ? 'Перевірте email' : 'Оплата тимчасово недоступна. Напишіть на custom@forwardcarua.com');
      try{ const l = JSON.parse(localStorage.getItem('ccOrders') || '[]'); l.unshift({ t: d.token, code, at: Date.now() }); localStorage.setItem('ccOrders', JSON.stringify(l.slice(0, 30))); }catch(e){}
      try{ track('begin_checkout', { value: price, currency: 'UAH', items: [{ item_name: 'company_check' }] }); }catch(e){}
      const form = document.createElement('form');
      form.method = 'POST'; form.action = 'https://secure.wayforpay.com/pay'; form.acceptCharset = 'utf-8';
      Object.entries(d.form).forEach(([k, v]) => (Array.isArray(v) ? v : [v]).forEach(val => {
        const i = document.createElement('input'); i.type = 'hidden'; i.name = Array.isArray(v) ? k + '[]' : k; i.value = val; form.appendChild(i); }));
      document.body.appendChild(form); form.submit();
    }catch(e){ fail('Не вдалося перейти до оплати. Спробуйте ще раз.'); }
  }

  async function run(code){
    const btn = document.getElementById('ccBtn'), m = document.getElementById('ccMsg');
    const fail = html => { m.className = 'msg show msg-err'; m.innerHTML = html; btn.disabled = false; btn.innerHTML = '<i class="ti ti-shield-search"></i>Перевірити за ' + price + ' грн'; };
    btn.disabled = true; btn.textContent = 'Перевіряємо…';
    let user = null; try{ user = await currentUser(); }catch(e){}
    if (!user) return fail('Увійдіть у кабінет або оплатіть карткою нижче.');
    try{
      const session = await currentSession();
      const res = await fetch(SUPABASE_URL + '/functions/v1/company-check', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, apikey: SUPABASE_ANON },
        body: JSON.stringify({ code }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'error');
      try{ track('company_check', { value: data.price, currency: 'UAH', repeat: data.repeat }); }catch(e){}
      document.getElementById('ccBody').innerHTML = report(data);
    }catch(e){
      const t = String(e.message || '');
      if (/no_cabinet/.test(t)) return fail('Баланс є лише в кабінеті брокера чи перевізника — оплатіть карткою нижче.');
      if (/balance/.test(t)) return fail('На балансі недостатньо коштів (потрібно ' + price + ' грн). Оплатіть карткою нижче або <a href="#" onclick="CompanyCheck.topup();return false">поповніть баланс</a>.');
      if (/unavailable/.test(t)) return fail('Перевірка тимчасово недоступна — дані оновлюються. Спробуйте за кілька хвилин.');
      fail('Не вдалося виконати перевірку. Спробуйте ще раз.');
    }
  }
  async function topup(){
    const x = prompt('Сума поповнення, грн (від 200):', '200'); if (x === null) return;
    try{ await startTopup(Number(String(x).replace(/\s/g, '').replace(',', '.'))); }catch(e){ alert(e.message); }
  }

  // дата з розкладу засідань ДСА: «10.11.2026 15:00» — майбутнє засідання чи вже минуле
  function hearing(d){
    const m = String(d || '').match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}:\d{2}))?/);
    if (!m) return esc(d);
    const t = new Date(+m[3], +m[2] - 1, +m[1]);
    return (t >= new Date(new Date().toDateString()) ? 'засідання призначено на ' : 'засідання ') + m[1] + '.' + m[2] + '.' + m[3] + (m[4] ? ' о ' + m[4] : '');
  }
  // автоматичний висновок: червоні прапорці, на що звернути увагу, що на користь компанії
  function analysis(r){
    const bad = [], warn = [], good = [];
    const E = r.edr || {}, st = String(E.state || '');
    if (st && st !== 'зареєстровано') bad.push('Стан за ЄДР: ' + st);
    if (E.termination) bad.push('Припинення: ' + E.termination);
    if (E.bankruptcy) bad.push('ЄДР: ' + E.bankruptcy);
    const sn = (r.sanctions && r.sanctions.items) || [];
    if (sn.some(i => i.status === 'active')) bad.push('Під чинними санкціями РНБО');
    else if (r.sanctions) good.push('Санкцій РНБО немає');
    if (r.erb && r.erb.n) bad.push('Боржник: відкритих виконавчих проваджень — ' + r.erb.n);
    else good.push('Не значиться в Єдиному реєстрі боржників');
    if ((r.bankrupt || []).length) bad.push('Справи про банкрутство: ' + r.bankrupt.length);
    else good.push('Справ про банкрутство немає');
    const c = r.courts, roles = (c && c.roles) || {};
    const def = Object.entries(roles).filter(([k]) => /відповідач|боржник/.test(k)).reduce((a, [, v]) => a + Number(v || 0), 0);
    if (def) warn.push('Відповідач у судових справах: ' + def);
    else if (c && c.n) good.push('У судах лише як позивач чи третя особа (' + c.n + ')');
    else good.push('Судових справ не знайдено');
    if (E.reg_date){
      const y = (Date.now() - new Date(E.reg_date).getTime()) / 31557600000;
      if (y < 1) warn.push('Компанія молода — зареєстрована ' + date(E.reg_date));
      else if (y >= 5) good.push('Працює понад ' + Math.floor(y) + ' р. (з ' + date(E.reg_date) + ')');
    }
    if (E.capital != null && Number(E.capital) > 0 && Number(E.capital) <= 1000) warn.push('Мінімальний статутний капітал — ' + Number(E.capital).toLocaleString('uk-UA') + ' грн');
    const L = (r.licenses || []).filter(l => l.ok).length + (r.license && r.license.status === 'Чинна' ? 1 : 0);
    if (L) good.push('Чинні ліцензії й дозволи: ' + L);
    if ((r.aeo || []).some(a => a.status === 'Чинна')) good.push('Авторизований економічний оператор (AEO)');
    const lvl = bad.length ? 'bad' : warn.length ? 'warn' : 'good';
    const V = { bad: ['var(--red)', 'ti-alert-octagon', 'Високий ризик'], warn: ['var(--amber)', 'ti-alert-triangle', 'Є на що звернути увагу'], good: ['var(--green)', 'ti-shield-check', 'Суттєвих ризиків не виявлено'] }[lvl];
    const li = (arr, col, ic) => arr.map(t => '<div class="cc-f"><i class="ti ' + ic + '" style="color:' + col + '"></i>' + esc(t) + '</div>').join('');
    return '<div class="card cc-verdict cc-' + lvl + '">' +
      '<div class="cc-vh" style="color:' + V[0] + '"><i class="ti ' + V[1] + '"></i>' + V[2] + '</div>' +
      li(bad, 'var(--red)', 'ti-circle-x') + li(warn, 'var(--amber)', 'ti-alert-triangle') + li(good, 'var(--green)', 'ti-circle-check') +
      '<p class="text-xs text-muted" style="margin:.6rem 0 0">Автоматичний висновок за відкритими державними реєстрами. Не є юридичним висновком — перед великою угодою перевірте документи компанії.</p></div>';
  }

  // «Витяг з ЄДР»: верстка відомостей ЄДР (відкриті дані + розширені поля r.extract), як друкована форма
  const cap1 = t => String(t || '').toLowerCase().replace(/(^|[\s\-'’"«(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  const TAXN = t => String(t || '').replace(/^Реєстр платників податків.*/i, 'Реєстр платників податків').replace(/^Реєстр платників єдиного внеску.*/i, 'Реєстр платників єдиного внеску');
  function extract(r){
    const E = r.edr, X0 = r.extract || {};
    const sp = t => String(t || '').replace(/\s+/g, ' ').trim();
    // чистимо: порожні засновники, «причина відсутності» бенефіціара, код правонаступника окремим рядком
    const pr = [];
    (X0.successors || []).forEach(t => { t = sp(t); if (/^\d{8}$/.test(t) && pr.length) pr[pr.length - 1] += ' (код ' + t + ')'; else if (t) pr.push(t); });
    // бенефіціар: рядок (старий формат) або [ПІБ, тип впливу, відсоток]
    const bfAll = (X0.beneficiaries || []).map(b => Array.isArray(b) ? { name: sp(b[0]), inf: b[1], pct: b[2] } : { name: sp(b) }).filter(b => b.name);
    const bfNo = (bfAll.find(b => /^причина відсутності/i.test(b.name)) || {}).name;
    const X = { ...X0,
      signers: (X0.signers || []).map(h => ({ name: sp(h.name), role: h.role })).filter(h => h.name),
      founders: (X0.founders || []).map(f => ({ ...f, name: sp(f.name) })).filter(f => f.name),
      beneficiaries: bfAll.filter(b => !/^причина відсутності/i.test(b.name)), bfNo: bfNo ? bfNo.replace(/^причина відсутності:\s*/i, '') : null,
      successors: pr };
    if (!E) return '<div class="text-sm text-muted">Компанії немає у відкритих даних ЄДР.</div>';
    const row = (k, v) => v ? '<tr><td>' + k + '</td><td>' + v + '</td></tr>' : '';
    const st = String(E.state || '');
    const cap = Number(E.capital) || 0;
    const money = n => Number(n).toLocaleString('uk-UA', { maximumFractionDigits: 2 }) + ' грн';
    const heads = (X.signers && X.signers.length ? X.signers : (E.heads || []).map(h => ({ name: h.name, role: h.role || 'керівник' })));
    const head = heads.filter(h => !h.role || /керівник/.test(h.role)).map(h => esc(cap1(h.name))).join('<br>');
    const reps = heads.filter(h => h.role && !/керівник/.test(h.role)).map(h => esc(cap1(h.name)) + (h.role !== 'представник' ? ' <span class="text-muted">(' + esc(h.role) + ')</span>' : '')).join('<br>');
    const founders = X.founders && X.founders.length
      ? X.founders.map(f => esc(f.code ? f.name : cap1(f.name)) + (f.code ? ' <span class="text-muted">(код ' + esc(f.code) + ')</span>' : '') +
          (f.country && f.country !== 'Україна' ? ' <span class="text-muted">· ' + esc(f.country) + '</span>' : '') +
          (f.share != null ? '<br><span class="text-muted">внесок ' + money(f.share) + (cap ? ' (' + (Math.round(f.share / cap * 10000) / 100) + '%)' : '') + '</span>' : '')).join('<br>')
      : ([...(E.founder_orgs || []).map(f => esc(f.name) + ' <span class="text-muted">(код ' + esc(f.code) + ')</span>'),
          E.founders_total ? '<span class="text-muted">' + ((E.founder_orgs || []).length ? 'Усього засновників: ' + E.founders_total : 'Засновників: ' + E.founders_total + ' — імена у відкритих даних ЄДР не наведено') + '</span>' : ''].filter(Boolean).join('<br>'));
    const taxes = (E.taxes || []).map(t => esc(TAXN(t.type)) + (t.date ? ' — з ' + date(t.date) : '') + (t.end ? ' по ' + date(t.end) : '')).join('<br>');
    const br = (X.branches || []).map(b => esc(b.name) + (b.code ? ' <span class="text-muted">(' + esc(b.code) + ')</span>' : '')).join('<br>') || (E.branches ? String(E.branches) : '');
    return '<div class="cc-extract" id="ccExtract">' +
      '<div class="cc-xtitle">Витяг з ЄДР<span>за відкритими даними на ' + date(r.data_at || r.checked_at) + '</span></div>' +
      '<table class="cc-xt">' +
      row('Повна назва', esc(E.name || r.name || '')) +
      row('Скорочена назва', E.short_name && E.short_name !== E.name ? esc(E.short_name) : '') +
      row('Організаційно-правова форма', esc(E.opf || '')) +
      row('Код ЄДРПОУ', esc(r.code)) +
      row('Номер запису в ЄДР', esc(X.reg_number || '')) +
      row('Дата реєстрації', E.reg_date ? date(E.reg_date) : '') +
      row('Дата запису', X.record_date ? date(X.record_date) : '') +
      row('Стан', st ? '<b' + (st !== 'зареєстровано' ? ' style="color:var(--red)"' : '') + '>' + esc(st) + '</b>' : '') +
      row('Припинення', E.termination ? '<span style="color:var(--red)">' + esc(E.termination) + '</span>' : '') +
      row('Банкрутство / санація', E.bankruptcy ? '<span style="color:var(--red)">' + esc(E.bankruptcy) + '</span>' : '') +
      row('Керівник', head) +
      row('Представники', reps) +
      row('Органи управління', esc(String(X.management || E.management || '').toLowerCase())) +
      row('Засновники', founders) +
      row('Кінцеві бенефіціарні власники', (X.beneficiaries || []).map(b => esc(cap1(b.name)) +
          (b.inf || b.pct ? '<br><span class="text-muted">' + [b.inf ? esc(String(b.inf).toLowerCase()) : '', b.pct ? esc(b.pct) + '%' : ''].filter(Boolean).join(', ') + '</span>' : '')).join('<br>') || (X.bfNo ? '<span class="text-muted">не зазначено: ' + esc(X.bfNo.toLowerCase()) + '</span>' : '')) +
      row('Статутний капітал', E.capital != null ? money(E.capital) : '') +
      row('Відокремлені підрозділи', br) +
      row('Правонаступники / попередники', X.successors.map(esc).join('<br>')) +
      row('Взяття на облік', taxes) +
      row('Адреса, види діяльності (КВЕД), контакти', '<span class="text-muted">на час воєнного стану не публікуються у відкритих даних ЄДР — дивіться в офіційному витязі Мін’юсту</span>') +
      '</table>' +
      '<p class="text-xs text-muted" style="margin:.6rem 0 0">Сформовано сервісом МитнийБрокер (forwardcarua.com) за відкритими даними Єдиного державного реєстру юридичних осіб, фізичних осіб-підприємців та громадських формувань (Мін’юст, data.gov.ua). Не є витягом, виданим державним реєстратором.</p></div>';
  }

  function report(r){
    const e = r.erb, b = r.bankrupt || [], dec = r.decisions || {};
    const docs = cs => (dec[cs] || []).length ? '<div class="text-xs" style="margin-top:6px">Рішення: ' + dec[cs].map(d =>
      '<a href="' + esc(d.url) + '" target="_blank" rel="noopener nofollow">' + esc(d.form || 'документ') + ' ' + date(d.date) + '</a>').join(' · ') + '</div>' : '';
    const ok = (t) => '<div class="msg show msg-ok" style="margin:0">' + t + '</div>';
    const bad = (t) => '<div class="msg show msg-err" style="margin:0">' + t + '</div>';
    const erbBlock = e
      ? bad('<b>Компанія є в Єдиному реєстрі боржників</b> — відкритих виконавчих проваджень: <b>' + e.n + '</b>') +
        '<div class="text-sm" style="margin:.75rem 0 .25rem">Категорії стягнень: ' + Object.entries(e.cats || {}).map(([k, v]) => esc(k) + ' — ' + v).join('; ') + '</div>' +
        (e.items || []).map(i => '<div class="card" style="padding:10px 12px;margin-top:8px;font-size:13px"><b>ВП № ' + esc(i.vp) + '</b> · ' + esc(i.cat) +
          '<div class="text-xs text-muted">Стягувач / виданий: ' + esc(i.issuer) + '<br>Виконавець: ' + esc(i.executor) + '</div></div>').join('') +
        (e.n > (e.items || []).length ? '<p class="text-xs text-muted">Показано ' + (e.items || []).length + ' з ' + e.n + '. Деталі будь-якого провадження — за номером ВП в АСВП (asvpweb.minjust.gov.ua).</p>' : '')
      : ok('<b>У Єдиному реєстрі боржників не значиться</b> — відкритих виконавчих проваджень, де компанія боржник, немає');
    const bkBlock = b.length
      ? bad('<b>Є справи про банкрутство: ' + b.length + '</b>') + b.map(i => '<div class="card" style="padding:10px 12px;margin-top:8px;font-size:13px"><b>Справа № ' + esc(i.case) + '</b> · ' + esc(i.date) +
          '<div class="text-xs text-muted">' + esc(i.type) + '<br>' + esc(i.court) + '</div>' + docs(i.case) + '</div>').join('')
      : ok('<b>Справ про банкрутство не знайдено</b>');
    const c = r.courts;
    const crBlock = c && c.n
      ? (Object.keys(c.roles || {}).some(k => /відповідач|боржник/.test(k)) ? bad : ok)('<b>Судових справ: ' + c.n + '</b> — ' + Object.entries(c.roles || {}).map(([k, v]) => esc(k) + ' — ' + v).join(', ')) +
        (c.items || []).slice(0, 10).map(i => '<div class="card" style="padding:10px 12px;margin-top:8px;font-size:13px"><b>Справа № ' + esc(i.case) + '</b> · ' + hearing(i.date) + (i.role ? ' · <span style="color:var(--amber)">' + esc(i.role) + '</span>' : '') +
          '<div class="text-xs text-muted">' + esc(i.what || '') + '<br>' + esc(i.court) + '</div>' + docs(i.case) + '</div>').join('') +
        (c.n > 10 ? '<p class="text-xs text-muted">Показано 10 найсвіжіших з ' + c.n + '. Повний текст рішень — у Єдиному державному реєстрі судових рішень за номером справи.</p>' : '')
      : ok('<b>Судових справ не знайдено</b>');
    // Санкції РНБО (якщо реєстр підключено) і AEO
    const sn = r.sanctions;
    const SN_ST = { active: 'Під чинними санкціями РНБО', expired: 'Строк санкцій закінчився', excluded: 'Санкції скасовано' };
    const snBlock = !sn ? '' : '<h3 style="font-size:16px;margin:1.25rem 0 .5rem">Санкції РНБО</h3>' + (sn.items && sn.items.length
      ? sn.items.map(i => (i.status === 'active' ? bad : ok)('<b>' + (SN_ST[i.status] || esc(i.status || 'Є в реєстрі')) + '</b> — ' + esc(i.name || '') +
          (i.decree ? '<div class="text-xs" style="margin-top:4px">Указ Президента № ' + esc(i.decree) + (i.decree_date ? ' від ' + date(i.decree_date) : '') +
            (i.term ? ' · строк: ' + esc(i.term) : '') + (i.end_date ? ' · до ' + date(i.end_date) : '') + (i.kind === 'P' ? ' · як фізична особа' : '') + '</div>' : ''))).join('')
      : ok('<b>У Державному реєстрі санкцій не значиться</b>')) +
      (sn.at ? '<p class="text-xs text-muted">Державний реєстр санкцій РНБО (drs.nsdc.gov.ua), дані на ' + date(String(sn.at).slice(0, 10)) + '.</p>' : '');
    const aeo = r.aeo;
    const AEO_T = { 'АЕО-С': 'спрощення митних формальностей', 'АЕО-В': 'безпека та надійність', 'AEO-C': 'спрощення митних формальностей', 'AEO-S': 'безпека та надійність' };
    const aeoBlock = aeo && aeo.length ? '<h3 style="font-size:16px;margin:1.25rem 0 .5rem">Авторизований економічний оператор (AEO)</h3>' +
      aeo.map(a => (a.status === 'Чинна' ? ok : bad)('<b>' + esc(a.type || 'AEO') + (AEO_T[a.type] ? ' — ' + AEO_T[a.type] : '') + '</b>: авторизація ' + esc((a.status || '').toLowerCase()) +
        '<div class="text-xs" style="margin-top:4px">№ ' + esc(a.number || '—') + (a.authorizationDate ? ' · з ' + date(a.authorizationDate) : '') +
        (a.cancellationDate ? ' · скасовано ' + date(a.cancellationDate) : '') + (a.annulmentDate ? ' · анульовано ' + date(a.annulmentDate) : '') + '</div>')).join('') : '';
    const E = r.edr, head = E && (E.heads || []).find(h => !h.role || h.role === 'керівник');
    const edr = E ? '<div class="text-sm" style="margin-top:.5rem">Стан за ЄДР: <b' + (E.state && E.state !== 'зареєстровано' ? ' style="color:var(--red)"' : '') + '>' + esc(E.state || '—') + '</b>' + (E.reg_date ? ' · зареєстровано ' + date(E.reg_date) : '') +
      (head ? '<br>Керівник: ' + esc(head.name) : '') + (E.capital ? ' · статутний капітал ' + Number(E.capital).toLocaleString('uk-UA') + ' грн' : '') +
      (E.founders_total ? '<br>Засновників: ' + E.founders_total + ((E.founder_orgs || []).length ? ' (юрособи: ' + E.founder_orgs.map(f => esc(f.name) + ', ' + esc(f.code)).join('; ') + ')' : '') : '') +
      (E.termination ? '<br><span style="color:var(--red)">Припинення: ' + esc(E.termination) + '</span>' : '') + (E.bankruptcy ? '<br><span style="color:var(--red)">Банкрутство: ' + esc(E.bankruptcy) + '</span>' : '') +
      '<br><a class="no-pdf" href="/c/' + esc(r.code) + '" target="_blank" rel="noopener">Картка компанії за даними ЄДР</a></div>' : '';
    const lic = r.license ? '<div class="text-sm">Ліцензія Укртрансбезпеки: <b>' + esc(r.license.status) + '</b>' + (r.license.intl_cargo ? ', міжнародні перевезення' : '') + '</div>' : '';
    // ліцензії й дозволи з відкритих реєстрів органів (Держмитслужба, НКРЕКП, Держлікслужба, ДАРТ) + Укртрансбезпека
    const L = (r.licenses || []).slice(0, 15);
    const licItems = (r.license ? [(r.license.status === 'Чинна' ? ok : bad)('<b>Перевезення вантажів автомобільним транспортом</b> — ' + esc(String(r.license.status).toLowerCase()) +
        '<div class="text-xs" style="margin-top:4px">Укртрансбезпека' + (r.license.intl_cargo ? ' · міжнародні перевезення' : '') + (r.license.dangerous ? ' · небезпечні вантажі' : '') + '</div>')] : [])
      .concat(L.map(l => (l.ok ? ok : bad)('<b>' + esc(l.kind) + '</b> — ' + esc(String(l.status || '').toLowerCase()) +
        '<div class="text-xs" style="margin-top:4px">' + esc(l.org) + (l.num ? ' · № ' + esc(l.num) : '') + (l.from ? ' · з ' + date(l.from) : '') + (l.to ? ' · до ' + date(l.to) : '') + '</div>')));
    const licBlock = r.licenses === undefined ? '' : '<h3 style="font-size:16px;margin:1.25rem 0 .5rem">Ліцензії та дозволи</h3>' +
      (licItems.length ? licItems.join('') : '<div class="text-sm text-muted">У відкритих ліцензійних реєстрах не знайдено.</div>') +
      '<p class="text-xs text-muted">Реєстри Держмитслужби (митні брокери), НКРЕКП (енергетика, комунальні послуги), Держлікслужби (наркотичні засоби й прекурсори), ДАРТ (туроператори), Укртрансбезпеки (перевезення). Єдиний ліцензійний реєстр ДРС у відкритих даних не публікується, тож інші види ліцензій (медична практика, будівництво, охорона тощо) тут не перевіряються.</p>';
    last = r;
    return '<div class="cc-report" id="ccReport"><div class="cc-pdfhead"><span><b>МитнийБрокер</b> · forwardcarua.com</span><span>Аналіз компанії від ' + date(r.checked_at) + '</span></div>' +
      '<div class="modal-title">Аналіз компанії</div>' +
      '<div class="modal-sub" style="margin-bottom:.75rem">' + esc(r.name || '') + ' · ЄДРПОУ ' + esc(r.code) + '</div>' + analysis(r) +
      '<h3 style="font-size:16px;margin:1.25rem 0 .5rem">Витяг з ЄДР</h3>' + extract(r) + (r.licenses === undefined ? lic : '') +
      snBlock + licBlock +
      '<h3 style="font-size:16px;margin:1.25rem 0 .5rem">Виконавчі провадження</h3>' + erbBlock +
      '<h3 style="font-size:16px;margin:1.25rem 0 .5rem">Банкрутство</h3>' + bkBlock +
      '<h3 style="font-size:16px;margin:1.25rem 0 .5rem">Судові справи</h3>' + crBlock + aeoBlock +
      '<p class="text-xs text-muted" style="margin:1.25rem 0 0">Перевірено ' + date(r.checked_at) + '. Дані — відкриті дані Мін’юсту (Єдиний реєстр боржників) і ДСА (справи про банкрутство, справи, призначені до розгляду, Єдиний державний реєстр судових рішень) станом на ' + date(r.data_at) + '. Судові справи привʼязані за точним збігом назви з ЄДР; справи компаній з неоднозначними назвами не показуються. ' +
        (r.token ? 'Оплачено карткою ' + r.price + ' грн.' : r.price > 0 ? 'Списано ' + r.price + ' грн з балансу.' : 'Без оплати (повторний перегляд).') + (r.token ? ' Збережіть посилання на цю сторінку — звіт доступний за ним.' : ' Звіт збережено в кабінеті → «Перевірка компаній».') + '</p>' +
      '</div>' +
      '<div class="row no-print" style="gap:8px;margin-top:1rem;flex-wrap:wrap"><button class="btn btn-primary" id="ccPdf" onclick="CompanyCheck.pdf()"><i class="ti ti-file-type-pdf"></i>Завантажити звіт PDF</button>' +
        (r.edr ? '<button class="btn btn-ghost" id="ccPdfX" onclick="CompanyCheck.pdf(\'extract\')"><i class="ti ti-file-certificate"></i>Витяг з ЄДР PDF</button>' : '') +
        '<button class="btn btn-ghost" onclick="window.print()"><i class="ti ti-printer"></i>Друк</button>' + (r.token ? '' : '<button class="btn btn-ghost" onclick="CompanyCheck.close()">Закрити</button>') + '</div>';
  }

  async function mountHistory(el){
    if (!el) return;
    await loadPrice();
    el.innerHTML = '<div class="card" style="margin-bottom:1rem"><div class="field-row" style="align-items:flex-end"><div class="field" style="flex:1"><label class="label" for="ccCode">Код ЄДРПОУ компанії</label><input class="input" id="ccCode" inputmode="numeric" maxlength="8" placeholder="8 цифр"></div>' +
      '<div class="field" style="flex:0"><button class="btn btn-primary" onclick="CompanyCheck.open(document.getElementById(\'ccCode\').value)"><i class="ti ti-shield-search"></i>Перевірити · ' + price + ' грн</button></div></div>' +
      '<p class="hint" style="margin:0">Виконавчі провадження (Єдиний реєстр боржників), банкрутство й судові справи — перед угодою з відправником, перевізником чи клієнтом.</p></div><div id="ccHist" class="text-sm text-muted">Завантаження…</div>';
    try{
      const sb = await sbReady();
      const { data } = await sb.from('company_checks').select('id, created_at, code, price, report').order('created_at', { ascending: false }).limit(50);
      const list = data || [];
      window.__ccHist = list;
      document.getElementById('ccHist').innerHTML = list.length ? list.map((c, i) => {
        const r = c.report || {}, flags = [r.erb ? '⚠️ боржник (' + r.erb.n + ' ВП)' : '✓ не боржник', (r.bankrupt || []).length ? '⚠️ банкрутство' : '✓ без банкрутства', r.courts && r.courts.n ? '⚖️ судових справ: ' + r.courts.n : '✓ без судових справ'];
        return '<div class="cargo-item" style="cursor:pointer" onclick="CompanyCheck.show(' + i + ')"><div class="spread" style="gap:10px;flex-wrap:wrap"><div><b>' + esc(r.name || c.code) + '</b> <span class="text-xs text-muted">ЄДРПОУ ' + esc(c.code) + '</span>' +
          '<div class="text-xs" style="margin-top:3px">' + flags.join(' · ') + '</div></div><div class="text-xs text-muted">' + date(c.created_at) + (Number(c.price) ? ' · ' + c.price + ' грн' : '') + '</div></div></div>';
      }).join('') : 'Перевірок ще не було.';
    }catch(e){ document.getElementById('ccHist').textContent = 'Не вдалося завантажити історію.'; }
  }
  // PDF: світла копія звіту на A4 через html2pdf (html2canvas + jsPDF), бібліотека вантажиться лише за потреби
  let last = null, h2p = null;
  function lib(){
    if (window.html2pdf) return Promise.resolve();
    return h2p || (h2p = new Promise((ok, no) => { const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'; s.onload = ok; s.onerror = () => { h2p = null; no(new Error('lib')); }; document.head.appendChild(s); }));
  }
  async function pdf(mode){
    const only = mode === 'extract';
    const src = document.getElementById(only ? 'ccExtract' : 'ccReport'), btn = document.getElementById(only ? 'ccPdfX' : 'ccPdf');
    if (!src) return;
    const label = btn ? btn.innerHTML : '';
    if (btn){ btn.disabled = true; btn.textContent = 'Готуємо PDF…'; }
    // holder — за межами екрана; у PDF іде .cc-pdf (світла тема), щоб стилі працювали і в копії html2pdf
    const wrap = document.createElement('div'), doc = document.createElement('div');
    wrap.className = 'cc-pdf-holder'; doc.className = 'cc-pdf';
    const r0 = last || {};
    if (only){   // окремий витяг: шапка + назва компанії + таблиця
      const box = document.createElement('div'); box.className = 'cc-report';
      box.innerHTML = '<div class="cc-pdfhead"><span><b>МитнийБрокер</b> · forwardcarua.com</span><span>' + date(r0.checked_at) + '</span></div>' +
        '<div class="modal-title">' + esc((r0.edr && (r0.edr.short_name || r0.edr.name)) || r0.name || '') + '</div>';
      const x = src.cloneNode(true); x.removeAttribute('id'); box.appendChild(x); doc.appendChild(box);
    } else { doc.appendChild(src.cloneNode(true)); doc.firstChild.removeAttribute('id'); }
    wrap.appendChild(doc); document.body.appendChild(wrap);
    try{
      await lib();
      const r = last || {};
      await window.html2pdf().set({
        margin: [10, 10, 12, 10], filename: (only ? 'vytyag-yedr-' : 'analiz-kompanii-') + (r.code || '') + '.pdf',
        image: { type: 'jpeg', quality: 0.92 }, html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['.card', '.msg', '.cc-f', 'h3', 'tr'] },
      }).from(doc).save();
      try{ track('company_pdf', { code: r.code, kind: only ? 'extract' : 'report' }); }catch(e){}
    }catch(e){ window.print(); }
    finally{ wrap.remove(); if (btn){ btn.disabled = false; btn.innerHTML = label; } }
  }

  function show(i){ const c = (window.__ccHist || [])[i]; if (!c) return; shell().classList.add('open'); document.getElementById('ccBody').innerHTML = report({ ...c.report, price: c.price }); }

  return { open, run, payCard, close, topup, mountHistory, show, report, pdf, analysis, loadPrice };
})();
