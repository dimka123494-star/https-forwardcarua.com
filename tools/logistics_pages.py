# Розділ для перевізників і логістів. Виконується з build.py (exec), тому бачить page(), write(), E, SITE, faq_html тощо.

CARGO_FAQ = [
 ('Скільки коштує розмістити заявку на перевезення?',
  'Нічого. Заявку бачать перевізники, зареєстровані на платформі, і ті, хто готовий взяти вантаж, телефонують вам напряму. Комісії з перевезення ми не беремо.'),
 ('Хто побачить мої контакти?',
  'Опис вантажу бачать зареєстровані перевізники, а ваш телефон і email — лише ті з них, хто відгукнувся на заявку. На публічних сторінках сайту контакти не показуються.'),
 ('Чи можна одразу знайти митного брокера?',
  'Так. Позначте «потрібне митне оформлення» — і скористайтеся каталогом брокерів або картою пунктів пропуску, щоб знайти брокера на кордоні чи в місці доставки.'),
]

CARRIER_FAQ = [
 ('Скільки коштує розміщення перевізника?',
  'Профіль у каталозі перевізників безкоштовний. На безкоштовному тарифі можна відгукнутися на 5 заявок на місяць, на платних (від 299 грн) — без обмежень, плюс вища позиція в каталозі.'),
 ('Звідки беруться заявки на перевезення?',
  'Від власників вантажів, логістів і митних брокерів, які оформлюють імпорт та експорт: вони залишають заявку на forwardcarua.com, а ви бачите її в кабінеті й відгукуєтесь.'),
 ('Ви берете комісію з рейсу?',
  'Ні. Ціну й умови ви погоджуєте із замовником напряму.'),
]

LOG_SCRIPTS = ('<script src="/assets/js/config.js"></script>\n<script src="/assets/js/db.js"></script>\n'
               '<script src="/assets/js/logistics.js"></script>\n<script src="/assets/js/cargo-public.js"></script>\n')


def cargo_page():
    body = (
        '<section class="container page-hero"><div class="crumbs"><a href="/">Каталог</a> › Перевезення</div>'
        '<h1 class="h-lg">Перевезення вантажів<br><span style="color:var(--blue)">з Європи, в Європу та по Україні</span></h1>'
        '<p class="lead">Опишіть вантаж — заявку побачать перевізники платформи, і ті, хто готовий взяти рейс, зателефонують вам. '
        'Безкоштовно, без комісії. Потрібне митне оформлення — тут же знайдете брокера.</p>'
        '<div class="row" style="margin-top:1.5rem"><a class="btn btn-primary" href="#cargoForm" style="padding:13px 26px"><i class="ti ti-truck-delivery"></i>Розмістити вантаж</a>'
        '<a class="btn btn-ghost" href="/punkty-propusku" style="padding:13px 22px">Брокери в пунктах пропуску</a>'
        '<a class="btn btn-ghost" href="/dlya-perevizhnykiv" style="padding:13px 22px">Я перевізник</a></div></section>'
        '<section class="container" style="padding-bottom:1rem"><div class="lg-grid">'
        '<div class="card" id="cargoForm"><div id="cargoFormMount"></div></div>'
        '<div class="lg-side">'
        '<div class="card"><i class="ti ti-users" style="color:var(--blue);font-size:22px"></i><h3 class="h-sm" style="margin:.4rem 0">Перевізники відгукуються самі</h3>'
        '<p class="text-sm text-muted">Заявка йде всім перевізникам платформи. Відгукнутись і побачити ваш телефон можуть лише зареєстровані компанії.</p></div>'
        '<div class="card"><i class="ti ti-file-certificate" style="color:var(--blue);font-size:22px"></i><h3 class="h-sm" style="margin:.4rem 0">Митне оформлення поруч</h3>'
        '<p class="text-sm text-muted">Експортна чи імпортна декларація, транзит T1, оформлення на кордоні — <a href="/">каталог брокерів</a> і <a href="/punkty-propusku">карта пунктів пропуску</a>.</p></div>'
        '<div class="card"><i class="ti ti-calculator" style="color:var(--blue);font-size:22px"></i><h3 class="h-sm" style="margin:.4rem 0">Митні платежі заздалегідь</h3>'
        '<p class="text-sm text-muted">Порахуйте мито, акциз і ПДВ у <a href="/kalkulyator-rozmytnennya">калькуляторі</a> — або попросіть розрахунок за кодом УКТ ЗЕД у брокера.</p></div>'
        '</div></div></section>'
        '<section class="container" style="padding:2rem 0 1rem"><div class="spread" style="margin-bottom:1rem;flex-wrap:wrap;gap:10px">'
        '<h2 class="h-md">Перевізники на платформі</h2>'
        '<div class="row" style="gap:8px"><select class="input" id="fTransport" style="width:auto"><option value="">Будь-який транспорт</option></select>'
        '<select class="input" id="fRoute" style="width:auto"><option value="">Будь-яка країна</option></select></div></div>'
        '<div id="carrierList" class="lg-carriers"><div class="text-sm text-muted">Завантаження…</div></div></section>'
        '<section class="container seo"><h3>Часті запитання</h3><div style="max-width:820px">' + faq_html(CARGO_FAQ) + '</div></section>'
        + region_links())
    ld = [crumbs_ld([('Каталог', '/'), ('Перевезення', '/perevezennya')]), faq_ld(CARGO_FAQ)]
    write('perevezennya.html', page('/perevezennya',
          'Перевезення вантажів: заявка перевізникам безкоштовно | МитнийБрокер',
          'Розмістіть заявку на перевезення вантажу з Європи, в Європу чи по Україні — перевізники зателефонують самі. Тент, реф, контейнер, автовоз, збірні вантажі. Митне оформлення поруч.',
          body, ld, active='/perevezennya', scripts=LOG_SCRIPTS + '<script>CargoPublic.mountForm("cargoFormMount");CargoPublic.mountCarriers("carrierList");</script>\n'))


def carriers_landing():
    benefits = [
        ('ti-truck-delivery', 'Заявки на вантажі', 'Власники вантажів, логісти й митні брокери розміщують заявки — ви бачите маршрут, вантаж, вагу й дату та відгукуєтесь.'),
        ('ti-id-badge-2', 'Профіль у каталозі', 'Тип транспорту, напрямки, автопарк, відгуки й «перевірено». Клієнти знаходять вас за транспортом і країною.'),
        ('ti-building-bank', 'Брокери в пунктах пропуску', 'Карта брокерів на Ягодині, Шегинях, Чопі, у портах — оформлення на кордоні без пошуку контактів.'),
        ('ti-calculator', 'Митний калькулятор', 'Мито, акциз і ПДВ за кодом УКТ ЗЕД, з урахуванням віку вантажівок, — щоб відповісти клієнту одразу.'),
        ('ti-qrcode', 'Електронна візитівка', 'Сторінка з контактами й QR-кодом — для водіїв, вантажовідправників і підпису в листах.'),
        ('ti-scale', 'Юрист і бухгалтер', 'На платних тарифах — безкоштовні консультації: протоколи про порушення митних правил, затримання вантажу, ПДВ на перевезення.'),
    ]
    cards = ''.join('<div class="card"><i class="ti %s"></i><h3>%s</h3><p>%s</p></div>' % b for b in benefits)
    body = (
        '<section class="container page-hero"><div class="crumbs"><a href="/">Каталог</a> › <a href="/perevezennya">Перевезення</a> › Для перевізників</div>'
        '<h1 class="h-lg">Вантажі для перевізників —<br><span style="color:var(--blue)">без комісії з рейсу</span></h1>'
        '<p class="lead">Отримуйте заявки на перевезення від власників вантажів, логістів і митних брокерів. Профіль безкоштовний, '
        'на платних тарифах — безлімітні відгуки й вища позиція в каталозі.</p>'
        '<div class="row" style="margin-top:1.75rem"><a class="btn btn-primary" href="/vhid?role=carrier" style="padding:13px 26px;font-size:15px">'
        '<i class="ti ti-user-plus"></i>Зареєструватись як перевізник</a><a class="btn btn-ghost" href="/perevezennya" style="padding:13px 22px">Каталог перевізників</a></div>'
        '</section>'
        '<section class="seo container"><h2>Що ви отримуєте</h2><div class="seo-grid">' + cards + '</div></section>'
        '<section class="seo container"><div class="prose" style="max-width:820px">'
        '<h2>Як це працює</h2><ol>'
        '<li><strong>Реєстрація — 3 хвилини.</strong> Компанія, телефон, тип транспорту й напрямки.</li>'
        '<li><strong>Дивіться заявки.</strong> У кабінеті — стрічка вантажів з фільтром за країною й типом транспорту.</li>'
        '<li><strong>Відгукуйтесь.</strong> Натискаєте «Відгукнутись» — бачите телефон замовника й домовляєтесь напряму.</li></ol>'
        '<h2>Тарифи</h2>'
        '<table><tr><th>Тариф</th><th>Ціна</th><th>Що дає</th></tr>'
        '<tr><td>Безкоштовний</td><td>0 грн</td><td>Профіль у каталозі, 5 відгуків на заявки на місяць</td></tr>'
        '<tr><td>Стандарт</td><td>299 грн/міс</td><td>Безлімітні відгуки, візитівка з QR, калькулятор УКТ ЗЕД, консультації юриста й бухгалтера</td></tr>'
        '<tr><td>Про</td><td>599 грн/міс</td><td>Усе зі «Стандарт» + вища позиція в каталозі, значок ТОП</td></tr>'
        '<tr><td>Преміум</td><td>999 грн/міс</td><td>Перша позиція в каталозі, персональний менеджер</td></tr></table>'
        '</div><h3>Часті запитання</h3><div style="max-width:820px">' + faq_html(CARRIER_FAQ) + '</div>'
        '<div class="cta-band"><h3>Розмістіть профіль перевізника безкоштовно</h3>'
        '<p>Реєстрація займає кілька хвилин. Платіжна картка не потрібна.</p>'
        '<div class="row"><a class="btn btn-primary" href="/vhid?role=carrier"><i class="ti ti-user-plus"></i>Зареєструватись</a></div></div></section>')
    ld = [crumbs_ld([('Каталог', '/'), ('Перевезення', '/perevezennya'), ('Для перевізників', '/dlya-perevizhnykiv')]), faq_ld(CARRIER_FAQ)]
    write('dlya-perevizhnykiv.html', page('/dlya-perevizhnykiv',
          'Заявки на вантажі для перевізників без комісії | МитнийБрокер',
          'Отримуйте заявки на перевезення вантажів з Європи, в Європу та по Україні. Безкоштовний профіль перевізника, відгуки на вантажі, брокери в пунктах пропуску.',
          body, ld, active='/perevezennya'))


def posts_page():
    body = (
        '<section class="container page-hero"><div class="crumbs"><a href="/">Каталог</a> › Пункти пропуску</div>'
        '<h1 class="h-lg">Митні брокери в пунктах пропуску</h1>'
        '<p class="lead">Ягодин, Шегині, Краківець, Чоп, Порубне, порти Одеси — оберіть пункт пропуску чи митний термінал і зв\'яжіться з брокером, '
        'який оформлює вантажі й авто саме там: експорт, імпорт, транзит T1, гарантії.</p></section>'
        '<section class="container" style="padding-bottom:2rem"><input class="input" id="postFind" placeholder="Пошук: Ягодин, Чоп, Одеса…" style="max-width:420px;margin-bottom:1rem">'
        '<div id="postsMount" class="lg-posts"><div class="text-sm text-muted">Завантаження…</div></div>'
        '<div class="cta-band"><h3>Ви брокер і працюєте на кордоні?</h3><p>Відмітьте пункти пропуску в профілі — і перевізники знайдуть вас тут.</p>'
        '<div class="row"><a class="btn btn-primary" href="/vhid?role=broker">Зареєструватись</a><a class="btn btn-ghost" href="/kabinet#profile">Відмітити в кабінеті</a></div></div></section>'
        + region_links())
    ld = [crumbs_ld([('Каталог', '/'), ('Пункти пропуску', '/punkty-propusku')])]
    write('punkty-propusku.html', page('/punkty-propusku',
          'Митні брокери в пунктах пропуску: Ягодин, Шегині, Чоп, Одеса | МитнийБрокер',
          'Знайдіть митного брокера в потрібному пункті пропуску чи митному терміналі: Ягодин, Устилуг, Шегині, Краківець, Рава-Руська, Чоп, Порубне, порти Одеси. Оформлення вантажів і авто на кордоні.',
          body, ld, active='/perevezennya', scripts=LOG_SCRIPTS + '<script>CargoPublic.mountPosts("postsMount");</script>\n'))


cargo_page()
carriers_landing()
posts_page()
