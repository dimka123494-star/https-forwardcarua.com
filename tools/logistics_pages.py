# Біржа «ВантажПоруч» (перевізники, логісти, вантажі, транспорт) і карта пунктів пропуску.
# Виконується з build.py (exec), тому бачить page(), write(), E, SITE, faq_html, STATIC_NAV тощо.

BRAND = 'ВантажПоруч'

def freight_nav(active=''):
    links = [('/perevezennya', 'Головна'), ('/vantazhi', 'Вантажі'), ('/transport', 'Транспорт'), ('/perevizhnyky', 'Перевізники'),
             ('/punkty-propusku', 'Пункти пропуску'), ('/dlya-vantazhovlasnykiv', 'Вантажовласникам'), ('/dlya-perevizhnykiv', 'Перевізникам')]
    a = ''.join('<a class="nav-link%s" href="%s">%s</a>' % (' active' if h == active else '', h, t) for h, t in links)
    m = ''.join('<a href="%s">%s</a>' % (h, t) for h, t in links)
    return ('<nav class="nav">\n  <a class="nav-brand" href="/perevezennya">Вантаж<span>Поруч</span></a>\n'
            '  <div class="nav-links">' + a + '</div>\n'
            '  <div class="nav-actions">\n    <a class="btn btn-ghost btn-sm" id="loginBtn" href="/vhid">Увійти</a>\n'
            '    <a class="btn btn-primary btn-sm" href="/perevezennya#cargoForm"><i class="ti ti-plus"></i>Додати вантаж</a>\n'
            '    <button class="nav-burger" onclick="toggleMenu()" aria-label="Меню"><i class="ti ti-menu-2"></i></button>\n  </div>\n</nav>\n\n'
            '<div class="mobile-menu" id="menu">' + m + '<a href="/vhid?role=carrier">Реєстрація перевізника</a><a href="/">Митні брокери — МитнийБрокер</a>'
            '<a href="/vhid" id="menuAuth">Увійти в кабінет</a></div>\n\n')

FREIGHT_NOTE = ('<section class="container"><p class="text-xs text-muted" style="padding:1rem 0 0">' + BRAND +
                ' — біржа вантажів і транспорту від команди <a href="/">МитнийБрокер</a>: перевізники, експедитори, вантажовласники та митні брокери в одному місці.</p></section>')

AUTH_JS = ('<script>(async()=>{try{const u=await currentUser();if(!u)return;const b=document.getElementById("loginBtn");'
           'if(b){b.textContent="Кабінет";b.href="/kabinet";}const m=document.getElementById("menuAuth");if(m){m.textContent="Мій кабінет";m.href="/kabinet";}}catch(e){}})();</script>\n')

def fpage(path, title, desc, body, ld, active, scripts=''):
    html_ = page(path, title, desc, body + FREIGHT_NOTE, ld, active=None, scripts=scripts + AUTH_JS)
    assert STATIC_NAV in html_, 'freight nav: не знайдено STATIC_NAV'
    return (html_.replace(STATIC_NAV, freight_nav(active))
                 .replace('<meta property="og:site_name" content="МитнийБрокер">', '<meta property="og:site_name" content="' + BRAND + '">'))

CARGO_FAQ = [
 ('Скільки коштує розмістити вантаж?',
  'Нічого. Вантаж бачать усі відвідувачі біржі, а ваші контакти — лише перевізники, які відгукнулися. Комісії з перевезення немає.'),
 ('Як знайти вільну машину?',
  'Відкрийте розділ «Транспорт»: там перевізники розміщують вільні машини з маршрутом і датою. Телефонуйте напряму.'),
 ('Чи можна одразу знайти митного брокера?',
  'Так. Позначте «потрібне митне оформлення» — і скористайтеся каталогом брокерів МитнийБрокер або картою пунктів пропуску.'),
 ('Що означає «авто перевірено»?',
  'Перевізник додав машину з держномером і характеристиками, а адміністратор біржі перевірив дані. Це додатковий сигнал надійності.'),
]

CARRIER_FAQ = [
 ('Скільки коштує розміщення перевізника?',
  'Профіль, автопарк і пропозиції транспорту — безкоштовно. На безкоштовному тарифі можна відкрити контакти 5 вантажів на місяць, на платних (від 299 грн) — без обмежень, плюс вища позиція.'),
 ('Чи підходить біржа експедиторам і логістам?',
  'Так. Під час реєстрації оберіть «Експедитор / логіст»: ви зможете і шукати транспорт, і розміщувати вантажі своїх клієнтів, і відгукуватися на вантажі.'),
 ('Ви берете комісію з рейсу?', 'Ні. Ціну й умови ви погоджуєте із замовником напряму.'),
]

LOG_SCRIPTS = ('<script src="/assets/js/config.js"></script>\n<script src="/assets/js/db.js"></script>\n'
               '<script src="/assets/js/logistics.js"></script>\n<script src="/assets/js/cargo-public.js"></script>\n')

FORM_CARD = ('<div class="card" id="cargoForm"><div id="cargoFormMount"></div></div>')


def freight_home():
    body = (
        '<section class="container page-hero"><div class="crumbs">' + BRAND + ' › Біржа вантажів</div>'
        '<h1 class="h-lg">Біржа вантажів і транспорту<br><span style="color:var(--blue)">з Європи, в Європу та по Україні</span></h1>'
        '<p class="lead">Розмістіть вантаж — перевізники надішлють ставки, а ви оберете найкращу. Шукаєте рейс — відкрийте стрічку вантажів. '
        'Без комісії. Митне оформлення й брокери на кордоні — поруч.</p>'
        '<div class="row" style="margin-top:1.5rem"><a class="btn btn-primary" href="#cargoForm" style="padding:13px 26px"><i class="ti ti-package"></i>Додати вантаж</a>'
        '<a class="btn btn-ghost" href="/vantazhi" style="padding:13px 22px"><i class="ti ti-list-search"></i>Знайти вантаж</a>'
        '<a class="btn btn-ghost" href="/transport" style="padding:13px 22px"><i class="ti ti-truck"></i>Знайти транспорт</a></div></section>'
        '<section class="container" style="padding-bottom:1rem"><div class="lg-grid">'
        '<div><div class="spread" style="margin-bottom:10px"><h2 class="h-sm">Свіжі вантажі</h2><a href="/vantazhi" class="text-sm">Усі вантажі →</a></div><div id="homeCargo"></div>'
        '<div class="spread" style="margin:1.5rem 0 10px"><h2 class="h-sm">Вільний транспорт</h2><a href="/transport" class="text-sm">Увесь транспорт →</a></div><div id="homeOffers"></div></div>'
        '<div class="lg-side">' + FORM_CARD + '</div></div></section>'
        '<section class="container seo"><div class="seo-grid">'
        '<div class="card"><i class="ti ti-package"></i><h3>Вантажовласникам</h3><p>Кабінет вантажів: ставки перевізників, рейтинг і перевірені авто, обрані перевізники. <a href="/dlya-vantazhovlasnykiv">Як це працює</a></p></div>'
        '<div class="card"><i class="ti ti-truck-delivery"></i><h3>Перевізникам</h3><p>Стрічка вантажів, пропозиції вільного транспорту, автопарк з перевіркою. <a href="/dlya-perevizhnykiv">Як це працює</a></p></div>'
        '<div class="card"><i class="ti ti-route"></i><h3>Експедиторам і логістам</h3><p>Розміщуйте вантажі клієнтів, шукайте машини й брокерів на кордоні з одного кабінету.</p></div>'
        '<div class="card"><i class="ti ti-building-bank"></i><h3>Митне оформлення</h3><p><a href="/punkty-propusku">Брокери в пунктах пропуску</a>, <a href="/">каталог митних брокерів</a> і <a href="/kalkulyator-rozmytnennya">калькулятор платежів</a>.</p></div>'
        '</div><h3>Часті запитання</h3><div style="max-width:820px">' + faq_html(CARGO_FAQ) + '</div></section>')
    ld = [crumbs_ld([(BRAND, '/perevezennya')]), faq_ld(CARGO_FAQ)]
    write('perevezennya.html', fpage('/perevezennya',
          'Біржа вантажів і транспорту ' + BRAND + ' — вантажі й вільні машини без комісії',
          'Біржа вантажів ' + BRAND + ': розмістіть вантаж безкоштовно або знайдіть рейс. Перевезення з Європи, в Європу та по Україні — тент, реф, контейнер, автовоз. Митні брокери на кордоні поруч.',
          body, ld, '/perevezennya', scripts=LOG_SCRIPTS +
          '<script>CargoPublic.mountForm("cargoFormMount");CargoPublic.mountCargoBoard("homeCargo",{compact:true,limit:6});CargoPublic.mountOffers("homeOffers",{compact:true,limit:5});</script>\n'))


def cargo_board_page():
    body = ('<section class="container page-hero" style="padding-bottom:1rem"><div class="crumbs"><a href="/perevezennya">' + BRAND + '</a> › Вантажі</div>'
            '<div class="spread" style="flex-wrap:wrap;gap:12px"><h1 class="h-lg" style="font-size:clamp(28px,5vw,40px)">Вантажі для перевезення</h1>'
            '<a class="btn btn-primary" href="/perevezennya#cargoForm"><i class="ti ti-plus"></i>Додати вантаж</a></div>'
            '<p class="lead">Свіжі заявки від вантажовласників, логістів і митних брокерів. Контакти замовника відкриваються зареєстрованим перевізникам.</p></section>'
            '<section class="container" style="padding-bottom:2rem"><div id="cargoBoard"><div class="text-sm text-muted">Завантаження…</div></div></section>')
    ld = [crumbs_ld([(BRAND, '/perevezennya'), ('Вантажі', '/vantazhi')])]
    write('vantazhi.html', fpage('/vantazhi', 'Вантажі для перевезення — свіжі заявки | ' + BRAND,
          'Свіжі вантажі для перевізників: маршрути з Польщі, Німеччини, Литви, Туреччини та по Україні. Тент, реф, контейнер, збірні вантажі. Відгукуйтесь і отримуйте контакти замовника.',
          body, ld, '/vantazhi', scripts=LOG_SCRIPTS + '<script>CargoPublic.mountCargoBoard("cargoBoard");</script>\n'))


def offers_page():
    body = ('<section class="container page-hero" style="padding-bottom:1rem"><div class="crumbs"><a href="/perevezennya">' + BRAND + '</a> › Транспорт</div>'
            '<div class="spread" style="flex-wrap:wrap;gap:12px"><h1 class="h-lg" style="font-size:clamp(28px,5vw,40px)">Вільний транспорт</h1>'
            '<a class="btn btn-primary" href="/kabinet#offers"><i class="ti ti-plus"></i>Додати транспорт</a></div>'
            '<p class="lead">Перевізники розміщують вільні машини з маршрутом і датою. Телефонуйте напряму — без посередників і комісії.</p></section>'
            '<section class="container" style="padding-bottom:2rem"><div id="offersBoard"><div class="text-sm text-muted">Завантаження…</div></div></section>')
    ld = [crumbs_ld([(BRAND, '/perevezennya'), ('Транспорт', '/transport')])]
    write('transport.html', fpage('/transport', 'Вільний транспорт — машини під завантаження | ' + BRAND,
          'Вільні вантажівки під завантаження: тент, рефрижератор, контейнеровоз, автовоз, буси. Маршрути Європа — Україна. Пряма звʼязка з перевізником.',
          body, ld, '/transport', scripts=LOG_SCRIPTS + '<script>CargoPublic.mountOffers("offersBoard");</script>\n'))


def carriers_catalog_page():
    body = ('<section class="container page-hero" style="padding-bottom:1rem"><div class="crumbs"><a href="/perevezennya">' + BRAND + '</a> › Перевізники</div>'
            '<h1 class="h-lg" style="font-size:clamp(28px,5vw,40px)">Перевізники та експедитори</h1>'
            '<p class="lead">Компанії з автопарком, напрямками й відгуками. Позначка «авто перевірено» — машини перевірені адміністратором біржі.</p></section>'
            '<section class="container" style="padding-bottom:2rem"><div class="row" style="gap:8px;margin-bottom:1rem">'
            '<select class="input" id="fTransport" style="width:auto"></select><select class="input" id="fRoute" style="width:auto"></select></div>'
            '<div id="carrierList" class="lg-carriers"><div class="text-sm text-muted">Завантаження…</div></div></section>')
    ld = [crumbs_ld([(BRAND, '/perevezennya'), ('Перевізники', '/perevizhnyky')])]
    write('perevizhnyky.html', fpage('/perevizhnyky', 'Перевізники та експедитори — каталог | ' + BRAND,
          'Каталог перевізників і експедиторів: тип транспорту, напрямки, автопарк, відгуки. Міжнародні й внутрішні перевезення вантажів.',
          body, ld, '/perevizhnyky', scripts=LOG_SCRIPTS + '<script>CargoPublic.mountCarriers("carrierList");</script>\n'))


def carriers_landing():
    benefits = [
        ('ti-list-search', 'Стрічка вантажів', 'Свіжі вантажі з фільтром за країною й транспортом — у кабінеті та на сайті. Відгукнулись — бачите телефон замовника.'),
        ('ti-truck', 'Вільний транспорт', 'Розміщуйте вільні машини з маршрутом і датою — вантажовласники телефонують вам напряму.'),
        ('ti-shield-check', 'Автопарк з перевіркою', 'Додайте машини з держномером і характеристиками — після перевірки отримаєте позначку «авто перевірено».'),
        ('ti-route', 'Для експедиторів', 'Розміщуйте вантажі клієнтів, шукайте машини, бачте всі свої заявки й відгуки перевізників в одному кабінеті.'),
        ('ti-building-bank', 'Брокери на кордоні', 'Карта брокерів на Ягодині, Шегинях, Чопі, у портах — оформлення без пошуку контактів.'),
        ('ti-calculator', 'Митний калькулятор', 'Мито, акциз і ПДВ за кодом УКТ ЗЕД, з урахуванням віку вантажівок, — щоб відповісти клієнту одразу.'),
        ('ti-qrcode', 'Електронна візитівка', 'Сторінка з контактами й QR-кодом — для вантажовідправників і підпису в листах.'),
        ('ti-scale', 'Юрист і бухгалтер', 'На платних тарифах — безкоштовні консультації: протоколи про порушення митних правил, затримання вантажу, ПДВ на перевезення.'),
    ]
    cards = ''.join('<div class="card"><i class="ti %s"></i><h3>%s</h3><p>%s</p></div>' % b for b in benefits)
    body = (
        '<section class="container page-hero"><div class="crumbs"><a href="/perevezennya">' + BRAND + '</a> › Для перевізників</div>'
        '<h1 class="h-lg">Вантажі для перевізників і логістів —<br><span style="color:var(--blue)">без комісії з рейсу</span></h1>'
        '<p class="lead">' + BRAND + ' — біржа вантажів і транспорту: стрічка вантажів, вільні машини, автопарк з перевіркою й митні брокери на кордоні. '
        'Профіль безкоштовний, на платних тарифах — безлімітні контакти вантажів і вища позиція.</p>'
        '<div class="row" style="margin-top:1.75rem"><a class="btn btn-primary" href="/vhid?role=carrier" style="padding:13px 26px;font-size:15px">'
        '<i class="ti ti-user-plus"></i>Зареєструватись безкоштовно</a><a class="btn btn-ghost" href="/instruktsiya-perevizhnyka" style="padding:13px 22px">Інструкція</a>'
        '<a class="btn btn-ghost" href="/vantazhi" style="padding:13px 22px">Стрічка вантажів</a></div></section>'
        '<section class="seo container"><h2>Що ви отримуєте</h2><div class="seo-grid">' + cards + '</div></section>'
        '<section class="seo container"><div class="prose" style="max-width:820px">'
        '<h2>Як це працює</h2><ol>'
        '<li><strong>Реєстрація — 3 хвилини.</strong> Компанія, телефон, перевізник чи експедитор, тип транспорту й напрямки.</li>'
        '<li><strong>Додайте автопарк.</strong> Держномер, тип, вантажопідйомність — після перевірки машини отримають позначку.</li>'
        '<li><strong>Шукайте вантажі й розміщуйте транспорт.</strong> Відгукуйтесь на вантажі, а вільні машини публікуйте в розділі «Транспорт».</li></ol>'
        '<h2>Тарифи</h2>'
        '<table><tr><th>Тариф</th><th>Ціна</th><th>Що дає</th></tr>'
        '<tr><td>Безкоштовний</td><td>0 грн</td><td>Профіль, автопарк, пропозиції транспорту, контакти 5 вантажів на місяць</td></tr>'
        '<tr><td>Стандарт</td><td>299 грн/міс</td><td>Безлімітні контакти вантажів, візитівка з QR, калькулятор УКТ ЗЕД, консультації юриста й бухгалтера</td></tr>'
        '<tr><td>Про</td><td>599 грн/міс</td><td>Усе зі «Стандарт» + вища позиція в каталозі, значок ТОП</td></tr>'
        '<tr><td>Преміум</td><td>999 грн/міс</td><td>Перша позиція в каталозі, персональний менеджер</td></tr></table>'
        '</div><h3>Часті запитання</h3><div style="max-width:820px">' + faq_html(CARRIER_FAQ) + '</div>'
        '<div class="cta-band"><h3>Розмістіть профіль перевізника безкоштовно</h3>'
        '<p>Реєстрація займає кілька хвилин. Платіжна картка не потрібна.</p>'
        '<div class="row"><a class="btn btn-primary" href="/vhid?role=carrier"><i class="ti ti-user-plus"></i>Зареєструватись</a>'
        '<a class="btn btn-ghost" href="/instruktsiya-perevizhnyka">Інструкція</a></div></div></section>')
    ld = [crumbs_ld([(BRAND, '/perevezennya'), ('Для перевізників', '/dlya-perevizhnykiv')]), faq_ld(CARRIER_FAQ)]
    write('dlya-perevizhnykiv.html', fpage('/dlya-perevizhnykiv',
          'Вантажі для перевізників і логістів без комісії | ' + BRAND,
          'Біржа вантажів ' + BRAND + ' для перевізників і експедиторів: стрічка вантажів, вільний транспорт, автопарк з перевіркою, брокери на кордоні. Безкоштовний профіль.',
          body, ld, '/dlya-perevizhnykiv'))


INSTR_C = [
 ('reyestratsiya', 'Реєстрація', '''
<ol><li>Відкрийте <a href="/vhid?role=carrier">реєстрацію</a> й оберіть «Я перевізник».</li>
<li>Вкажіть email, телефон і пароль, потім — назву компанії, область, <strong>тип компанії</strong> (перевізник чи експедитор / логіст), тип транспорту, країни й кількість машин.</li>
<li>Після реєстрації відкриється кабінет на вкладці «Вантажі».</li></ol>'''),
 ('avtopark', 'Автопарк і перевірка авто', '''
<p>Кабінет → <strong>«Автопарк»</strong> → «Додати авто»: держномер (і номер причепа), тип кузова, марка, рік, вантажопідйомність і обʼєм.</p>
<p>Нове авто отримує статус «на перевірці». Адміністратор біржі перевіряє дані й ставить <strong>«авто перевірено»</strong> — позначка зʼявляється у профілі та в пропозиціях транспорту. Якщо змінити дані авто, воно повертається на перевірку.</p>'''),
 ('vantazhi', 'Стрічка вантажів і відгуки', '''
<p>Кабінет → <strong>«Вантажі»</strong> (або сторінка <a href="/vantazhi">«Вантажі»</a>). Фільтруйте за країною й транспортом; «Лише мої напрямки» показує вантажі під ваш профіль.</p>
<p>Натисніть <strong>«Запропонувати ставку»</strong>: вкажіть ціну й валюту, оберіть машину з автопарку й додайте коментар (дата подачі, умови). Вантажовласник бачить вашу ставку поруч з іншими, ваш рейтинг і перевірені авто. Ви одразу отримуєте його контакти — можна домовлятись телефоном.</p>
<p>Ставку можна оновити, поки вантажовласник не обрав перевізника. Коли він обере вас — у стрічці зʼявиться «Вантажовласник обрав вас». На безкоштовному тарифі — 5 відгуків на місяць, на платних — без обмежень.</p>'''),
 ('transport', 'Пропозиції вільного транспорту', '''
<p>Кабінет → <strong>«Мій транспорт»</strong> → вкажіть звідки й куди, дати, тип транспорту й оберіть машину з автопарку. Пропозиція зʼявиться на сторінці <a href="/transport">«Транспорт»</a> на 30 днів; коли машину завантажили — натисніть «Зняти».</p>'''),
 ('ekspedytory', 'Для експедиторів: розміщення вантажів', '''
<p>Кабінет → <strong>«Мої вантажі»</strong> → форма праворуч. Контакти підставляються з профілю; можна вказати свою ставку або залишити «запит ставок». Біля кожного вантажу — кнопка «Пропозиції»: ставки перевізників від найнижчої, рейтинг, перевірені авто. «Обрати» знімає вантаж з біржі; кнопка з копією повторює вантаж з новою датою.</p>'''),
 ('kordon', 'Митне оформлення й брокери на кордоні', '''
<p>Сторінка <a href="/punkty-propusku">«Пункти пропуску»</a> — брокери на Ягодині, Шегинях, Краківці, Чопі, Порубному, в портах. У кабінеті також є митний калькулятор (мито, акциз з урахуванням віку вантажівок, ПДВ) і довідка по VIN.</p>'''),
 ('taryfy', 'Тарифи', '''
<p>Профіль, автопарк і пропозиції транспорту — безкоштовно. Платні тарифи (від 299 грн/міс) дають безлімітні відгуки на вантажі, візитівку з QR, консультації юриста й бухгалтера, вищу позицію в каталозі. Оплата — кабінет → «Підписка».</p>'''),
 ('pidtrymka', 'Підтримка', '''
<p>Питання й пропозиції — <a href="mailto:custom@forwardcarua.com">custom@forwardcarua.com</a>.</p>'''),
]

def carrier_instruction():
    toc = ''.join('<li><a href="#%s">%s</a></li>' % (a, t) for a, t, _ in INSTR_C)
    secs = ''.join('<h2 id="%s">%d. %s</h2>%s' % (a, i + 1, t, b) for i, (a, t, b) in enumerate(INSTR_C))
    body = ('<article class="container-narrow page-hero"><div class="crumbs"><a href="/perevezennya">' + BRAND + '</a> › <a href="/dlya-perevizhnykiv">Для перевізників</a> › Інструкція</div>'
            '<h1 class="h-lg" style="font-size:clamp(28px,5vw,40px)">Інструкція для перевізників і експедиторів</h1>'
            '<p class="lead">Як зареєструватися, додати автопарк, знаходити вантажі й розміщувати вільний транспорт на біржі ' + BRAND + '.</p>'
            '<div class="card" style="margin:1.5rem 0"><div class="card-title">Зміст</div><ol class="text-sm" style="padding-left:1.2rem;line-height:1.9">' + toc + '</ol></div>'
            '<div class="prose">' + secs + '</div>'
            '<div class="cta-band"><h3>Готові почати?</h3><div class="row"><a class="btn btn-primary" href="/vhid?role=carrier">Зареєструватись</a></div></div></article>')
    ld = [crumbs_ld([(BRAND, '/perevezennya'), ('Для перевізників', '/dlya-perevizhnykiv'), ('Інструкція', '/instruktsiya-perevizhnyka')])]
    write('instruktsiya-perevizhnyka.html', fpage('/instruktsiya-perevizhnyka', 'Інструкція для перевізників і експедиторів | ' + BRAND,
          'Покрокова інструкція біржі ' + BRAND + ': реєстрація перевізника, автопарк і перевірка авто, стрічка вантажів, пропозиції транспорту, розміщення вантажів експедиторами.',
          body, ld, '/dlya-perevizhnykiv'))


def posts_page():
    body = (
        '<section class="container page-hero"><div class="crumbs"><a href="/perevezennya">' + BRAND + '</a> › Пункти пропуску</div>'
        '<h1 class="h-lg">Митні брокери в пунктах пропуску</h1>'
        '<p class="lead">Ягодин, Шегині, Краківець, Чоп, Порубне, порти Одеси — оберіть пункт пропуску чи митний термінал і зв\'яжіться з брокером, '
        'який оформлює вантажі й авто саме там: експорт, імпорт, транзит T1, гарантії.</p></section>'
        '<section class="container" style="padding-bottom:2rem"><input class="input" id="postFind" placeholder="Пошук: Ягодин, Чоп, Одеса…" style="max-width:420px;margin-bottom:1rem">'
        '<div id="postsMount" class="lg-posts"><div class="text-sm text-muted">Завантаження…</div></div>'
        '<div class="cta-band"><h3>Ви брокер і працюєте на кордоні?</h3><p>Відмітьте пункти пропуску в профілі — і перевізники знайдуть вас тут.</p>'
        '<div class="row"><a class="btn btn-primary" href="/vhid?role=broker">Зареєструватись</a><a class="btn btn-ghost" href="/kabinet#profile">Відмітити в кабінеті</a></div></div></section>')
    ld = [crumbs_ld([(BRAND, '/perevezennya'), ('Пункти пропуску', '/punkty-propusku')])]
    write('punkty-propusku.html', fpage('/punkty-propusku',
          'Митні брокери в пунктах пропуску: Ягодин, Шегині, Чоп, Одеса | ' + BRAND,
          'Знайдіть митного брокера в потрібному пункті пропуску чи митному терміналі: Ягодин, Устилуг, Шегині, Краківець, Рава-Руська, Чоп, Порубне, порти Одеси. Оформлення вантажів і авто на кордоні.',
          body, ld, '/punkty-propusku', scripts=LOG_SCRIPTS + '<script>CargoPublic.mountPosts("postsMount");</script>\n'))


freight_home()
cargo_board_page()
offers_page()
carriers_catalog_page()
carriers_landing()
carrier_instruction()
posts_page()


INSTR_S = [
 ('kabinet', 'Створіть кабінет вантажовласника', '''
<ol><li>Відкрийте <a href="/vhid">реєстрацію</a> й оберіть «Я клієнт / вантажовласник».</li>
<li>Вкажіть імʼя, телефон, email і пароль — кабінет відкриється одразу.</li>
<li>У «Моїх даних» перевірте імʼя й телефон: вони підставляються в кожен новий вантаж.</li></ol>
<p>Розмістити вантаж можна й без кабінету — на сторінці <a href="/perevezennya#cargoForm">біржі</a>. Але тоді перевізники лише телефонують, а порівнювати ставки онлайн не вийде.</p>'''),
 ('vantazh', 'Розмістіть вантаж', '''
<p>Кабінет → <strong>«Мої вантажі»</strong> → форма праворуч: звідки й куди, що веземо, вага й обʼєм, тип транспорту, дата завантаження, митне оформлення.</p>
<p><strong>Ставка</strong>: вкажіть свою ціну й валюту — або залиште поле порожнім, тоді це «запит ставок» і перевізники запропонують ціну самі. Оберіть форму оплати (готівка, безготівка з ПДВ / без ПДВ, передоплата, відстрочка).</p>'''),
 ('stavky', 'Порівняйте ставки й оберіть перевізника', '''
<p>Біля вантажу — кнопка <strong>«Пропозиції»</strong> з кількістю ставок. Для кожного перевізника видно: ставку (найнижча позначена), рейтинг і відгуки, кількість перевірених авто, машину, яку він пропонує, коментар і контакти.</p>
<p>Натисніть <strong>«Обрати»</strong> — вантаж зникне з біржі, інші перевізники побачать, що обрано іншого. Зателефонуйте обраному перевізнику й підтвердіть рейс. Невідповідні пропозиції можна «Відхилити».</p>'''),
 ('transport', 'Шукайте вільний транспорт', '''
<p>Вкладка <strong>«Знайти транспорт»</strong> — машини, які перевізники пропонують на найближчі дати, з фільтром за країнами й типом кузова. Позначка «авто перевірено» означає, що адміністратор перевірив дані машини.</p>'''),
 ('obrani', 'Обрані перевізники', '''
<p>Зірочка біля перевізника в пропозиціях або кнопка «В обрані перевізники» на його сторінці додає його у вкладку <strong>«Обрані перевізники»</strong> — ваш список надійних партнерів з телефонами під рукою.</p>'''),
 ('povtor', 'Повторні вантажі й відгуки', '''
<p>Кнопка з копією біля вантажу підставляє його в форму — залишається вказати нову дату. Після рейсу залиште відгук про перевізника на його сторінці: рейтинг допомагає іншим вантажовласникам.</p>'''),
 ('mytnytsia', 'Митне оформлення', '''
<p>Якщо вантаж перетинає кордон — позначте «Потрібне митне оформлення». Брокера на потрібному переході знайдете на сторінці <a href="/punkty-propusku">«Пункти пропуску»</a>, заявки брокерам — у вкладці «Митні брокери» кабінету. Платежі можна порахувати в <a href="/kalkulyator-rozmytnennya">калькуляторі розмитнення</a>.</p>'''),
]

def shipper_page():
    toc = ''.join('<li><a href="#%s">%s</a></li>' % (a, t) for a, t, _ in INSTR_S)
    secs = ''.join('<h2 id="%s">%d. %s</h2>%s' % (a, i + 1, t, b) for i, (a, t, b) in enumerate(INSTR_S))
    feats = [('ti-currency-hryvnia', 'Ставки перевізників', 'Розмістіть вантаж зі своєю ціною або як запит ставок — перевізники пропонують ціну, ви порівнюєте.'),
             ('ti-shield-check', 'Перевірені авто й рейтинг', 'Бачите, скільки машин перевізника перевірено, його відгуки й машину, яку він подає.'),
             ('ti-star', 'Обрані перевізники', 'Свій список надійних партнерів з контактами в один клік.'),
             ('ti-building-bank', 'Митниця поруч', 'Брокери в пунктах пропуску й калькулятор платежів — на тій самій платформі.')]
    cards = ''.join('<div class="card"><i class="ti %s"></i><h3>%s</h3><p>%s</p></div>' % f for f in feats)
    body = ('<article class="container-narrow page-hero"><div class="crumbs"><a href="/perevezennya">' + BRAND + '</a> › Вантажовласникам</div>'
            '<h1 class="h-lg" style="font-size:clamp(28px,5vw,40px)">Вантажовласникам: кабінет, ставки, перевірені перевізники</h1>'
            '<p class="lead">Розмістіть вантаж безкоштовно — перевізники біржі надішлють ставки. Оберіть за ціною, рейтингом і перевіреними авто. Без комісії.</p>'
            '<div class="row" style="margin:1.25rem 0"><a class="btn btn-primary" href="/vhid?next=/moi-zayavky%23cargo"><i class="ti ti-user-plus"></i>Створити кабінет</a>'
            '<a class="btn btn-ghost" href="/perevezennya#cargoForm">Додати вантаж без реєстрації</a></div>'
            '<section class="seo"><div class="seo-grid">' + cards + '</div></section>'
            '<div class="card" style="margin:1.5rem 0"><div class="card-title">Інструкція</div><ol class="text-sm" style="padding-left:1.2rem;line-height:1.9">' + toc + '</ol></div>'
            '<div class="prose">' + secs + '</div>'
            '<div class="cta-band"><h3>Розмістіть перший вантаж</h3><div class="row"><a class="btn btn-primary" href="/vhid?next=/moi-zayavky%23cargo">Створити кабінет</a></div></div></article>')
    ld = [crumbs_ld([(BRAND, '/perevezennya'), ('Вантажовласникам', '/dlya-vantazhovlasnykiv')])]
    write('dlya-vantazhovlasnykiv.html', fpage('/dlya-vantazhovlasnykiv', 'Вантажовласникам: ставки перевізників і перевірені авто | ' + BRAND,
          'Кабінет вантажовласника ' + BRAND + ': розмістіть вантаж безкоштовно, отримайте ставки перевізників, порівняйте рейтинг і перевірені авто, оберіть перевізника. Інструкція.',
          body, ld, '/perevezennya'))

shipper_page()
