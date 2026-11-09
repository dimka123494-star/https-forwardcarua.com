#!/usr/bin/env python3
"""Генерує perevizhnyk.html — шаблон сторінок «Перевірка перевізника» (/perevirka-perevizhnyka)
і профілів /perevizhnyk/{ЄДРПОУ}. Профіль рендерить Netlify Edge (netlify/edge-functions/carrier-page.ts)
між маркерами <!--CP--> … <!--/CP-->; без нього сторінка дорендерюється в браузері.
Стилі, футер і тег аналітики беруться з rmpd.html. Запуск: python3 tools/carrier_page.py"""
import re, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = (ROOT / 'rmpd.html').read_text(encoding='utf-8')
STYLE = re.search(r'<style>.*?</style>', SRC, re.S).group(0)
FOOTER = re.search(r'<footer class="footer">.*?</footer>', SRC, re.S).group(0)
GTAG = re.search(r'<script async src="https://www.googletagmanager.com.*?</script>\s*<script>.*?</script>', SRC, re.S).group(0)

TITLE = 'Перевірка перевізника за ЄДРПОУ — ліцензія Укртрансбезпеки онлайн | МитнийБрокер'
DESC = ('Безкоштовна перевірка перевізника за кодом ЄДРПОУ або назвою: чи чинна ліцензія Укртрансбезпеки, чи включає міжнародні '
        'перевезення вантажів і небезпечні вантажі. 33 000+ перевізників України.')
FAQ = [
  ('Як перевірити перевізника перед рейсом?', 'Введіть код ЄДРПОУ або частину назви. Ми покажемо, чи є в перевізника чинна ліцензія Укртрансбезпеки і чи включає вона міжнародні перевезення вантажів та небезпечні вантажі.'),
  ('Звідки дані?', 'З відкритого ліцензійного реєстру Укртрансбезпеки. Реєстр оновлюється автоматично; дата останньої перевірки вказана в профілі.'),
  ('Чому для ФОП не видно імені?', 'Імʼя фізичної особи-підприємця — персональні дані, тому в профілі показуємо лише код і статус ліцензії.'),
  ('Це моя компанія — як змінити профіль?', 'На сторінці перевізника натисніть «Це моя компанія» і залиште контакти. Після перевірки додамо телефон, автопарк і напрямки, а компанія зможе отримувати вантажі з біржі ВантажПоруч.'),
]
LD = {"@context": "https://schema.org", "@graph": [
  {"@type": "WebApplication", "name": "Перевірка перевізника за ЄДРПОУ", "applicationCategory": "BusinessApplication",
   "url": "https://forwardcarua.com/perevirka-perevizhnyka", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "UAH"}},
  {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ]}]}

SEARCH = '''<section class="container-narrow" style="padding-top:1rem;padding-bottom:1.5rem" id="cpSearch">
    <h2 style="font-size:22px;margin:0 0 .75rem" id="cpSearchH">Перевірити перевізника</h2>
    <div class="row" style="gap:8px"><input class="input" id="cpQ" placeholder="Код ЄДРПОУ або назва компанії" autocomplete="off" inputmode="search" style="flex:1;min-width:0">
      <button class="btn btn-primary" type="button" id="cpGo"><i class="ti ti-search"></i>Знайти</button></div>
    <div id="cpRes" style="margin-top:1rem"></div>
  </section>'''

INTRO = '''<section class="container-narrow page-hero" style="padding-bottom:.5rem">
    <div class="crumbs"><a href="/">МитнийБрокер</a> › Перевірка перевізника</div>
    <h1 class="h-lg" style="font-size:clamp(28px,5vw,42px)">Перевірка перевізника<br><span style="color:var(--green)">за ЄДРПОУ або назвою</span></h1>
    <p class="lead">Чи чинна ліцензія Укртрансбезпеки, чи включає вона міжнародні перевезення вантажів і небезпечні вантажі — за даними відкритого реєстру. Безкоштовно, без реєстрації.</p>
    <div class="rm-trust"><span><i class="ti ti-database"></i>33 000+ перевізників</span><span><i class="ti ti-refresh"></i>Реєстр оновлюється автоматично</span><span><i class="ti ti-world"></i>Міжнародні й небезпечні вантажі</span></div>
  </section>'''

FAQ_HTML = '<section class="container-narrow seo" id="cpFaq"><h2>Питання й відповіді</h2>' + ''.join(
  '<div class="faq" onclick="this.classList.toggle(\'open\')"><div class="faq-q">' + q + ' <i class="ti ti-chevron-down"></i></div><div class="faq-a">' + a + '</div></div>' for q, a in FAQ) + '</section>'

EXTRA_CSS = '''<style>
.cp-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cp-stats>div{background:var(--surface);border:.5px solid var(--border);border-radius:var(--r-sm);padding:12px}
.cp-stats b{display:block;font:800 26px var(--display,inherit);color:var(--text)}
.cp-stats span{font-size:12px;color:var(--muted)}
.cp-item{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;margin-bottom:8px;text-decoration:none;color:inherit}
.cp-item .st{font-size:12px;white-space:nowrap}
#claimBox:empty{display:none}
</style>'''

SCRIPT = r'''<script src="/assets/js/config.js"></script>
<script src="/assets/js/db.js"></script>
<script src="/assets/js/company-check.js"></script>
<script type="module">
import { renderCarrier, prettyName, esc } from '/assets/js/carrier-render.mjs';
const $ = id => document.getElementById(id);
const code = (location.pathname.match(/^\/perevizhnyk\/(\d{8,10})\/?$/) || [])[1];
const rpc = async (fn, args) => { const sb = await sbReady(); const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };

function claimBox(){
  const box = $('claimBox'); if (!box) return;
  const st = box.dataset.state, broker = box.dataset.broker;
  if (st === 'claimed'){ box.closest('section').remove(); return; }  // контакти вже в картці «Контакти перевізника»
  if (st === 'pending'){
    box.innerHTML = '<h2 style="font-size:22px">Заявку на підтвердження отримано</h2><p style="margin-left:0">Ми звʼяжемося з компанією, щоб підтвердити, що заявку подав її представник. Зазвичай це займає до одного робочого дня.</p>';
    return;
  }
  box.innerHTML = '<h2 style="font-size:22px">Це ваша компанія?</h2>' +
    '<p style="margin-left:0">Підтвердьте профіль безкоштовно: додамо телефон, автопарк і напрямки, позначку «профіль підтверджено», а вантажі з біржі ВантажПоруч надходитимуть вам напряму.</p>' +
    '<form id="cpClaim"><div class="field-row"><div class="field"><label class="label">Ваше імʼя *</label><input class="input" name="name" required autocomplete="name"></div>' +
    '<div class="field"><label class="label">Посада</label><input class="input" name="position" placeholder="Директор, логіст…"></div></div>' +
    '<div class="field-row"><div class="field"><label class="label">Телефон *</label><input class="input" name="phone" type="tel" required autocomplete="tel"></div>' +
    '<div class="field"><label class="label">Email *</label><input class="input" name="email" type="email" required autocomplete="email"></div></div>' +
    '<div class="field"><label class="label">Автопарк і напрямки</label><textarea class="input" name="comment" placeholder="Напр.: 5 тентів 20 т, Україна — Польща, Німеччина"></textarea></div>' +
    '<label class="check-row"><input type="checkbox" name="ok" checked> Погоджуюсь з <a href="/terms#privacy" target="_blank">обробкою персональних даних</a></label>' +
    '<div class="msg" id="cpMsg"></div><button class="btn btn-primary" type="submit"><i class="ti ti-user-check"></i>Підтвердити профіль</button></form>' +
    '<p class="text-sm" style="margin:1rem 0 0;color:var(--muted)">Не хочете бути в каталозі? Напишіть на <a href="mailto:custom@forwardcarua.com?subject=Профіль перевізника ' + esc(box.dataset.code) + '">custom@forwardcarua.com</a>.</p>';
  $('cpClaim').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target, m = $('cpMsg'), b = f.querySelector('button'), v = n => f.elements[n].value.trim();
    const show = (t, ok) => { m.className = 'msg show ' + (ok ? 'msg-ok' : 'msg-err'); m.textContent = t; };
    if (!f.elements.ok.checked) return show('Потрібна згода на обробку даних', false);
    b.disabled = true; b.textContent = 'Надсилаємо…';
    try{
      await rpc('claim_carrier_profile', { p_edrpou: box.dataset.code, p_company: box.dataset.name, p_name: v('name'), p_position: v('position'),
        p_phone: v('phone'), p_email: v('email'), p_comment: v('comment') });
      f.innerHTML = '<div class="msg show msg-ok" style="font-size:15px">Дякуємо! Ми зателефонуємо, щоб підтвердити, що ви представляєте компанію, і оновимо профіль.</div>';
      try{ track('carrier_claim', { edrpou: box.dataset.code }); }catch(e){}
    }catch(e){
      const map = { bad_name: 'Вкажіть імʼя', bad_phone: 'Вкажіть коректний телефон', bad_email: 'Вкажіть коректний email', too_many: 'Заявку вже надіслано — ми звʼяжемося з вами' };
      const k = Object.keys(map).find(k => (e.message || '').includes(k));
      show(k ? map[k] : 'Не вдалося надіслати. Спробуйте ще раз або напишіть на custom@forwardcarua.com', false);
      b.disabled = false; b.innerHTML = '<i class="ti ti-user-check"></i>Підтвердити профіль';
    }
  });
}

async function search(){
  const q = $('cpQ').value.trim(), out = $('cpRes'); if (!q) return;
  if (/^\d{8,10}$/.test(q)){
    const r = await rpc('carrier_search', { q }).catch(() => []);
    if (r && r.length){ location.href = '/perevizhnyk/' + q; return; }
    out.innerHTML = '<div class="card"><b>' + esc(q) + '</b> — немає в ліцензійному реєстрі перевізників.' +
      (q.length === 8 ? '<p class="text-sm text-muted" style="margin:.5rem 0">Перевірте будь-яку компанію (відправника, клієнта) за Реєстром боржників і справами про банкрутство:</p>' +
        '<button class="btn btn-primary btn-sm" onclick="CompanyCheck.open(\'' + q + '\')"><i class="ti ti-shield-search"></i>Перевірити компанію · 50 грн</button>' : '') + '</div>';
    return;
  }
  if (q.length < 3){ out.innerHTML = '<p class="text-sm text-muted">Введіть щонайменше 3 літери назви або код ЄДРПОУ.</p>'; return; }
  out.innerHTML = '<p class="text-sm text-muted">Шукаємо…</p>';
  try{
    const list = await rpc('carrier_search', { q });
    try{ track('carrier_search', { q_len: q.length, found: list.length }); }catch(e){}
    out.innerHTML = list.length ? list.map(r => '<a class="card card-hover cp-item" href="/perevizhnyk/' + esc(r.code) + '"><div><div style="font-weight:600">' + esc(r.is_fop ? 'ФОП' : prettyName(r.name)) + '</div><div class="text-xs text-muted">ЄДРПОУ ' + esc(r.code) + '</div></div>' +
        '<span class="st" style="color:' + (r.status === 'Чинна' ? 'var(--green)' : 'var(--red)') + '">' + (r.status === 'Чинна' ? (r.intl_cargo ? '✓ міжнародні' : '✓ чинна') : 'немає ліцензії') + '</span></a>').join('') +
        (list.length === 20 ? '<p class="text-xs text-muted">Показано перші 20 — уточніть назву.</p>' : '')
      : '<p class="text-sm text-muted">Нічого не знайшли. Перевірте назву або введіть код ЄДРПОУ. ФОП шукайте лише за кодом.</p>';
  }catch(e){ out.innerHTML = '<p class="text-sm" style="color:var(--red)">Пошук тимчасово не працює — спробуйте пізніше.</p>'; }
}
$('cpGo').addEventListener('click', search);
$('cpQ').addEventListener('keydown', e => { if (e.key === 'Enter') search(); });

(async () => {
  if (!code){ return; }
  $('cpSearchH').textContent = 'Перевірити іншого перевізника';
  const main = $('cpMain');
  if (main.dataset.ssr !== '1'){
    try{
      const d = await rpc('carrier_public', { code });
      if (!d || !d.found){ main.innerHTML = '<section class="container-narrow page-hero"><h1 class="h-lg">Перевізника не знайдено</h1><p class="lead">Коду ' + esc(code) + ' немає в ліцензійному реєстрі. Перевірте код або знайдіть перевізника за назвою.</p></section>'; return; }
      const r = renderCarrier(d); main.innerHTML = r.html; document.title = r.title;
    }catch(e){ main.innerHTML = '<section class="container-narrow page-hero"><p class="lead">Не вдалося завантажити дані — оновіть сторінку.</p></section>'; return; }
  }
  claimBox();
})();
</script>'''

html = f'''<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{TITLE}</title>
<meta name="description" content="{DESC}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="https://forwardcarua.com/perevirka-perevizhnyka">
<meta name="theme-color" content="#0a0f0d">
<meta property="og:type" content="website">
<meta property="og:site_name" content="МитнийБрокер">
<meta property="og:locale" content="uk_UA">
<meta property="og:title" content="{TITLE.split(' | ')[0]}">
<meta property="og:description" content="{DESC}">
<meta property="og:url" content="https://forwardcarua.com/perevirka-perevizhnyka">
{GTAG}
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.7.0/dist/tabler-icons.min.css">
<link rel="stylesheet" href="/assets/css/app.css">
<script type="application/ld+json" id="cpLd">{json.dumps(LD, ensure_ascii=False)}</script>
{STYLE}
{EXTRA_CSS}
</head>
<body>
<nav class="nav">
  <a class="nav-brand" href="/">Митний<span>Брокер</span></a>
  <div class="nav-links"><a class="nav-link active" href="/perevirka-perevizhnyka">Перевірка перевізника</a><a class="nav-link" href="/rmpd">RMPD</a><a class="nav-link" href="/sent">SENT</a><a class="nav-link" href="/cmr-nakladna">CMR</a><a class="nav-link" href="/perevezennya">Біржа вантажів</a></div>
  <div class="nav-actions">
    <a class="btn btn-ghost btn-sm" href="/vhid?role=carrier&next=%2Fkabinet%23rmpd">Увійти</a>
    <button class="nav-burger" onclick="document.getElementById('menu').classList.toggle('open')" aria-label="Меню"><i class="ti ti-menu-2"></i></button>
  </div>
</nav>
<div class="mobile-menu" id="menu"><a href="/perevirka-perevizhnyka">Перевірка перевізника</a><a href="/rmpd">Заявка RMPD</a><a href="/sent">Доповнення SENT</a><a href="/cmr-nakladna">CMR-накладна</a><a href="/perevezennya">Біржа вантажів</a><a href="/vhid?role=carrier">Увійти в кабінет</a></div>

<div class="page">
  <main id="cpMain"><!--CP-->{INTRO}<!--/CP--></main>
  {SEARCH}
  <!--CPFAQ-->{FAQ_HTML}<!--/CPFAQ-->
</div>

{FOOTER}
{SCRIPT}
</body>
</html>
'''
(ROOT / 'perevizhnyk.html').write_text(html, encoding='utf-8')
print('ok perevizhnyk.html', len(html))
