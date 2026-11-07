#!/usr/bin/env python3
"""Генерує лендинги послуг (/sent, /cmr-nakladna, /vidryadzhennya-vodiya) на основі rmpd.html:
бере звідти стилі, меню, футер і скрипти, підставляє власний вміст. Запуск: python3 tools/service_pages.py"""
import html, json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = (ROOT / 'rmpd.html').read_text(encoding='utf-8')
STYLE = re.search(r'<style>.*?</style>', SRC, re.S).group(0)
FOOTER = re.search(r'<footer class="footer">.*?</footer>', SRC, re.S).group(0)
GTAG = re.search(r'<script async src="https://www.googletagmanager.com.*?</script>\s*<script>.*?</script>', SRC, re.S).group(0)
E = html.escape

BONUS = ('<p class="text-sm" data-team="welcome_bonus" hidden style="margin-top:1rem;color:var(--green)"><i class="ti ti-gift"></i> '
         '<strong><span data-price="welcome_bonus">100</span> грн на перший документ</strong> — даруємо після реєстрації</p>')

PAGES = [
  dict(
    slug='sent', pane='sent', icon='ti-map-pin-check', nav='SENT',
    title='SENT для перевізника — доповнення заявки в PUESC за вас | МитнийБрокер',
    desc='Доповнення заявки SENT перевізником: номер SENT і ключ KD від польського партнера — решту підставимо з рейсу, перевіримо локатор GPS і внесемо в PUESC. Оператор — 450 грн, самостійно — 100 грн.',
    h1='Доповнення SENT для перевізника —<br><span style="color:var(--green)">без помилок у PUESC</span>',
    lead='Польський партнер створив заявку SENT і надіслав вам номер та ключ KD-…? Впишіть їх у кабінеті — дані перевізника, авто, локатора й рейсу підставимо самі, перевіримо формат за офіційною схемою PUESC і внесемо в систему за вас. Або візьміть готові дані й подайте самі.',
    cta='Доповнити SENT',
    trust=['<i class="ti ti-gps"></i>Номер локатора перевіряємо з контрольною цифрою', '<i class="ti ti-copy-check"></i>Дані з рейсу RMPD — одним натиском',
           '<i class="ti ti-coin"></i>Оплата лише за подану заявку', '<i class="ti ti-brand-telegram"></i>Статус у кабінеті й Telegram'],
    why_h='Що таке SENT і що робить перевізник',
    why='SENT — польська система контролю перевезень «чутливих» товарів: паливо, мастила, олії, алкоголь, тютюн, сухофрукти та інші. Заявку створює польська сторона — відправник або одержувач — і передає перевізнику номер SENT і ключ перевізника. Перевізник до початку руху Польщею доповнює її своїми даними: компанія, тягач і причіп, номер GPS-локатора, дати, пункт вʼїзду чи виїзду, документ перевезення.',
    facts=[('SENT + 14 цифр', 'номер заявки, який дає польський партнер, і ключ перевізника KD-…'),
           ('GPS увесь час', 'локатор має передавати геолокацію весь час руху Польщею — інакше штраф навіть при поданій заявці'),
           ('3 напрямки', 'ввезення з-поза ЄС або транзит (SENT-301), ввезення з ЄС (SENT-202), вивезення з Польщі (SENT-102)')],
    plans=[('👨‍💼 Подає оператор', 'sent', 450, 'за подану заявку', ['Вписуєте номер SENT і ключ — решту підставимо', 'Перевіряємо формат кожного поля за схемою PUESC', 'Вносимо дані в PUESC від імені перевізника', 'Сума заморожується й списується лише після подачі', 'Статус і уточнення — у кабінеті й Telegram'], 'plan_team'),
           ('🙋 Подаю сам', 'sent_self', 100, 'за перевірку й підготовку даних', ['Та сама форма й ті самі перевірки', 'Дані з польськими назвами полів PUESC — копіюєте одним дотиком', 'Покрокова інструкція до форми доповнення', 'Потрібен власний акаунт на puesc.gov.pl'], 'plan_self')],
    steps=[('Номер і ключ від партнера', 'Польський відправник чи одержувач надсилає вам номер SENT і ключ перевізника KD-…'),
           ('Форма в кабінеті', 'Впишіть номер і ключ. Авто, локатор, дати й пункт пропуску підставляться з вашого рейсу RMPD.'),
           ('Перевірка', 'Сервіс перевіряє формат номера, ключа й локатора (з контрольною цифрою) ще до подачі.'),
           ('Подача', 'Оператор вносить дані в PUESC, а ви отримуєте статус у кабінеті й Telegram.')],
    faq=[('Хто створює заявку SENT?', 'Польська сторона: відправник при вивезенні з Польщі або одержувач при ввезенні. Перевізник лише доповнює заявку своїми даними — за номером SENT і ключем перевізника, які отримує від партнера.'),
         ('Що робити, якщо партнер не дав ключ?', 'Без номера SENT і ключа KD-… доповнити заявку неможливо — попросіть їх у польського партнера. Він бачить їх у своїй заявці на PUESC. Партнер також може вписати дані перевізника сам.'),
         ('Навіщо перевірка номера локатора?', 'Номер GPS-локатора має контрольну цифру за офіційною специфікацією PUESC. Помилка в одному символі — і заявку з неробочим локатором не приймуть або оштрафують. Ми ловимо таку помилку до подачі.'),
         ('Коли списуються гроші?', 'Якщо подає оператор — сума заморожується при подачі заявки й списується лише після внесення в PUESC; при скасуванні повертається. У режимі «Подаю сам» оплата списується одразу.')],
  ),
  dict(
    slug='cmr-nakladna', pane='rmpd', icon='ti-file-text', nav='CMR',
    title='CMR-накладна онлайн — заповнена за хвилину, 3 примірники для друку | МитнийБрокер',
    desc='Заповнена міжнародна товарно-транспортна накладна CMR з даних рейсу: 24 графи, підписи українською, польською й англійською, 3 кольорові примірники, друк або PDF з телефона. 100 грн за документ.',
    h1='CMR-накладна онлайн —<br><span style="color:var(--green)">готова за хвилину</span>',
    lead='Сформуйте заповнену CMR з даних вашого рейсу: відправник, одержувач, перевізник, номери авто, місця завантаження й розвантаження, вантаж і вага підставляються самі. Допишіть упаковку — і друкуйте 3 кольорові примірники або зберігайте PDF прямо з телефона.',
    cta='Створити CMR',
    trust=['<i class="ti ti-forms"></i>Усі 24 графи за Конвенцією CMR', '<i class="ti ti-language"></i>Підписи граф UA / PL / EN',
           '<i class="ti ti-printer"></i>3 примірники: відправник, одержувач, перевізник', '<i class="ti ti-device-mobile"></i>Друк і PDF з iPhone'],
    why_h='Чому CMR краще заповнювати в сервісі',
    why='CMR — головний документ міжнародного перевезення вантажів, його перевіряють на кордоні й під час контролю на дорозі. Помилки в назвах сторін, номерах авто чи вазі створюють проблеми з митницею й страховиками. У сервісі дані беруться з рейсу, тож одні й ті самі назви та номери однакові в RMPD, SENT і CMR.',
    facts=[('24 графи', 'стандартний бланк міжнародної товарно-транспортної накладної'),
           ('3 примірники', 'для відправника, одержувача й перевізника — кольорові або чорно-білі'),
           ('0 грн', 'за правки вже створеної CMR — виправляйте скільки потрібно')],
    plans=[('📄 CMR з рейсу', 'cmr', 100, 'за документ', ['Дані підставляються з картки рейсу', 'До 4 позицій вантажу з підсумками', 'Оплата Frei / Unfrei, накладений платіж, документи', 'Друк на принтері або PDF з телефона', 'Правки безкоштовно'], 'plan_cmr')],
    steps=[('Рейс у кабінеті', 'Створіть заявку RMPD — або просто рейс із даними сторін, авто й маршруту.'),
           ('Кнопка «Створити CMR»', 'На картці рейсу натисніть «📄 Створити CMR» — форма вже заповнена.'),
           ('Допишіть деталі', 'Кількість місць, упаковка, обʼєм, додані документи, вказівки відправника.'),
           ('Друк або PDF', 'Готова накладна відкривається на 3 примірники — друкуйте чи зберігайте PDF.')],
    faq=[('Чи має така CMR юридичну силу?', 'Так, це стандартний бланк накладної за Конвенцією CMR. Юридичної сили документу надають підписи й печатки сторін на паперовому примірнику — графи 22–24.'),
         ('Скільки примірників друкувати?', 'Зазвичай три: для відправника, одержувача й перевізника. Можна вибрати 4 примірники або чорно-білий друк.'),
         ('Можна виправити CMR після створення?', 'Так, правки вже створеної CMR безкоштовні — відкрийте її з картки рейсу, змініть дані й надрукуйте знову.'),
         ('Як зберегти PDF на iPhone?', 'Натисніть «Друкувати / PDF», у вікні друку — «Поділитися» → «Зберегти у Файли».')],
  ),
  dict(
    slug='vidryadzhennya-vodiya', pane='deleg', icon='ti-id', nav='Відрядження водія',
    title='Відрядження водія в Польщу (Delegowanie) — бланк і дані за хвилину | МитнийБрокер',
    desc='Delegowanie для перевізників з України: офіційний бланк Potwierdzenie delegowania і дані для повідомлення PIP на biznes.gov.pl. Потрібне навіть для двосторонніх рейсів. Штраф без нього — до 7 000 zł.',
    h1='Відрядження водія в Польщу —<br><span style="color:var(--green)">бланк і дані без помилок</span>',
    lead='Перевізники з України мають повідомляти інспекцію праці Польщі (PIP) про кожне відрядження водія — навіть на двосторонні рейси — і мати в кабіні підписаний бланк Potwierdzenie delegowania. Заповніть дані водія один раз: офіційний бланк сформуємо одразу, а дані для повідомлення на biznes.gov.pl дамо в порядку полів майстра.',
    cta='Оформити відрядження',
    trust=['<i class="ti ti-file-certificate"></i>Офіційний бланк Dz.U. 2023 poz. 1638', '<i class="ti ti-language"></i>Латиниця й формати — автоматично',
           '<i class="ti ti-users"></i>Водії запамʼятовуються', '<i class="ti ti-repeat"></i>Наступний період — одним натиском'],
    why_h='Коли потрібне відрядження водія',
    why='Закон Польщі про відрядження водіїв від 28 липня 2023 року для перевізників з третіх країн, зокрема з України, вимагає повідомляти PIP про кожне відрядження: при двосторонніх перевезеннях (Україна ↔ Польща), cross-trade і каботажі. Не потрібно лише для транзиту без завантаження й розвантаження в Польщі. Повідомлення подається онлайн на biznes.gov.pl не пізніше початку відрядження, а в кабіні водій має мати паперовий бланк, підписаний перевізником і водієм, разом із CMR і записами тахографа.',
    facts=[('500 zł', 'штраф водію, якщо під час контролю немає бланка Potwierdzenie delegowania'),
           ('4 000–7 000 zł', 'штраф перевізнику за кожне порушення правил відрядження'),
           ('до початку', 'повідомлення PIP подається не пізніше моменту початку відрядження')],
    plans=[('👨‍💼 Подає оператор', 'deleg', 250, 'за подане повідомлення', ['Подаємо повідомлення до PIP за довіреністю', 'Готовий бланк для водія — одразу', 'Довіреність формується автоматично, безстрокова', 'Оплата — лише після подачі'], 'plan_team'),
           ('🙋 Подаю сам', 'deleg_self', 100, 'за бланк і дані', ['Офіційний бланк Potwierdzenie — 15 граф PL/EN', 'Дані в порядку майстра biznes.gov.pl — копіюєте одним дотиком', 'Інструкція: вхід через e-mail і кваліфікований підпис', 'Водії й контактна особа запамʼятовуються'], 'plan_self')],
    steps=[('Дані водія', 'Імʼя, адреса, номер посвідчення й дата трудового договору — вводяться один раз.'),
           ('Період і авто', 'Дати відрядження й тягач — або підставте з рейсу RMPD.'),
           ('Бланк для водія', 'Офіційний Potwierdzenie delegowania готовий одразу — друкуйте й підписуйте.'),
           ('Повідомлення PIP', 'Подаєте на biznes.gov.pl за готовими даними — або подамо ми.')],
    faq=[('Чи потрібне відрядження для рейсу Україна — Польща?', 'Так. Для перевізників з третіх країн, зокрема з України, двосторонні перевезення теж підпадають під правила відрядження. Не потрібно лише для транзиту Польщею без завантаження й розвантаження.'),
         ('Що має бути в кабіні?', 'Паперовий бланк Potwierdzenie delegowania за офіційним зразком, підписаний перевізником і водієм; документи перевезення (CMR або дозвіл); записи тахографа.'),
         ('Як подати повідомлення без польського профілю?', 'На biznes.gov.pl можна зареєструватися через e-mail і підписати повідомлення кваліфікованим електронним підписом. Інструкцію з налаштуваннями дамо в кабінеті.'),
         ('Водій продовжує роботу в Польщі — що робити?', 'Оформіть наступний період: кнопка «Наступний період» підставить усі дані водія й авто, лишиться змінити дати.')],
  ),
]

def page(p):
    url = 'https://forwardcarua.com/' + p['slug']
    nxt = '%2Fkabinet%23' + p['pane']
    href = '/vhid?role=carrier&next=' + nxt
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "Service", "name": re.sub('<[^>]+>', '', p['h1']).replace('—', '').strip(), "areaServed": ["UA", "PL"],
         "provider": {"@type": "Organization", "name": "ТОВ «ФОРВАРД КАР ЮА»", "url": "https://forwardcarua.com/"},
         "offers": [{"@type": "Offer", "name": pl[0].split(' ', 1)[1], "price": str(pl[2]), "priceCurrency": "UAH"} for pl in p['plans']]},
        {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p['faq']]},
        {"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "МитнийБрокер", "item": "https://forwardcarua.com/"},
                                                         {"@type": "ListItem", "position": 2, "name": p['nav'], "item": url}]}]}
    plans = ''.join(
        '<div class="card rm-plan' + (' best' if i == 0 and len(p['plans']) > 1 else '') + '"' + (' data-team="' + code + '" hidden' if code == 'deleg' else '') + '>' +
        ('<span class="tag">Найпопулярніше</span>' if i == 0 and len(p['plans']) > 1 else '') +
        '<div style="font-weight:600;font-size:17px">' + E(name) + '</div><div class="price"><span data-price="' + code + '">' + str(price) + '</span> грн</div>' +
        '<div class="text-sm text-muted">' + E(unit) + '</div><ul>' + ''.join('<li>' + E(x) + '</li>' for x in items) + '</ul>' +
        '<a class="btn ' + ('btn-primary' if i == 0 else 'btn-ghost') + ' btn-block rm-cta" data-cta="' + cta + '" href="' + href + '">' + E(p['cta']) + '</a></div>'
        for i, (name, code, price, unit, items, cta) in enumerate(p['plans']))
    others = [x for x in [('/rmpd', 'ti-file-certificate', 'Заявка RMPD', 'Реєстрація перевезення Польщею — подаємо за вас.'),
                          ('/sent', 'ti-map-pin-check', 'Доповнення SENT', 'Номер SENT і ключ — решту підставимо з рейсу.'),
                          ('/cmr-nakladna', 'ti-file-text', 'CMR-накладна', 'Заповнена CMR з рейсу на 3 примірники.'),
                          ('/vidryadzhennya-vodiya', 'ti-id', 'Відрядження водія', 'Бланк Potwierdzenie і дані для PIP.')] if x[0] != '/' + p['slug']]
    return f'''<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{E(p['title'])}</title>
<meta name="description" content="{E(p['desc'])}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#0a0f0d">
<meta property="og:type" content="website">
<meta property="og:site_name" content="МитнийБрокер">
<meta property="og:locale" content="uk_UA">
<meta property="og:title" content="{E(p['title'].split(' | ')[0])}">
<meta property="og:description" content="{E(p['desc'])}">
<meta property="og:url" content="{url}">
{GTAG}
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.7.0/dist/tabler-icons.min.css">
<link rel="stylesheet" href="/assets/css/app.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
{STYLE}
</head>
<body>
<nav class="nav">
  <a class="nav-brand" href="/">Митний<span>Брокер</span></a>
  <div class="nav-links"><a class="nav-link" href="/rmpd">RMPD</a><a class="nav-link{' active' if p['slug']=='sent' else ''}" href="/sent">SENT</a><a class="nav-link{' active' if p['slug']=='cmr-nakladna' else ''}" href="/cmr-nakladna">CMR</a><a class="nav-link{' active' if p['slug']=='vidryadzhennya-vodiya' else ''}" href="/vidryadzhennya-vodiya">Відрядження водія</a><a class="nav-link" href="/perevezennya">Біржа вантажів</a></div>
  <div class="nav-actions">
    <a class="btn btn-ghost btn-sm" id="loginBtn" href="/vhid?next={nxt}">Увійти</a>
    <a class="btn btn-primary btn-sm rm-cta" data-cta="nav" href="{href}">{E(p['cta'])}</a>
    <button class="nav-burger" onclick="toggleMenu()" aria-label="Меню"><i class="ti ti-menu-2"></i></button>
  </div>
</nav>
<div class="mobile-menu" id="menu"><a href="/rmpd">Заявка RMPD</a><a href="/sent">Доповнення SENT</a><a href="/cmr-nakladna">CMR-накладна</a><a href="/vidryadzhennya-vodiya">Відрядження водія</a><a href="/perevezennya">Біржа вантажів</a><a href="/vhid?next={nxt}" id="menuAuth">Увійти в кабінет</a></div>

<div class="page">
  <section class="container rm-hero">
    <div class="crumbs"><a href="/">МитнийБрокер</a> › {E(p['nav'])}</div>
    <h1 class="h-lg">{p['h1']}</h1>
    <p class="lead" style="font-size:17px;color:var(--muted-strong);max-width:660px;line-height:1.7;margin-top:1rem">{E(p['lead'])}</p>
    <div class="row" style="margin-top:1.75rem">
      <a class="btn btn-primary rm-cta" data-cta="hero" href="{href}" style="padding:13px 26px;font-size:15px"><i class="ti {p['icon']}"></i>{E(p['cta'])}</a>
      <a class="btn btn-ghost" href="#yak" style="padding:13px 22px">Як це працює</a>
    </div>
    {BONUS}
    <div class="rm-trust">{''.join('<span>' + t + '</span>' for t in p['trust'])}</div>
  </section>

  <section class="container seo">
    <h2>{E(p['why_h'])}</h2>
    <p class="text-sm text-muted" style="max-width:760px;line-height:1.7">{E(p['why'])}</p>
    <div class="rm-fine">{''.join('<div class="card"><b>' + E(a) + '</b><p class="text-sm text-muted">' + E(b) + '</p></div>' for a, b in p['facts'])}</div>
  </section>

  <section class="container seo" id="tsiny">
    <h2>Ціна</h2>
    <div class="rm-plans">{plans}</div>
    <p class="text-xs text-muted">Оплата з балансу кабінету: карткою від 200 грн (зараховується одразу) або рахунком для ТОВ / ФОП. Без абонплати. Баланс спільний для RMPD, SENT, CMR і відрядження.</p>
  </section>

  <section class="container seo" id="yak">
    <h2>Як це працює</h2>
    <div class="rm-steps">{''.join('<div class="card"><h3>' + E(a) + '</h3><p>' + E(b) + '</p></div>' for a, b in p['steps'])}</div>
  </section>

  <section class="container seo">
    <h2>Питання й відповіді</h2>
    {''.join('<div class="faq" onclick="this.classList.toggle(' + "'open'" + ')"><div class="faq-q">' + E(q) + ' <i class="ti ti-chevron-down"></i></div><div class="faq-a">' + E(a) + '</div></div>' for q, a in p['faq'])}
  </section>

  <section class="container seo">
    <div class="cta-band"><h3>{E(p['cta'])} — у кабінеті за кілька хвилин</h3><p>Реєстрація займає хвилину. Дані перевізника, авто й водіїв запамʼятовуються для наступних рейсів.</p>
      <div class="row"><a class="btn btn-primary rm-cta" data-cta="band" href="{href}"><i class="ti {p['icon']}"></i>{E(p['cta'])}</a><a class="btn btn-ghost" href="tel:+380931104662"><i class="ti ti-phone"></i>+38 093 110 46 62</a></div>
    </div>
    <h2 style="font-size:22px">Інші документи для перевізників</h2>
    <div class="rm-more">{''.join('<a class="card" href="' + u + '"><i class="ti ' + ic + '"></i><strong>' + E(t) + '</strong><p class="text-sm text-muted">' + E(d) + '</p></a>' for u, ic, t, d in others)}</div>
  </section>
</div>

<a class="btn btn-primary rm-sticky rm-cta" data-cta="sticky" href="{href}"><i class="ti {p['icon']}"></i>{E(p['cta'])}</a>

{FOOTER}
<script src="/assets/js/config.js"></script>
<script src="/assets/js/db.js"></script>
<script>
function toggleMenu(){{ document.getElementById('menu').classList.toggle('open'); }}
document.querySelectorAll('.rm-cta').forEach(a => a.addEventListener('click', () => {{ try {{ track('{p['slug'].replace('-', '_')}_landing_cta', {{ place: a.dataset.cta }}); }} catch(e){{}} }}));
(async () => {{
  try {{
    const prices = await servicePrices();
    prices.forEach(p => document.querySelectorAll('[data-price="' + p.code + '"]').forEach(e => {{ e.textContent = Number(p.price).toLocaleString('uk-UA'); }}));
    prices.forEach(p => document.querySelectorAll('[data-team="' + p.code + '"]').forEach(e => {{ e.hidden = !p.active; }}));
  }} catch(e){{}}
  try {{
    const u = await currentUser(); if (!u) return;
    document.querySelectorAll('.rm-cta').forEach(a => {{ a.href = '/kabinet#{p['pane']}'; }});
    document.querySelectorAll('[data-team="welcome_bonus"]').forEach(e => {{ e.hidden = true; }});
    const b = document.getElementById('loginBtn'); if (b){{ b.textContent = 'Кабінет'; b.href = '/kabinet#{p['pane']}'; }}
    const m = document.getElementById('menuAuth'); if (m){{ m.textContent = 'Мій кабінет'; m.href = '/kabinet#{p['pane']}'; }}
  }} catch(e){{}}
}})();
</script>
</body>
</html>
'''

for p in PAGES:
    (ROOT / (p['slug'] + '.html')).write_text(page(p), encoding='utf-8')
    print('ok', p['slug'])
