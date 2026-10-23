#!/usr/bin/env python3
"""Генератор статичних сторінок forwardcarua.com.

Запуск з кореня репозиторію:  python3 tools/build.py
Створює: index.html (з tools/index.src.html), brokery/{slug}/index.html,
dlya-brokeriv/index.html, statti/index.html, statti/{slug}/index.html, sitemap.xml
"""
import html, json, os, sys, datetime
sys.path.insert(0, os.path.dirname(__file__))
from regions import REGIONS
from content import ARTICLES, BROKERS_FAQ

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://forwardcarua.com'
TODAY = datetime.date.today().isoformat()
E = html.escape

def write(rel, text):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)

def jsonld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False) + '</script>'

def faq_ld(faq):
    return {"@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}

def crumbs_ld(items):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + u} for i, (n, u) in enumerate(items)]}

def faq_html(faq):
    return ''.join(
        '<div class="faq" onclick="this.classList.toggle(\'open\')"><div class="faq-q">' + E(q) +
        ' <i class="ti ti-chevron-down"></i></div><div class="faq-a">' + E(a) + '</div></div>' for q, a in faq)

def region_links(current=None):
    links = ''.join(
        '<a href="/brokery/%s"%s>%s</a>' % (r['slug'], ' class="on"' if r['slug'] == current else '',
                                         'Київ' if r['slug'] == 'kyiv' else r['name'] + ' область')
        for r in REGIONS)
    return ('<section class="seo container"><h2>Митні брокери за областями</h2>'
            '<div class="region-links">' + links + '</div></section>')

# ---------------------------------------------------------------- шаблон
SRC = open(os.path.join(ROOT, 'tools', 'index.src.html'), encoding='utf-8').read()

def head_part():
    """Спільна частина <head> з index: шрифти, іконки, css, gtag, favicon."""
    a = SRC.index('<script async src="https://www.googletagmanager.com')
    b = SRC.index('<script type="application/ld+json">')
    common = SRC[a:b]
    icons = SRC[SRC.index('<link rel="icon"'):SRC.index('</head>')]
    return common, icons

COMMON_HEAD, ICONS = head_part()
NAV = SRC[SRC.index('<nav class="nav">'):SRC.index('<!-- ========== КАТАЛОГ')]
FOOTER = SRC[SRC.index('<footer class="footer">'):SRC.index('</footer>') + len('</footer>')]
STATIC_CONTACTS = ('<a href="mailto:custom@forwardcarua.com">custom@forwardcarua.com</a>'
                   '<a href="tel:+380981722342">+38 098 172 23 42</a>'
                   '<a href="https://t.me/Dimakrykun95" target="_blank" rel="noopener">Telegram</a>'
                   '<span>Пн–Пт 9:00–18:00, Сб 10:00–15:00</span>')
STATIC_BOTTOM = ('© 2026 ТОВ «ФОРВАРД КАР ЮА» · ЄДРПОУ 45002097<br>'
                 '45400, Волинська обл., м. Нововолинськ, вул. Святого Володимира, 23, офіс 1')
STATIC_FOOTER = (FOOTER.replace('<div class="footer-links" id="footerContacts"></div>',
                                '<div class="footer-links">' + STATIC_CONTACTS + '</div>')
                       .replace('<div class="footer-bottom" id="footerBottom"></div>',
                                '<div class="footer-bottom">' + STATIC_BOTTOM + '</div>'))
# На статичних сторінках SPA-кнопки замінюємо звичайними посиланнями
STATIC_NAV = (NAV.replace('<button class="nav-brand" onclick="go(\'/\')">Митний<span>Брокер</span></button>',
                          '<a class="nav-brand" href="/">Митний<span>Брокер</span></a>')
                 .replace('<button class="nav-link active" id="navCatalog" onclick="go(\'/\')">Каталог</button>',
                          '<a class="nav-link" href="/">Каталог</a>')
                 .replace('<button class="nav-link" id="navPricing" onclick="go(\'/taryfy\')">Тарифи</button>',
                          '<a class="nav-link" href="/taryfy">Тарифи</a>')
                 .replace('<button onclick="go(\'/\');toggleMenu()">Каталог брокерів</button>',
                          '<a href="/">Каталог брокерів</a>')
                 .replace('<button onclick="go(\'/taryfy\');toggleMenu()">Тарифи для брокерів</button>',
                          '<a href="/taryfy">Тарифи для брокерів</a>'))
assert 'onclick="go(' not in STATIC_NAV, 'nav: SPA-кнопки не замінено'

def page(path, title, desc, body, ld_graph, active=None):
    nav = STATIC_NAV
    if active:
        nav = nav.replace('<a class="nav-link" href="%s">' % active, '<a class="nav-link active" href="%s">' % active)
    return ('<!DOCTYPE html>\n<html lang="uk">\n<head>\n<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
            '<title>' + E(title) + '</title>\n'
            '<meta name="description" content="' + E(desc) + '">\n'
            '<link rel="canonical" href="' + SITE + path + '">\n'
            '<meta name="theme-color" content="#0a0f0d">\n'
            '<meta property="og:type" content="article">\n<meta property="og:site_name" content="МитнийБрокер">\n'
            '<meta property="og:locale" content="uk_UA">\n'
            '<meta property="og:title" content="' + E(title) + '">\n'
            '<meta property="og:description" content="' + E(desc) + '">\n'
            '<meta property="og:url" content="' + SITE + path + '">\n'
            + COMMON_HEAD +
            jsonld({"@context": "https://schema.org", "@graph": ld_graph}) + '\n' + ICONS +
            '</head>\n<body>\n' + nav + '\n<div class="page">' + body + '</div>\n' + STATIC_FOOTER +
            '\n<script>function toggleMenu(){document.getElementById("menu").classList.toggle("open")}</script>\n'
            '</body>\n</html>\n')

# ---------------------------------------------------------------- головна
index = SRC.replace('<!--REGION-SEO-->', '').replace('<!--REGIONS-LINKS-->', region_links())
write('index.html', index)

# ---------------------------------------------------------------- області
SERVICES_CARDS = [
    ('ti-car', 'Розмитнення авто', 'Легкові авто з Європи: розрахунок платежів, декларація, випуск.'),
    ('ti-ship', 'Авто зі США', 'Авто з аукціонів Copart та IAAI, що прибувають у контейнерах.'),
    ('ti-file-certificate', 'Оцінка авто', 'Звіт про оцінку для митниці, банку, нотаріуса чи продажу.'),
    ('ti-packages', 'Митне оформлення вантажів', 'Імпорт і експорт товарів для бізнесу та ФОП.'),
]

def region_page(r):
    slug, loc, gen, name = r['slug'], r['loc'], r['gen'], r['name']
    city0 = 'Київ' if slug == 'kyiv' else r['cities'][0]
    is_city = slug == 'kyiv'
    places = 'райони' if is_city else 'міста'
    title = ('Митний брокер Київ — розмитнення авто | МитнийБрокер' if is_city
             else 'Митний брокер %s — %s область | МитнийБрокер' % (city0, name))
    desc = ('Митні брокери %s: %s. Розмитнення авто, авто зі США, оцінка, митне оформлення вантажів. '
            'Порівняйте послуги й ціни та залиште заявку онлайн.' % (loc, ', '.join(r['cities'][:3])))
    faq = [
        ('Скільки коштують послуги митного брокера %s?' % loc,
         'Ціну встановлює сам брокер. Вона залежить від типу авто чи вантажу, комплекту документів і терміновості. '
         'Ціни «від» видно в профілях, точну суму брокер назве після перегляду документів. Митні платежі — мито, '
         'акциз і ПДВ — сплачуються окремо в державний бюджет.'),
        ('Чи можна розмитнити авто, якщо я живу в іншому місті %s?' % gen if not is_city
         else 'Чи можна оформити розмитнення дистанційно?',
         'Так. Багато брокерів приймають документи онлайн і проводять оформлення на зручному митному посту, '
         'тож особисто приїжджати до офісу брокера зазвичай не потрібно.'),
        ('Як перевірити митного брокера?',
         'Перегляньте профіль, послуги, ціни та відгуки, попросіть письмовий договір і повний розрахунок витрат. '
         'Не вносьте повну передоплату без договору.'),
        ('Що робити, якщо в каталозі ще немає брокерів %s?' % gen,
         'Залиште загальну заявку — ми передамо її брокерам, які працюють з вашим регіоном, і вам зателефонують.'),
    ]
    front = ('<p>Через безпекову ситуацію багато брокерів %s працюють дистанційно: документи приймають онлайн, '
             'а оформлення проводять на митному посту в безпечнішому регіоні. Залиште заявку — брокер підкаже '
             'найшвидший і найбезпечніший варіант.</p>' % gen) if r.get('front') else ''
    note = ('<p>' + E(r['note']) + '</p>') if r['note'] else ''
    cards = ''.join('<div class="card"><i class="ti %s"></i><h3>%s</h3><p>%s</p></div>' % c for c in SERVICES_CARDS)
    seo = (
        '<section class="seo container"><div class="prose" style="max-width:820px">'
        '<h2>Митний брокер %s: як обрати і чим він допоможе</h2>' % loc + note + front +
        '<p>У каталозі МитнийБрокер зібрані митні брокери %s з переліком послуг, цінами «від» і відгуками клієнтів. '
        'Брокерів можна відфільтрувати за містом — %s та інші %s — і за послугою. '
        'Обирайте брокера в профілі або залиште одну заявку: брокер зв\'яжеться з вами сам.</p>'
        % (gen, ', '.join(r['cities']), places) +
        '</div>'
        '<h3>Які послуги найчастіше шукають %s</h3><div class="seo-grid">%s</div>' % (loc, cards) +
        '<div class="prose" style="max-width:820px"><h3>Як працює заявка</h3><ol>'
        '<li>Опишіть завдання: авто чи вантаж, послуга, терміновість.</li>'
        '<li>Оберіть конкретного брокера або залиште заявку для будь-якого вільного брокера регіону.</li>'
        '<li>Брокер зателефонує, назве вартість і перелік документів.</li></ol>'
        '<p>Перед співпрацею корисно прочитати, <a href="/statti/yak-obraty-mytnoho-brokera/">як обрати митного брокера</a> '
        'і <a href="/statti/vartist-posluh-mytnoho-brokera/">з чого складається вартість розмитнення</a>.</p></div>'
        '<div class="row" style="margin:1.25rem 0 2rem"><a class="btn btn-primary" href="/zayavka"><i class="ti ti-send"></i>Залишити заявку</a></div>'
        '<h3>Часті запитання</h3><div style="max-width:820px">' + faq_html(faq) + '</div>'
        '<div class="cta-band"><h3>Ви митний брокер %s?</h3>'
        '<p>Розмістіть профіль безкоштовно і отримуйте заявки від клієнтів свого регіону. Поки брокерів %s у каталозі небагато — '
        'ваш профіль побачать серед перших.</p>'
        '<div class="row"><a class="btn btn-primary" href="/vhid?role=broker"><i class="ti ti-user-plus"></i>Зареєструватись безкоштовно</a>'
        '<a class="btn btn-ghost" href="/dlya-brokeriv">Як це працює</a></div></div>'
        '</section>' % (loc, gen)
    )
    path = '/brokery/' + slug
    s = SRC
    def rep(a, b):
        nonlocal s
        assert s.count(a) == 1, a
        s = s.replace(a, b)
    rep(s[s.index('<title>'):s.index('</title>') + 8], '<title>' + E(title) + '</title>')
    rep(s[s.index('<meta name="description"'):s.index('>', s.index('<meta name="description"')) + 1],
        '<meta name="description" content="' + E(desc) + '">')
    rep('<link rel="canonical" href="https://forwardcarua.com/">', '<link rel="canonical" href="' + SITE + path + '">')
    rep('<meta property="og:title" content="Митний брокер — каталог перевірених брокерів України">',
        '<meta property="og:title" content="' + E(title.split(' | ')[0]) + '">')
    rep('<meta property="og:description" content="Оберіть митного брокера за областю та містом. Розмитнення авто, оцінка, договір купівлі-продажу.">',
        '<meta property="og:description" content="' + E(desc) + '">')
    rep('<meta property="og:url" content="https://forwardcarua.com/">', '<meta property="og:url" content="' + SITE + path + '">')
    rep('<h1 class="h-xl">Знайдіть митного<br><span>брокера</span> у своєму регіоні</h1>',
        '<div class="crumbs"><a href="/">Каталог</a> › Митні брокери ' + E(gen) + '</div>'
        '<h1 class="h-xl region-h1">Митний брокер<br><span>' + E(loc) + '</span></h1>')
    rep('<p class="hero-sub">Оберіть область і місто, порівняйте послуги та ціни, залиште заявку — брокер зв\'яжеться з вами напряму.</p>',
        '<p class="hero-sub">Порівняйте митних брокерів ' + E(gen) + ': послуги, ціни та відгуки. '
        'Залиште заявку — брокер зв\'яжеться з вами напряму.</p>')
    rep('<!--REGION-SEO-->', seo)
    rep('<!--REGIONS-LINKS-->', region_links(slug))
    # власний JSON-LD: організація + хлібні крихти + FAQ
    ld_start = s.index('<script type="application/ld+json">')
    ld_end = s.index('</script>', ld_start) + 9
    org = json.loads(s[ld_start + len('<script type="application/ld+json">'):ld_end - 9])
    org['@graph'].append(crumbs_ld([('Каталог', '/'), ('Митні брокери ' + gen, path)]))
    org['@graph'].append(faq_ld(faq))
    s = s[:ld_start] + jsonld(org) + s[ld_end:]
    rep('<script src="/assets/js/config.js"></script>',
        '<script>window.PAGE_REGION = ' + json.dumps(name, ensure_ascii=False) + ';</script>\n'
        '<script src="/assets/js/config.js"></script>')
    rep('</style>\n<link rel="icon"',
        '.region-h1{font-size:clamp(30px,6vw,60px);overflow-wrap:anywhere}\n'
        '.hero .crumbs{margin-bottom:1.25rem}\n</style>\n<link rel="icon"')
    write('brokery/%s.html' % slug, s)

for r in REGIONS:
    region_page(r)

# ---------------------------------------------------------------- для брокерів
def brokers_page():
    benefits = [
        ('ti-id-badge-2', 'Профіль у каталозі', 'Послуги, ціни «від», контакти, досвід і відгуки — все, що клієнт хоче побачити до дзвінка.'),
        ('ti-inbox', 'Заявки в кабінет', 'Клієнт описує авто чи вантаж, послугу й терміновість. Ви бачите заявку і телефонуєте йому.'),
        ('ti-percentage', 'Без комісії', 'Ми не беремо відсоток з угод. Ціну ви встановлюєте самі й домовляєтесь напряму.'),
        ('ti-map-pin', 'Сторінки областей', 'Клієнти знаходять вас за запитом «митний брокер + місто» на сторінці вашої області.'),
        ('ti-star', 'Рейтинг і відгуки', 'Відгуки клієнтів після заявок формують довіру й піднімають вас у списку.'),
        ('ti-calculator', 'Митний калькулятор + PDF', 'Рахуйте платежі за авто й надсилайте клієнту PDF з вашими контактами. На платних тарифах — будь-який товар за групами УКТ ЗЕД.'),
        ('ti-chart-bar', 'Статистика', 'На платних тарифах — перегляди профілю та динаміка заявок.'),
    ]
    who = ['Митні брокери та декларанти', 'Компанії з розмитнення авто «під ключ»',
           'Фахівці з доставки авто зі США та Європи', 'Оцінювачі та юристи з договорів купівлі-продажу авто']
    cards = ''.join('<div class="card"><i class="ti %s"></i><h3>%s</h3><p>%s</p></div>' % b for b in benefits)
    body = (
        '<section class="container page-hero"><div class="crumbs"><a href="/">Каталог</a> › Для брокерів</div>'
        '<h1 class="h-lg">Клієнти на розмитнення —<br><span style="color:var(--blue)">без комісії з угод</span></h1>'
        '<p class="lead">МитнийБрокер — каталог митних брокерів України. Клієнти знаходять вас за областю, містом і послугою '
        'та надсилають заявки прямо в кабінет. Базове розміщення — 0 грн, без картки.</p>'
        '<div class="row" style="margin-top:1.75rem"><a class="btn btn-primary" href="/vhid?role=broker" style="padding:13px 26px;font-size:15px">'
        '<i class="ti ti-user-plus"></i>Зареєструватись безкоштовно</a><a class="btn btn-ghost" href="/prezentatsiya" style="padding:13px 22px">Презентація</a>'
        '<a class="btn btn-ghost" href="/instruktsiya" style="padding:13px 22px">Інструкція</a></div>'
        '</section>'
        '<section class="seo container"><h2>Що ви отримуєте</h2><div class="seo-grid">' + cards + '</div></section>'
        '<section class="seo container"><div class="prose" style="max-width:820px">'
        '<h2>Як це працює</h2><ol>'
        '<li><strong>Реєстрація — 3 хвилини.</strong> Email, телефон, назва компанії, область.</li>'
        '<li><strong>Заповніть профіль.</strong> Додайте послуги з цінами «від», Telegram, досвід і кілька речень про себе.</li>'
        '<li><strong>Отримуйте заявки.</strong> Заявки з контактами клієнта приходять у кабінет — телефонуйте й домовляйтесь напряму.</li></ol>'
        '<h2>Кому підходить</h2><ul>' + ''.join('<li>' + E(w) + '</li>' for w in who) + '</ul>'
        '<h2>Чому варто зайти зараз</h2>'
        '<p>Каталог тільки наповнюється: у більшості областей поки один-два брокери або жодного. Хто розміститься першим, '
        'той і отримуватиме заявки свого регіону, поки конкуренція мінімальна. Ми просуваємо сторінки областей у пошуку Google — '
        'кожна з них веде на профілі брокерів цього регіону.</p>'
        '<h2>Тарифи</h2>'
        '<table><tr><th>Тариф</th><th>Ціна</th><th>Що дає</th></tr>'
        '<tr><td>Безкоштовний</td><td>0 грн</td><td>Профіль у своїй області, до 5 заявок на місяць, 3 послуги, калькулятор авто з PDF</td></tr>'
        '<tr><td>Стандарт</td><td>299 грн/міс</td><td>Показ по всій Україні, до 30 заявок, статистика, калькулятор УКТ ЗЕД</td></tr>'
        '<tr><td>Про</td><td>599 грн/міс</td><td>Без ліміту заявок, вища позиція, значок ТОП</td></tr>'
        '<tr><td>Преміум</td><td>999 грн/міс</td><td>Перша позиція, банер на головній, персональний менеджер</td></tr></table>'
        '<p>При оплаті за рік — знижка 20%. Підписка не поновлюється автоматично. <a href="/taryfy">Детальніше про тарифи</a>.</p>'
        '</div>'
        '<h3>Часті запитання</h3><div style="max-width:820px">' + faq_html(BROKERS_FAQ) + '</div>'
        '<div class="cta-band"><h3>Розмістіть профіль безкоштовно</h3>'
        '<p>Реєстрація займає кілька хвилин. Платіжна картка не потрібна.</p>'
        '<div class="row"><a class="btn btn-primary" href="/vhid?role=broker"><i class="ti ti-user-plus"></i>Зареєструватись</a>'
        '<a class="btn btn-ghost" href="/prezentatsiya">Презентація</a><a class="btn btn-ghost" href="/instruktsiya">Інструкція</a></div></div>'
        '</section>' + region_links()
    )
    ld = [crumbs_ld([('Каталог', '/'), ('Для брокерів', '/dlya-brokeriv')]), faq_ld(BROKERS_FAQ)]
    write('dlya-brokeriv.html',
          page('/dlya-brokeriv', 'Каталог митних брокерів: розмістіть профіль безкоштовно | МитнийБрокер',
               'Отримуйте заявки на розмитнення авто й вантажів без комісії. Безкоштовний профіль у каталозі митних брокерів України, сторінки областей, заявки в кабінет.',
               body, ld, active='/dlya-brokeriv'))

brokers_page()

# ---------------------------------------------------------------- статті
def articles():
    items = ''.join(
        '<a class="card card-hover" href="/statti/%s/"><span class="tag-sm">%s</span><h2>%s</h2><p>%s</p></a>'
        % (a['slug'], E(a['tag']), E(a['h1']), E(a['desc'])) for a in ARTICLES)
    body = ('<section class="container page-hero"><div class="crumbs"><a href="/">Каталог</a> › Статті</div>'
            '<h1 class="h-lg">Корисні статті</h1><p class="lead">Розмитнення авто, вибір митного брокера, вартість послуг — '
            'і поради для самих брокерів.</p></section>'
            '<section class="container" style="padding-bottom:2rem"><div class="post-list">' + items + '</div></section>')
    ld = [crumbs_ld([('Каталог', '/'), ('Статті', '/statti/')]),
          {"@type": "ItemList", "itemListElement": [
              {"@type": "ListItem", "position": i + 1, "url": SITE + '/statti/%s/' % a['slug'], "name": a['h1']}
              for i, a in enumerate(ARTICLES)]}]
    write('statti/index.html', page('/statti/', 'Статті про розмитнення авто та митних брокерів | МитнийБрокер',
          'Як обрати митного брокера, порядок розмитнення авто, з чого складається вартість, як брокеру знайти клієнтів.',
          body, ld, active='/statti/'))
    for a in ARTICLES:
        path = '/statti/%s/' % a['slug']
        others = ''.join('<li><a href="/statti/%s/">%s</a></li>' % (o['slug'], E(o['h1'])) for o in ARTICLES if o is not a)
        client_cta = ('' if a['tag'] == 'Брокерам' or 'cta-band' in a['body'] else
                      '<div class="cta-band"><h3>Знайдіть митного брокера у своїй області</h3>'
                      '<p>Порівняйте послуги та ціни або залиште одну заявку — брокер зв\'яжеться з вами сам.</p>'
                      '<div class="row"><a class="btn btn-primary" href="/zayavka"><i class="ti ti-send"></i>Залишити заявку</a>'
                      '<a class="btn btn-ghost" href="/">Каталог брокерів</a></div></div>')
        body = ('<article class="container-narrow page-hero"><div class="crumbs"><a href="/">Каталог</a> › '
                '<a href="/statti/">Статті</a></div>'
                '<h1 class="h-lg" style="font-size:clamp(26px,5vw,38px)">' + E(a['h1']) + '</h1>'
                '<p class="lead">' + E(a['lead']) + '</p>'
                '<div class="prose" style="margin-top:2rem">' + a['body'] + client_cta +
                '<h2>Часті запитання</h2></div>' + faq_html(a['faq']) +
                '<div class="prose" style="margin-top:2rem"><h3>Читайте також</h3><ul>' + others + '</ul></div>'
                '</article>' + region_links())
        ld = [crumbs_ld([('Каталог', '/'), ('Статті', '/statti/'), (a['h1'], path)]),
              {"@type": "Article", "headline": a['h1'], "description": a['desc'], "inLanguage": "uk-UA",
               "mainEntityOfPage": SITE + path, "datePublished": TODAY, "dateModified": TODAY,
               "author": {"@type": "Organization", "name": "МитнийБрокер", "url": SITE + '/'},
               "publisher": {"@type": "Organization", "name": "МитнийБрокер",
                             "logo": {"@type": "ImageObject", "url": SITE + '/apple-touch-icon.png'}},
               "image": SITE + '/og.png'},
              faq_ld(a['faq'])]
        write('statti/%s/index.html' % a['slug'], page(path, a['title'] + ' | МитнийБрокер', a['desc'], body, ld, active='/statti/'))

articles()

# ---------------------------------------------------------------- довідник областей для адмінки
write('assets/js/regions-loc.js', '/* Генерується tools/build.py */\nconst REGION_LOC = ' +
      json.dumps({r['name']: [r['slug'], r['loc']] for r in REGIONS}, ensure_ascii=False) + ';\n')

# ---------------------------------------------------------------- презентація та інструкція
from broker_docs import presentation, instruction
presentation(write, COMMON_HEAD, ICONS)
instruction(write, page, crumbs_ld)

# ---------------------------------------------------------------- sitemap
urls = [('/', '1.0'), ('/taryfy', '0.6'), ('/zayavka', '0.8'), ('/dlya-brokeriv', '0.9'), ('/prezentatsiya', '0.6'), ('/instruktsiya', '0.6'), ('/statti/', '0.6'), ('/terms', '0.3')]
urls += [('/brokery/' + r['slug'], '0.8') for r in REGIONS]
urls += [('/statti/%s/' % a['slug'], '0.7') for a in ARTICLES]
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      ''.join('  <url><loc>%s%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>\n' % (SITE, u, TODAY, p) for u, p in urls) +
      '</urlset>\n')
print('ok:', len(REGIONS), 'областей,', len(ARTICLES), 'статей')
