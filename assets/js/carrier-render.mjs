/* carrier-render.mjs — HTML профілю перевізника /perevizhnyk/{ЄДРПОУ}.
   Спільний для Netlify Edge (серверний рендер для Google і превʼю в месенджерах) і браузера (запасний рендер).
   Дані — з RPC carrier_public (ліцензійний реєстр + активність на платформі). */

const SITE = 'https://forwardcarua.com';
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const FORMS = [
  [/^(ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ|ТОВ|TOB|ТЗОВ|ТОВ\.)\s*/i, 'ТОВ'],
  [/^(ПРИВАТНЕ П[IІ]ДПРИЄМСТВО|ПП)\s*/i, 'ПП'],
  [/^(ДОЧ[IІ]РНЄ П[IІ]ДПРИЄМСТВО|ДП)\s*/i, 'ДП'],
  [/^(АКЦ[IІ]ОНЕРНЕ ТОВАРИСТВО|ПРИВАТНЕ АКЦ[IІ]ОНЕРНЕ ТОВАРИСТВО|ПРАТ|ПАТ|АТ)\s*/i, 'АТ'],
  [/^(ВИРОБНИЧО-КОМЕРЦ[IІ]ЙНА ФIРМА|ФIРМА|Ф[IІ]РМА)\s*/i, 'Фірма'],
  [/^(СЕЛЯНСЬКЕ \(ФЕРМЕРСЬКЕ\) ГОСПОДАРСТВО|ФЕРМЕРСЬКЕ ГОСПОДАРСТВО|ФГ)\s*/i, 'ФГ'],
  [/^(КОМУНАЛЬНЕ П[IІ]ДПРИЄМСТВО|КП)\s*/i, 'КП']
];
/** «TOB "СУПЕР ЕКСПРЕС"» → «ТОВ «СУПЕР ЕКСПРЕС»» */
export function prettyName(raw){
  let s = String(raw || '').replace(/\s+/g, ' ').trim().replace(/I(?=[А-ЯҐЄІЇа-яґєії])|(?<=[А-ЯҐЄІЇа-яґєії])I/g, 'І');
  let form = '';
  for (const [re, f] of FORMS){ if (re.test(s)){ form = f; s = s.replace(re, ''); break; } }
  s = s.replace(/^["“”«»'„]+|["“”«»'„]+$/g, '').replace(/["“”„]/g, '"').trim();
  if (!s) return form || String(raw || '');
  return form ? form + ' «' + s.replace(/"/g, '') + '»' : s;
}
const cap = s => String(s || '').toLowerCase().replace(/(^|[\s\-'’"])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const money = n => n == null ? '' : Number(n).toLocaleString('uk-UA', { maximumFractionDigits: 2 }) + ' грн';
const date = d => d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—';
const yes = (b, t, f) => b ? '<span style="color:var(--green)"><i class="ti ti-circle-check"></i> ' + t + '</span>' : '<span class="text-muted"><i class="ti ti-circle-x"></i> ' + f + '</span>';

/** Повертає { title, desc, canonical, index, h1, html, ld } */
export function renderCarrier(d){
  const code = esc(d.code), canonical = SITE + '/perevizhnyk/' + d.code;
  // ФОП, що підтвердив профіль, сам погодився на публікацію — показуємо назву з його кабінету
  const fopOpen = d.is_fop && d.state === 'claimed' && d.profile && d.profile.name;
  const name = d.is_fop ? (fopOpen ? d.profile.name : 'ФОП, код ' + d.code) : prettyName(d.name);
  const ok = d.status === 'Чинна';
  const intl = ok && d.intl_cargo;
  const title = d.is_fop && !fopOpen ? 'Перевізник ФОП — ліцензія, код ' + d.code + ' | МитнийБрокер'
    : name + ' — перевізник, ЄДРПОУ ' + d.code + (intl ? ', міжнародні перевезення' : '') + ' | МитнийБрокер';
  const desc = (d.is_fop && !fopOpen ? 'Перевізник ФОП' : name + ' (ЄДРПОУ ' + d.code + ')') + ': ' +
    (ok ? 'ліцензія Укртрансбезпеки чинна' + (d.intl_cargo ? ', включає міжнародні перевезення вантажів' : '') + (d.dangerous ? ' і небезпечні вантажі' : '') + '.'
        : 'чинної ліцензії в реєстрі не знайдено.') +
    (d.edr && d.edr.state && d.edr.state !== 'зареєстровано' ? ' Увага: за ЄДР — ' + d.edr.state + '.' : d.edr && d.edr.reg_date ? ' Зареєстровано ' + date(d.edr.reg_date) + (d.edr.heads && d.edr.heads[0] ? ', керівник — ' + cap(d.edr.heads[0].name) : '') + '.' : '') +
    ' Перевірка перевізника, активність на платформі МитнийБрокер і документи на рейс: RMPD, SENT, CMR.';
  const badge = ok
    ? '<span class="badge" style="background:rgba(45,217,143,.12);color:var(--green);border:.5px solid rgba(45,217,143,.35);padding:5px 12px;border-radius:20px;font-size:12px"><i class="ti ti-rosette-discount-check"></i> Ліцензія чинна</span>'
    : '<span class="badge" style="background:rgba(240,90,90,.12);color:var(--red);border:.5px solid rgba(240,90,90,.35);padding:5px 12px;border-radius:20px;font-size:12px"><i class="ti ti-alert-triangle"></i> Чинної ліцензії немає в реєстрі</span>';
  const claimedBadge = d.state === 'claimed' ? ' <span class="badge" style="background:rgba(59,130,246,.12);color:var(--blue);border:.5px solid rgba(59,130,246,.35);padding:5px 12px;border-radius:20px;font-size:12px"><i class="ti ti-user-check"></i> Профіль підтверджено</span>' : '';
  const lead = d.is_fop
    ? 'Перевізник — фізична особа-підприємець. Імʼя не показуємо: це персональні дані. Нижче — статус ліцензії за відкритим ліцензійним реєстром.'
    : ok ? 'Перевізник з ліцензією на автомобільні перевезення' + (d.intl_cargo ? ', що включає <b>міжнародні перевезення вантажів</b>' : '') + '. Дані — з відкритого ліцензійного реєстру Укртрансбезпеки, оновлюються автоматично.'
         : 'У ліцензійному реєстрі Укртрансбезпеки чинної ліцензії для цього коду немає. Перед співпрацею попросіть у перевізника підтвердження ліцензії.';
  const row = (k, v) => '<tr><td class="text-muted" style="padding:9px 12px 9px 0;width:44%;vertical-align:top">' + k + '</td><td style="padding:9px 0">' + v + '</td></tr>';
  const acts = Array.isArray(d.activities) && d.activities.length ? row('Види перевезень', esc(d.activities.join(', '))) : '';
  const activity = (d.rmpd_done || d.sent_done)
    ? '<div class="cp-stats"><div><b>' + (d.rmpd_done || 0) + '</b><span>заявок RMPD оформлено</span></div><div><b>' + (d.sent_done || 0) + '</b><span>заявок SENT</span></div></div>'
    : '<p class="text-sm text-muted" style="margin:0">Перевізник ще не оформлював документи на рейс через МитнийБрокер.</p>';
  const e = d.edr || null;
  const bad = e && e.state && e.state !== 'зареєстровано';
  let edr = '';
  if (e){
    const heads = (e.heads || []).map(h => esc(cap(h.name)) + (h.role && h.role !== 'керівник' ? ' <span class="text-muted">— ' + esc(h.role) + '</span>' : '')).join('<br>');
    const orgs = (e.founder_orgs || []).map(f => esc(prettyName(f.name)) + ' <span class="text-muted">(' + esc(f.code) + ')</span>').join('<br>');
    const others = (e.founders_total || 0) - (e.founder_orgs || []).length;
    const founders = e.founders_total ? (orgs ? orgs + (others > 0 ? '<br><span class="text-muted">і ще ' + others + ' фіз. ос.</span>' : '') : e.founders_total + ' ' + (e.founders_total === 1 ? 'фізична особа' : 'фіз. ос.')) : '';
    const taxes = (e.taxes || []).filter(t => !t.end).map(t => esc(t.type.replace(/^Реєстр платників податків.*/i, 'Платник податків').replace(/^Реєстр платників єдиного внеску.*/i, 'Платник ЄСВ').replace(/^Реєстр платників ПДВ.*/i, 'Платник ПДВ')) + (t.date ? ' з ' + date(t.date) : '')).join('<br>');
    edr = '<div class="card" style="margin-top:1rem"><h2 style="font-size:18px;margin:0 0 .5rem">Дані ЄДР</h2><table style="width:100%;font-size:14px;border-collapse:collapse">' +
      row('Стан', bad ? '<span style="color:var(--red)"><i class="ti ti-alert-triangle"></i> ' + esc(e.state) + '</span>' : '<span style="color:var(--green)">зареєстровано</span>') +
      (e.termination ? row('Припинення', esc(e.termination)) : '') + (e.bankruptcy ? row('Банкрутство', esc(e.bankruptcy)) : '') +
      (e.opf ? row('Форма', esc(e.opf.charAt(0) + e.opf.slice(1).toLowerCase())) : '') +
      (e.reg_date ? row('Дата реєстрації', date(e.reg_date)) : '') +
      (heads ? row('Керівник', heads) : '') +
      (e.capital ? row('Статутний капітал', money(e.capital)) : '') +
      (founders ? row('Засновники', founders) : '') +
      (e.branches ? row('Відокремлені підрозділи', e.branches) : '') +
      (taxes ? row('Податковий облік', taxes) : '') +
      row('Джерело', '<a href="https://data.gov.ua/dataset/a1799820-195b-4982-8141-6e84f58103e7" target="_blank" rel="noopener nofollow">Відкриті дані ЄДР, Мін’юст</a>' + (d.edr_at ? ' · ' + date(d.edr_at) : '')) +
      '</table></div>';
  }
  const pr = d.state === 'claimed' && d.profile ? d.profile : null;
  let contact = '';
  if (pr){
    const tel = String(pr.phone || '').replace(/[^\d+]/g, '');
    const tg = String(pr.telegram || '').replace(/^@|^https?:\/\/t\.me\//, '');
    const list = a => Array.isArray(a) && a.length ? esc(a.join(', ')) : '';
    contact = '<div class="card" style="margin-top:1rem;border-color:rgba(59,130,246,.35)"><h2 style="font-size:18px;margin:0 0 .5rem">Контакти перевізника</h2>' +
      '<p class="text-xs text-muted" style="margin:0 0 .75rem">Профіль підтверджено представником компанії.</p>' +
      '<table style="width:100%;font-size:14px;border-collapse:collapse">' +
      (pr.city || pr.region ? row('Місто', esc([pr.city, pr.region].filter(Boolean).join(', '))) : '') +
      (pr.fleet ? row('Автопарк', esc(pr.fleet) + ' авто') : '') +
      (list(pr.transport) ? row('Транспорт', list(pr.transport)) : '') +
      (list(pr.routes) ? row('Напрямки', list(pr.routes)) : '') +
      '</table>' + (pr.about ? '<p class="text-sm" style="margin:.75rem 0 0;white-space:pre-line">' + esc(pr.about) + '</p>' : '') +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:1rem">' +
        (tel ? '<a class="btn btn-primary" href="tel:' + esc(tel) + '" onclick="try{track(\'carrier_call\',{edrpou:\'' + code + '\'})}catch(e){}"><i class="ti ti-phone"></i>' + esc(pr.phone) + '</a>' : '') +
        (tg ? '<a class="btn btn-ghost" href="https://t.me/' + esc(tg) + '" target="_blank" rel="noopener"><i class="ti ti-brand-telegram"></i>Telegram</a>' : '') +
        '<a class="btn btn-ghost" href="/broker/' + esc(d.broker_id) + '"><i class="ti ti-truck"></i>Профіль на біржі</a>' +
        '<a class="btn btn-ghost" href="/perevezennya"><i class="ti ti-package"></i>Запропонувати вантаж</a>' +
      '</div></div>';
  }
  const html =
    '<section class="container-narrow page-hero" style="padding-bottom:1rem"><div class="crumbs"><a href="/">МитнийБрокер</a> › <a href="/perevirka-perevizhnyka">Перевірка перевізника</a> › ' + esc(d.is_fop && !fopOpen ? 'ФОП' : name) + '</div>' +
      badge + claimedBadge + (bad ? ' <span class="badge" style="background:rgba(240,90,90,.12);color:var(--red);border:.5px solid rgba(240,90,90,.35);padding:5px 12px;border-radius:20px;font-size:12px"><i class="ti ti-alert-triangle"></i> ЄДР: ' + esc(e.state) + '</span>' : '') +
      '<h1 class="h-lg" style="font-size:clamp(26px,5vw,40px);margin-top:1rem">' + esc(name) + '</h1>' +
      '<p class="lead">' + lead + '</p>' +
      contact +
      '<div class="card" style="margin-top:1rem"><table style="width:100%;font-size:14px;border-collapse:collapse">' +
        (d.is_fop ? '' : row('Назва в реєстрі', esc(d.name))) +
        row(d.is_fop ? 'Код (РНОКПП)' : 'Код ЄДРПОУ', code) +
        row('Ліцензія', ok ? '<span style="color:var(--green)">Чинна</span>' : '<span style="color:var(--red)">' + esc(d.status || 'немає') + '</span>') +
        row('Міжнародні перевезення вантажів', yes(intl, 'так', 'ні')) +
        row('Небезпечні вантажі', yes(ok && d.dangerous, 'так', 'ні')) +
        acts +
        (d.license_date ? row('Ліцензія з', date(d.license_date)) : '') +
        row('Перевірено', date(d.checked_at)) +
        row('Джерело', '<a href="https://www.dsbt.gov.ua/" target="_blank" rel="noopener nofollow">Ліцензійний реєстр Укртрансбезпеки</a>') +
      '</table></div>' +
      edr +
      (d.is_fop ? '' : '<div class="card" style="margin-top:1rem;border-color:rgba(245,166,35,.35)"><div class="spread" style="gap:12px;flex-wrap:wrap"><div style="flex:1;min-width:220px">' +
        '<h2 style="font-size:18px;margin:0 0 .35rem"><i class="ti ti-shield-search"></i> Боржник? Банкрутство? Суди?</h2>' +
        '<p class="text-sm text-muted" style="margin:0">Виконавчі провадження (Єдиний реєстр боржників), справи про банкрутство й судові справи — перед тим, як віддати вантаж.</p></div>' +
        '<button class="btn btn-primary" type="button" data-code="' + code + '" data-name="' + esc(name) + '" onclick="CompanyCheck.open(this.dataset.code, this.dataset.name)"><i class="ti ti-shield-search"></i>Перевірити · 50 грн</button></div></div>') +
      '<div class="card" style="margin-top:1rem"><h2 style="font-size:18px;margin:0 0 .75rem">Активність на МитнийБрокер</h2>' + activity + '</div>' +
    '</section>' +
    '<section class="container-narrow" style="padding-bottom:1rem"><div class="cta-band" id="claimBox" data-code="' + code + '" data-name="' + esc(d.is_fop ? '' : name) + '" data-state="' + esc(d.state || 'none') + '" data-broker="' + esc(d.broker_id || '') + '" style="text-align:left"></div></section>' +
    '<section class="container-narrow" style="padding-bottom:1rem"><div class="card">' +
      '<h2 style="font-size:20px;margin:0 0 .5rem">Документи на рейс у Польщу — за хвилини</h2>' +
      '<p class="text-sm text-muted" style="margin:0 0 1rem">Реєстрація перевезення RMPD, доповнення SENT, CMR-накладна й відрядження водія в одному кабінеті. Подаємо в PUESC за вас або готуємо дані, щоб подали самі.</p>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn btn-primary" href="/rmpd"><i class="ti ti-file-certificate"></i>Заявка RMPD</a><a class="btn btn-ghost" href="/sent">SENT</a><a class="btn btn-ghost" href="/cmr-nakladna">CMR</a><a class="btn btn-ghost" href="/vidryadzhennya-vodiya">Відрядження водія</a></div>' +
    '</div></section>';
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'МитнийБрокер', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Перевірка перевізника', item: SITE + '/perevirka-perevizhnyka' },
      { '@type': 'ListItem', position: 3, name: d.is_fop ? 'ФОП' : name, item: canonical }] }
  ].concat(d.is_fop ? [] : [Object.assign({ '@type': 'Organization', name, legalName: (d.edr && d.edr.name) || d.name, identifier: d.code, url: canonical },
      d.edr && d.edr.reg_date ? { foundingDate: d.edr.reg_date } : {},
      pr && pr.phone ? { telephone: pr.phone } : {}, pr && pr.city ? { address: { '@type': 'PostalAddress', addressLocality: pr.city, addressCountry: 'UA' } } : {})]) };
  return { title, desc, canonical, index: !d.is_fop || !!fopOpen, h1: name, html, ld };
}
