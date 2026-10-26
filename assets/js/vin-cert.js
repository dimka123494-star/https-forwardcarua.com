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
        '<div class="field-row"><div class="field"><label class="label" for="vc-make">Марка</label><input class="input" id="vc-make"></div>' +
          '<div class="field"><label class="label" for="vc-model">Модель</label><input class="input" id="vc-model"></div></div>' +
        '<div class="field-row"><div class="field"><label class="label" for="vc-year">Рік випуску (модельний)</label><input class="input" type="number" id="vc-year" min="1950" max="2100" oninput="VinCert.estimate()"></div>' +
          '<div class="field"><label class="label" for="vc-reg">Дата першої реєстрації</label><input class="input" type="date" id="vc-reg" oninput="VinCert.estimate()"><div class="hint">З техпаспорта (поле B). Робить оцінку класу точнішою.</div></div></div>' +
        '<div class="field-row"><div class="field"><label class="label" for="vc-fuel">Тип пального</label><select class="input" id="vc-fuel" onchange="VinCert.estimate()"><option value="">—</option>' + opt(FUEL) + '</select></div>' +
          '<div class="field"><label class="label" for="vc-cc">Обʼєм двигуна, см³</label><input class="input" type="number" id="vc-cc" min="0"></div></div>' +
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
      $('vc-vin').value = d.vin;
      $('vc-make').value = d.make || ''; $('vc-model').value = d.model || ''; $('vc-year').value = d.year || '';
      $('vc-fuel').value = d.fuel || ''; $('vc-cc').value = d.cc || ''; $('vc-cm').value = d.country || ''; $('vc-co').value = d.country || '';
      $('vc-reg').value = ''; $('vc-basis').value = 'estimate';
      $('vc-src').textContent = d.source === 'NHTSA' ? '· дані з бази NHTSA та WMI' : '· за структурою VIN (WMI) — модель і двигун уточніть вручну';
      $('vc-form').style.display = ''; $('vc-send').innerHTML = '';
      if (d.checkOk === false) msg('Увага: контрольна цифра VIN не збігається. Перевірте, чи правильно введено номер.');
      estimate();
    }catch(e){ msg(e.message); }
    btn.disabled = false; btn.innerHTML = '<i class="ti ti-search"></i> Розшифрувати';
  }

  function estimate(){
    if (!st.data) return;
    const r = VinTools.euroEstimate({ fuel: $('vc-fuel').value, firstReg: $('vc-reg').value, year: +$('vc-year').value || null,
                                      market: st.data.market, category: $('vc-cat').value });
    if (!st.manualEuro && $('vc-basis').value === 'estimate') $('vc-euro').value = r.value;
    st.note = r.note;
    $('vc-enote').textContent = $('vc-basis').value === 'estimate' ? r.note : 'Клас підтверджено документом — у довідці буде зазначено підставу.';
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
      country_mfg: $('vc-cm').value.trim() || null, country_origin: $('vc-co').value.trim() || null, first_reg: $('vc-reg').value || null,
      euro: $('vc-euro').value.trim() || null, euro_basis: $('vc-basis').value,
      euro_note: $('vc-basis').value === 'estimate' ? (st.note || null) : null,
      client: $('vc-client').value.trim() || null, note: $('vc-note').value.trim() || null
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

  return { mount, decode, estimate, manual, basis, create };
})();
