/* cargo-public.js — публічні частини розділу перевезень: форма заявки, каталог перевізників, брокери в пунктах пропуску */
const CargoPublic = (() => {
  const $ = id => document.getElementById(id);
  const opts = (list, first) => (first ? '<option value="">' + first + '</option>' : '') + list.map(x => '<option>' + esc(x) + '</option>').join('');

  function mountForm(id){
    const el = $(id); if (!el) return;
    el.innerHTML =
      '<h2 class="h-sm" style="margin-bottom:.25rem">Заявка на перевезення</h2>' +
      '<p class="text-sm text-muted" style="margin-bottom:1rem">Безкоштовно. Перевізники зателефонують самі.</p>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-fc">Звідки — країна *</label><select class="input" id="cg-fc">' + opts(CARGO_COUNTRIES, 'Оберіть') + '</select></div>' +
        '<div class="field"><label class="label" for="cg-fcity">Місто</label><input class="input" id="cg-fcity" placeholder="Напр.: Варшава"></div></div>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-tc">Куди — країна *</label><select class="input" id="cg-tc">' + opts(CARGO_COUNTRIES, 'Оберіть') + '</select></div>' +
        '<div class="field"><label class="label" for="cg-tcity">Місто</label><input class="input" id="cg-tcity" placeholder="Напр.: Київ"></div></div>' +
      '<div class="field"><label class="label" for="cg-cargo">Що веземо *</label><input class="input" id="cg-cargo" maxlength="200" placeholder="Напр.: обладнання на палетах, 8 палет"></div>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-w">Вага, т</label><input class="input" type="number" id="cg-w" min="0" step="0.1"></div>' +
        '<div class="field"><label class="label" for="cg-v">Обʼєм, м³</label><input class="input" type="number" id="cg-v" min="0" step="0.1"></div></div>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-tr">Транспорт</label><select class="input" id="cg-tr">' + opts(TRANSPORT_TYPES, 'Будь-який') + '</select></div>' +
        '<div class="field"><label class="label" for="cg-date">Дата завантаження</label><input class="input" id="cg-date" placeholder="ДД.ММ.РРРР" inputmode="numeric" maxlength="10" oninput="CargoPublic.mask(this)"></div></div>' +
      '<label class="check-row"><input type="checkbox" id="cg-customs"> Потрібне митне оформлення (експорт / імпорт / транзит)</label>' +
      '<div class="field"><label class="label" for="cg-notes">Деталі</label><textarea class="input" id="cg-notes" maxlength="1500" placeholder="Габарити, ADR, температурний режим, бюджет…"></textarea></div>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-name">Ваше імʼя *</label><input class="input" id="cg-name" autocomplete="name"></div>' +
        '<div class="field"><label class="label" for="cg-company">Компанія</label><input class="input" id="cg-company" autocomplete="organization"></div></div>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-phone">Телефон *</label><input class="input" id="cg-phone" type="tel" autocomplete="tel" placeholder="+380…"></div>' +
        '<div class="field"><label class="label" for="cg-tg">Telegram або email</label><input class="input" id="cg-tg" placeholder="@username або mail@…"></div></div>' +
      '<label class="check-row"><input type="checkbox" id="cg-ok" checked> Погоджуюсь з <a href="/terms#privacy" target="_blank">обробкою персональних даних</a></label>' +
      '<div class="msg" id="cg-msg"></div>' +
      '<button class="btn btn-primary btn-block" id="cg-btn" onclick="CargoPublic.send()"><i class="ti ti-send"></i>Надіслати перевізникам</button>';
  }

  function mask(el){
    const d = el.value.replace(/\D/g, '').slice(0, 8);
    el.value = d.length > 4 ? d.slice(0, 2) + '.' + d.slice(2, 4) + '.' + d.slice(4) : d.length > 2 ? d.slice(0, 2) + '.' + d.slice(2) : d;
  }
  function isoDate(v){
    const m = String(v || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/); if (!m) return '';
    const dt = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return dt.getUTCDate() === +m[1] && dt.getUTCMonth() === +m[2] - 1 ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }

  async function send(){
    const v = id => $(id).value.trim(), m = $('cg-msg'), btn = $('cg-btn');
    const fail = t => { m.className = 'msg show msg-err'; m.textContent = t; };
    if (!v('cg-fc') || !v('cg-tc')) return fail('Оберіть країну завантаження і доставки');
    if (v('cg-cargo').length < 2) return fail('Опишіть вантаж');
    if (v('cg-name').length < 2) return fail('Вкажіть імʼя');
    if (v('cg-phone').replace(/\D/g, '').length < 9) return fail('Вкажіть коректний телефон');
    if (v('cg-date') && !isoDate(v('cg-date'))) return fail('Перевірте дату завантаження — формат ДД.ММ.РРРР');
    if (!$('cg-ok').checked) return fail('Потрібна згода на обробку даних');
    const tg = v('cg-tg');
    btn.disabled = true; btn.textContent = 'Надсилаємо…';
    try{
      await createCargoRequest({
        from_country: v('cg-fc'), from_city: v('cg-fcity'), to_country: v('cg-tc'), to_city: v('cg-tcity'),
        cargo: v('cg-cargo'), weight_t: v('cg-w'), volume_m3: v('cg-v'), transport: v('cg-tr'), load_date: isoDate(v('cg-date')),
        customs: $('cg-customs').checked, notes: v('cg-notes'), name: v('cg-name'), company: v('cg-company'), phone: v('cg-phone'),
        telegram: tg.includes('@') && !tg.startsWith('@') ? '' : tg, email: tg.includes('@') && !tg.startsWith('@') ? tg : ''
      });
      $(btn.parentElement.id).innerHTML = '<div style="text-align:center;padding:1.5rem 0"><i class="ti ti-circle-check" style="font-size:44px;color:var(--green)"></i>' +
        '<h3 class="h-sm" style="margin:.6rem 0">Заявку надіслано перевізникам</h3><p class="text-sm text-muted">Перевізники, які готові взяти рейс, зателефонують вам. ' +
        'Потрібне митне оформлення? <a href="/punkty-propusku">Брокери в пунктах пропуску</a> або <a href="/">каталог брокерів</a>.</p></div>';
      if (typeof CargoPublic.onSent === 'function') CargoPublic.onSent();
    }catch(e){ fail(e.message); btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i>Надіслати перевізникам'; }
  }

  let carriers = [];
  async function mountCarriers(id){
    const el = $(id); if (!el) return;
    $('fTransport').innerHTML = opts(TRANSPORT_TYPES, 'Будь-який транспорт');
    $('fRoute').innerHTML = opts(CARGO_COUNTRIES.filter(c => c !== 'Інша країна' && c !== 'Україна'), 'Будь-яка країна');
    $('fTransport').onchange = $('fRoute').onchange = () => renderCarriers(el);
    try{ carriers = await listBrokers({ kind: 'carrier', sort: 'plan' }); }catch(e){ carriers = []; }
    renderCarriers(el);
  }
  function renderCarriers(el){
    const t = $('fTransport').value, r = $('fRoute').value;
    const list = carriers.filter(b => (!t || (b.transport || []).includes(t)) && (!r || (b.routes || []).includes(r)));
    el.innerHTML = list.length ? list.map(b =>
      '<a class="card card-hover" href="/broker/' + esc(b.id) + '" style="display:block;color:inherit">' +
        '<div style="display:flex;gap:12px;align-items:center"><div class="avatar av-' + esc(b.plan || 'free') + '" style="width:44px;height:44px;font-size:16px">' + avatarInner(b) + '</div>' +
        '<div style="min-width:0"><div style="font-weight:600">' + esc(b.name) + (b.is_verified ? ' <i class="ti ti-rosette-discount-check" style="color:var(--green)"></i>' : '') + '</div>' +
        '<div class="text-xs text-muted">' + esc([b.city, b.region].filter(Boolean).join(', ') || 'Україна') + (b.fleet ? ' · ' + b.fleet + ' авто' : '') + '</div></div></div>' +
        ((b.transport || []).length ? '<div class="lg-tags">' + b.transport.slice(0, 5).map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') +
        ((b.routes || []).length ? '<div class="text-xs text-muted" style="margin-top:6px"><i class="ti ti-route"></i> ' + esc(b.routes.slice(0, 6).join(', ')) + (b.routes.length > 6 ? '…' : '') + '</div>' : '') +
      '</a>').join('')
      : '<div class="card" style="grid-column:1/-1"><div class="text-sm text-muted">' + (carriers.length ? 'За цим фільтром перевізників поки немає.' : 'Каталог перевізників тільки наповнюється.') +
        ' Розмістіть заявку вище — її побачать усі перевізники платформи. Ви перевізник? <a href="/dlya-perevizhnykiv">Розмістіть профіль безкоштовно</a>.</div></div>';
  }

  async function mountPosts(id){
    const el = $(id); if (!el) return;
    const rows = await postBrokers();
    const by = {}; rows.forEach(r => (by[r.post] = by[r.post] || []).push(r));
    const paid = b => b.plan && b.plan !== 'free' && (!b.plan_expires_at || new Date(b.plan_expires_at) > new Date());
    const render = q => {
      q = (q || '').trim().toLowerCase();
      const posts = BORDER_POSTS.filter(p => !q || (p.name + ' ' + p.region + ' ' + p.country).toLowerCase().includes(q));
      el.innerHTML = posts.map(p => {
        const list = (by[p.id] || []).sort((a, b) => (PLAN_RANK[a.plan] ?? 3) - (PLAN_RANK[b.plan] ?? 3));
        return '<div class="card"><div style="font-weight:700">' + esc(p.name) + '</div>' +
          '<div class="text-xs text-muted" style="margin-bottom:10px">' + esc([p.region === 'м. Київ' ? 'Київ' : p.region + ' обл.', p.country].filter(Boolean).join(' · ')) + '</div>' +
          (list.length ? list.map(b => '<div class="lg-pb"><a href="/broker/' + esc(b.id) + '" style="font-weight:500">' + esc(b.name) + '</a>' +
              (b.is_verified ? ' <i class="ti ti-rosette-discount-check" style="color:var(--green)"></i>' : '') +
              '<div class="row" style="gap:6px;margin-top:4px">' +
              (b.phone ? '<a class="btn btn-ghost btn-sm" href="' + telHref(b.phone) + '"><i class="ti ti-phone"></i>' + esc(b.phone) + '</a>' : '') +
              (b.telegram ? '<a class="btn btn-ghost btn-sm" href="' + tgHref(b.telegram) + '" target="_blank" rel="noopener"><i class="ti ti-brand-telegram"></i></a>' : '') +
              '</div></div>').join('')
            : '<div class="text-sm text-muted">Брокерів тут ще не відмічено. <a href="/zayavka">Залиште заявку</a> — підберемо.</div>') +
          '</div>';
      }).join('') || '<div class="text-sm text-muted">Нічого не знайдено.</div>';
    };
    render('');
    const f = $('postFind'); if (f) f.oninput = () => render(f.value);
  }

  /* ---------------- Біржа: стрічка вантажів і транспорту ---------------- */
  const fmtD = d => d ? d.split('-').reverse().join('.') : '';
  const ago = d => { const h = Math.floor((Date.now() - new Date(d)) / 36e5); return h < 1 ? 'щойно' : h < 24 ? h + ' год тому' : Math.floor(h / 24) + ' дн тому'; };
  const route = x => '<span>' + esc([x.from_city, x.from_country].filter(Boolean).join(', ')) + '</span> <i class="ti ti-arrow-right" style="color:var(--blue)"></i> <span>' + esc([x.to_city, x.to_country].filter(Boolean).join(', ')) + '</span>';
  let me = null, meLoaded = false;
  async function whoAmI(){
    if (meLoaded) return me; meLoaded = true;
    try{ if (await currentUser()) me = await getMyBroker(); }catch(e){}
    return me;
  }
  function filterBar(prefix, extra){
    const c = opts(CARGO_COUNTRIES, 'Будь-яка');
    return '<div class="fx-filters">' +
      '<div class="field"><label class="label">Звідки</label><select class="input" id="' + prefix + 'From">' + c + '</select></div>' +
      '<div class="field"><label class="label">Куди</label><select class="input" id="' + prefix + 'To">' + c + '</select></div>' +
      '<div class="field"><label class="label">Транспорт</label><select class="input" id="' + prefix + 'Tr">' + opts(TRANSPORT_TYPES, 'Будь-який') + '</select></div>' +
      (extra || '') + '</div>';
  }
  const fval = (p, k) => ($(p + k) || {}).value || '';

  let cargoAll = [], respSet = {};
  async function mountCargoBoard(id, o = {}){
    const el = $(id); if (!el) return;
    if (!o.compact) el.insertAdjacentHTML('beforebegin', filterBar('cb'));
    try{ cargoAll = await cargoBoard(); }catch(e){ cargoAll = []; }
    const m = await whoAmI();
    if (m && m.kind === 'carrier'){ try{ (await myCargoResponses()).forEach(r => respSet[r.cargo_id] = 1); }catch(e){} }
    const draw = () => {
      const f = fval('cb', 'From'), t = fval('cb', 'To'), tr = fval('cb', 'Tr');
      const list = cargoAll.filter(x => (!f || x.from_country === f) && (!t || x.to_country === t) && (!tr || !x.transport || x.transport === tr)).slice(0, o.limit || 500);
      const btn = x => m && m.kind === 'carrier'
        ? '<button class="btn btn-primary btn-sm" onclick="CargoPublic.respond(\'' + x.id + '\',this)">' + (respSet[x.id] ? 'Контакти' : 'Відгукнутись') + '</button>'
        : '<a class="btn btn-ghost btn-sm" href="/vhid?role=carrier&next=/vantazhi">Контакти — для перевізників</a>';
      el.innerHTML = list.length ? list.map(x =>
        '<div class="fx-row" id="cg-' + x.id + '"><div class="fx-main"><div class="cargo-route">' + route(x) + '</div>' +
          '<div class="fx-what">' + esc(x.cargo) + '</div>' +
          '<div class="fx-meta">' + [x.weight_t ? x.weight_t + ' т' : '', x.volume_m3 ? x.volume_m3 + ' м³' : '', x.transport || 'будь-який транспорт',
            x.load_date ? '<i class="ti ti-calendar"></i> ' + fmtD(x.load_date) : '', x.customs ? '<span class="fx-badge">митне оформлення</span>' : ''].filter(Boolean).join(' · ') + '</div>' +
          (x.notes && !o.compact ? '<div class="fx-notes">' + esc(x.notes) + '</div>' : '') + '</div>' +
          '<div class="fx-side"><div class="text-xs text-muted">' + ago(x.created_at) + (x.responses_count ? ' · відгуків: ' + x.responses_count : '') + '</div>' + btn(x) + '</div></div>').join('')
        : '<div class="card"><div class="text-sm text-muted">Вантажів за цим фільтром поки немає. <a href="/perevezennya#cargoForm">Додайте свій вантаж</a> — його побачать усі перевізники.</div></div>';
    };
    ['From', 'To', 'Tr'].forEach(k => { const s = $('cb' + k); if (s) s.onchange = draw; });
    draw();
  }
  async function respond(id, btn){
    btn.disabled = true;
    try{
      const c = await respondCargo(id); respSet[id] = 1;
      const row = $('cg-' + id);
      row.querySelector('.fx-side').innerHTML = '<div class="fx-contact"><b>' + esc(c.name) + '</b>' + (c.company ? '<div class="text-xs">' + esc(c.company) + '</div>' : '') +
        '<a href="' + telHref(c.phone) + '">' + esc(c.phone) + '</a>' + (c.telegram ? '<a href="' + tgHref(c.telegram) + '" target="_blank" rel="noopener">' + esc(c.telegram) + '</a>' : '') +
        (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') + '</div>';
    }catch(e){ showToast(e.message, 'error'); btn.disabled = false; }
  }

  let offersAll = [];
  async function mountOffers(id, o = {}){
    const el = $(id); if (!el) return;
    if (!o.compact) el.insertAdjacentHTML('beforebegin', filterBar('tb'));
    try{ offersAll = await publicOffers(); }catch(e){ offersAll = []; }
    const draw = () => {
      const f = fval('tb', 'From'), t = fval('tb', 'To'), tr = fval('tb', 'Tr');
      const list = offersAll.filter(x => (!f || x.from_country === f) && (!t || x.to_country === t) && (!tr || x.transport === tr)).slice(0, o.limit || 500);
      el.innerHTML = list.length ? list.map(x => {
        const b = x.brokers || {}, v = x.vehicles;
        return '<div class="fx-row"><div class="fx-main"><div class="cargo-route">' + route(x) + '</div>' +
          '<div class="fx-what">' + esc(x.transport || (v && v.kind) || 'Транспорт') + (v ? ' · ' + esc([v.make, v.capacity_t ? v.capacity_t + ' т' : '', v.volume_m3 ? v.volume_m3 + ' м³' : ''].filter(Boolean).join(', ')) +
            (v.status === 'verified' ? ' <span class="fx-badge ok"><i class="ti ti-shield-check"></i> авто перевірено</span>' : '') : '') + '</div>' +
          '<div class="fx-meta">' + [x.date_from ? '<i class="ti ti-calendar"></i> ' + fmtD(x.date_from) + (x.date_to ? ' – ' + fmtD(x.date_to) : '') : 'дата за домовленістю',
            !v && x.capacity_t ? x.capacity_t + ' т' : '', !v && x.volume_m3 ? x.volume_m3 + ' м³' : ''].filter(Boolean).join(' · ') + '</div>' +
          (x.notes && !o.compact ? '<div class="fx-notes">' + esc(x.notes) + '</div>' : '') + '</div>' +
          '<div class="fx-side"><a href="/broker/' + esc(b.id) + '" style="font-weight:600">' + esc(b.name || '') + '</a>' + (b.is_verified ? ' <i class="ti ti-rosette-discount-check" style="color:var(--green)"></i>' : '') +
            '<div class="text-xs text-muted">' + esc(b.city || '') + ' · ' + ago(x.created_at) + '</div>' +
            '<div class="row" style="gap:6px;justify-content:flex-end">' + (b.phone ? '<a class="btn btn-primary btn-sm" href="' + telHref(b.phone) + '"><i class="ti ti-phone"></i>Подзвонити</a>' : '') +
            (b.telegram ? '<a class="btn btn-ghost btn-sm" href="' + tgHref(b.telegram) + '" target="_blank" rel="noopener"><i class="ti ti-brand-telegram"></i></a>' : '') + '</div></div></div>';
      }).join('') : '<div class="card"><div class="text-sm text-muted">Вільного транспорту за цим фільтром поки немає. Перевізник? <a href="/vhid?role=carrier">Додайте свій транспорт</a> — його побачать вантажовласники.</div></div>';
    };
    ['From', 'To', 'Tr'].forEach(k => { const s = $('tb' + k); if (s) s.onchange = draw; });
    draw();
  }

  async function mountVehicles(id, carrierId){
    const el = $(id); if (!el) return;
    const list = await carrierVehicles(carrierId);
    if (!list.length){ el.style.display = 'none'; return; }
    const ok = list.filter(v => v.status === 'verified').length;
    el.innerHTML = '<div class="card-title">Автопарк · ' + list.length + ' авто' + (ok ? ', перевірено ' + ok : '') + '</div>' +
      list.map(v => '<div class="fx-veh"><b>' + esc(v.kind || 'Авто') + '</b> ' + esc([v.make, v.year, v.capacity_t ? v.capacity_t + ' т' : '', v.volume_m3 ? v.volume_m3 + ' м³' : ''].filter(Boolean).join(' · ')) +
        (v.status === 'verified' ? ' <span class="fx-badge ok"><i class="ti ti-shield-check"></i> перевірено</span>' : ' <span class="fx-badge">на перевірці</span>') + '</div>').join('');
  }

  return { mountForm, mountCarriers, mountPosts, send, mask, mountCargoBoard, mountOffers, respond, mountVehicles };
})();
