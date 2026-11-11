/* vehicle-check.js — «Перевірка авто» за номерним знаком або VIN (відкриті дані МВС).
   Безкоштовно — коротка довідка; повний звіт (уся історія реєстрацій, VIN, інші номери, розшук) — з балансу кабінету або карткою.
   VehicleCheck.mount(el, q?) — пошук і результат; VehicleCheck.report(r) — HTML повного звіту; VehicleCheck.mountHistory(el) — у кабінеті. */
const VehicleCheck = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const date = d => !d ? '—' : /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).split('-').reverse().join('.') : new Date(d).toLocaleDateString('uk-UA');
  const FN = () => SUPABASE_URL + '/functions/v1/vehicle-check';
  let price = 50, last = null;
  const cap = s => s ? String(s).charAt(0) + String(s).slice(1).toLowerCase() : '';

  // ілюстрація моделі — вільне фото з Вікіпедії (Wikimedia Commons), не фото саме цього авто
  const photoSlot = v => v && v.brand ? '<figure class="vc-photo" data-b="' + esc(v.brand) + '" data-m="' + esc(String(v.model || '').split(/[\s\-]/)[0]) + '"></figure>' : '';
  function loadPhotos(root){
    (root || document).querySelectorAll('.vc-photo:not([data-done])').forEach(async f => {
      f.dataset.done = '1';
      const b = f.dataset.b || '', m = f.dataset.m || '';
      const cyr = /[А-ЯІЇЄ]/i.test(b), host = cyr ? 'uk' : 'en';
      const brandWord = b.split(/[\s\-]/)[0].toLowerCase();
      const key = 'vcPh:' + b + '|' + m;
      try{ const c = sessionStorage.getItem(key); if (c){ show(f, JSON.parse(c)); return; } }catch(e){}
      try{
        const q = encodeURIComponent((b.charAt(0) + b.slice(1).toLowerCase()) + (m ? ' ' + m : ''));
        const res = await fetch('https://' + host + '.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=6&gsrsearch=' + q +
          '&prop=pageimages|info&inprop=url&piprop=thumbnail&pithumbsize=640&pilicense=free');
        const d = await res.json();
        const pages = Object.values((d.query && d.query.pages) || {}).sort((x, y) => x.index - y.index);
        const hit = pages.find(pg => pg.thumbnail && pg.title.toLowerCase().includes(brandWord) && (!m || pg.title.toLowerCase().includes(m.toLowerCase().slice(0, 2))))
          || pages.find(pg => pg.thumbnail && pg.title.toLowerCase().includes(brandWord));
        const val = hit ? { src: hit.thumbnail.source, url: hit.fullurl, title: hit.title } : null;
        try{ sessionStorage.setItem(key, JSON.stringify(val)); }catch(e){}
        show(f, val);
      }catch(e){ f.remove(); }
    });
    function show(f, v){
      if (!v){ f.remove(); return; }
      f.innerHTML = '<img src="' + esc(v.src) + '" alt="' + esc(v.title) + '" loading="lazy" referrerpolicy="no-referrer"><figcaption>Ілюстрація моделі, не фото цього авто · <a href="' + esc(v.url) + '" target="_blank" rel="noopener nofollow">Вікіпедія</a></figcaption>';
    }
  }

  async function loadPrice(){
    try{ const sb = await sbReady(); const { data } = await sb.from('service_prices').select('price').eq('code', 'vehicle_check').maybeSingle(); if (data) price = Number(data.price); }catch(e){}
    return price;
  }
  async function call(body, auth){
    const h = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON };
    if (auth){ const s = await currentSession(); if (s) h.Authorization = 'Bearer ' + s.access_token; }
    const res = await fetch(FN(), { method: 'POST', headers: h, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(d.error || 'error'), { status: res.status });
    return d;
  }

  function vline(v){
    return [v.brand, v.model].filter(Boolean).map(esc).join(' ') + (v.year ? ', ' + esc(v.year) + ' р.' : '');
  }
  function specs(v){
    const rows = [['Колір', cap(v.color)], ['Пальне', cap(v.fuel)], ['Обʼєм двигуна', v.capacity ? v.capacity + ' см³' : ''], ['Тип', cap(v.kind)],
      ['Кузов', cap(v.body)], ['Призначення', cap(v.purpose)], ['Власна / повна маса', v.own_weight ? v.own_weight + ' / ' + (v.total_weight || '—') + ' кг' : '']].filter(r => r[1]);
    return '<div class="vc-specs">' + rows.map(r => '<div><span>' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>').join('') + '</div>';
  }

  const W_KEYS = { brandmodel: 'Марка й модель', color: 'Колір', vehiclenumber: 'Номер', bodynumber: 'Номер кузова / VIN', chassisnumber: 'Номер шасі', enginenumber: 'Номер двигуна',
    illegalseizuredate: 'Дата незаконного заволодіння', organunit: 'Орган поліції', insertdate: 'Внесено в базу', cartype: 'Тип' };
  const wItem = x => '<div class="text-xs" style="margin-top:6px;line-height:1.6">' + Object.entries(x).filter(([k, v]) => v && W_KEYS[k]).map(([k, v]) =>
    W_KEYS[k] + ': <b>' + esc(/date$/.test(k) ? date(String(v).slice(0, 10)) : v) + '</b>').join(' · ') + '</div>';
  const wAlert = w => '<div class="msg show msg-err" style="margin:0 0 1rem"><b>Авто є в базі розшуку МВС</b> — не купуйте й не оформлюйте його без перевірки в сервісному центрі МВС' + (w.items || []).map(wItem).join('') + '</div>';
function summary(r){
    if (!r.found && r.wanted && r.wanted.found) return wAlert(r.wanted) + '<p class="text-xs text-muted">У реєстраційних даних МВС за «' + esc(r.q) + '» записів немає — дані з бази транспорту в розшуку.</p>';
    if (!r.found) return '<div class="card"><h3 style="margin:0 0 .4rem">Нічого не знайдено</h3><p class="text-sm text-muted" style="margin:0">За «' + esc(r.q) + '» немає записів у реєстраційних даних МВС' +
      (r.data_until ? ' (2013–' + esc(r.data_until) + ')' : '') + '. Перевірте номер: у старих форматах і транзитних номерах бувають розбіжності. Для авто, ввезеного недавно, дані можуть ще не бути опубліковані.</p></div>';
    const v = r.vehicle || {};
    const flags = [];
    flags.push(r.owner_changes ? '<span class="vc-flag">Змін власника: <b>' + r.owner_changes + '</b></span>' : '<span class="vc-flag ok">Змін власника не зафіксовано</span>');
    if (r.imported) flags.push('<span class="vc-flag">Ввезено з-за кордону · ' + date(r.imported) + '</span>');
    if (r.new_in_ua) flags.push('<span class="vc-flag ok">Новим з салону · ' + date(r.new_in_ua) + '</span>');
    if (r.wanted_flag) flags.unshift('<span class="vc-flag bad"><b>У базі розшуку МВС</b></span>');
    else if (r.wanted_flag === false) flags.push('<span class="vc-flag ok">Не в розшуку</span>');
    if (r.deregistered) flags.push('<span class="vc-flag bad">Знято з обліку</span>');
    if (r.other_vehicles) flags.push('<span class="vc-flag">Цей номер мали ще ' + r.other_vehicles + ' авто</span>');
    return '<div class="card vc-card">' +
      '<div class="text-xs text-muted">' + (r.by === 'vin' ? 'VIN ' : 'Номер ') + esc(r.q) + '</div>' +
      photoSlot(v) +
      '<h3 style="margin:.2rem 0 0;font-size:22px">' + (vline(v) || 'Транспортний засіб') + '</h3>' + (r.vin_masked ? '<div class="text-xs text-muted" style="margin-top:4px">VIN ' + esc(r.vin_masked) + '</div>' : '') +
      '<div class="vc-meta">' + (r.history_partial ? 'Перший запис з цим номером: ' : 'В Україні з ') + date(r.first_date) + ' · операцій у реєстрі: <b style="color:var(--text)">' + r.events + '</b>' +
        (r.by === 'plate' && /^[А-ЯІЇЄ]{2}\d{4}[А-ЯІЇЄ]{2}$/.test(r.q) ? ' · <a href="/avto/' + encodeURIComponent(r.q) + '">сторінка авто</a>' : '') + '</div>' +
      '<div class="vc-flags">' + flags.join('') + '</div>' + specs(v) + (r.by === 'plate' ? '<div class="cp-mount" data-compact="1" data-plate="' + esc(r.q) + '"></div>' : '') +
      '<div class="text-sm" style="margin-top:.75rem">Остання операція: <b>' + date(r.last.date) + '</b> — ' + esc(cap(r.last.op) || 'реєстраційна операція') + (r.last.region ? ' · ' + esc(r.last.region) : '') + (r.last.owner ? ' · власник — ' + esc(r.last.owner) : '') + '</div>' +
      '</div>' + buyBox(r);
  }

  async function prefill(){
    try{ const u = await currentUser(); if (u){ const e = document.getElementById('vcEmail'); if (e && !e.value) e.value = u.email || ''; const b = await getMyBroker(); if (b) document.getElementById('vcCab').style.display = ''; } }catch(e){}
  }
  // сторінка /avto/{номер}: довідка вже на сторінці — лише блок покупки повного звіту
  async function mountBuy(el, r){
    if (!el || !r || !r.found) return;
    await loadPrice(); last = r;
    el.innerHTML = buyBox(r); prefill();
  }

  function buyBox(r){
    return '<div class="card vc-buy" id="vcBuy"><div class="spread" style="gap:12px;flex-wrap:wrap;align-items:center"><div><h3 style="margin:0 0 .35rem;font-size:18px">Повний звіт · ' + price + ' грн</h3>' +
      '<ul class="text-sm" style="margin:0;padding-left:18px;line-height:1.7"><li>Уся історія: кожна реєстрація, перереєстрація й зняття з обліку з датою, областю й ТСЦ</li>' +
      '<li>Повний VIN і всі номерні знаки, які мало авто</li><li>Тип власника на кожному етапі (фізична чи юридична особа), зміни кольору, пального, перереєстрації</li>' +
      '<li>Подробиці з бази розшуку МВС: дата, орган поліції, номери кузова й двигуна</li>' + (r.other_vehicles ? '<li>Які інші авто раніше їздили з цим номером</li>' : '') + '</ul></div></div>' +
      '<div class="msg" id="vcMsg" style="margin-top:.75rem"></div>' +
      '<div id="vcCab" style="display:none;margin-top:.75rem"><button class="btn btn-primary btn-block" id="vcBtn" onclick="VehicleCheck.run()"><i class="ti ti-wallet"></i>Списати ' + price + ' грн з балансу кабінету</button></div>' +
      '<div id="vcCard" style="margin-top:.75rem"><div class="field"><label class="label" for="vcEmail">Email для чека й посилання на звіт</label><input class="input" id="vcEmail" type="email" autocomplete="email" placeholder="you@example.com"></div>' +
      '<button class="btn btn-block" id="vcPay" style="background:var(--green);color:#06120c;font-weight:600" onclick="VehicleCheck.payCard()"><i class="ti ti-credit-card"></i>Оплатити карткою ' + price + ' грн</button>' +
      '<p class="text-xs text-muted" style="margin:.5rem 0 0">WayForPay: Visa, Mastercard, Apple Pay, Google Pay. Звіт відкриється одразу після оплати.</p></div></div>';
  }

  function report(r){
    if (!r.found) return summary(r);
    const v = r.vehicle || {};
    const w = r.wanted;
    const wBlock = w == null ? '' : w.found
      ? wAlert(w)
      : '<div class="msg show msg-ok" style="margin:0 0 1rem"><b>У базі розшуку МВС не значиться</b></div>';
    const hist = (r.history || []).slice().reverse().map(h => '<div class="vc-ev"><div class="vc-dt">' + date(h.date) + '</div><div><b>' + esc(cap(h.op) || 'Реєстраційна операція') + '</b>' +
      '<div class="text-xs text-muted">' + [h.region, h.tsc && /^ТСЦ/.test(h.tsc) ? h.tsc : '', h.owner ? 'власник — ' + h.owner : '', h.color ? cap(h.color) : '', h.fuel ? cap(h.fuel) : ''].filter(Boolean).map(esc).join(' · ') + '</div></div></div>').join('');
    const prev = (r.previous_on_plate || []).length ? '<h3 style="font-size:16px;margin:1.25rem 0 .5rem">Інші авто з цим номером раніше</h3>' +
      r.previous_on_plate.map(p => '<div class="card" style="padding:10px 12px;margin-top:8px;font-size:13px"><b>' + vline(p.vehicle || {}) + '</b><div class="text-xs text-muted">' + date(p.from) + ' — ' + date(p.to) + ' · операцій: ' + p.events + '</div></div>').join('') : '';
    return '<div class="modal-title">Звіт про авто</div>' +
      '<div class="modal-sub" style="margin-bottom:.75rem">' + vline(v) + '</div>' + photoSlot(v) + wBlock +
      '<div class="text-sm" style="line-height:1.8">' + (r.vin ? 'VIN: <b>' + esc(r.vin) + '</b><br>' : '') +
        ((r.plates || []).length ? 'Номерні знаки: <b>' + r.plates.map(esc).join(', ') + '</b><br>' : '') +
        (r.history_partial ? 'Перший запис з цим номером: ' : 'В Україні з ') + date(r.first_date) + ' · змін власника: <b>' + r.owner_changes + '</b>' + (r.imported ? ' · ввезено ' + date(r.imported) : '') + '</div>' + specs(v) + ((r.by === 'plate' ? r.q : (r.plates || [])[0]) ? '<div class="cp-mount" data-compact="1" data-plate="' + esc(r.by === 'plate' ? r.q : r.plates[0]) + '"></div>' : '') +
      '<h3 style="font-size:16px;margin:1.25rem 0 .5rem">Історія реєстраційних операцій (' + (r.history || []).length + ')</h3><div class="vc-hist">' + hist + '</div>' + prev +
      '<p class="text-xs text-muted" style="margin:1.25rem 0 0">Перевірено ' + date(r.checked_at) + '. Джерело — відкриті дані Головного сервісного центру МВС («Відомості про транспортні засоби та їх власників», «Транспортні засоби в розшуку») ' +
        (r.data_until ? 'за 2013–' + esc(r.data_until) + ' рр. ' : '') + 'Імена, адреси й контакти власників у відкритих даних не публікуються. ' +
        (r.token ? 'Оплачено карткою ' + r.price + ' грн. Збережіть посилання на цю сторінку.' : r.price > 0 ? 'Списано ' + r.price + ' грн з балансу.' : r.price === 0 ? 'Без оплати (повторний перегляд).' : '') + '</p>' +
      '<div class="row no-print" style="gap:8px;margin-top:1rem"><button class="btn btn-ghost" onclick="window.print()"><i class="ti ti-printer"></i>Друк / PDF</button></div>';
  }

  async function search(q, el){
    el = el || document.getElementById('vcRes');
    q = String(q || '').trim();
    if (!q){ el.innerHTML = ''; return; }
    el.innerHTML = '<p class="text-sm text-muted">Шукаємо в реєстраційних даних МВС…</p>';
    await loadPrice();
    try{
      const r = await call({ action: 'summary', q });
      last = r;
      el.innerHTML = summary(r);
      loadPhotos(el); if (typeof CarPhotos !== 'undefined') CarPhotos.scan(el);
      try{ track('vehicle_search', { found: r.found }); }catch(e){}
      try{ history.replaceState(null, '', location.pathname + '?q=' + encodeURIComponent(r.q)); }catch(e){}
      if (r.found) prefill();
    }catch(e){
      el.innerHTML = '<div class="msg show msg-err">' + (e.message === 'bad_query' ? 'Введіть номерний знак (наприклад, АА1234ВВ) або VIN із 17 символів.' : e.message === 'unavailable' ? 'Дані оновлюються — спробуйте за кілька хвилин.' : 'Не вдалося виконати пошук. Спробуйте ще раз.') + '</div>';
    }
  }

  async function run(){
    const btn = document.getElementById('vcBtn'), m = document.getElementById('vcMsg');
    const fail = html => { m.className = 'msg show msg-err'; m.innerHTML = html; btn.disabled = false; btn.innerHTML = '<i class="ti ti-wallet"></i>Списати ' + price + ' грн з балансу кабінету'; };
    btn.disabled = true; btn.textContent = 'Формуємо звіт…';
    try{
      const d = await call({ action: 'full', q: last.q }, true);
      try{ track('vehicle_check', { value: d.price, currency: 'UAH', repeat: d.repeat }); }catch(e){}
      openReport(d);
      document.getElementById('vcBuy').innerHTML = '<p class="text-sm" style="margin:0">Звіт відкрито й збережено в кабінеті → «Перевірка авто». <a href="#" onclick="VehicleCheck.reopen();return false">Відкрити ще раз</a></p>';
      window.__vcLast = d;
    }catch(e){
      const t = e.message;
      if (t === 'no_cabinet') return fail('Баланс є лише в кабінеті брокера чи перевізника — оплатіть карткою нижче.');
      if (t === 'balance') return fail('На балансі недостатньо коштів. Оплатіть карткою нижче або поповніть баланс у кабінеті.');
      if (t === 'unauthorized') return fail('Увійдіть у кабінет або оплатіть карткою нижче.');
      fail('Не вдалося сформувати звіт. Спробуйте ще раз.');
    }
  }
  function reopen(){ if (window.__vcLast) openReport(window.__vcLast); }

  async function payCard(){
    const btn = document.getElementById('vcPay'), m = document.getElementById('vcMsg');
    const email = (document.getElementById('vcEmail').value || '').trim();
    const fail = t => { m.className = 'msg show msg-err'; m.textContent = t; btn.disabled = false; btn.innerHTML = '<i class="ti ti-credit-card"></i>Оплатити карткою ' + price + ' грн'; };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Вкажіть email — на нього прийде чек, а звіт буде за посиланням');
    btn.disabled = true; btn.textContent = 'Переходимо до оплати…';
    try{
      const d = await call({ action: 'checkout', q: last.q, email });
      try{ const l = JSON.parse(localStorage.getItem('vcOrders') || '[]'); l.unshift({ t: d.token, q: last.q, at: Date.now() }); localStorage.setItem('vcOrders', JSON.stringify(l.slice(0, 30))); }catch(e){}
      try{ track('begin_checkout', { value: price, currency: 'UAH', items: [{ item_name: 'vehicle_check' }] }); }catch(e){}
      const form = document.createElement('form');
      form.method = 'POST'; form.action = 'https://secure.wayforpay.com/pay'; form.acceptCharset = 'utf-8';
      Object.entries(d.form).forEach(([k, v]) => (Array.isArray(v) ? v : [v]).forEach(val => {
        const i = document.createElement('input'); i.type = 'hidden'; i.name = Array.isArray(v) ? k + '[]' : k; i.value = val; form.appendChild(i); }));
      document.body.appendChild(form); form.submit();
    }catch(e){
      fail(e.message === 'too_many' ? 'Забагато замовлень з цього email — спробуйте за годину' : e.message === 'bad_email' ? 'Перевірте email' : 'Оплата тимчасово недоступна. Напишіть на custom@forwardcarua.com');
    }
  }

  function shell(){
    let o = document.getElementById('vcOverlay');
    if (o) return o;
    o = document.createElement('div'); o.className = 'overlay'; o.id = 'vcOverlay';
    o.innerHTML = '<div class="modal modal-wide"><button class="modal-close" aria-label="Закрити" onclick="document.getElementById(\'vcOverlay\').classList.remove(\'open\')"><i class="ti ti-x"></i></button><div id="vcBody"></div></div>';
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
    document.body.appendChild(o); return o;
  }
  function openReport(r){ shell().classList.add('open'); document.getElementById('vcBody').innerHTML = report(r); loadPhotos(document.getElementById('vcBody')); if (typeof CarPhotos !== 'undefined') CarPhotos.scan(document.getElementById('vcBody')); }

  function mount(el, q){
    if (!el) return;
    el.innerHTML = '<div class="row" style="gap:8px"><input class="input" id="vcQ" placeholder="Номер (АА1234ВВ) або VIN" autocomplete="off" autocapitalize="characters" style="flex:1;min-width:0;text-transform:uppercase">' +
      '<button class="btn btn-primary" type="button" id="vcGo"><i class="ti ti-search"></i>Перевірити</button></div><div id="vcRes" style="margin-top:1rem"></div>';
    const i = document.getElementById('vcQ'), go = () => search(i.value, document.getElementById('vcRes'));
    document.getElementById('vcGo').onclick = go;
    i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    if (q){ i.value = q; go(); }
  }

  async function mountHistory(el){
    if (!el) return;
    el.innerHTML = '<div class="card" style="margin-bottom:1rem" id="vcMount"></div><div id="vcHist" class="text-sm text-muted">Завантаження…</div>';
    mount(document.getElementById('vcMount'));
    try{
      const sb = await sbReady();
      const { data } = await sb.from('vehicle_checks').select('id, created_at, q, price, report').order('created_at', { ascending: false }).limit(50);
      const list = data || [];
      window.__vcHist = list;
      document.getElementById('vcHist').innerHTML = list.length ? '<div class="card-title">Ваші перевірки</div>' + list.map((c, k) => {
        const r = c.report || {}, v = r.vehicle || {};
        return '<div class="cargo-item" style="cursor:pointer" onclick="VehicleCheck.show(' + k + ')"><div class="spread" style="gap:10px;flex-wrap:wrap"><div><b>' + esc(c.q) + '</b> <span class="text-xs text-muted">' + vline(v) + '</span>' +
          '<div class="text-xs" style="margin-top:3px">' + (r.wanted && r.wanted.found ? '⚠️ у розшуку · ' : '') + 'змін власника: ' + (r.owner_changes ?? '—') + '</div></div><div class="text-xs text-muted">' + date(c.created_at) + (Number(c.price) ? ' · ' + c.price + ' грн' : '') + '</div></div></div>';
      }).join('') : 'Перевірок авто ще не було.';
    }catch(e){ document.getElementById('vcHist').textContent = 'Не вдалося завантажити історію.'; }
  }
  function show(k){ const c = (window.__vcHist || [])[k]; if (c) openReport({ ...c.report, price: c.price }); }

  return { mount, mountBuy, loadPhotos, search, run, payCard, report, summary, reopen, mountHistory, show, loadPrice };
})();
