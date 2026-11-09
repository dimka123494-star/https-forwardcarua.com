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
const date = d => d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—';
const yes = (b, t, f) => b ? '<span style="color:var(--green)"><i class="ti ti-circle-check"></i> ' + t + '</span>' : '<span class="text-muted"><i class="ti ti-circle-x"></i> ' + f + '</span>';

/** Повертає { title, desc, canonical, index, h1, html, ld } */
export function renderCarrier(d){
  const code = esc(d.code), canonical = SITE + '/perevizhnyk/' + d.code;
  const name = d.is_fop ? 'ФОП, код ' + d.code : prettyName(d.name);
  const ok = d.status === 'Чинна';
  const intl = ok && d.intl_cargo;
  const title = d.is_fop ? 'Перевізник ФОП — ліцензія, код ' + d.code + ' | МитнийБрокер'
    : name + ' — перевізник, ЄДРПОУ ' + d.code + (intl ? ', міжнародні перевезення' : '') + ' | МитнийБрокер';
  const desc = (d.is_fop ? 'Перевізник ФОП' : name + ' (ЄДРПОУ ' + d.code + ')') + ': ' +
    (ok ? 'ліцензія Укртрансбезпеки чинна' + (d.intl_cargo ? ', включає міжнародні перевезення вантажів' : '') + (d.dangerous ? ' і небезпечні вантажі' : '') + '.'
        : 'чинної ліцензії в реєстрі не знайдено.') +
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
  const html =
    '<section class="container-narrow page-hero" style="padding-bottom:1rem"><div class="crumbs"><a href="/">МитнийБрокер</a> › <a href="/perevirka-perevizhnyka">Перевірка перевізника</a> › ' + esc(d.is_fop ? 'ФОП' : name) + '</div>' +
      badge + claimedBadge +
      '<h1 class="h-lg" style="font-size:clamp(26px,5vw,40px);margin-top:1rem">' + esc(name) + '</h1>' +
      '<p class="lead">' + lead + '</p>' +
      '<div class="card" style="margin-top:1.5rem"><table style="width:100%;font-size:14px;border-collapse:collapse">' +
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
  ].concat(d.is_fop ? [] : [{ '@type': 'Organization', name, legalName: d.name, identifier: d.code, url: canonical }]) };
  return { title, desc, canonical, index: !d.is_fop, h1: name, html, ld };
}
