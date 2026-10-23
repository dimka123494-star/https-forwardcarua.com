/* =========================================================
   Митний калькулятор у кабінеті брокера + PDF для клієнта.
   Безкоштовний тариф — легкові авто. Платні — ще й будь-який
   товар за групою УКТ ЗЕД зі ставками, які вводить брокер.
   Формули для авто — ті самі, що на brokservisavto.com/rozmytnennya.
   ========================================================= */
(function(){
  const CAR = {
    petrol: { small: 50, large: 100, threshold: 3000 },
    diesel: { small: 75, large: 150, threshold: 3500 }
  };
  const PM_2026 = 3328; /* прожитковий мінімум для працездатних осіб на 01.01.2026 */
  const PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';

  let st = { mode: 'car', fuel: 'petrol', eur: 0, usd: 0, rateDate: '', broker: null, paid: false, last: null };

  const $ = id => document.getElementById(id);
  const num = id => parseFloat(String(($(id) || {}).value || '').replace(',', '.'));
  const money = n => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' грн';
  const eurFmt = n => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' €';

  function carAgeCoef(year){
    let kv = new Date().getFullYear() - year - 1;
    return Math.min(15, Math.max(1, kv));
  }

  async function loadRates(){
    try{
      const r = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
      const d = await r.json();
      const eur = d.find(x => x.cc === 'EUR'), usd = d.find(x => x.cc === 'USD');
      if (eur){ $('cc-eur').value = eur.rate.toFixed(4); st.rateDate = eur.exchangedate; }
      if (usd) $('cc-usd').value = usd.rate.toFixed(4);
      $('cc-rate-note').textContent = 'Курс НБУ на ' + (st.rateDate || 'сьогодні') + ' — можна змінити вручну';
    }catch(e){
      $('cc-rate-note').textContent = 'Курс НБУ не завантажився — введіть курс вручну';
    }
  }

  function toUah(value, cur){
    if (cur === 'EUR') return value * num('cc-eur');
    if (cur === 'USD') return value * num('cc-usd');
    return value;
  }

  /* ---------------- розмітка ---------------- */
  function markup(){
    const groups = (typeof UKTZED_GROUPS !== 'undefined' ? UKTZED_GROUPS : []).map(g => '<option value="' + g[0] + '">' + g[0] + ' — ' + esc(g[1]) + '</option>').join('');
    return '' +
    '<div class="cc-tabs row" style="gap:6px;margin-bottom:1rem">' +
      '<button class="chip active" id="cc-tab-car" onclick="CustomsCalc.mode(\'car\')"><i class="ti ti-car"></i> Легкове авто</button>' +
      '<button class="chip" id="cc-tab-goods" onclick="CustomsCalc.mode(\'goods\')"><i class="ti ti-packages"></i> Будь-який товар (УКТ ЗЕД)' +
        (st.paid ? '' : ' <i class="ti ti-lock" style="font-size:13px"></i>') + '</button>' +
    '</div>' +
    '<div class="card" style="margin-bottom:1rem">' +
      '<div class="card-title">Клієнт і курс</div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-client">Клієнт (для PDF)</label><input class="input" id="cc-client" placeholder="Ім\'я або компанія"></div>' +
        '<div class="field"><label class="label" for="cc-fee">Ваші послуги, грн</label><input class="input" id="cc-fee" type="number" min="0" placeholder="Напр. 4000"></div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-eur">Курс EUR</label><input class="input" id="cc-eur" type="number" step="0.0001"></div>' +
        '<div class="field"><label class="label" for="cc-usd">Курс USD</label><input class="input" id="cc-usd" type="number" step="0.0001"></div>' +
      '</div>' +
      '<div class="hint" id="cc-rate-note">Завантажуємо курс НБУ…</div>' +
    '</div>' +

    /* ---- АВТО ---- */
    '<div class="card" id="cc-car" style="margin-bottom:1rem">' +
      '<div class="card-title">Легкове авто</div>' +
      '<div class="row" style="gap:6px;margin-bottom:1rem" id="cc-fuel">' +
        ['petrol:Бензин','diesel:Дизель','hybrid:Гібрид','electric:Електро'].map((f, i) => {
          const [k, l] = f.split(':');
          return '<button class="chip' + (i ? '' : ' active') + '" data-fuel="' + k + '" onclick="CustomsCalc.fuel(\'' + k + '\',this)">' + l + '</button>';
        }).join('') +
      '</div>' +
      '<div class="field"><label class="label" for="cc-car-name">Авто (марка, модель)</label><input class="input" id="cc-car-name" placeholder="Напр. Volkswagen Golf"></div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-price">Митна вартість</label><input class="input" id="cc-price" type="number" min="0"></div>' +
        '<div class="field"><label class="label" for="cc-cur">Валюта</label><select class="input" id="cc-cur"><option>EUR</option><option>USD</option><option>UAH</option></select></div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-year">Рік випуску</label><input class="input" id="cc-year" type="number" min="1980" max="2030"></div>' +
        '<div class="field" id="cc-engine-f"><label class="label" for="cc-engine">Об\'єм двигуна, см³</label><input class="input" id="cc-engine" type="number" min="0"></div>' +
        '<div class="field" id="cc-battery-f" style="display:none"><label class="label" for="cc-battery">Батарея, кВт·год</label><input class="input" id="cc-battery" type="number" min="0"></div>' +
      '</div>' +
      '<div class="field" id="cc-hybrid-f" style="display:none"><label class="label" for="cc-hybrid">Двигун гібрида</label><select class="input" id="cc-hybrid"><option value="petrol">Бензиновий</option><option value="diesel">Дизельний</option></select></div>' +
      '<label class="check-row" id="cc-eu-f"><input type="checkbox" id="cc-eu"> Походження з ЄС, є сертифікат EUR.1 (мито 0%)</label>' +
    '</div>' +

    /* ---- ТОВАР ---- */
    '<div class="card" id="cc-goods" style="margin-bottom:1rem;display:none">' +
      '<div class="card-title">Товар за УКТ ЗЕД</div>' +
      '<div class="field"><label class="label" for="cc-group">Група УКТ ЗЕД</label><select class="input" id="cc-group">' + groups + '</select></div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-code">Код УКТ ЗЕД</label><input class="input" id="cc-code" inputmode="numeric" maxlength="13" placeholder="10 цифр"></div>' +
        '<div class="field"><label class="label" for="cc-goods-name">Опис товару</label><input class="input" id="cc-goods-name" placeholder="Напр. Насоси відцентрові"></div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-gprice">Митна вартість</label><input class="input" id="cc-gprice" type="number" min="0"></div>' +
        '<div class="field"><label class="label" for="cc-gcur">Валюта</label><select class="input" id="cc-gcur"><option>EUR</option><option>USD</option><option>UAH</option></select></div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-qty">Кількість (од., кг, л…)</label><input class="input" id="cc-qty" type="number" min="0" value="1"></div>' +
        '<div class="field"><label class="label" for="cc-unit">Одиниця</label><input class="input" id="cc-unit" value="шт"></div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-duty">Ввізне мито, %</label><input class="input" id="cc-duty" type="number" min="0" step="0.1" value="0"></div>' +
        '<div class="field"><label class="label" for="cc-duty-spec">Специфічне мито, € за од.</label><input class="input" id="cc-duty-spec" type="number" min="0" step="0.01" value="0"></div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-exc-type">Акциз</label><select class="input" id="cc-exc-type"><option value="none">Не підакцизний</option><option value="pct">% від вартості</option><option value="unit">€ за одиницю</option><option value="uah">грн за одиницю</option></select></div>' +
        '<div class="field"><label class="label" for="cc-exc">Ставка акцизу</label><input class="input" id="cc-exc" type="number" min="0" step="0.01" value="0"></div>' +
      '</div>' +
      '<div class="field"><label class="label" for="cc-vat">ПДВ</label><select class="input" id="cc-vat"><option value="20">20%</option><option value="14">14%</option><option value="7">7%</option><option value="0">0% (звільнення)</option></select></div>' +
      '<div class="hint">Ставки мита й акцизу для конкретного коду вводите ви — перевірте їх за чинним Митним тарифом і угодами про вільну торгівлю. ' +
        'Для легкових авто (група 87) зручніше вкладка «Легкове авто».</div>' +
    '</div>' +

    '<div class="msg msg-err" id="cc-err"></div>' +
    '<button class="btn btn-primary" onclick="CustomsCalc.calc()"><i class="ti ti-calculator"></i>Розрахувати</button>' +

    '<div id="cc-res" style="display:none;margin-top:1.25rem">' +
      '<div class="card"><div class="card-title">Результат</div><div id="cc-lines"></div>' +
        '<div class="row" style="margin-top:1rem;gap:8px">' +
        '</div>' +
        '<div id="cc-send" style="margin-top:1rem"></div>' +
        '<div class="hint">PDF містить ваше ім\'я, телефон і Telegram — клієнт одразу знає, кому дзвонити.</div>' +
      '</div>' +
    '</div>' +
    '<div id="cc-pdf-host" style="position:fixed;left:0;top:0;z-index:-1;opacity:0;pointer-events:none"></div>';
  }

  /* ---------------- розрахунок ---------------- */
  function fail(msg){ const e = $('cc-err'); e.textContent = msg; e.classList.add('show'); $('cc-res').style.display = 'none'; }

  function calcCar(){
    const isEv = st.fuel === 'electric';
    const price = num('cc-price'), cur = $('cc-cur').value, year = parseInt($('cc-year').value, 10);
    const engine = num('cc-engine'), battery = num('cc-battery');
    if (!(price > 0)) return fail('Вкажіть митну вартість авто.');
    if (!(year >= 1980)) return fail('Вкажіть рік випуску.');
    if (isEv && !(battery > 0)) return fail('Вкажіть ємність батареї, кВт·год.');
    if (!isEv && !(engine > 0)) return fail('Вкажіть об\'єм двигуна, см³.');
    const eurRate = num('cc-eur');
    const base = toUah(price, cur);
    const euOrigin = !isEv && $('cc-eu').checked;
    const duty = (isEv || euOrigin) ? 0 : base * 0.10;
    let exciseEur, exciseNote;
    if (isEv){
      exciseEur = battery * 1;
      exciseNote = '1 € × ' + battery + ' кВт·год';
    } else {
      const key = st.fuel === 'hybrid' ? $('cc-hybrid').value : st.fuel;
      const cfg = CAR[key];
      const rate = engine > cfg.threshold ? cfg.large : cfg.small;
      const kv = carAgeCoef(year);
      exciseEur = rate * (engine / 1000) * kv;
      exciseNote = rate + ' € × ' + (engine / 1000).toFixed(1) + ' л × ' + kv + ' (коеф. віку)';
    }
    const excise = exciseEur * eurRate;
    const vat = (base + duty + excise) * 0.20;
    let pRate = 0.03;
    if (base > 290 * PM_2026) pRate = 0.05; else if (base > 165 * PM_2026) pRate = 0.04;
    const pension = isEv ? 0 : base * pRate;
    const fuelName = { petrol:'бензин', diesel:'дизель', hybrid:'гібрид', electric:'електро' }[st.fuel];
    return {
      title: 'Розрахунок розмитнення авто',
      subject: [($('cc-car-name').value || '').trim() || 'Легкове авто', fuelName,
                isEv ? battery + ' кВт·год' : engine + ' см³', year + ' р.'].join(', '),
      params: [['Митна вартість', price.toLocaleString('uk-UA') + ' ' + cur + (cur !== 'UAH' ? ' = ' + money(base) : '')],
               ...(euOrigin ? [['Походження', 'ЄС, сертифікат EUR.1']] : [])],
      lines: [
        ['Ввізне мито', isEv ? '0% для електромобілів' : (euOrigin ? '0% (EUR.1)' : '10% від митної вартості'), duty],
        ['Акцизний податок', exciseNote + ' = ' + eurFmt(exciseEur), excise],
        ['ПДВ 20%', 'від вартості, мита та акцизу', vat]
      ],
      payments: duty + excise + vat,
      extra: [['Збір до Пенсійного фонду', isEv ? 'легкові електромобілі звільнені' : Math.round(pRate * 100) + '% при першій реєстрації', pension]]
    };
  }

  function calcGoods(){
    const price = num('cc-gprice'), cur = $('cc-gcur').value, qty = num('cc-qty') || 0;
    if (!(price > 0)) return fail('Вкажіть митну вартість товару.');
    const eurRate = num('cc-eur');
    const base = toUah(price, cur);
    const dutyPct = num('cc-duty') || 0, dutySpec = num('cc-duty-spec') || 0;
    const dutyAdv = base * dutyPct / 100, dutySp = dutySpec * qty * eurRate;
    const duty = dutyAdv + dutySp;
    const et = $('cc-exc-type').value, er = num('cc-exc') || 0;
    let excise = 0, excNote = 'товар не підакцизний';
    if (et === 'pct'){ excise = base * er / 100; excNote = er + '% від митної вартості'; }
    if (et === 'unit'){ excise = er * qty * eurRate; excNote = er + ' € × ' + qty + ' ' + ($('cc-unit').value || 'од.'); }
    if (et === 'uah'){ excise = er * qty; excNote = er + ' грн × ' + qty + ' ' + ($('cc-unit').value || 'од.'); }
    const vatPct = parseFloat($('cc-vat').value);
    const vat = (base + duty + excise) * vatPct / 100;
    const g = $('cc-group'), code = ($('cc-code').value || '').replace(/\D/g, '');
    const dutyNote = [dutyPct ? dutyPct + '% від вартості' : '', dutySpec ? dutySpec + ' € × ' + qty + ' ' + ($('cc-unit').value || 'од.') : '']
                     .filter(Boolean).join(' + ') || '0%';
    return {
      title: 'Розрахунок митних платежів',
      subject: (($('cc-goods-name').value || '').trim() || 'Товар') + (code ? ', код УКТ ЗЕД ' + code : ''),
      params: [['Група УКТ ЗЕД', g.options[g.selectedIndex].text],
               ['Митна вартість', price.toLocaleString('uk-UA') + ' ' + cur + (cur !== 'UAH' ? ' = ' + money(base) : '')],
               ['Кількість', qty + ' ' + ($('cc-unit').value || '')]],
      lines: [['Ввізне мито', dutyNote, duty], ['Акцизний податок', excNote, excise],
              ['ПДВ ' + vatPct + '%', 'від вартості, мита та акцизу', vat]],
      payments: duty + excise + vat,
      extra: []
    };
  }

  function calc(){
    $('cc-err').classList.remove('show');
    if (!(num('cc-eur') > 0) || !(num('cc-usd') > 0)) return fail('Вкажіть курс EUR і USD.');
    const r = st.mode === 'car' ? calcCar() : calcGoods();
    if (!r) return;
    r.fee = num('cc-fee') || 0;
    r.client = ($('cc-client').value || '').trim();
    r.eur = num('cc-eur'); r.usd = num('cc-usd'); r.rateDate = st.rateDate;
    r.total = r.payments + r.fee + r.extra.reduce((s, x) => s + x[2], 0);
    st.last = r;
    const row = (n, s, v, strong) => '<div class="svc-line" style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:.5px solid var(--border)">' +
      '<div><div style="font-size:14px' + (strong ? ';font-weight:600' : '') + '">' + esc(n) + '</div>' + (s ? '<div class="text-xs text-muted">' + esc(s) + '</div>' : '') + '</div>' +
      '<div style="white-space:nowrap' + (strong ? ';font-weight:700;color:var(--blue)' : '') + '">' + money(v) + '</div></div>';
    $('cc-lines').innerHTML = r.lines.map(l => row(l[0], l[1], l[2])).join('') +
      row('Митні платежі разом', '', r.payments, true) +
      r.extra.map(l => row(l[0], l[1], l[2])).join('') +
      (r.fee ? row('Послуги брокера', '', r.fee) : '') +
      row('Разом до сплати', 'орієнтовно', r.total, true);
    $('cc-res').style.display = 'block';
    preparePdf();
    $('cc-res').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------------- PDF ---------------- */
  function loadPdfLib(){
    if (window.html2pdf) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = PDF_LIB; s.onload = res; s.onerror = () => rej(new Error('PDF-бібліотека не завантажилась'));
      document.head.appendChild(s);
    });
  }

  function pdfHtml(r){
    const b = st.broker || {};
    const today = new Date().toLocaleDateString('uk-UA');
    const tr = (n, s, v, bold) => '<tr' + (bold ? ' style="font-weight:700;background:#ecfdf5"' : '') + '><td style="padding:9px 10px;border-bottom:1px solid #e5e7eb">' + esc(n) +
      (s ? '<div style="font-size:11px;color:#6b7280;font-weight:400">' + esc(s) + '</div>' : '') +
      '</td><td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap">' + money(v) + '</td></tr>';
    const contacts = [b.phone, b.telegram ? 'Telegram: @' + String(b.telegram).replace(/^@/, '') : '', b.email].filter(Boolean).map(esc).join(' · ');
    return '<div style="width:720px;padding:34px 38px;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #10B981;padding-bottom:14px;margin-bottom:18px">' +
        '<div><div style="font-size:20px;font-weight:700">' + esc(b.name || 'Митний брокер') + '</div>' +
          '<div style="color:#4b5563;margin-top:3px">' + esc([b.city, b.region].filter(Boolean).join(', ')) + '</div>' +
          '<div style="color:#4b5563;margin-top:3px">' + contacts + '</div></div>' +
        '<div style="text-align:right;color:#6b7280;font-size:12px">Дата: ' + today + (r.client ? '<br>Клієнт: <b style="color:#111827">' + esc(r.client) + '</b>' : '') + '</div>' +
      '</div>' +
      '<div style="font-size:18px;font-weight:700;margin-bottom:4px">' + esc(r.title) + '</div>' +
      '<div style="color:#374151;margin-bottom:14px">' + esc(r.subject) + '</div>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px;color:#374151">' +
        r.params.map(p => '<tr><td style="padding:3px 0;width:170px;color:#6b7280;border:0">' + esc(p[0]) + '</td><td style="padding:3px 0;border:0">' + esc(p[1]) + '</td></tr>').join('') +
        '<tr><td style="padding:3px 0;color:#6b7280;border:0">Курс НБУ</td><td style="padding:3px 0;border:0">EUR ' + r.eur.toFixed(2) + ' · USD ' + r.usd.toFixed(2) + (r.rateDate ? ' (на ' + esc(r.rateDate) + ')' : '') + '</td></tr>' +
      '</table>' +
      '<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">' +
        r.lines.map(l => tr(l[0], l[1], l[2])).join('') +
        tr('Митні платежі разом', '', r.payments, true) +
        r.extra.map(l => tr(l[0], l[1], l[2])).join('') +
        (r.fee ? tr('Послуги митного брокера', '', r.fee) : '') +
        '<tr style="font-weight:700;font-size:15px;background:#10B981;color:#fff"><td style="padding:11px 10px">Разом до сплати (орієнтовно)</td><td style="padding:11px 10px;text-align:right;white-space:nowrap">' + money(r.total) + '</td></tr>' +
      '</table>' +
      '<p style="font-size:11px;color:#6b7280;margin-top:14px">Розрахунок орієнтовний і не є офіційним документом. Остаточну суму визначає митний орган під час оформлення: ' +
        'на неї впливають митна вартість, курс НБУ на день подання декларації, документи про походження та чинні ставки. ' +
        'Не враховано витрати на сертифікацію, доставку, стоянку та реєстрацію, якщо їх не вказано окремо.</p>' +
      '<div style="margin-top:18px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;display:flex;justify-content:space-between">' +
        '<span>Підготовлено в каталозі МитнийБрокер</span><span>forwardcarua.com' + (b.id ? '/broker/' + esc(b.id) : '') + '</span></div>' +
    '</div>';
  }

  /* PDF готуємо одразу після розрахунку і завантажуємо в сховище — тоді клієнту
     можна надіслати посилання в будь-який месенджер, а кнопки спрацьовують миттєво. */
  let prepId = 0;
  async function buildBlob(r){
    await loadPdfLib();
    const host = $('cc-pdf-host');
    host.innerHTML = pdfHtml(r);
    try{
      return await html2pdf().set({
        margin: 8, image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0, windowWidth: 800,
          onclone: d => { const h = d.getElementById('cc-pdf-host'); if (h) h.style.opacity = '1'; } },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(host.firstChild).outputPdf('blob');
    } finally { host.innerHTML = ''; }
  }

  async function upload(blob){
    const sb = await sbReady();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Увійдіть у кабінет');
    const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
    const path = session.user.id + '/' + id + '.pdf';
    const { error } = await sb.storage.from('rozrakhunky').upload(path, blob, { contentType: 'application/pdf', upsert: false });
    if (error) throw error;
    return sb.storage.from('rozrakhunky').getPublicUrl(path).data.publicUrl;
  }

  function fileName(r){
    return 'rozrakhunok-' + (r.client || 'mytni-platezhi').replace(/[^\wа-яіїєґ-]+/gi, '-').slice(0, 40) + '-' +
           new Date().toISOString().slice(0, 10) + '.pdf';
  }

  function renderSend(state){
    const box = $('cc-send');
    if (state === 'busy'){ box.innerHTML = '<div class="text-sm text-muted"><i class="ti ti-loader-2"></i> Готуємо PDF для клієнта…</div>'; return; }
    if (state === 'error'){
      box.innerHTML = '<div class="msg msg-err show">Не вдалося підготувати PDF. <a href="#" onclick="CustomsCalc.retry();return false">Спробувати ще раз</a></div>'; return;
    }
    const b = st.broker || {};
    const text = 'Розрахунок митних платежів' + (st.last.client ? ' для ' + st.last.client : '') + ' — ' + (b.name || 'митний брокер') +
                 '. Разом орієнтовно: ' + money(st.last.total) + '. PDF: ';
    const url = st.url || '';
    const enc = encodeURIComponent;
    const canFile = !!(navigator.canShare && st.file && navigator.canShare({ files: [st.file] }));
    box.innerHTML =
      '<div class="text-sm" style="margin-bottom:.6rem">Надіслати клієнту:</div>' +
      '<div class="row" style="gap:8px">' +
        '<a class="btn btn-primary" href="' + esc(st.objUrl) + '" download="' + esc(st.fname) + '"><i class="ti ti-file-download"></i>Завантажити PDF</a>' +
        (canFile ? '<button class="btn btn-ghost" onclick="CustomsCalc.shareFile()"><i class="ti ti-share"></i>Поділитися файлом</button>' : '') +
        (url ? (
          '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + enc(url) + '&text=' + enc(text) + '"><i class="ti ti-brand-telegram"></i>Telegram</a>' +
          '<a class="btn btn-ghost" href="viber://forward?text=' + enc(text + url) + '"><i class="ti ti-brand-viber"></i>Viber</a>' +
          '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' + enc(text + url) + '"><i class="ti ti-brand-whatsapp"></i>WhatsApp</a>' +
          '<a class="btn btn-ghost" href="mailto:?subject=' + enc(st.last.title) + '&body=' + enc(text + url) + '"><i class="ti ti-mail"></i>Email</a>' +
          '<button class="btn btn-ghost" onclick="CustomsCalc.copy()"><i class="ti ti-link"></i>Копіювати посилання</button>'
        ) : '') +
      '</div>' +
      (url ? '' : st.uploading
        ? '<div class="hint"><i class="ti ti-loader-2"></i> Створюємо посилання для Telegram, Viber і WhatsApp…</div>'
        : '<div class="hint">Посилання для месенджерів не створилось — завантажте PDF і надішліть файлом.</div>');
  }

  async function preparePdf(){
    const my = ++prepId;
    st.url = ''; st.file = null;
    if (st.objUrl){ URL.revokeObjectURL(st.objUrl); st.objUrl = ''; }
    renderSend('busy');
    try{
      const blob = await buildBlob(st.last);
      if (my !== prepId) return;
      st.fname = fileName(st.last);
      st.objUrl = URL.createObjectURL(blob);
      st.file = new File([blob], st.fname, { type: 'application/pdf' });
      st.uploading = true;
      renderSend('ready');
      try{
        st.url = await Promise.race([upload(blob),
          new Promise((_, rej) => setTimeout(() => rej(new Error('upload timeout')), 20000))]);
      }catch(e){ console.error('upload pdf:', e); st.url = ''; }
      st.uploading = false;
      if (my !== prepId) return;
      renderSend('ready');
    }catch(e){
      console.error('pdf:', e);
      if (my === prepId) renderSend('error');
    }
  }

  async function shareFile(){
    try{ await navigator.share({ files: [st.file], title: st.last.title }); }
    catch(e){ if (e.name !== 'AbortError') showToast('Не вдалося поділитися — завантажте PDF', 'error'); }
  }

  async function copy(){
    try{ await navigator.clipboard.writeText(st.url); showToast('Посилання скопійовано'); }
    catch(e){ prompt('Скопіюйте посилання:', st.url); }
  }

  /* ---------------- публічне API ---------------- */
  window.CustomsCalc = {
    mount(el, opts){
      st.broker = opts.broker || null;
      st.paid = !!opts.paid;
      el.innerHTML = markup();
      loadRates();
    },
    mode(m){
      if (m === 'goods' && !st.paid){
        showToast('Розрахунок за УКТ ЗЕД доступний на тарифах Стандарт, Про і Преміум', 'error');
        if (typeof pane === 'function') pane('billing', document.querySelector('[data-pane=billing]'));
        return;
      }
      st.mode = m;
      $('cc-tab-car').classList.toggle('active', m === 'car');
      $('cc-tab-goods').classList.toggle('active', m === 'goods');
      $('cc-car').style.display = m === 'car' ? '' : 'none';
      $('cc-goods').style.display = m === 'goods' ? '' : 'none';
      $('cc-res').style.display = 'none';
    },
    fuel(f, btn){
      st.fuel = f;
      document.querySelectorAll('#cc-fuel .chip').forEach(c => c.classList.toggle('active', c === btn));
      const ev = f === 'electric';
      $('cc-engine-f').style.display = ev ? 'none' : '';
      $('cc-battery-f').style.display = ev ? '' : 'none';
      $('cc-hybrid-f').style.display = f === 'hybrid' ? '' : 'none';
      $('cc-eu-f').style.display = ev ? 'none' : '';
    },
    calc, shareFile, copy, retry: preparePdf,
    _state: st
  };
})();
