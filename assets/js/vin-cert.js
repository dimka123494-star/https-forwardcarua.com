/* vin-cert.js — довідка про ТЗ за VIN з екологічним класом і QR для перевірки.
   Потребує config.js, db.js, vin.js, bizcard.js (QR) і qrcode-generator. */
const VinCert = (() => {
  const PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  const FUEL = { petrol: 'Бензин', diesel: 'Дизель', hybrid: 'Гібрид (бензин + електро)', phev: 'Плагін-гібрид', gas: 'Газ / бензин', electric: 'Електро' };
  const CAT = { M1: 'M1 — легковий', N1: 'N1 — вантажний до 3,5 т', N2: 'N2/N3 — вантажний понад 3,5 т', M2: 'M2/M3 — автобус', L: 'L — мототехніка', other: 'Інше' };
  const BASIS = { estimate: 'Орієнтовно — за датою реєстрації / роком випуску', v9: 'Підтверджено: поле V.9 свідоцтва про реєстрацію', coc: 'Підтверджено: сертифікат відповідності (COC)', other: 'Підтверджено іншим документом' };
  const FREE_LIMIT = 5;
  let st = { broker: null, data: null, manualEuro: false, certs: [], last: null, url: '', objUrl: '', fname: '' };
  const $ = id => document.getElementById(id);
  const opt = (o, sel) => Object.entries(o).map(([k, v]) => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + v + '</option>').join('');

  function paid(){ return typeof BizCard !== 'undefined' && BizCard.paid(st.broker); }
  function usedThisMonth(){
    const m = new Date(); m.setDate(1); m.setHours(0, 0, 0, 0);
    return st.certs.filter(c => new Date(c.created_at) >= m).length;
  }

  function mount(el, { broker }){
    st.broker = broker;
    el.innerHTML =
      '<div class="card" style="margin-bottom:16px">' +
        '<div class="card-title">VIN-код</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<input class="input" id="vc-vin" maxlength="20" placeholder="Напр.: WBA8E9C50GK644366" style="flex:1;min-width:220px;font-family:monospace;letter-spacing:.06em;text-transform:uppercase" onkeydown="if(event.key===\'Enter\')VinCert.decode()">' +
          '<button class="btn btn-primary" id="vc-go" onclick="VinCert.decode()"><i class="ti ti-search"></i> Розшифрувати</button>' +
        '</div>' +
        '<div class="hint" id="vc-quota"></div>' +
        '<div class="msg" id="vc-msg"></div>' +
      '</div>' +
      '<div class="card" id="vc-form" style="display:none;margin-bottom:16px">' +
        '<div class="card-title">Дані авто <span class="text-xs text-muted" id="vc-src" style="text-transform:none;letter-spacing:0"></span></div>' +
        '<div id="vc-gap" style="margin:-4px 0 12px"></div>' +
        '<div class="field-row"><div class="field"><label class="label" for="vc-make">Марка</label><input class="input" id="vc-make"></div>' +
          '<div class="field"><label class="label" for="vc-model">Модель</label><input class="input" id="vc-model" oninput="this.style.borderColor=\'\'"></div></div>' +
        '<div class="field-row"><div class="field"><label class="label" for="vc-year">Рік випуску (модельний)</label><input class="input" type="number" id="vc-year" min="1950" max="2100" oninput="this.style.borderColor=\'\';VinCert.estimate()"></div>' +
          '<div class="field"><label class="label" for="vc-reg">Дата першої реєстрації</label><input class="input" type="text" id="vc-reg" inputmode="numeric" maxlength="10" placeholder="ДД.ММ.РРРР" autocomplete="off" oninput="VinCert.regInput(this)"><div class="hint" id="vc-reg-hint">З техпаспорта (поле B), напр. 15.03.2016. Необовʼязково — робить оцінку класу точнішою.</div></div></div>' +
        '<div class="field-row"><div class="field"><label class="label" for="vc-fuel">Тип пального</label><select class="input" id="vc-fuel" onchange="this.style.borderColor=\'\';VinCert.estimate()"><option value="">—</option>' + opt(FUEL) + '</select></div>' +
          '<div class="field"><label class="label" for="vc-cc">Обʼєм двигуна, см³</label><input class="input" type="number" id="vc-cc" min="0" oninput="this.style.borderColor=\'\'"></div></div>' +
        '<div class="field-row"><div class="field"><label class="label" for="vc-cat">Категорія</label><select class="input" id="vc-cat" onchange="VinCert.estimate()">' + opt(CAT, 'M1') + '</select></div>' +
          '<div class="field"><label class="label" for="vc-cm">Країна виробництва (за VIN)</label><input class="input" id="vc-cm"></div></div>' +
        '<div class="field"><label class="label" for="vc-co">Країна походження</label><input class="input" id="vc-co">' +
          '<div class="hint">Зазвичай збігається з країною виробництва. Для пільгового мита з ЄС потрібен EUR.1 або декларація інвойс.</div></div>' +
        '<div class="card-title" style="margin-top:1.25rem">Екологічний клас</div>' +
        '<div class="field-row"><div class="field"><label class="label" for="vc-euro">Клас</label>' +
            '<input class="input" id="vc-euro" list="vc-euros" oninput="VinCert.manual()"><datalist id="vc-euros">' +
            ['Euro 3','Euro 4','Euro 5','Euro 6','Euro 6c','Euro 6d-TEMP','Euro 6d','Не застосовується'].map(x => '<option value="' + x + '">').join('') + '</datalist></div>' +
          '<div class="field"><label class="label" for="vc-basis">Підстава</label><select class="input" id="vc-basis" onchange="VinCert.basis()">' + opt(BASIS, 'estimate') + '</select></div></div>' +
        '<div class="hint" id="vc-enote" style="margin:-4px 0 1rem"></div>' +
        '<details id="vc-auc" style="margin:0 0 1rem;border:.5px solid var(--border);border-radius:var(--r);padding:12px 14px">' +
          '<summary style="cursor:pointer;font-weight:600"><i class="ti ti-gavel"></i> Історія аукціону <span class="text-xs text-muted" id="vc-auc-hint"></span></summary>' +
          '<div style="margin-top:12px"><div class="text-sm text-muted" style="margin-bottom:8px">Відкрийте пошук цього VIN на аукціонах — фото, пошкодження, ціна продажу:</div>' +
          '<div class="row" id="vc-auc-links" style="gap:8px;flex-wrap:wrap;margin-bottom:12px"></div>' +
          '<div class="text-sm text-muted" style="margin-bottom:8px">Знайшли лот? Внесіть дані — вони потраплять у довідку:</div>' +
          '<div class="field-row"><div class="field"><label class="label" for="vc-a-src">Аукціон</label><select class="input" id="vc-a-src"><option value="">—</option>' +
            ['Copart','IAAI','Manheim','ADESA','Інший'].map(x => '<option>' + x + '</option>').join('') + '</select></div>' +
            '<div class="field"><label class="label" for="vc-a-lot">Номер лоту</label><input class="input" id="vc-a-lot" maxlength="30"></div></div>' +
          '<div class="field-row"><div class="field"><label class="label" for="vc-a-date">Дата продажу</label><input class="input" id="vc-a-date" inputmode="numeric" maxlength="10" placeholder="ДД.ММ.РРРР" oninput="VinCert.dateMask(this)"></div>' +
            '<div class="field"><label class="label" for="vc-a-price">Ціна продажу, $</label><input class="input" type="number" id="vc-a-price" min="0"></div></div>' +
          '<div class="field-row"><div class="field"><label class="label" for="vc-a-dmg">Пошкодження</label><input class="input" id="vc-a-dmg" maxlength="80" placeholder="Напр.: Front end, Hail, Flood"></div>' +
            '<div class="field"><label class="label" for="vc-a-title">Документи (title)</label><select class="input" id="vc-a-title"><option value="">—</option>' +
            ['Clean','Salvage','Rebuilt','Certificate of Destruction','Parts only','Інше'].map(x => '<option>' + x + '</option>').join('') + '</select></div></div>' +
          '<div class="field"><label class="label" for="vc-a-odo">Пробіг на аукціоні</label><input class="input" id="vc-a-odo" maxlength="20" placeholder="Напр.: 45 210 mi"></div>' +
        '</div></details>' +
        '<div class="field-row"><div class="field"><label class="label" for="vc-client">Клієнт (для PDF)</label><input class="input" id="vc-client" placeholder="Необовʼязково"></div>' +
          '<div class="field"><label class="label" for="vc-note">Примітка</label><input class="input" id="vc-note" maxlength="300" placeholder="Напр.: пробіг, комплектація"></div></div>' +
        '<button class="btn btn-primary" id="vc-make-btn" onclick="VinCert.create()"><i class="ti ti-file-certificate"></i> Сформувати довідку PDF</button>' +
        '<div id="vc-send" style="margin-top:1rem"></div>' +
        '<div id="vc-pdf-host" style="position:fixed;left:-10000px;top:0"></div>' +
      '</div>' +
      '<h2 class="h-sm" style="margin-bottom:10px">Останні довідки</h2><div id="vc-list" class="text-sm text-muted">Завантаження…</div>';
    refresh();
  }

  async function refresh(){
    st.certs = await myVehicleCerts(50);
    const used = usedThisMonth();
    $('vc-quota').innerHTML = paid() ? 'Безлімітні довідки на вашому тарифі.'
      : 'Безкоштовний тариф: використано <b>' + used + ' з ' + FREE_LIMIT + '</b> довідок цього місяця. На платних — без ліміту.';
    $('vc-list').innerHTML = st.certs.length ? '<div class="table-wrap table-scroll"><table><thead><tr><th>Дата</th><th>VIN</th><th>Авто</th><th>Клас</th><th></th></tr></thead><tbody>' +
      st.certs.slice(0, 20).map(c => '<tr><td>' + fmtDate(c.created_at) + '</td><td style="font-family:monospace">' + esc(c.vin) + '</td><td>' +
        esc([c.make, c.model, c.year].filter(Boolean).join(' ')) + (c.client ? '<div class="text-xs text-muted">' + esc(c.client) + '</div>' : '') + '</td><td>' + esc(c.euro || '—') +
        '</td><td><a href="/d/' + esc(c.id) + '" target="_blank" rel="noopener">Перевірка</a></td></tr>').join('') + '</tbody></table></div>'
      : 'Ще немає довідок.';
  }

  function msg(t, ok){ const m = $('vc-msg'); m.className = 'msg show ' + (ok ? 'msg-ok' : 'msg-err'); m.textContent = t; if (!t) m.className = 'msg'; }

  async function decode(){
    msg('');
    const btn = $('vc-go'); btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i> Шукаємо…';
    try{
      const d = await VinTools.decode($('vc-vin').value);
      st.data = d; st.manualEuro = false;
      aucLinks(d);
      $('vc-vin').value = d.vin;
      $('vc-make').value = d.make || ''; $('vc-model').value = d.model || ''; $('vc-year').value = d.year || '';
      $('vc-fuel').value = d.fuel || ''; $('vc-cc').value = d.cc || ''; $('vc-cm').value = d.country || ''; $('vc-co').value = d.country || '';
      $('vc-reg').value = ''; $('vc-basis').value = 'estimate';
      $('vc-src').textContent = d.source === 'NHTSA' ? '· дані з бази NHTSA (США) та структури VIN' : '· за структурою VIN';
      // Підсвічуємо поля, які треба внести з техпаспорта
      const F = { model: 'vc-model', year: 'vc-year', cc: 'vc-cc', fuel: 'vc-fuel' };
      Object.values(F).forEach(id => $(id).style.borderColor = '');
      (d.missing || []).forEach(k => $(F[k]).style.borderColor = 'var(--amber)');
      if (d.modelGuess) $('vc-model').title = 'Визначено за кодом моделі у VIN — перевірте';
      const names = { model: 'модель', year: 'рік випуску', cc: 'обʼєм двигуна', fuel: 'тип пального' };
      const miss = (d.missing || []).map(k => names[k]);
      $('vc-gap').innerHTML = miss.length
        ? '<div class="msg show" style="background:rgba(245,166,35,.12);color:var(--amber);border:.5px solid rgba(245,166,35,.35)">' +
          (d.market === 'na' ? 'База NHTSA не має повних даних про це авто. ' :
            'Це VIN європейського ринку: безкоштовні бази розшифровують у ньому лише марку, країну' + (d.year ? ', рік' : '') + (d.model ? ' і модель' : '') + '. ') +
          'Внесіть з техпаспорта: <b>' + miss.join(', ') + '</b> (поля підсвічено).' + (d.modelGuess ? ' Модель визначено за кодом у VIN — перевірте.' : '') + '</div>'
        : '';
      if (miss.length) setTimeout(() => $(F[d.missing[0]]).focus(), 50);
      $('vc-form').style.display = ''; $('vc-send').innerHTML = '';
      if (d.checkOk === false) msg('Увага: контрольна цифра VIN не збігається. Перевірте, чи правильно введено номер.');
      estimate();
    }catch(e){ msg(e.message); }
    btn.disabled = false; btn.innerHTML = '<i class="ti ti-search"></i> Розшифрувати';
  }

  function estimate(){
    if (!st.data) return;
    const r = VinTools.euroEstimate({ fuel: $('vc-fuel').value, firstReg: regIso(), year: +$('vc-year').value || null,
                                      market: st.data.market, category: $('vc-cat').value });
    if (!st.manualEuro && $('vc-basis').value === 'estimate') $('vc-euro').value = r.value;
    st.note = r.note;
    $('vc-enote').textContent = $('vc-basis').value === 'estimate' ? r.note : 'Клас підтверджено документом — у довідці буде зазначено підставу.';
  }
  // Дата першої реєстрації: вводимо ДД.ММ.РРРР (рідний date-picker у темній темі незручний і не всюди дає ввести з клавіатури)
  function regIso(){
    const v = ($('vc-reg').value || '').trim();
    let m = v.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/), d, mo, y;
    if (m){ d = +m[1]; mo = +m[2]; y = +m[3]; }
    else if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))){ y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = v.match(/^(\d{1,2})[.\/](\d{4})$/))){ d = 1; mo = +m[1]; y = +m[2]; }
    else return '';
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (y < 1950 || y > new Date().getFullYear() || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function regInput(el){
    let raw = el.value.replace(/[^\d]/g, '').slice(0, 8);
    if (/^\d{1,2}[.\/]\d{4}$/.test(el.value)) raw = null;   // формат ММ.РРРР залишаємо як є
    if (raw !== null) el.value = raw.length > 4 ? raw.slice(0, 2) + '.' + raw.slice(2, 4) + '.' + raw.slice(4)
                                 : raw.length > 2 ? raw.slice(0, 2) + '.' + raw.slice(2) : raw;
    const ok = !el.value || regIso();
    el.style.borderColor = ok ? '' : 'var(--red)';
    $('vc-reg-hint').textContent = el.value && !ok && el.value.length >= 10 ? 'Перевірте дату — формат ДД.ММ.РРРР' : 'З техпаспорта (поле B), напр. 15.03.2016. Необовʼязково — робить оцінку класу точнішою.';
    estimate();
  }
  function aucLinks(d){
    const v = encodeURIComponent(d.vin);
    const L = [['Copart', 'https://www.copart.com/lotSearchResults?free=true&query=' + v],
               ['IAAI', 'https://www.iaai.com/Search?Keyword=' + v],
               ['Архів stat.vin', 'https://stat.vin/cars/' + v],
               ['Пошук у Google', 'https://www.google.com/search?q=%22' + v + '%22+copart+OR+iaai']];
    $('vc-auc-links').innerHTML = L.map(x => '<a class="btn btn-ghost btn-sm" href="' + x[1] + '" target="_blank" rel="noopener nofollow"><i class="ti ti-external-link"></i>' + x[0] + '</a>').join('');
    ['vc-a-src','vc-a-lot','vc-a-date','vc-a-price','vc-a-dmg','vc-a-title','vc-a-odo'].forEach(id => $(id).value = '');
    const na = d.market === 'na';
    $('vc-auc').open = na;
    $('vc-auc-hint').textContent = na ? '· авто з ринку США/Канади — ймовірно, з аукціону' : '· якщо авто куплене на аукціоні';
  }
  function dateMask(el){
    const raw = el.value.replace(/\D/g, '').slice(0, 8);
    el.value = raw.length > 4 ? raw.slice(0, 2) + '.' + raw.slice(2, 4) + '.' + raw.slice(4) : raw.length > 2 ? raw.slice(0, 2) + '.' + raw.slice(2) : raw;
  }
  function auction(){
    const a = { source: $('vc-a-src').value, lot: $('vc-a-lot').value.trim(), date: $('vc-a-date').value.trim(),
                price: +$('vc-a-price').value || null, damage: $('vc-a-dmg').value.trim(), title: $('vc-a-title').value, odometer: $('vc-a-odo').value.trim() };
    return Object.values(a).some(Boolean) ? a : null;
  }
  function manual(){ st.manualEuro = true; }
  function basis(){ estimate(); }

  function loadPdfLib(){
    if (window.html2pdf) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = PDF_LIB; s.onload = res; s.onerror = () => rej(new Error('PDF-бібліотека не завантажилась')); document.head.appendChild(s); });
  }

  // QR растровим зображенням — html2canvas некоректно малює складні SVG
  function qrImg(text){
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    return q.createDataURL(6, 2);
  }

  function pdfHtml(c){
    const b = st.broker || {};
    const verify = 'https://forwardcarua.com/d/' + c.id;
    const row = (k, v) => v ? '<tr><td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;width:230px">' + esc(k) + '</td><td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:600">' + esc(v) + '</td></tr>' : '';
    const contacts = [b.phone, b.telegram ? 'Telegram: @' + String(b.telegram).replace(/^@/, '') : '', b.email].filter(Boolean).map(esc).join(' · ');
    const confirmed = c.euro_basis !== 'estimate';
    return '<div style="width:720px;padding:34px 38px;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #10B981;padding-bottom:14px;margin-bottom:18px">' +
        '<div><div style="font-size:20px;font-weight:700">' + esc(b.name || 'Митний брокер') + '</div>' +
          '<div style="color:#4b5563;margin-top:3px">' + esc([b.city, b.region].filter(Boolean).join(', ')) + '</div>' +
          '<div style="color:#4b5563;margin-top:3px">' + contacts + '</div></div>' +
        '<div style="text-align:right;color:#6b7280;font-size:12px">Дата: ' + new Date().toLocaleDateString('uk-UA') +
          (c.client ? '<br>Клієнт: <b style="color:#111827">' + esc(c.client) + '</b>' : '') + '<br>№ ' + esc(c.id.slice(0, 8).toUpperCase()) + '</div>' +
      '</div>' +
      '<div style="font-size:18px;font-weight:700;margin-bottom:2px">Інформаційна довідка про транспортний засіб</div>' +
      '<div style="color:#4b5563;margin-bottom:14px">Розшифровка VIN-коду та екологічний клас</div>' +
      '<div style="display:flex;gap:22px;align-items:flex-start">' +
        '<table style="flex:1;border-collapse:collapse;border:1px solid #e5e7eb">' +
          row('VIN', c.vin) + row('Марка', c.make) + row('Модель', c.model) + row('Рік випуску (модельний)', c.year) +
          row('Тип пального', FUEL[c.fuel] || '') + row('Обʼєм двигуна', c.engine_cc ? c.engine_cc + ' см³' : '') + row('Категорія', CAT[c.category] || '') +
          row('Країна виробництва', c.country_mfg) + row('Країна походження', c.country_origin) +
          row('Дата першої реєстрації', c.first_reg ? c.first_reg.split('-').reverse().join('.') : '') +
        '</table>' +
        '<div style="width:150px;text-align:center;font-size:10.5px;color:#6b7280">' +
          '<img src="' + qrImg(verify) + '" style="width:150px;height:150px;image-rendering:pixelated;display:block" alt="QR">' +
          '<div style="margin-top:6px">Скануйте, щоб перевірити довідку</div></div>' +
      '</div>' +
      '<div style="margin-top:16px;border:2px solid ' + (confirmed ? '#10B981' : '#F5A623') + ';border-radius:10px;padding:14px 16px;display:flex;justify-content:space-between;gap:16px;align-items:center">' +
        '<div><div style="font-size:12px;color:#6b7280">Екологічний клас</div><div style="font-size:24px;font-weight:700">' + esc(c.euro || '—') + '</div></div>' +
        '<div style="flex:1;font-size:12px;color:#374151"><b>' + esc(BASIS[c.euro_basis] || '') + '</b>' + (c.euro_note && !confirmed ? '<br>' + esc(c.euro_note) : '') + '</div>' +
      '</div>' +
      (c.auction ? '<div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px">' +
        '<div style="font-weight:700;margin-bottom:6px">Історія аукціону</div><div style="display:flex;flex-wrap:wrap;gap:6px 22px;font-size:12px;color:#374151">' +
        [['Аукціон', c.auction.source], ['Лот', c.auction.lot], ['Дата продажу', c.auction.date], ['Ціна продажу', c.auction.price ? '$' + Number(c.auction.price).toLocaleString('uk-UA') : ''],
         ['Пошкодження', c.auction.damage], ['Документи', c.auction.title], ['Пробіг', c.auction.odometer]]
          .filter(x => x[1]).map(x => '<span><span style="color:#6b7280">' + x[0] + ':</span> <b>' + esc(x[1]) + '</b></span>').join('') +
        '</div><div style="font-size:10.5px;color:#6b7280;margin-top:6px">Внесено брокером за даними аукціону.</div></div>' : '') +
      (c.note ? '<p style="margin-top:12px;font-size:12px;color:#374151"><b>Примітка:</b> ' + esc(c.note) + '</p>' : '') +
      '<p style="font-size:10.5px;color:#6b7280;margin-top:14px">Довідка має інформаційний характер і не є офіційним документом. Дані отримано за структурою VIN-коду (WMI, ISO 3779) та з відкритої бази NHTSA. ' +
        'Орієнтовний екологічний клас визначено за строками введення норм Euro в ЄС; остаточно клас підтверджують сертифікат відповідності (COC) або поле V.9 свідоцтва про реєстрацію. ' +
        'Перевірити довідку: ' + esc(verify) + '</p>' +
      '<div style="margin-top:14px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;display:flex;justify-content:space-between">' +
        '<span>Підготовлено в каталозі МитнийБрокер</span><span>forwardcarua.com' + (b.id ? '/broker/' + esc(b.id) : '') + '</span></div>' +
    '</div>';
  }

  async function buildBlob(c){
    await loadPdfLib();
    const host = $('vc-pdf-host'); host.innerHTML = pdfHtml(c);
    try{
      return await html2pdf().set({ margin: 8, image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, backgroundColor: '#ffffff', scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(host.firstChild).outputPdf('blob');
    } finally { host.innerHTML = ''; }
  }
  async function upload(blob, id){
    const sb = await sbReady();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Увійдіть у кабінет');
    const path = session.user.id + '/vin-' + id + '.pdf';
    const { error } = await sb.storage.from('rozrakhunky').upload(path, blob, { contentType: 'application/pdf', upsert: false });
    if (error) throw error;
    return sb.storage.from('rozrakhunky').getPublicUrl(path).data.publicUrl;
  }

  async function create(){
    msg('');
    const c = {
      broker_id: st.broker.id, vin: VinTools.normalize($('vc-vin').value),
      make: $('vc-make').value.trim() || null, model: $('vc-model').value.trim() || null, year: +$('vc-year').value || null,
      fuel: $('vc-fuel').value || null, engine_cc: +$('vc-cc').value || null, category: $('vc-cat').value,
      country_mfg: $('vc-cm').value.trim() || null, country_origin: $('vc-co').value.trim() || null, first_reg: regIso() || null,
      euro: $('vc-euro').value.trim() || null, euro_basis: $('vc-basis').value,
      euro_note: $('vc-basis').value === 'estimate' ? (st.note || null) : null,
      client: $('vc-client').value.trim() || null, note: $('vc-note').value.trim() || null, auction: auction()
    };
    if (!VinTools.valid(c.vin)) return msg('Перевірте VIN — 17 символів.');
    if (!c.make) return msg('Вкажіть марку авто.');
    if (!paid() && usedThisMonth() >= FREE_LIMIT) return msg('Ліміт безкоштовного тарифу — ' + FREE_LIMIT + ' довідок на місяць. Оберіть платний тариф, щоб формувати довідки без обмежень.');
    const btn = $('vc-make-btn'); btn.disabled = true;
    $('vc-send').innerHTML = '<div class="text-sm text-muted"><i class="ti ti-loader-2"></i> Формуємо довідку…</div>';
    try{
      c.id = await createVehicleCert(c);
      const blob = await buildBlob(c);
      st.last = c;
      if (st.objUrl) URL.revokeObjectURL(st.objUrl);
      st.objUrl = URL.createObjectURL(blob);
      st.fname = 'dovidka-vin-' + c.vin + '.pdf';
      st.url = ''; renderSend(true);
      try { st.url = await upload(blob, c.id); } catch(e){ console.error('upload vin pdf:', e); }
      renderSend(false);
      try { track('vin_certificate', { euro: c.euro || '' }); } catch(e){}
      refresh();
    }catch(e){ $('vc-send').innerHTML = ''; msg(e.message || 'Не вдалося сформувати довідку'); }
    btn.disabled = false;
  }

  function renderSend(uploading){
    const c = st.last, enc = encodeURIComponent, verify = 'https://forwardcarua.com/d/' + c.id;
    const text = 'Довідка про авто ' + [c.make, c.model, c.year].filter(Boolean).join(' ') + ' (VIN ' + c.vin + ')\n' +
      'Екологічний клас: ' + (c.euro || '—') + (c.euro_basis === 'estimate' ? ' (орієнтовно)' : '') + '\n' +
      (c.country_mfg ? 'Країна виробництва: ' + c.country_mfg + '\n' : '') +
      (c.auction && (c.auction.source || c.auction.price) ? 'Аукціон: ' + [c.auction.source, c.auction.date, c.auction.price ? '$' + c.auction.price : '', c.auction.damage].filter(Boolean).join(', ') + '\n' : '') +
      (st.broker.name || '') + (st.broker.phone ? ', ' + st.broker.phone : '') + '\n' +
      (st.url ? 'PDF: ' + st.url + '\n' : '') + 'Перевірка: ' + verify;
    st.msg = text;
    $('vc-send').innerHTML = '<div class="msg msg-ok show" style="margin-bottom:10px">Довідку сформовано. QR-код у PDF веде на сторінку перевірки.</div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap">' +
        '<a class="btn btn-primary" href="' + esc(st.objUrl) + '" download="' + esc(st.fname) + '"><i class="ti ti-file-download"></i>Завантажити PDF</a>' +
        '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + enc(st.url || verify) + '&text=' + enc(text) + '"><i class="ti ti-brand-telegram"></i>Telegram</a>' +
        '<a class="btn btn-ghost" href="viber://forward?text=' + enc(text) + '"><i class="ti ti-brand-viber"></i>Viber</a>' +
        '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' + enc(text) + '"><i class="ti ti-brand-whatsapp"></i>WhatsApp</a>' +
        '<a class="btn btn-ghost" href="mailto:?subject=' + enc('Довідка про авто ' + c.vin) + '&body=' + enc(text) + '"><i class="ti ti-mail"></i>Email</a>' +
        '<a class="btn btn-ghost" href="/d/' + esc(c.id) + '" target="_blank" rel="noopener"><i class="ti ti-qrcode"></i>Сторінка перевірки</a>' +
      '</div>' + (uploading ? '<div class="hint"><i class="ti ti-loader-2"></i> Створюємо посилання на PDF для месенджерів…</div>' : '');
  }

  return { mount, decode, estimate, manual, basis, create, regInput, dateMask };
})();
