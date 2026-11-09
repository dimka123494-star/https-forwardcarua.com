/* company-check.js — платна «Перевірка компанії» за ЄДРПОУ (Реєстр боржників + справи про банкрутство).
   Оплата — з балансу кабінету (RPC company_check, ціна в service_prices.company_check).
   CompanyCheck.open(code, name) — вікно з кнопкою оплати і звітом; CompanyCheck.mountHistory(el) — історія в кабінеті. */
const CompanyCheck = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const date = d => d ? new Date(d).toLocaleDateString('uk-UA') : '—';
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
      '<div class="modal-title">Перевірка компанії</div>' +
      '<div class="modal-sub">' + esc(name || '') + ' · ЄДРПОУ ' + esc(code) + '</div>' +
      '<ul class="text-sm" style="margin:0 0 1rem;padding-left:18px;line-height:1.7">' +
        '<li><b>Виконавчі провадження</b> — чи є компанія в Єдиному реєстрі боржників: кількість, категорії стягнень, хто стягувач і виконавець</li>' +
        '<li><b>Банкрутство</b> — справи про банкрутство та їхні етапи</li>' +
        '<li>Дані ЄДР і ліцензії перевізника, якщо є</li></ul>' +
      '<p class="text-xs text-muted" style="margin:0 0 1rem">Джерела — відкриті дані Мін’юсту та Державної судової адміністрації, оновлюються двічі на тиждень. Повторний перегляд цієї компанії протягом 30 днів — безкоштовно.</p>' +
      '<div class="msg" id="ccMsg"></div>' +
      '<button class="btn btn-primary btn-block" id="ccBtn" onclick="CompanyCheck.run(\'' + code + '\')"><i class="ti ti-shield-search"></i>Перевірити за ' + price + ' грн</button>';
  }

  async function run(code){
    const btn = document.getElementById('ccBtn'), m = document.getElementById('ccMsg');
    const fail = html => { m.className = 'msg show msg-err'; m.innerHTML = html; btn.disabled = false; btn.innerHTML = '<i class="ti ti-shield-search"></i>Перевірити за ' + price + ' грн'; };
    btn.disabled = true; btn.textContent = 'Перевіряємо…';
    let user = null; try{ user = await currentUser(); }catch(e){}
    if (!user) return fail('Перевірка оплачується з балансу кабінету. <a href="/vhid?next=' + encodeURIComponent(location.pathname + location.search) + '">Увійдіть або зареєструйтесь</a> — новим кабінетам нараховуємо вітальний бонус на баланс.');
    try{
      const sb = await sbReady();
      const { data, error } = await sb.rpc('company_check', { p_code: code });
      if (error) throw error;
      try{ track('company_check', { value: data.price, currency: 'UAH', repeat: data.repeat }); }catch(e){}
      document.getElementById('ccBody').innerHTML = report(data);
    }catch(e){
      const t = String(e.message || '');
      if (/no_cabinet/.test(t)) return fail('Перевірка оплачується з балансу кабінету брокера або перевізника. <a href="/vhid?role=carrier">Створіть кабінет</a> — це безкоштовно.');
      if (/balance/.test(t)) return fail('На балансі недостатньо коштів (потрібно ' + price + ' грн). <a href="#" onclick="CompanyCheck.topup();return false">Поповнити баланс</a> або <a href="/kabinet#rmpd">перейти в кабінет</a>.');
      if (/unavailable/.test(t)) return fail('Перевірка тимчасово недоступна — дані оновлюються. Спробуйте за кілька хвилин.');
      fail('Не вдалося виконати перевірку. Спробуйте ще раз.');
    }
  }
  async function topup(){
    const x = prompt('Сума поповнення, грн (від 200):', '200'); if (x === null) return;
    try{ await startTopup(Number(String(x).replace(/\s/g, '').replace(',', '.'))); }catch(e){ alert(e.message); }
  }

  function report(r){
    const e = r.erb, b = r.bankrupt || [];
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
          '<div class="text-xs text-muted">' + esc(i.type) + '<br>' + esc(i.court) + '</div></div>').join('')
      : ok('<b>Справ про банкрутство не знайдено</b>');
    const edr = r.edr ? '<div class="text-sm" style="margin-top:.5rem">Стан за ЄДР: <b>' + esc(r.edr.state || '—') + '</b>' + (r.edr.reg_date ? ' · зареєстровано ' + date(r.edr.reg_date) : '') + '</div>' : '';
    const lic = r.license ? '<div class="text-sm">Ліцензія Укртрансбезпеки: <b>' + esc(r.license.status) + '</b>' + (r.license.intl_cargo ? ', міжнародні перевезення' : '') + '</div>' : '';
    return '<div class="modal-title">Звіт перевірки</div>' +
      '<div class="modal-sub" style="margin-bottom:.75rem">' + esc(r.name || '') + ' · ЄДРПОУ ' + esc(r.code) + '</div>' + edr + lic +
      '<h3 style="font-size:16px;margin:1.25rem 0 .5rem">Виконавчі провадження</h3>' + erbBlock +
      '<h3 style="font-size:16px;margin:1.25rem 0 .5rem">Банкрутство</h3>' + bkBlock +
      '<p class="text-xs text-muted" style="margin:1.25rem 0 0">Перевірено ' + date(r.checked_at) + '. Дані — відкриті дані Мін’юсту (Єдиний реєстр боржників) і ДСА (справи про банкрутство) станом на ' + date(r.data_at) + '. ' +
        (r.price > 0 ? 'Списано ' + r.price + ' грн з балансу.' : 'Без оплати (повторний перегляд).') + ' Звіт збережено в кабінеті → «Перевірка компаній».</p>' +
      '<div class="row" style="gap:8px;margin-top:1rem"><button class="btn btn-ghost" onclick="window.print()"><i class="ti ti-printer"></i>Друк / PDF</button><button class="btn btn-ghost" onclick="CompanyCheck.close()">Закрити</button></div>';
  }

  async function mountHistory(el){
    if (!el) return;
    await loadPrice();
    el.innerHTML = '<div class="card" style="margin-bottom:1rem"><div class="field-row" style="align-items:flex-end"><div class="field" style="flex:1"><label class="label" for="ccCode">Код ЄДРПОУ компанії</label><input class="input" id="ccCode" inputmode="numeric" maxlength="8" placeholder="8 цифр"></div>' +
      '<div class="field" style="flex:0"><button class="btn btn-primary" onclick="CompanyCheck.open(document.getElementById(\'ccCode\').value)"><i class="ti ti-shield-search"></i>Перевірити · ' + price + ' грн</button></div></div>' +
      '<p class="hint" style="margin:0">Виконавчі провадження (Єдиний реєстр боржників) і справи про банкрутство — перед угодою з відправником, перевізником чи клієнтом.</p></div><div id="ccHist" class="text-sm text-muted">Завантаження…</div>';
    try{
      const sb = await sbReady();
      const { data } = await sb.from('company_checks').select('id, created_at, code, price, report').order('created_at', { ascending: false }).limit(50);
      const list = data || [];
      window.__ccHist = list;
      document.getElementById('ccHist').innerHTML = list.length ? list.map((c, i) => {
        const r = c.report || {}, flags = [r.erb ? '⚠️ боржник (' + r.erb.n + ' ВП)' : '✓ не боржник', (r.bankrupt || []).length ? '⚠️ банкрутство' : '✓ без банкрутства'];
        return '<div class="cargo-item" style="cursor:pointer" onclick="CompanyCheck.show(' + i + ')"><div class="spread" style="gap:10px;flex-wrap:wrap"><div><b>' + esc(r.name || c.code) + '</b> <span class="text-xs text-muted">ЄДРПОУ ' + esc(c.code) + '</span>' +
          '<div class="text-xs" style="margin-top:3px">' + flags.join(' · ') + '</div></div><div class="text-xs text-muted">' + date(c.created_at) + (Number(c.price) ? ' · ' + c.price + ' грн' : '') + '</div></div></div>';
      }).join('') : 'Перевірок ще не було.';
    }catch(e){ document.getElementById('ccHist').textContent = 'Не вдалося завантажити історію.'; }
  }
  function show(i){ const c = (window.__ccHist || [])[i]; if (!c) return; shell().classList.add('open'); document.getElementById('ccBody').innerHTML = report({ ...c.report, price: c.price }); }

  return { open, run, close, topup, mountHistory, show, report };
})();
