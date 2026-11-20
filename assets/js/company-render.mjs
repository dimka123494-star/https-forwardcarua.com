/* company-render.mjs — безкоштовна картка компанії /c/{ЄДРПОУ} (дані ЄДР).
   Спільний для Netlify Edge (company-page.ts: серверний рендер для Google і превʼю в месенджерах) і браузера.
   Дані — шард відкритого ЄДР з релізу edr-data (tools/edr_shards.py); expandEdr() розгортає короткі ключі
   у формат carrier_edr / edr_import.pick(), щоб звіт «Перевірка компанії» малювався однаково. */
import { prettyName, esc } from './carrier-render.mjs';
export { esc, prettyName };

const SITE = 'https://forwardcarua.com';
export const EDR_RELEASE = 'https://github.com/dimka123494-star/https-forwardcarua.com/releases/download/edr-data/';
export const EDR_SHARDS = 512;
export const edrShardUrl = code => EDR_RELEASE + 'edr-' + String(Number(code) % EDR_SHARDS).padStart(3, '0') + '.json.gz';

/** короткий запис шарду → { name, short_name, opf, state, reg_date, capital, heads, founders_total, founder_orgs, branches, termination, bankruptcy, taxes } */
export function expandEdr(c){
  if (!c) return null;
  return {
    name: c.n || null, short_name: c.sn || null, opf: c.o || null, state: c.s || null, reg_date: c.d || null,
    capital: c.c ?? null, heads: (c.h || []).map(name => ({ name, role: 'керівник' })),
    founders_total: c.fn || 0, founder_orgs: (c.fo || []).map(([name, code]) => ({ name, code })),
    branches: c.b || 0, termination: c.t || null, bankruptcy: c.bk || null,
    taxes: (c.x || []).map(([type, date, end]) => ({ type, date, end })),
  };
}

// prettyName знає лише поширені форми (ТОВ, ПП, АТ…); для решти («КОЛЕКТИВНЕ ПІДПРИЄМСТВО "…"») лишаємо назву як є
const quotesOk = s => (String(s).match(/"/g) || []).length % 2 === 0;
export const displayName = e => { const raw = String(e.short_name || e.name || '').replace(/\s+/g, ' ').trim(); const p = prettyName(raw); return quotesOk(p) ? p : raw; };
const cap = s => String(s || '').toLowerCase().replace(/(^|[\s\-'’"])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const money = n => n == null ? '' : Number(n).toLocaleString('uk-UA', { maximumFractionDigits: 2 }) + ' грн';
const date = d => d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—';
const years = d => { if (!d) return ''; const y = (Date.now() - new Date(d).getTime()) / 31557600000; return y >= 1 ? Math.floor(y) + ' ' + (Math.floor(y) % 10 === 1 && Math.floor(y) % 100 !== 11 ? 'рік' : [2, 3, 4].includes(Math.floor(y) % 10) && ![12, 13, 14].includes(Math.floor(y) % 100) ? 'роки' : 'років') : 'менше року'; };
const TAX = t => String(t || '').replace(/^Реєстр платників податків.*/i, 'Платник податків (взятий на облік у ДПС)')
  .replace(/^Реєстр платників єдиного внеску.*/i, 'Платник єдиного внеску (ЄСВ)').replace(/^Реєстр платників ПДВ.*/i, 'Платник ПДВ');

/** d = { code, found, edr, at } → { title, desc, canonical, index, html, ld } */
export function renderCompany(d){
  const code = esc(d.code), canonical = SITE + '/c/' + d.code, e = d.edr;
  const name = displayName(e);
  const st = String(e.state || '');
  const dead = /^(припинено|скасовано)/.test(st), warn = !dead && st !== 'зареєстровано';
  const head = (e.heads || [])[0];
  const title = name + ' — ЄДРПОУ ' + d.code + (dead ? ', припинено' : '') + ' | перевірка компанії';
  const desc = name + ' (ЄДРПОУ ' + d.code + '): ' + (dead ? 'за ЄДР — ' + st + '.' : (warn ? 'увага, за ЄДР — ' + st + '. ' : 'зареєстровано' + (e.reg_date ? ' ' + date(e.reg_date) : '') + '. ') +
    (head ? 'Керівник — ' + cap(head.name) + '. ' : '') + (e.capital ? 'Статутний капітал ' + money(e.capital) + '. ' : '')).trim() +
    ' Безкоштовно: дані ЄДР, санкції РНБО, реєстр боржників. Повний звіт — виконавчі провадження, банкрутство, суди.';
  const badge = dead
    ? '<span class="badge" style="background:rgba(240,90,90,.12);color:var(--red);border:.5px solid rgba(240,90,90,.35);padding:5px 12px;border-radius:20px;font-size:12px"><i class="ti ti-circle-x"></i> ' + esc(st) + '</span>'
    : warn ? '<span class="badge" style="background:rgba(245,166,35,.12);color:var(--amber);border:.5px solid rgba(245,166,35,.35);padding:5px 12px;border-radius:20px;font-size:12px"><i class="ti ti-alert-triangle"></i> ' + esc(st) + '</span>'
    : '<span class="badge" style="background:rgba(45,217,143,.12);color:var(--green);border:.5px solid rgba(45,217,143,.35);padding:5px 12px;border-radius:20px;font-size:12px"><i class="ti ti-circle-check"></i> Зареєстровано</span>';
  const row = (k, v) => '<tr><td class="text-muted" style="padding:9px 12px 9px 0;width:44%;vertical-align:top">' + k + '</td><td style="padding:9px 0">' + v + '</td></tr>';
  const orgs = (e.founder_orgs || []).map(f => '<a href="/c/' + esc(f.code) + '">' + esc(prettyName(f.name)) + '</a> <span class="text-muted">(' + esc(f.code) + ')</span>').join('<br>');
  const others = (e.founders_total || 0) - (e.founder_orgs || []).length;
  const founders = e.founders_total ? (orgs ? orgs + (others > 0 ? '<br><span class="text-muted">і ще ' + others + ' фіз. ос.</span>' : '') : e.founders_total + ' ' + (e.founders_total === 1 ? 'фізична особа' : 'фіз. ос.')) : '';
  const taxes = (e.taxes || []).filter(t => !t.end && t.type).map(t => esc(TAX(t.type)) + (t.date ? ' з ' + date(t.date) : '')).join('<br>');
  const table = '<table style="width:100%;font-size:14px;border-collapse:collapse">' +
    row('Повна назва', esc(e.name || '—')) +
    row('Код ЄДРПОУ', code) +
    row('Стан', dead ? '<span style="color:var(--red)">' + esc(st) + '</span>' : warn ? '<span style="color:var(--amber)"><i class="ti ti-alert-triangle"></i> ' + esc(st) + '</span>' : '<span style="color:var(--green)">зареєстровано</span>') +
    (e.termination ? row('Припинення', esc(e.termination)) : '') + (e.bankruptcy ? row('Банкрутство / санація', esc(e.bankruptcy)) : '') +
    (e.opf ? row('Організаційно-правова форма', esc(e.opf.charAt(0) + e.opf.slice(1).toLowerCase())) : '') +
    (e.reg_date ? row('Дата реєстрації', date(e.reg_date) + ' <span class="text-muted">(' + years(e.reg_date) + ')</span>') : '') +
    (head ? row('Керівник', (e.heads || []).map(h => esc(cap(h.name))).join('<br>')) : '') +
    (e.capital ? row('Статутний капітал', money(e.capital)) : '') +
    (founders ? row('Засновники', founders) : '') +
    (e.branches ? row('Відокремлені підрозділи', e.branches) : '') +
    (taxes ? row('Податковий облік', taxes) : '') +
    row('Платник ПДВ', '<span class="text-muted">ДПС закрила відкриті дані реєстру ПДВ — перевірте в </span><a href="https://cabinet.tax.gov.ua/" target="_blank" rel="noopener nofollow">Е-кабінеті ДПС</a><span class="text-muted"> (відкрита частина → «Реєстри»)</span>') +
    '</table>';
  const html =
    '<section class="container-narrow page-hero" style="padding-bottom:.5rem">' +
      '<div class="crumbs"><a href="/">МитнийБрокер</a> › <a href="/app#company">Перевірка компанії</a> › ' + code + '</div>' +
      '<h1 class="h-lg" style="font-size:clamp(24px,4.5vw,38px)">' + esc(name) + '</h1>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin:.75rem 0 0">' + badge + '<span class="badge" style="padding:5px 12px;border-radius:20px;font-size:12px;border:.5px solid var(--border)">ЄДРПОУ ' + code + '</span></div>' +
    '</section>' +
    '<section class="container-narrow" style="padding-top:1rem">' +
      '<div class="card"><h2 style="font-size:18px;margin:0 0 .5rem">Дані ЄДР</h2>' + table +
        '<p class="text-xs text-muted" style="margin:.75rem 0 0">Джерело — <a href="https://data.gov.ua/dataset/a1799820-195b-4982-8141-6e84f58103e7" target="_blank" rel="noopener nofollow">відкриті дані ЄДР</a>, Мін’юст' + (d.at ? ', станом на ' + date(d.at) : '') +
        '. Адреси, КВЕДи й контакти у відкритих даних не публікуються (воєнний стан).</p></div>' +
      '<h2 style="font-size:18px;margin:1.5rem 0 .5rem">Санкції та борги — безкоштовно</h2>' +
      '<div data-sanctions-code="' + code + '"></div><div data-erb-code="' + code + '"></div>' +
      '<div class="card" style="margin-top:1rem;border-color:rgba(245,166,35,.35)"><h2 style="font-size:18px;margin:0 0 .35rem">Повний звіт про компанію</h2>' +
        '<p class="text-sm text-muted" style="margin:0 0 .75rem">Виконавчі провадження з деталями, справи про банкрутство, судові справи й рішення, ліцензії, AEO. Повторний перегляд 30 днів — безкоштовно.</p>' +
        '<button class="btn btn-primary btn-block" type="button" onclick="CompanyCheck.open(\'' + code + '\',' + esc(JSON.stringify(name)) + ')"><i class="ti ti-shield-search"></i>Отримати звіт · 50 грн</button></div>' +
    '</section>';
  const ld = { '@context': 'https://schema.org', '@graph': [
    Object.assign({ '@type': 'Organization', name, legalName: e.name || name, identifier: d.code, url: canonical },
      e.reg_date ? { foundingDate: e.reg_date } : {}, dead && e.termination ? { dissolutionDate: (String(e.termination).match(/\d{2}\.\d{2}\.\d{4}/) || [''])[0].split('.').reverse().join('-') || undefined } : {}),
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'МитнийБрокер', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Перевірка компанії', item: SITE + '/app' },
      { '@type': 'ListItem', position: 3, name, item: canonical }] }] };
  return { title, desc, canonical, index: !dead, html, ld };
}

export function renderNotFound(code){
  return '<section class="container-narrow page-hero"><h1 class="h-lg">Компанію не знайдено</h1><p class="lead">Коду ЄДРПОУ ' + esc(code) +
    ' немає у відкритих даних ЄДР. Перевірте код — він має 8 цифр. Нові компанії зʼявляються протягом тижня після реєстрації.</p></section>';
}
