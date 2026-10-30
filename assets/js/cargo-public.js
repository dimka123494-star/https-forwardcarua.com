/* cargo-public.js — публічні частини розділу перевезень: форма заявки, каталог перевізників, брокери в пунктах пропуску */
const CargoPublic = (() => {
  const $ = id => document.getElementById(id);
  const opts = (list, first) => (first ? '<option value="">' + first + '</option>' : '') + list.map(x => '<option>' + esc(x) + '</option>').join('');

  function mountForm(id){
    const el = $(id); if (!el) return;
    el.innerHTML =
      '<h2 class="h-sm" style="margin-bottom:.25rem">Заявка на перевезення</h2>' +
      '<p class="text-sm text-muted" style="margin-bottom:1rem" id="cg-sub">Безкоштовно. Перевізники надсилають ставки — ви обираєте.</p>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-fc">Звідки — країна *</label><select class="input" id="cg-fc">' + opts(CARGO_COUNTRIES, 'Оберіть') + '</select></div>' +
        '<div class="field"><label class="label" for="cg-fcity">Місто</label><input class="input" id="cg-fcity" placeholder="Напр.: Варшава"></div></div>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-tc">Куди — країна *</label><select class="input" id="cg-tc">' + opts(CARGO_COUNTRIES, 'Оберіть') + '</select></div>' +
        '<div class="field"><label class="label" for="cg-tcity">Місто</label><input class="input" id="cg-tcity" placeholder="Напр.: Київ"></div></div>' +
      '<div class="cg-route"><div class="cg-map" id="cg-map"></div><div class="text-sm" id="cg-km"><i class="ti ti-route"></i> Вкажіть міста завантаження й доставки — порахуємо кілометраж і покажемо маршрут.</div></div>' +
      '<div class="field"><label class="label" for="cg-cargo">Що веземо *</label><input class="input" id="cg-cargo" maxlength="200" placeholder="Напр.: обладнання на палетах, 8 палет"></div>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-w">Вага, т</label><input class="input" type="number" id="cg-w" min="0" step="0.1"></div>' +
        '<div class="field"><label class="label" for="cg-v">Обʼєм, м³</label><input class="input" type="number" id="cg-v" min="0" step="0.1"></div></div>' +
      '<label class="label">Габарити вантажу, м <span class="text-muted" style="text-transform:none;letter-spacing:0">(довжина × ширина × висота)</span></label>' +
      '<div class="cg-dims"><input class="input" type="number" id="cg-l" min="0" step="0.01" placeholder="Довжина"><span>×</span>' +
        '<input class="input" type="number" id="cg-wd" min="0" step="0.01" placeholder="Ширина"><span>×</span>' +
        '<input class="input" type="number" id="cg-h" min="0" step="0.01" placeholder="Висота">' +
        '<input class="input" type="number" id="cg-pl" min="1" step="1" placeholder="Місць / палет" title="Кількість місць або палет"></div>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-tr">Транспорт</label><select class="input" id="cg-tr">' + opts(TRANSPORT_TYPES, 'Будь-який') + '</select></div>' +
        '<div class="field"><label class="label" for="cg-date">Дата завантаження</label><input class="input" id="cg-date" placeholder="ДД.ММ.РРРР" inputmode="numeric" maxlength="10" oninput="CargoPublic.mask(this)"></div></div>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-price">Ваша ставка</label><div style="display:flex;gap:6px"><input class="input" type="number" id="cg-price" min="0" step="1" placeholder="порожньо — запит ставок">' +
        '<select class="input" id="cg-cur" style="width:92px">' + CURRENCIES.map(c => '<option>' + c + '</option>').join('') + '</select></div></div>' +
        '<div class="field"><label class="label" for="cg-pay">Оплата</label><select class="input" id="cg-pay">' + opts(PAY_TERMS, 'Не важливо') + '</select></div></div>' +
      '<label class="check-row"><input type="checkbox" id="cg-customs"> Потрібне митне оформлення (експорт / імпорт / транзит)</label>' +
      '<div class="field"><label class="label" for="cg-notes">Деталі</label><textarea class="input" id="cg-notes" maxlength="1500" placeholder="Габарити, ADR, температурний режим, бюджет…"></textarea></div>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-name">Ваше імʼя *</label><input class="input" id="cg-name" autocomplete="name"></div>' +
        '<div class="field"><label class="label" for="cg-company">Компанія</label><input class="input" id="cg-company" autocomplete="organization"></div></div>' +
      '<div class="field-row"><div class="field"><label class="label" for="cg-phone">Телефон *</label><input class="input" id="cg-phone" type="tel" autocomplete="tel" placeholder="+380…"></div>' +
        '<div class="field"><label class="label" for="cg-tg">Telegram або email</label><input class="input" id="cg-tg" placeholder="@username або mail@…"></div></div>' +
      '<label class="check-row"><input type="checkbox" id="cg-ok" checked> Погоджуюсь з <a href="/terms#privacy" target="_blank">обробкою персональних даних</a></label>' +
      '<div class="msg" id="cg-msg"></div>' +
      '<button class="btn btn-primary btn-block" id="cg-btn" onclick="CargoPublic.send()"><i class="ti ti-send"></i>Надіслати перевізникам</button>';
    route_ = {}; map_ = null;
    ['cg-fc', 'cg-tc', 'cg-fcity', 'cg-tcity'].forEach(i => $(i).addEventListener('change', planRoute));
    ['cg-fcity', 'cg-tcity'].forEach(i => $(i).addEventListener('input', () => { clearTimeout(rt_); rt_ = setTimeout(planRoute, 1200); }));
    $('cg-price').addEventListener('input', kmLine); $('cg-cur').addEventListener('change', kmLine);
    ['cg-l', 'cg-wd', 'cg-h'].forEach(i => $(i).addEventListener('input', autoVolume));
  }

  /* ---------- Габарити: обʼєм рахуємо сам, якщо не вказано ---------- */
  let volAuto = false;
  function autoVolume(){
    const l = +$('cg-l').value, w = +$('cg-wd').value, h = +$('cg-h').value, vEl = $('cg-v');
    if (l && w && h && (!vEl.value || volAuto)){ vEl.value = Math.round(l * w * h * 10) / 10; volAuto = true; }
  }

  /* ---------- Карта й кілометраж: OpenStreetMap (Nominatim + OSRM) ---------- */
  let route_ = {}, map_ = null, layer_ = null, rt_ = null, seq_ = 0;
  const geoCache = {};
  function loadLeaflet(){
    if (window.L) return Promise.resolve();
    return new Promise((ok, bad) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
      const js = document.createElement('script'); js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; js.onload = ok; js.onerror = bad; document.head.appendChild(js);
    });
  }
  async function geocode(city, country){
    const key = city + '|' + country; if (geoCache[key]) return geoCache[key];
    const cc = (typeof COUNTRY_CODES !== 'undefined' && COUNTRY_CODES[country]) || '';
    const u = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=uk&q=' + encodeURIComponent(cc ? city : city + ', ' + country) + (cc ? '&countrycodes=' + cc : '');
    const r = await fetch(u); const d = await r.json();
    if (!d.length) return null;
    return geoCache[key] = [+(+d[0].lat).toFixed(5), +(+d[0].lon).toFixed(5)];
  }
  function kmLine(){
    const el = $('cg-km'); if (!el || !route_.km) return;
    const pr = +$('cg-price').value, cur = $('cg-cur').value;
    el.innerHTML = '<i class="ti ti-route" style="color:var(--blue)"></i> <b>' + route_.km.toLocaleString('uk-UA') + ' км</b>' + (route_.approx ? ' (орієнтовно, по прямій ×1,2)' : ' автодорогами') +
      (route_.h ? ' · ≈ ' + route_.h + ' год за кермом' : '') + (pr ? ' · <b>' + (pr / route_.km).toFixed(2) + ' ' + cur + '/км</b>' : '');
  }
  async function planRoute(){
    const fc = $('cg-fc').value, tc = $('cg-tc').value, fcity = $('cg-fcity').value.trim(), tcity = $('cg-tcity').value.trim(), el = $('cg-km');
    if (!el) return;
    if (!fc || !tc || !fcity || !tcity){ route_ = {}; return; }
    const my = ++seq_;
    el.innerHTML = '<i class="ti ti-loader-2"></i> Рахуємо маршрут…';
    try{
      const [a, b] = await Promise.all([geocode(fcity, fc), geocode(tcity, tc)]);
      if (my !== seq_) return;
      if (!a || !b){ route_ = {}; el.innerHTML = '<i class="ti ti-map-pin-off"></i> Не знайшли місто ' + esc(!a ? fcity : tcity) + ' на карті — перевірте назву. Заявку можна надіслати й так.'; return; }
      let km, h, line;
      try{
        const r = await (await fetch('https://router.project-osrm.org/route/v1/driving/' + a[1] + ',' + a[0] + ';' + b[1] + ',' + b[0] + '?overview=simplified&geometries=geojson')).json();
        if (r.code !== 'Ok' || !r.routes.length) throw 0;
        km = Math.round(r.routes[0].distance / 1000); h = Math.round(r.routes[0].duration / 3600); line = r.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      }catch(e){
        const R = 6371, rad = x => x * Math.PI / 180, dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]);
        const s = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2;
        km = Math.round(2 * R * Math.asin(Math.sqrt(s)) * 1.2); line = [a, b];
      }
      if (my !== seq_) return;
      route_ = { km, h, a, b, approx: line.length === 2 };
      kmLine();
      drawMap(line, a, b, fcity, tcity).catch(() => {});  // карта — лише ілюстрація, кілометраж уже пораховано
    }catch(e){
      if (my === seq_) el.innerHTML = '<i class="ti ti-route"></i> Не вдалося порахувати маршрут зараз. Заявку можна надіслати й так.';
    }
  }
  async function drawMap(line, a, b, fcity, tcity){
      await loadLeaflet();
      const box = $('cg-map'); if (!box) return;
      box.style.display = 'block';
      if (!map_ || !document.body.contains(map_.getContainer())){
        map_ = L.map(box, { scrollWheelZoom: false, attributionControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map_);
      }
      if (layer_) layer_.remove();
      layer_ = L.layerGroup([L.polyline(line, { color: '#378add', weight: 4, dashArray: route_.approx ? '6 6' : null }),
        L.circleMarker(a, { radius: 7, color: '#1d9e75', fillOpacity: 1 }).bindTooltip(fcity), L.circleMarker(b, { radius: 7, color: '#e24b4a', fillOpacity: 1 }).bindTooltip(tcity)]).addTo(map_);
      setTimeout(() => { map_.invalidateSize(); map_.fitBounds(L.latLngBounds(line), { padding: [20, 20] }); }, 50);
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
    const dims = ['cg-l', 'cg-wd', 'cg-h'].map(v).filter(Boolean).length;
    if (dims && dims < 3) return fail('Вкажіть усі три габарити: довжину, ширину й висоту');
    if (['cg-l', 'cg-wd', 'cg-h'].some(i => v(i) && +v(i) > (i === 'cg-l' ? 100 : 20))) return fail('Перевірте габарити — вказуються в метрах');
    if (!$('cg-ok').checked) return fail('Потрібна згода на обробку даних');
    const tg = v('cg-tg');
    btn.disabled = true; btn.textContent = 'Надсилаємо…';
    try{
      await createCargoRequest({
        from_country: v('cg-fc'), from_city: v('cg-fcity'), to_country: v('cg-tc'), to_city: v('cg-tcity'),
        cargo: v('cg-cargo'), weight_t: v('cg-w'), volume_m3: v('cg-v'), transport: v('cg-tr'), load_date: isoDate(v('cg-date')),
        price: v('cg-price'), currency: v('cg-cur'), pay_terms: v('cg-pay'),
        length_m: v('cg-l'), width_m: v('cg-wd'), height_m: v('cg-h'), places: v('cg-pl'),
        distance_km: route_.km || '', from_lat: route_.a ? route_.a[0] : '', from_lon: route_.a ? route_.a[1] : '', to_lat: route_.b ? route_.b[0] : '', to_lon: route_.b ? route_.b[1] : '',
        customs: $('cg-customs').checked, notes: v('cg-notes'), name: v('cg-name'), company: v('cg-company'), phone: v('cg-phone'),
        telegram: tg.includes('@') && !tg.startsWith('@') ? '' : tg, email: tg.includes('@') && !tg.startsWith('@') ? tg : ''
      });
      const logged = await currentUser().catch(() => null);
      $(btn.parentElement.id).innerHTML = '<div style="text-align:center;padding:1.5rem 0"><i class="ti ti-circle-check" style="font-size:44px;color:var(--green)"></i>' +
        '<h3 class="h-sm" style="margin:.6rem 0">Вантаж опубліковано на біржі</h3><p class="text-sm text-muted">' +
        (logged ? 'Ставки перевізників зʼявляться в кабінеті: <a href="/moi-zayavky#cargo">Мої вантажі</a>. ' :
          'Перевізники зателефонують вам. Щоб бачити й порівнювати їхні ставки онлайн, <a href="/vhid?next=/moi-zayavky%23cargo">створіть кабінет вантажовласника</a> — наступні вантажі будуть там. ') +
        'Потрібне митне оформлення? <a href="/punkty-propusku">Брокери в пунктах пропуску</a>.</p></div>';
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
  const money = (v, c) => Number(v).toLocaleString('uk-UA') + ' ' + (c || 'UAH');
  const priceTag = x => x.price ? '<span class="fx-badge ok">' + money(x.price, x.currency) + '</span>' : '<span class="fx-badge">запит ставок</span>';

  let cargoAll = [], respSet = {};
  async function mountCargoBoard(id, o = {}){
    const el = $(id); if (!el) return;
    if (!o.compact) el.insertAdjacentHTML('beforebegin', filterBar('cb'));
    try{ cargoAll = await cargoBoard(); }catch(e){ cargoAll = []; }
    const m = await whoAmI();
    if (m && m.kind === 'carrier'){ try{ (await myCargoResponses()).forEach(r => respSet[r.cargo_id] = r); }catch(e){} }
    const draw = () => {
      const f = fval('cb', 'From'), t = fval('cb', 'To'), tr = fval('cb', 'Tr');
      const list = cargoAll.filter(x => (!f || x.from_country === f) && (!t || x.to_country === t) && (!tr || !x.transport || x.transport === tr)).slice(0, o.limit || 500);
      const btn = x => m && m.kind === 'carrier'
        ? '<button class="btn btn-primary btn-sm" onclick="CargoPublic.respond(\'' + x.id + '\',this)">' + (respSet[x.id] ? 'Моя ставка й контакти' : 'Запропонувати ставку') + '</button>'
        : '<a class="btn btn-ghost btn-sm" href="/vhid?role=carrier&next=/vantazhi">Контакти — для перевізників</a>';
      el.innerHTML = list.length ? list.map(x =>
        '<div class="fx-row" id="cg-' + x.id + '"><div class="fx-main"><div class="cargo-route">' + route(x) + '</div>' +
          '<div class="fx-what">' + esc(x.cargo) + '</div>' +
          '<div class="fx-meta">' + [x.distance_km ? '<a href="' + cargoMapsUrl(x) + '" target="_blank" rel="noopener"><i class="ti ti-route"></i> ' + x.distance_km.toLocaleString('uk-UA') + ' км</a>' : '',
            x.weight_t ? x.weight_t + ' т' : '', x.volume_m3 ? x.volume_m3 + ' м³' : '', esc(cargoDims(x)), x.transport || 'будь-який транспорт',
            x.load_date ? '<i class="ti ti-calendar"></i> ' + fmtD(x.load_date) : '', x.pay_terms ? esc(x.pay_terms) : '', priceTag(x), x.customs ? '<span class="fx-badge">митне оформлення</span>' : ''].filter(Boolean).join(' · ') + '</div>' +
          (x.notes && !o.compact ? '<div class="fx-notes">' + esc(x.notes) + '</div>' : '') + '</div>' +
          '<div class="fx-side"><div class="text-xs text-muted">' + ago(x.created_at) + (x.responses_count ? ' · відгуків: ' + x.responses_count : '') + '</div>' + btn(x) + '</div></div>').join('')
        : '<div class="card"><div class="text-sm text-muted">Вантажів за цим фільтром поки немає. <a href="/perevezennya#cargoForm">Додайте свій вантаж</a> — його побачать усі перевізники.</div></div>';
    };
    ['From', 'To', 'Tr'].forEach(k => { const s = $('cb' + k); if (s) s.onchange = draw; });
    draw();
  }
  /* Форма ставки перевізника — спільна для біржі та кабінету */
  let myVeh = null;
  async function offerForm(cid, box, prev, onDone){
    if (myVeh === null){ try{ myVeh = (await myVehicles()).filter(v => v.status !== 'rejected'); }catch(e){ myVeh = []; } }
    prev = prev && typeof prev === 'object' ? prev : {};
    const locked = prev.status && prev.status !== 'new';
    box.innerHTML = '<div class="fx-offer">' +
      (locked ? '<div class="text-sm" style="margin-bottom:6px">' + (prev.status === 'accepted' ? '<b style="color:var(--green)">Вантажовласник обрав вас</b>' : 'Вантажовласник обрав іншого перевізника') + '</div>' :
      '<div style="display:flex;gap:6px"><input class="input" type="number" min="0" step="1" id="of-p-' + cid + '" placeholder="Ставка" value="' + (prev.price || '') + '">' +
        '<select class="input" id="of-c-' + cid + '" style="width:86px">' + CURRENCIES.map(c => '<option' + (c === (prev.currency || 'UAH') ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
      (myVeh.length ? '<select class="input" id="of-v-' + cid + '"><option value="">Авто — не вказувати</option>' + myVeh.map(v => '<option value="' + v.id + '">' + esc(v.plate + ' · ' + (v.kind || '')) + (v.status === 'verified' ? ' ✓' : '') + '</option>').join('') + '</select>' : '') +
      '<input class="input" id="of-m-' + cid + '" maxlength="500" placeholder="Коментар: дата подачі, умови" value="' + esc(prev.comment || '') + '">' +
      '<button class="btn btn-primary btn-sm" id="of-b-' + cid + '">' + (prev.created_at ? 'Оновити ставку' : 'Надіслати ставку') + '</button>') +
      '<div class="fx-contact-box"></div></div>';
    const showContacts = c => { if (!c) return; box.querySelector('.fx-contact-box').innerHTML = '<div class="fx-contact"><b>' + esc(c.name) + '</b>' + (c.company ? '<div class="text-xs">' + esc(c.company) + '</div>' : '') +
        '<a href="' + telHref(c.phone) + '">' + esc(c.phone) + '</a>' + (c.telegram ? '<a href="' + tgHref(c.telegram) + '" target="_blank" rel="noopener">' + esc(c.telegram) + '</a>' : '') +
        (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') + '</div>'; };
    if (prev.created_at){ try{ showContacts(await respondCargo(cid)); }catch(e){} }
    const b = $('of-b-' + cid); if (!b) return;
    b.onclick = async () => {
      b.disabled = true;
      const o = { price: $('of-p-' + cid).value, currency: $('of-c-' + cid).value, comment: $('of-m-' + cid).value.trim(), vehicle_id: ($('of-v-' + cid) || {}).value || '' };
      try{
        const c = await respondCargo(cid, o); showContacts(c);
        b.textContent = 'Оновити ставку'; b.disabled = false; showToast('Ставку надіслано вантажовласнику');
        if (typeof track === 'function') track('cargo_response');
        if (onDone) onDone({ ...o, status: 'new', created_at: prev.created_at || new Date().toISOString() });
      }catch(e){ showToast(e.message, 'error'); b.disabled = false; }
    };
  }
  async function respond(id, btn){
    const box = $('cg-' + id).querySelector('.fx-side');
    await offerForm(id, box, respSet[id], r => { respSet[id] = r; });
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

  return { planRoute, offerForm, priceTag, mountForm, mountCarriers, mountPosts, send, mask, mountCargoBoard, mountOffers, respond, mountVehicles };
})();
