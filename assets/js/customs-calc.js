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
    '<div class="cc-tabs row" style="gap:6px;margin-bottom:1rem' + (st.public ? ';display:none' : '') + '">' +
      '<button class="chip active" id="cc-tab-car" onclick="CustomsCalc.mode(\'car\')"><i class="ti ti-car"></i> Легкове авто</button>' +
      '<button class="chip" id="cc-tab-goods" onclick="CustomsCalc.mode(\'goods\')"><i class="ti ti-packages"></i> Будь-який товар (УКТ ЗЕД)' +
        (st.paid ? '' : ' <i class="ti ti-lock" style="font-size:13px"></i>') + '</button>' +
    '</div>' +
    '<div class="card" style="margin-bottom:1rem">' +
      '<div class="card-title">' + (st.public ? 'Курс валют' : 'Клієнт і курс') + '</div>' +
      '<div class="field-row"' + (st.public ? ' style="display:none"' : '') + '>' +
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
      '<div class="field"><label class="label" for="cc-group">Група УКТ ЗЕД</label><select class="input" id="cc-group" onchange="CustomsCalc.group(this.value)"><option value="">Усі групи — шукати по всьому тарифу</option>' + groups + '</select></div>' +
      '<div class="field" style="position:relative"><label class="label" for="cc-find">Товар — пошук за назвою або кодом</label>' +
        '<input class="input" id="cc-find" autocomplete="off" placeholder="Напр. фотоелектричні або 8541" oninput="CustomsCalc.find(this.value)" onfocus="CustomsCalc.find(this.value)">' +
        '<div id="cc-find-list" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:50;max-height:340px;overflow-y:auto;background:var(--surface2);' +
          'border:.5px solid var(--border-strong);border-radius:var(--r-sm);box-shadow:0 20px 40px rgba(0,0,0,.45)"></div></div>' +
      '<div class="field"><label class="label" for="cc-origin">Країна походження</label><select class="input" id="cc-origin" onchange="CustomsCalc.applyRate()">' +
        '<option value="pilg">Член СОТ / режим найбільшого сприяння (Китай, США, Туреччина, Японія…) — пільгова ставка</option>' +
        '<option value="full">Країна без режиму найбільшого сприяння — повна ставка</option>' +
        '<option value="fta">Угода про вільну торгівлю з сертифікатом походження (ЄС, ЄАВТ, Велика Британія, Канада…) — ставка за угодою</option>' +
      '</select></div>' +
      '<div id="cc-rate-info" class="hint" style="display:none;margin:-.25rem 0 1rem;padding:10px 12px;background:var(--blue-glow);border-radius:var(--r-sm);color:var(--text)"></div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-code">Код УКТ ЗЕД</label><input class="input" id="cc-code" inputmode="numeric" maxlength="13" placeholder="10 цифр"></div>' +
        '<div class="field"><label class="label" for="cc-goods-name">Опис товару</label><input class="input" id="cc-goods-name" placeholder="Напр. Насоси відцентрові"></div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-gprice">Митна вартість</label><input class="input" id="cc-gprice" type="number" min="0"></div>' +
        '<div class="field"><label class="label" for="cc-gcur">Валюта</label><select class="input" id="cc-gcur"><option>EUR</option><option>USD</option><option>UAH</option></select></div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-qty" id="cc-qty-label">Кількість (од., кг, л…)</label><input class="input" id="cc-qty" type="number" min="0" value="1"></div>' +
        '<div class="field"><label class="label" for="cc-unit">Одиниця</label><input class="input" id="cc-unit" value="шт"></div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-duty">Ввізне мито, %</label><input class="input" id="cc-duty" type="number" min="0" step="0.1" value="0"></div>' +
        '<div class="field"><label class="label" for="cc-duty-spec">Специфічне мито, € за од.</label><input class="input" id="cc-duty-spec" type="number" min="0" step="0.01" value="0"></div>' +
      '</div>' +
      '<input type="hidden" id="cc-duty-per" value="1">' +
      '<label class="check-row"><input type="checkbox" id="cc-duty-min"> Специфічне мито — як мінімум («але не менш як»), а не додається до відсоткового</label>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="cc-exc-type">Акциз</label><select class="input" id="cc-exc-type" onchange="CustomsCalc.excUi()"><option value="none">Не підакцизний</option><option value="auto" disabled>За Податковим кодексом</option><option value="pct">% від вартості</option><option value="unit">€ за одиницю</option><option value="uah">грн за одиницю</option></select></div>' +
        '<div class="field" id="cc-exc-f"><label class="label" for="cc-exc">Ставка акцизу</label><input class="input" id="cc-exc" type="number" min="0" step="0.01" value="0"></div>' +
      '</div>' +
      '<div id="cc-exc-auto" style="display:none;margin-bottom:1rem">' +
        '<div class="field"><label class="label" for="cc-exc-var">Ставка акцизу (ПКУ, ст. 215 і перехідні положення на 2026 р.)</label><select class="input" id="cc-exc-var" onchange="CustomsCalc.excUi()"></select></div>' +
        '<div class="field-row">' +
          '<div class="field"><label class="label" for="cc-exc-qty" id="cc-exc-qty-l">Кількість для акцизу</label><input class="input" id="cc-exc-qty" type="number" min="0" step="any"></div>' +
          '<div class="field" id="cc-exc-abv-f" style="display:none"><label class="label" for="cc-exc-abv">Міцність, % об.</label><input class="input" id="cc-exc-abv" type="number" min="0" max="100" step="0.1"></div>' +
          '<div class="field" id="cc-exc-new-f" style="display:none"><label class="label" for="cc-exc-new">Стан</label><select class="input" id="cc-exc-new" onchange="CustomsCalc.excUi()"><option value="new">Новий</option><option value="used">Що використовувався</option></select></div>' +
        '</div>' +
        '<div class="hint" id="cc-exc-hint"></div>' +
      '</div>' +
      '<div class="field"><label class="label" for="cc-vat">ПДВ</label><select class="input" id="cc-vat"><option value="20">20%</option><option value="14">14%</option><option value="7">7%</option><option value="0">0% (звільнення)</option></select></div>' +
      '<div class="hint">Ставки ввізного мита підставляються з Митного тарифу України (Закон № 2697-IX) і їх можна змінити вручну. ' +
        'Акциз підставляється з Податкового кодексу (ст. 215, для тютюну й пального — ставки 2026 р.). Ставки за угодами про вільну торгівлю і пільги з ПДВ перевіряйте окремо. Для легкових авто зручніше вкладка «Легкове авто».</div>' +
    '</div>' +

    '<div class="msg msg-err" id="cc-err"></div>' +
    '<button class="btn btn-primary" onclick="CustomsCalc.calc()"><i class="ti ti-calculator"></i>Розрахувати</button>' +

    '<div id="cc-res" style="display:none;margin-top:1.25rem">' +
      '<div class="card"><div class="card-title">Результат</div><div id="cc-lines"></div>' +
        '<div class="row" style="margin-top:1rem;gap:8px">' +
        '</div>' +
        '<div id="cc-send" style="margin-top:1rem"></div>' +
        (st.public ? '' : '<div class="hint">PDF містить ваше ім\'я, телефон і Telegram — клієнт одразу знає, кому дзвонити.</div>') +
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
    const dutyPct = num('cc-duty') || 0, dutySpec = num('cc-duty-spec') || 0, per = num('cc-duty-per') || 1;
    const minMode = $('cc-duty-min').checked && dutyPct > 0 && dutySpec > 0;
    const dutyAdv = base * dutyPct / 100, dutySp = dutySpec * qty / per * eurRate;
    const duty = minMode ? Math.max(dutyAdv, dutySp) : dutyAdv + dutySp;
    const et = $('cc-exc-type').value, er = num('cc-exc') || 0;
    let excise = 0, excNote = 'товар не підакцизний';
    if (et === 'auto'){
      const x = excNow();
      if (!x) return fail('Оберіть ставку акцизу або вкажіть її вручну.');
      const q = num('cc-exc-qty') || 0;
      if (x.base !== 'pct' && !(q > 0)) return fail('Вкажіть кількість для розрахунку акцизу (' + x.label + ').');
      if (x.base === 'pure' && !(num('cc-exc-abv') > 0)) return fail('Вкажіть міцність напою, % об.');
      const units = x.base === 'pure' ? q * num('cc-exc-abv') / 100 : q;
      if (x.base === 'pct'){ excise = base * x.rate / 100; excNote = x.rate + '% від митної вартості'; }
      else {
        excise = x.rate * units / x.per * (x.cur === 'EUR' ? eurRate : 1);
        excNote = String(x.rate).replace('.', ',') + (x.cur === 'EUR' ? ' €' : ' грн') + ' за ' + (x.per !== 1 ? x.per + ' ' : '') + x.short + ' × ' +
                  (x.base === 'pure' ? q + ' л × ' + num('cc-exc-abv') + '% = ' + (+units.toFixed(3)) : units) +
                  (x.cur === 'EUR' ? ' = ' + eurFmt(x.rate * units / x.per) : '');
      }
      if (x.note) excNote += ' · ' + x.note;
    }
    if (et === 'pct'){ excise = base * er / 100; excNote = er + '% від митної вартості'; }
    if (et === 'unit'){ excise = er * qty * eurRate; excNote = er + ' € × ' + qty + ' ' + ($('cc-unit').value || 'од.'); }
    if (et === 'uah'){ excise = er * qty; excNote = er + ' грн × ' + qty + ' ' + ($('cc-unit').value || 'од.'); }
    const vatPct = parseFloat($('cc-vat').value);
    const vat = (base + duty + excise) * vatPct / 100;
    const g = $('cc-group'), code = ($('cc-code').value || '').replace(/\D/g, '');
    const specTxt = dutySpec ? dutySpec + ' € за ' + (per !== 1 ? per + ' ' : '') + ($('cc-unit').value || 'од.') + ' × ' + qty : '';
    const dutyNote = (minMode ? dutyPct + '%, але не менш як ' + specTxt
                      : [dutyPct ? dutyPct + '% від вартості' : '', specTxt].filter(Boolean).join(' + ')) || '0%';
    const T = st.tariff;
    return {
      title: 'Розрахунок митних платежів',
      subject: (($('cc-goods-name').value || '').trim() || 'Товар') + (code ? ', код УКТ ЗЕД ' + code : ''),
      params: [...(g.value ? [['Група УКТ ЗЕД', g.options[g.selectedIndex].text]] : []),
               ['Митна вартість', price.toLocaleString('uk-UA') + ' ' + cur + (cur !== 'UAH' ? ' = ' + money(base) : '')],
               ['Кількість', qty + ' ' + ($('cc-unit').value || '')],
               ...(T ? [['Ставка за Митним тарифом', 'пільгова ' + T.rate_pilg + (/^\d/.test(T.rate_pilg) && !/євро/.test(T.rate_pilg) ? '%' : '') +
                        ', повна ' + T.rate_full + (/^\d/.test(T.rate_full) && !/євро/.test(T.rate_full) ? '%' : '') +
                        ' · застосовано: ' + { pilg:'пільгова', full:'повна', fta:'за угодою про ЗВТ' }[$('cc-origin').value]]] : [])],
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
    if (st.public) renderLead(); else preparePdf();
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
        html2canvas: { scale: 2, backgroundColor: '#ffffff', scrollY: 0 },
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
    const text = st.last.title + (st.last.client ? ' для ' + st.last.client : '') + '\n' +
                 st.last.subject + '\n' +
                 'Митні платежі: ' + money(st.last.payments) + '\n' +
                 'Разом орієнтовно: ' + money(st.last.total) + '\n' +
                 (b.name || 'Митний брокер') + (b.phone ? ', ' + b.phone : '') + '\n' +
                 'Детальний розрахунок (PDF): ';
    const url = st.url || '';
    const enc = encodeURIComponent;
    st.msg = text + url;
    const canFile = !!navigator.share && (url || (navigator.canShare && st.file && navigator.canShare({ files: [st.file] })));
    box.innerHTML =
      '<div class="text-sm" style="margin-bottom:.6rem">Надіслати клієнту:</div>' +
      '<div class="row" style="gap:8px">' +
        '<a class="btn btn-primary" href="' + esc(st.objUrl) + '" download="' + esc(st.fname) + '"><i class="ti ti-file-download"></i>Завантажити PDF</a>' +
        (canFile ? '<button class="btn btn-ghost" onclick="CustomsCalc.shareFile()"><i class="ti ti-share"></i>Поділитися</button>' : '') +
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
    /* Багато месенджерів відкидають текст, коли в share є файл, і навпаки —
       тому, якщо є посилання, ділимося текстом із посиланням на PDF. */
    try{
      if (st.url) await navigator.share({ text: st.msg });
      else await navigator.share({ files: [st.file], text: st.msg });
    }
    catch(e){ if (e.name !== 'AbortError') showToast('Не вдалося поділитися — завантажте PDF', 'error'); }
  }

  async function copy(){
    try{ await navigator.clipboard.writeText(st.url); showToast('Посилання скопійовано'); }
    catch(e){ prompt('Скопіюйте посилання:', st.url); }
  }

  /* ---------------- Митний тариф (таблиця uktzed) ---------------- */
  const tariffCache = {}, byCode = {};
  const COLS = 'code,name,path,rate_pilg,rate_full,unit';
  const prep = rows => (rows || []).map(r => (byCode[r.code] = { ...r, hay: (r.code + ' ' + r.path).toLowerCase() }));
  async function loadGroup(g){
    if (tariffCache[g]) return tariffCache[g];
    const sb = await sbReady();
    const { data, error } = await sb.from('uktzed').select(COLS).eq('grp', g).order('code').limit(3000);
    if (error) throw error;
    return (tariffCache[g] = prep(data));
  }
  async function searchAll(words){
    const sb = await sbReady();
    let q = sb.from('uktzed').select(COLS);
    words.forEach(w => { q = q.ilike('path', '%' + w.replace(/[%_,()]/g, ' ').trim() + '%'); });
    const { data, error } = await q.order('code').limit(80);
    if (error) throw error;
    return prep(data);
  }
  const fmtCode = c => c.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
  function parseRate(s){
    s = String(s || '').trim().replace(/ /g, ' ');
    const n = x => parseFloat(String(x).replace(',', '.'));
    let m;
    if ((m = s.match(/^(\d+(?:,\d+)?)$/))) return { pct: n(m[1]), spec: 0, per: 1, unit: '', min: false };
    if ((m = s.match(/^(\d+(?:,\d+)?)\s*%?,?\s*але не менш як\s*(\d+(?:,\d+)?)\s*євро за\s*(\d+(?:,\d+)?)?\s*(.+)$/)))
      return { pct: n(m[1]), spec: n(m[2]), per: m[3] ? n(m[3]) : 1, unit: m[4].trim(), min: true };
    if ((m = s.match(/^(\d+(?:,\d+)?)\s*євро за\s*(\d+(?:,\d+)?)?\s*(.+)$/)))
      return { pct: 0, spec: n(m[1]), per: m[2] ? n(m[2]) : 1, unit: m[3].trim(), min: false };
    return null;
  }
  function rateLabel(s){ return /^\d+(,\d+)?$/.test(s) ? s + '%' : s; }
  async function onGroup(g){
    st.tariff = null; $('cc-find').value = ''; $('cc-rate-info').style.display = 'none';
    if (!g) return;
    try{ await loadGroup(g); doFind(''); $('cc-find').focus(); }catch(e){ console.error(e); }
  }
  let findTimer, findSeq = 0;
  function find(q){
    clearTimeout(findTimer);
    findTimer = setTimeout(() => doFind(q), 120);
  }
  async function doFind(q){
    const box = $('cc-find-list');
    q = String(q || '').trim().toLowerCase();
    const digits = q.replace(/\s/g, '');
    const grp = $('cc-group').value;
    const isCode = !!digits && /^\d+$/.test(digits);
    const words = q.split(/\s+/).filter(Boolean).map(w => w.length > 5 ? w.slice(0, w.length - 2) : w);
    if (!q && !grp){ box.style.display = 'none'; return; }
    if (!isCode && q && q.length < 3){ box.style.display = 'none'; return; }
    const my = ++findSeq;
    let hits = [], scope = grp ? 'у групі ' + grp : 'у тарифі';
    try{
      if (isCode) hits = (await loadGroup(digits.slice(0, 2))).filter(r => r.code.startsWith(digits));
      else if (grp){
        hits = (await loadGroup(grp)).filter(r => words.every(w => r.hay.includes(w)));
        if (!hits.length && q){ hits = await searchAll(words); scope = 'у тарифі'; }
      } else hits = await searchAll(words);
    }catch(e){ box.innerHTML = '<div class="text-sm" style="padding:10px;color:var(--red)">Довідник не завантажився — введіть ставки вручну</div>'; box.style.display = 'block'; return; }
    if (my !== findSeq) return;
    if (!hits.length){ box.innerHTML = '<div class="text-sm text-muted" style="padding:10px">Нічого не знайдено ' + scope + '. Спробуйте інше слово або код.</div>'; box.style.display = 'block'; return; }
    box.innerHTML = hits.slice(0, 60).map(r =>
      '<div class="cc-opt" data-code="' + r.code + '" style="padding:9px 12px;cursor:pointer;border-bottom:.5px solid var(--border)" ' +
      'onmousedown="CustomsCalc.pick(\'' + r.code + '\')">' +
      '<div style="display:flex;justify-content:space-between;gap:10px"><b style="font-size:13px;white-space:nowrap">' + fmtCode(r.code) + '</b>' +
      '<span class="text-xs" style="color:var(--blue);white-space:nowrap">' + esc(rateLabel(r.rate_pilg)) + ' / ' + esc(rateLabel(r.rate_full)) + '</span></div>' +
      '<div style="font-size:13px">' + esc(r.name) + '</div>' +
      '<div class="text-xs text-muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.path) + '</div></div>'
    ).join('') + (hits.length > 60 ? '<div class="text-xs text-muted" style="padding:8px 12px">Показано 60 з ' + hits.length + ' — уточніть запит</div>' : '');
    box.style.display = 'block';
  }
  document.addEventListener('click', e => { const b = $('cc-find-list'); if (b && !e.target.closest('#cc-find-list') && e.target.id !== 'cc-find') b.style.display = 'none'; });
  function pick(code){
    const r = byCode[code]; if (!r) return;
    if ($('cc-group').value !== code.slice(0, 2)) $('cc-group').value = code.slice(0, 2);
    st.tariff = r;
    $('cc-find-list').style.display = 'none';
    $('cc-find').value = fmtCode(r.code) + ' — ' + r.name;
    $('cc-code').value = r.code;
    const parts = r.path.split(' › ');
    const generic = /^(інш|інші|інша|інше)\b/i.test(r.name) || r.name.length < 18;
    $('cc-goods-name').value = generic && parts.length > 1 ? parts.slice(-2).join(', ') : r.name;
    applyRate();
    applyExcise(r.code);
  }
  /* ---------------- Акциз (таблиця excise_rates) ---------------- */
  let exciseAll = null, excMatches = [];
  async function loadExcise(){
    if (exciseAll) return exciseAll;
    const sb = await sbReady();
    const { data, error } = await sb.from('excise_rates').select('codes,excl,descr,unit,rate,src').order('id');
    if (error) throw error;
    return (exciseAll = data || []);
  }
  function parseExcise(row, isNew){
    let txt = (row.rate + ' ' + (row.unit || '')).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
    if (/^нові\s/.test(row.rate)){
      const m = row.rate.match(/нові\s+(.+?),\s*що використовувалися\s+(.+)$/);
      if (m) txt = (isNew ? m[1] : m[2]).trim();
    }
    if ((row.unit || '') === 'відсотків') return { base:'pct', rate: parseFloat(row.rate.replace(',', '.')), per:1, cur:'PCT', label:'', short:'' };
    const m = txt.match(/^(\d+(?:,\d+)?)\s*(євро|гривень)\s*за\s*(\d+)?\s*(.+)$/);
    if (!m) return null;
    const unitTxt = m[4];
    const x = { rate: parseFloat(m[1].replace(',', '.')), cur: m[2] === 'євро' ? 'EUR' : 'UAH', per: m[3] ? parseFloat(m[3]) : 1 };
    if (/100-відсоткового спирту/.test(unitTxt)) Object.assign(x, { base:'pure', label:'об\'єм, л', short:'л 100% спирту' });
    else if (/куб\.?\s*см/.test(unitTxt)) Object.assign(x, { base:'cc', label:'об\'єм двигуна, см³ (× кількість ТЗ)', short:'см³' });
    else if (/кілограм/.test(unitTxt)) Object.assign(x, { base:'qty', label:'кг нетто', short:'кг' });
    else if (/літр/.test(unitTxt)) Object.assign(x, { base:'qty', label: x.per === 1000 ? 'літрів (при 15 °C)' : 'літрів', short:'л' });
    else if (/штук/.test(unitTxt)) Object.assign(x, { base:'qty', label:'штук', short:'шт' });
    else Object.assign(x, { base:'qty', label: unitTxt, short: unitTxt });
    if (/^2402/.test(row.codes[0] || '')) x.note = 'плюс адвалорна частина 12% від максимальної роздрібної ціни, але не менше мінімального акцизного зобов\'язання';
    if (row.src && /розд/.test(row.src)) x.note = (x.note ? x.note + '; ' : '') + 'ставка 2026 р.';
    return x;
  }
  async function findExcise(code){
    let all; try{ all = await loadExcise(); }catch(e){ console.error(e); return []; }
    const hits = all.filter(r => r.codes.some(c => code.startsWith(c)) && !(r.excl || []).some(c => code.startsWith(c)));
    const best = r => Math.max(...r.codes.filter(c => code.startsWith(c)).map(c => c.length));
    return hits.sort((a, b) => best(b) - best(a));
  }
  function excNow(){
    const i = parseInt($('cc-exc-var').value, 10);
    const row = excMatches[i]; if (!row) return null;
    return parseExcise(row, $('cc-exc-new').value === 'new');
  }
  function excUi(){
    const auto = $('cc-exc-type').value === 'auto';
    $('cc-exc-auto').style.display = auto ? '' : 'none';
    $('cc-exc-f').style.display = auto || $('cc-exc-type').value === 'none' ? 'none' : '';
    if (!auto) return;
    const row = excMatches[parseInt($('cc-exc-var').value, 10)];
    $('cc-exc-new-f').style.display = row && /^нові\s/.test(row.rate) ? '' : 'none';
    const x = excNow();
    $('cc-exc-abv-f').style.display = x && x.base === 'pure' ? '' : 'none';
    $('cc-exc-qty').parentElement.style.display = x && x.base === 'pct' ? 'none' : '';
    $('cc-exc-qty-l').textContent = x ? 'Кількість для акцизу — ' + x.label : 'Кількість для акцизу';
    $('cc-exc-hint').innerHTML = row ? esc(row.descr) + (x && x.note ? '<br>' + esc(x.note) : '') : '';
    if (x && x.base === 'qty' && !num('cc-exc-qty')){
      const u = ($('cc-unit').value || '').toLowerCase();
      if ((x.short === 'л' && u === 'л') || (x.short === 'кг' && u === 'кг') || (x.short === 'шт' && u === 'шт' && x.per === 1)) $('cc-exc-qty').value = $('cc-qty').value;
    }
  }
  async function applyExcise(code){
    excMatches = await findExcise(code);
    $('cc-exc-qty').value = ''; $('cc-exc-abv').value = '';
    const sel = $('cc-exc-type'), opt = sel.querySelector('option[value=auto]');
    if (excMatches.length){
      opt.disabled = false; sel.value = 'auto';
      $('cc-exc-var').innerHTML = excMatches.map((r, i) =>
        '<option value="' + i + '">' + esc((/^нові\s/.test(r.rate) ? 'нові / що використовувалися' : r.rate.replace(/\*/g, '') + ' ' + (r.unit || '').replace(/\*/g, '')).trim()) +
        ' — ' + esc(r.descr.slice(0, 90)) + '</option>').join('');
    } else {
      opt.disabled = true; if (sel.value === 'auto') sel.value = 'none';
    }
    excUi();
  }

  function applyRate(){
    const r = st.tariff; if (!r) return;
    const origin = $('cc-origin').value;
    const src = origin === 'full' ? r.rate_full : r.rate_pilg;
    const pr = parseRate(src);
    const info = $('cc-rate-info');
    let warn = '';
    if (origin === 'fta'){
      $('cc-duty').value = 0; $('cc-duty-spec').value = 0; $('cc-duty-min').checked = false; $('cc-duty-per').value = 1;
      warn = '<br><b>Угода про ЗВТ:</b> підставлено 0% — для більшості промислових товарів з ЄС мито скасоване, але для частини товарів діють квоти та перехідні ставки. Перевірте графік угоди і виправте ставку за потреби.';
    } else if (pr){
      $('cc-duty').value = pr.pct; $('cc-duty-spec').value = pr.spec; $('cc-duty-per').value = pr.per; $('cc-duty-min').checked = pr.min;
      if (pr.unit) $('cc-unit').value = pr.unit.replace(/^1\s*/, '');
    } else {
      warn = '<br>Ставку «' + esc(src) + '» не вдалося розібрати автоматично — введіть її вручну.';
    }
    if (!pr || !pr.unit){ const u = (r.unit || '').trim(); $('cc-unit').value = u && u !== '-' ? u : ($('cc-unit').value || 'шт'); }
    $('cc-qty-label').textContent = 'Кількість, ' + ($('cc-unit').value || 'од.');
    info.innerHTML = '<b>' + fmtCode(r.code) + '</b> · пільгова: <b>' + esc(rateLabel(r.rate_pilg)) + '</b> · повна: <b>' + esc(rateLabel(r.rate_full)) + '</b>' +
      (r.unit && r.unit !== '-' ? ' · дод. одиниця: ' + esc(r.unit) : '') + warn;
    info.style.display = 'block';
  }

  /* ---------------- публічна версія: заявка брокеру ---------------- */
  function renderLead(){
    const r = st.last, box = $('cc-send');
    const regions = (typeof REGIONS !== 'undefined' ? REGIONS : []).map(x => '<option>' + esc(x) + '</option>').join('');
    box.innerHTML =
      '<div style="border-top:.5px solid var(--border);padding-top:1.25rem;margin-top:.25rem">' +
      '<div style="font-family:var(--display);font-size:20px;font-weight:800;margin-bottom:.35rem">Отримати точний розрахунок та оформлення від брокера у вашій області</div>' +
      '<p class="text-sm text-muted" style="margin-bottom:1rem">Безкоштовна заявка: брокер перевірить дані авто, назве точну суму платежів і вартість оформлення. Ваш розрахунок додамо до заявки.</p>' +
      '<div class="field-row">' +
        '<div class="field"><label class="label" for="ld-name">Ваше ім\'я</label><input class="input" id="ld-name" autocomplete="name"></div>' +
        '<div class="field"><label class="label" for="ld-phone">Телефон</label><input class="input" id="ld-phone" type="tel" autocomplete="tel" placeholder="+380…"></div>' +
      '</div>' +
      '<div class="field"><label class="label" for="ld-region">Область, де плануєте розмитнення</label><select class="input" id="ld-region"><option value="">Оберіть область</option>' + regions + '</select></div>' +
      '<label class="check-row"><input type="checkbox" id="ld-ok" checked> Погоджуюсь з <a href="/terms#privacy" target="_blank">обробкою персональних даних</a></label>' +
      '<div class="msg" id="ld-msg"></div>' +
      '<button class="btn btn-primary btn-block" id="ld-btn" onclick="CustomsCalc.sendLead()"><i class="ti ti-send"></i>Отримати безкоштовний розрахунок</button>' +
      '</div>';
  }
  async function sendLead(){
    const m = $('ld-msg'), btn = $('ld-btn'), r = st.last;
    const show = (t, ok) => { m.className = 'msg show ' + (ok ? 'msg-ok' : 'msg-err'); m.textContent = t; };
    if (!$('ld-ok').checked) return show('Потрібна згода на обробку даних', false);
    const region = $('ld-region').value;
    const summary = [r.title + ': ' + r.subject, r.params.map(p => p[0] + ': ' + p[1]).join('; '),
      r.lines.map(l => l[0] + ' ' + money(l[2])).join(', '), 'Разом орієнтовно: ' + money(r.total),
      region ? 'Область: ' + region : '', 'Джерело: публічний калькулятор'].filter(Boolean).join('\n');
    btn.disabled = true; btn.textContent = 'Надсилаємо…';
    try{
      await createRequest({
        service: 'Розмитнення авто',
        comment: summary,
        car: { make: ($('cc-car-name').value || '').trim() || null, year: parseInt($('cc-year').value, 10) || null },
        contact: { name: $('ld-name').value, phone: $('ld-phone').value }
      });
      $('cc-send').innerHTML = '<div class="msg show msg-ok" style="font-size:15px">Дякуємо! Заявку отримано — брокер зателефонує вам найближчим часом. ' +
        'Тим часом можна переглянути <a href="' + (region && typeof regionSlug === 'function' && regionSlug(region) ? '/brokery/' + regionSlug(region) : '/') + '">брокерів у вашій області</a>.</div>';
      if (typeof gtag === 'function') gtag('event', 'calculator_lead', { region });
    }catch(e){ show(e.message, false); btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i>Отримати безкоштовний розрахунок'; }
  }

  /* ---------------- публічне API ---------------- */
  window.CustomsCalc = {
    mount(el, opts){
      st.broker = opts.broker || null;
      st.paid = !!opts.paid;
      st.public = !!opts.public;
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
    calc, shareFile, copy, sendLead, retry: preparePdf, group: onGroup, find, pick, applyRate, excUi,
    _state: st
  };
})();
