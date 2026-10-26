"""Презентація для брокерів (/prezentatsiya) та інструкція (/instruktsiya)."""

CONTACT_PHONE = '+38 098 172 23 42'
CONTACT_TEL = '+380981722342'
CONTACT_TG = 'Dimakrykun95'
CONTACT_EMAIL = 'custom@forwardcarua.com'


def presentation(write, COMMON_HEAD, ICONS):
    slides = [
        # 1. Обкладинка
        '''<section class="s s-cover">
  <div class="kicker">Для митних брокерів</div>
  <h1>Клієнти на розмитнення —<br><em>без комісії з угод</em></h1>
  <p class="lead">МитнийБрокер — каталог митних брокерів України. Клієнти знаходять брокера за областю, містом і послугою та надсилають заявку прямо йому в кабінет.</p>
  <div class="brand">Митний<span>Брокер</span> · forwardcarua.com</div>
</section>''',
        # 2. Проблема
        '''<section class="s">
  <div class="kicker">Як клієнт шукає брокера сьогодні</div>
  <h2>Клієнт гуглить «митний брокер + місто» — і бачить хаос</h2>
  <div class="grid3">
    <div class="c"><i class="ti ti-search"></i><h3>Розрізнені сайти</h3><p>Кожен брокер — окремий сайт, без цін і відгуків. Порівняти складно.</p></div>
    <div class="c"><i class="ti ti-phone-call"></i><h3>Десятки дзвінків</h3><p>Клієнт обдзвонює 5–10 номерів, щоб дізнатися ціну і терміни.</p></div>
    <div class="c"><i class="ti ti-coin"></i><h3>Дорога реклама</h3><p>Свій сайт і контекстна реклама коштують брокеру тисячі гривень щомісяця.</p></div>
  </div>
</section>''',
        # 3. Рішення
        '''<section class="s">
  <div class="kicker">Рішення</div>
  <h2>Один каталог, де клієнт сам знаходить вас</h2>
  <div class="grid3">
    <div class="c"><i class="ti ti-map-pin"></i><h3>Пошук за областю</h3><p>25 регіонів, фільтр за містом і послугою. Для кожної області — окрема сторінка в Google.</p></div>
    <div class="c"><i class="ti ti-inbox"></i><h3>Заявки в кабінет</h3><p>Клієнт описує авто чи вантаж, терміновість і лишає телефон — ви телефонуєте.</p></div>
    <div class="c"><i class="ti ti-percentage"></i><h3>0% комісії</h3><p>Ми не беремо відсоток з угоди. Ціну встановлюєте ви, домовляєтесь напряму.</p></div>
  </div>
</section>''',
        # 4. Шлях клієнта
        '''<section class="s">
  <div class="kicker">Як це працює</div>
  <h2>Від пошуку до вашого дзвінка — 3 кроки</h2>
  <ol class="steps">
    <li><b>1</b><div><h3>Клієнт обирає область</h3><p>Заходить з Google на сторінку «Митний брокер + ваше місто» і бачить брокерів регіону.</p></div></li>
    <li><b>2</b><div><h3>Дивиться ваш профіль</h3><p>Послуги, ціни «від», досвід, відгуки, Telegram і телефон.</p></div></li>
    <li><b>3</b><div><h3>Залишає заявку</h3><p>Заявка з даними авто і контактом миттєво з'являється у вашому кабінеті.</p></div></li>
  </ol>
</section>''',
        # 5. Що отримує брокер
        '''<section class="s">
  <div class="kicker">Що ви отримуєте</div>
  <h2>Повноцінний кабінет брокера</h2>
  <div class="grid3">
    <div class="c"><i class="ti ti-id-badge-2"></i><h3>Профіль</h3><p>Послуги, ціни, контакти, досвід — усе, що клієнт хоче побачити до дзвінка.</p></div>
    <div class="c"><i class="ti ti-list-check"></i><h3>Заявки зі статусами</h3><p>Нова → В роботі → Завершена. Нічого не губиться.</p></div>
    <div class="c"><i class="ti ti-star"></i><h3>Відгуки й рейтинг</h3><p>Клієнти залишають відгуки, ви відповідаєте. Рейтинг піднімає вас у списку.</p></div>
  </div>
</section>''',
        # 6. Калькулятор
        '''<section class="s">
  <div class="kicker">Новинка</div>
  <h2>Митний калькулятор з PDF для клієнта</h2>
  <div class="split">
    <div>
      <ul class="ticks">
        <li>Розрахунок мита, акцизу, ПДВ і пенсійного збору за хвилину</li>
        <li>Курс НБУ підтягується автоматично</li>
        <li>Акуратний PDF з вашим іменем, телефоном і Telegram</li>
        <li>Надсилання клієнту в Telegram, Viber, WhatsApp або email в один клік</li>
        <li><b>Безкоштовно</b> — легкові авто; <b>на платних тарифах</b> — будь-який товар: пошук за назвою чи кодом УКТ ЗЕД, ставка мита з Митного тарифу підставляється сама</li>
      </ul>
    </div>
    <div class="pdf">
      <div class="pdf-h"><b>Ваша компанія</b><span>+380 … · @telegram</span></div>
      <div class="pdf-t">Розрахунок розмитнення авто</div>
      <div class="pdf-r"><span>Ввізне мито</span><span>36 160 грн</span></div>
      <div class="pdf-r"><span>Акцизний податок</span><span>46 701 грн</span></div>
      <div class="pdf-r"><span>ПДВ 20%</span><span>88 892 грн</span></div>
      <div class="pdf-r"><span>Послуги брокера</span><span>4 000 грн</span></div>
      <div class="pdf-tot"><span>Разом орієнтовно</span><span>186 601 грн</span></div>
    </div>
  </div>
</section>''',
        # 7. Звідки клієнти
        '''<section class="s">
  <div class="kicker">Звідки клієнти</div>
  <h2>Ми приводимо трафік — ви приймаєте заявки</h2>
  <div class="grid3">
    <div class="c"><i class="ti ti-world-search"></i><h3>25 сторінок областей</h3><p>Під запити «митний брокер Львів», «розмитнення авто Одеса» тощо.</p></div>
    <div class="c"><i class="ti ti-article"></i><h3>Корисні статті</h3><p>Як обрати брокера, порядок розмитнення, вартість — їх читають ті, хто шукає брокера зараз.</p></div>
    <div class="c"><i class="ti ti-speakerphone"></i><h3>Просування платформи</h3><p>Ми розвиваємо каталог у пошуку Google — кожна сторінка веде на профілі брокерів регіону.</p></div>
  </div>
</section>''',
        # 8. Тарифи
        '''<section class="s">
  <div class="kicker">Тарифи</div>
  <h2>Почніть безкоштовно</h2>
  <div class="plans">
    <div class="p"><h3>Безкоштовний</h3><div class="pr">0 <small>грн</small></div><p>Профіль у своїй області · до 5 заявок/міс · 3 послуги · калькулятор авто + PDF</p></div>
    <div class="p hot"><h3>Стандарт</h3><div class="pr">299 <small>грн/міс</small></div><p>Вся Україна · до 30 заявок · статистика · калькулятор УКТ ЗЕД</p></div>
    <div class="p"><h3>Про</h3><div class="pr">599 <small>грн/міс</small></div><p>Без ліміту заявок · вища позиція · значок ТОП</p></div>
    <div class="p"><h3>Преміум</h3><div class="pr">999 <small>грн/міс</small></div><p>Перша позиція · банер на головній · персональний менеджер</p></div>
  </div>
  <p class="note">Річна оплата — −20%. Підписка не поновлюється автоматично.</p>
</section>''',
        # 9. Чому зараз
        '''<section class="s">
  <div class="kicker">Чому варто зайти зараз</div>
  <h2>Каталог тільки наповнюється — <em>ваш регіон може бути вільним</em></h2>
  <p class="lead">У більшості областей поки один-два брокери або жодного. Хто розміститься першим, той і отримує заявки свого регіону, поки конкуренція мінімальна, і раніше збирає відгуки, які піднімають у списку.</p>
</section>''',
        # 10. Старт
        '''<section class="s s-cover">
  <div class="kicker">Старт за 3 хвилини</div>
  <h2>Зареєструйтесь безкоштовно</h2>
  <ol class="mini"><li>Email і телефон</li><li>Назва, місто, область</li><li>Послуги з цінами «від»</li></ol>
  <a class="cta" href="https://forwardcarua.com/vhid?role=broker&amp;utm_source=presentation">forwardcarua.com/vhid → «Я брокер»</a>
  <p class="contacts">Питання — Дмитро: <a href="tel:''' + CONTACT_TEL + '''">''' + CONTACT_PHONE + '''</a> · <a href="https://t.me/''' + CONTACT_TG + '''">Telegram @''' + CONTACT_TG + '''</a> · <a href="mailto:''' + CONTACT_EMAIL + '''">''' + CONTACT_EMAIL + '''</a></p>
  <p class="note"><a href="/instruktsiya">Інструкція для брокерів</a> · <a href="/dlya-brokeriv">Детальніше про платформу</a></p>
</section>''',
    ]
    css = '''
:root{--bg:#0a0f0d;--fg:#f0f1f5;--mut:rgba(240,241,245,.62);--acc:#10B981;--card:#111815;--bd:rgba(255,255,255,.08)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--fg);font-family:'DM Sans',Arial,sans-serif}
html{scroll-snap-type:y mandatory}
.s{min-height:100vh;scroll-snap-align:start;padding:9vh 7vw;display:flex;flex-direction:column;justify-content:center;
  border-bottom:1px solid var(--bd);position:relative;max-width:1400px;margin:0 auto}
.s-cover{background:radial-gradient(ellipse at 30% 20%,rgba(16,185,129,.16),transparent 60%)}
.kicker{font-size:13px;letter-spacing:2px;text-transform:uppercase;color:var(--acc);margin-bottom:1.25rem;font-weight:600}
h1,h2,h3{font-family:'Syne',Arial,sans-serif;line-height:1.1}
h1{font-size:clamp(36px,6.5vw,84px);letter-spacing:-2px;margin-bottom:1.5rem}
h2{font-size:clamp(28px,4.4vw,56px);letter-spacing:-1px;margin-bottom:2rem;max-width:1000px}
h1 em,h2 em{font-style:normal;color:var(--acc)}
h3{font-size:20px;margin-bottom:.5rem}
.lead{font-size:clamp(17px,2vw,24px);color:var(--mut);max-width:860px;line-height:1.55}
.brand{margin-top:3rem;font-family:'Syne',Arial,sans-serif;font-weight:800;font-size:22px}
.brand span{color:var(--acc)}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.c{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:26px}
.c i{font-size:30px;color:var(--acc);display:block;margin-bottom:14px}
.c p{color:var(--mut);font-size:16px;line-height:1.55}
.steps{list-style:none;display:grid;gap:16px;max-width:900px}
.steps li{display:flex;gap:20px;align-items:flex-start;background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:22px}
.steps b{flex-shrink:0;width:48px;height:48px;border-radius:50%;background:var(--acc);color:#03140d;display:flex;align-items:center;justify-content:center;font-size:22px;font-family:'Syne',Arial}
.steps p{color:var(--mut);font-size:16px}
.split{display:grid;grid-template-columns:1.1fr 1fr;gap:40px;align-items:center}
.ticks{list-style:none;display:grid;gap:14px}
.ticks li{padding-left:34px;position:relative;font-size:18px;line-height:1.5;color:var(--mut)}
.ticks li b{color:var(--fg)}
.ticks li:before{content:'✓';position:absolute;left:0;top:0;color:#03140d;background:var(--acc);width:22px;height:22px;border-radius:50%;
  font-size:13px;display:flex;align-items:center;justify-content:center;font-weight:700}
.pdf{background:#fff;color:#111827;border-radius:14px;padding:24px;font-size:14px;box-shadow:0 30px 80px rgba(0,0,0,.45);transform:rotate(1.5deg)}
.pdf-h{display:flex;justify-content:space-between;gap:10px;border-bottom:3px solid var(--acc);padding-bottom:10px;margin-bottom:12px}
.pdf-h span{color:#6b7280;font-size:12px}
.pdf-t{font-weight:700;font-size:16px;margin-bottom:10px}
.pdf-r{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb}
.pdf-tot{display:flex;justify-content:space-between;background:var(--acc);color:#fff;font-weight:700;padding:10px;border-radius:6px;margin-top:10px}
.plans{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.p{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:24px}
.p.hot{border-color:var(--acc)}
.pr{font-family:'Syne',Arial;font-size:40px;font-weight:800;margin:8px 0 12px}
.pr small{font-size:15px;color:var(--mut);font-weight:400}
.p p{color:var(--mut);font-size:15px;line-height:1.55}
.note{color:var(--mut);margin-top:1.5rem;font-size:15px}
.note a,.contacts a{color:var(--acc);text-decoration:none}
.mini{display:flex;gap:14px;flex-wrap:wrap;list-style:none;counter-reset:m;margin-bottom:2rem}
.mini li{counter-increment:m;background:var(--card);border:1px solid var(--bd);border-radius:40px;padding:10px 20px 10px 12px;font-size:17px}
.mini li:before{content:counter(m);background:var(--acc);color:#03140d;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;margin-right:10px;font-weight:700}
.cta{display:inline-block;background:var(--acc);color:#03140d;text-decoration:none;font-weight:700;font-size:clamp(17px,2vw,22px);padding:18px 30px;border-radius:14px;align-self:flex-start}
.contacts{margin-top:2rem;color:var(--mut);font-size:17px;line-height:1.8}
.bar{position:fixed;right:18px;bottom:18px;display:flex;gap:8px;z-index:10}
.bar button,.bar a{background:rgba(17,24,21,.9);border:1px solid var(--bd);color:var(--fg);border-radius:10px;padding:10px 14px;font:inherit;font-size:14px;cursor:pointer;text-decoration:none;display:flex;align-items:center;gap:6px}
.bar .num{color:var(--mut);cursor:default}
@media(max-width:900px){.grid3,.plans,.split{grid-template-columns:1fr}.s{padding:12vh 6vw 10vh}html{scroll-snap-type:none}.pdf{transform:none}}
@page{size:A4 landscape;margin:0}
@media print{
  html{scroll-snap-type:none}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bar{display:none}
  .s{min-height:auto;height:210mm;page-break-after:always;break-after:page;border:0;padding:16mm 18mm;max-width:none}
  h1{font-size:54px}h2{font-size:38px;margin-bottom:1.2rem}.lead{font-size:19px}
  .grid3,.plans{grid-template-columns:repeat(3,1fr)}.plans{grid-template-columns:repeat(4,1fr)}.split{grid-template-columns:1.1fr 1fr}
}
'''
    js = '''
const S=[...document.querySelectorAll('.s')];
function cur(){const y=scrollY+innerHeight/2;return Math.max(0,S.findIndex(s=>s.offsetTop<=y&&s.offsetTop+s.offsetHeight>y))}
function go(d){const i=Math.min(S.length-1,Math.max(0,cur()+d));S[i].scrollIntoView({behavior:'smooth'})}
addEventListener('keydown',e=>{if(['ArrowDown','PageDown',' '].includes(e.key)){e.preventDefault();go(1)}if(['ArrowUp','PageUp'].includes(e.key)){e.preventDefault();go(-1)}});
addEventListener('scroll',()=>{document.getElementById('num').textContent=(cur()+1)+' / '+S.length},{passive:true});
'''
    html = ('<!DOCTYPE html>\n<html lang="uk">\n<head>\n<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
            '<title>Презентація для митних брокерів | МитнийБрокер</title>\n'
            '<meta name="description" content="Як каталог МитнийБрокер приводить клієнтів митним брокерам: заявки без комісії, сторінки областей, митний калькулятор з PDF, тарифи.">\n'
            '<link rel="canonical" href="https://forwardcarua.com/prezentatsiya">\n'
            '<meta property="og:title" content="МитнийБрокер — клієнти на розмитнення без комісії">\n'
            '<meta property="og:description" content="Презентація каталогу митних брокерів України для брокерів.">\n'
            '<meta property="og:url" content="https://forwardcarua.com/prezentatsiya">\n'
            '<meta property="og:type" content="website">\n'
            + COMMON_HEAD.replace('<link rel="stylesheet" href="/assets/css/app.css">', '') +
            '<style>' + css + '</style>\n' + ICONS + '</head>\n<body>\n' + '\n'.join(slides) +
            '\n<div class="bar"><span class="num" id="num">1 / ' + str(len(slides)) + '</span>'
            '<button onclick="go(-1)" aria-label="Назад"><i class="ti ti-chevron-up"></i></button>'
            '<button onclick="go(1)" aria-label="Далі"><i class="ti ti-chevron-down"></i></button>'
            '<button onclick="print()"><i class="ti ti-file-download"></i>PDF</button></div>\n'
            '<script>' + js + '</script>\n</body>\n</html>\n')
    write('prezentatsiya.html', html)


INSTR = [
 ('reyestratsiya', 'Реєстрація', '''
<p>Відкрийте <a href="/vhid?role=broker">forwardcarua.com/vhid</a>, оберіть <strong>«Я брокер»</strong> і пройдіть три короткі кроки:</p>
<ol>
<li><strong>Акаунт</strong> — ім'я, телефон, email і пароль (мінімум 8 символів).</li>
<li><strong>Профіль</strong> — назва компанії або ваше ім'я, місто, область, досвід, кілька речень про себе, телефон і Telegram.</li>
<li><strong>Послуги</strong> — оберіть послуги й вкажіть ціну «від». Цей крок можна пропустити й заповнити пізніше.</li>
</ol>
<p>Якщо ви отримали запрошення листом — просто перейдіть за посиланням з листа і підтвердіть підготовлений профіль.</p>'''),
 ('profil', 'Заповнення профілю', '''
<p>Профіль — це те, що клієнт бачить до дзвінка. Відредагувати його можна в кабінеті → <strong>«Профіль»</strong>.</p>
<ul>
<li><strong>Область і місто — обов'язково.</strong> Саме за ними вас показують на сторінці області (наприклад, «Митний брокер Львів»). Без області клієнти з пошуку вас не побачать.</li>
<li><strong>Про себе</strong> — 2–4 речення: на чому спеціалізуєтесь, скільки років досвіду, які пости обслуговуєте.</li>
<li><strong>Телефон і Telegram</strong> — клієнти часто пишуть у месенджер, а не телефонують.</li>
</ul>'''),
 ('posluhy', 'Послуги та ціни', '''
<p>Кабінет → <strong>«Послуги»</strong>. Позначте послуги, які надаєте, і вкажіть ціну «від» (і за бажанням «до»). Клієнти фільтрують каталог за послугою, а ціни в профілі підвищують кількість заявок — людям простіше звернутися, коли вони орієнтуються в сумі.</p>
<p>На безкоштовному тарифі в профілі до 3 послуг, на платних — більше.</p>'''),
 ('zayavky', 'Заявки', '''
<p>Нові заявки з'являються в кабінеті → <strong>«Заявки»</strong> і на дашборді. У заявці — послуга, дані авто або вантажу, терміновість, ім'я і телефон клієнта.</p>
<table><tr><th>Статус</th><th>Що означає</th></tr>
<tr><td>Нова</td><td>Клієнт щойно залишив заявку — зателефонуйте якомога швидше</td></tr>
<tr><td>В роботі</td><td>Ви зв'язалися з клієнтом і працюєте над замовленням</td></tr>
<tr><td>Завершена</td><td>Послугу надано</td></tr>
<tr><td>Відхилена</td><td>Замовлення не відбулося</td></tr></table>
<p><strong>Порада:</strong> відповідайте протягом години. Клієнт, який залишив заявку, часто паралельно шукає інших брокерів.</p>
<p>На безкоштовному тарифі — до 5 заявок на місяць, на «Стандарт» — до 30, на «Про» і «Преміум» — без ліміту.</p>'''),
 ('kalkulyator', 'Митний калькулятор і PDF для клієнта', '''
<p>Кабінет → <strong>«Калькулятор»</strong>.</p>
<ol>
<li>Вкажіть ім'я клієнта (воно буде в PDF) і, за бажанням, вартість ваших послуг.</li>
<li>Курс НБУ підтягується автоматично — за потреби змініть вручну.</li>
<li><strong>Легкове авто</strong> (усі тарифи): тип пального, вартість, рік, об'єм двигуна або ємність батареї, позначка EUR.1 для авто з ЄС.</li>
<li><strong>Будь-який товар за УКТ ЗЕД</strong> (платні тарифи): знайдіть товар за назвою або кодом (наприклад, «фотоелектричні» чи «8541») і оберіть країну походження — ставка ввізного мита підставиться з Митного тарифу України автоматично. Далі вкажіть вартість і кількість. Акциз для підакцизних товарів (алкоголь, тютюн, пальне, вантажівки, мотоцикли тощо) теж підставляється з Податкового кодексу — вкажіть кількість (літри, міцність, штуки, см³). Ставку за угодою про вільну торгівлю і пільги з ПДВ перевірте й за потреби виправте вручну.</li>
<li>Натисніть <strong>«Розрахувати»</strong> — за кілька секунд підготується PDF.</li>
<li>Надішліть клієнту: <strong>Telegram, Viber, WhatsApp, Email</strong> або скопіюйте посилання. Клієнт отримає підсумки в повідомленні і посилання на PDF з вашими контактами.</li>
</ol>
<p>Розрахунок орієнтовний — остаточну суму визначає митниця під час оформлення. Це зазначено в PDF.</p>'''),
 ('vizytivka', 'Електронна візитівка', '''
<p>Кабінет → <strong>«Візитівка»</strong> (платні тарифи). Це окрема сторінка <strong>forwardcarua.com/v/…</strong> з вашими контактами, послугами, рейтингом і QR-кодом.</p>
<ol>
<li>Оберіть фірмовий колір — з готових або будь-який свій (HEX), світлу чи темну тему й слоган під іменем. Праворуч одразу видно, як візитівку побачить клієнт.</li>
<li>Натисніть <strong>«Зберегти оформлення»</strong>.</li>
<li>Надсилайте посилання в <strong>Telegram, Viber, WhatsApp, Email</strong>, додайте в підпис листа чи шапку соцмереж.</li>
<li>Завантажте <strong>QR-код (PNG)</strong> для друку на паперових візитках, табличці в офісі чи наклейці на авто.</li>
</ol>
<p>Клієнт відкриває візитівку з телефону й одним дотиком дзвонить, пише в месенджер, <strong>зберігає ваш контакт</strong> у телефонну книгу або залишає заявку.</p>'''),
 ('konsultatsii', 'Консультації бухгалтера та юриста', '''
<p>Кабінет → <strong>«Консультації»</strong> (платні тарифи, безкоштовно).</p>
<ul>
<li><strong>Бухгалтер з митних питань</strong> (clerk.tax): ПДВ при імпорті та відшкодування, облік митних платежів, ЗЕД-контракти й валютний контроль, оподаткування ваших послуг.</li>
<li><strong>Юрист з митних питань</strong> («Адвокат Поруч»): оскарження рішень митниці, коригування митної вартості, протоколи про порушення митних правил, договори з клієнтами й перевізниками.</li>
</ul>
<p>Оберіть спеціаліста, вкажіть тему й опишіть ситуацію (персональні дані клієнта не потрібні) і спосіб зв'язку. Відповідь з'явиться в кабінеті, а за потреби спеціаліст вам зателефонує чи напише. Підготовка документів і представництво в суді — окремою послугою.</p>'''),
 ('vidhuky', 'Відгуки', '''
<p>Клієнти залишають відгуки у вашому профілі; після модерації вони стають публічними. Відповісти можна в кабінеті → <strong>«Відгуки»</strong> — відповідь бачать усі відвідувачі профілю.</p>
<p>Рейтинг і кількість відгуків впливають на позицію в каталозі, тож просіть задоволених клієнтів залишити відгук.</p>'''),
 ('taryfy', 'Тарифи й оплата', '''
<p>Кабінет → <strong>«Підписка»</strong>. Оплата через WayForPay карткою, Google Pay або Apple Pay — дані картки на наш сайт не потрапляють.</p>
<ul>
<li>Підписка <strong>не поновлюється автоматично</strong>: кожен період оплачується окремо. Якщо не продовжити — профіль переходить на безкоштовний тариф.</li>
<li>Річна оплата — <strong>−20%</strong>.</li>
<li>Повернення коштів — за умовами <a href="/terms#refund">публічної оферти</a>.</li>
</ul>
<p><a href="/taryfy">Порівняння тарифів</a></p>'''),
 ('porady', 'Як отримувати більше заявок', '''
<ul>
<li>Заповніть профіль повністю: область, місто, опис, Telegram, ціни.</li>
<li>Додайте всі послуги, які реально надаєте.</li>
<li>Відповідайте на заявки швидко — бажано протягом години.</li>
<li>Збирайте відгуки й відповідайте на них.</li>
<li>Надсилайте клієнтам розрахунки з калькулятора — PDF з вашими контактами працює як візитка.</li>
<li>Щоб показуватися по всій Україні та вище в списку — оберіть платний тариф.</li>
</ul>'''),
 ('pidtrymka', 'Підтримка', '''
<p>Питання щодо кабінету, оплати чи профілю:</p>
<ul>
<li>Телефон: <a href="tel:''' + CONTACT_TEL + '''">''' + CONTACT_PHONE + '''</a></li>
<li>Telegram: <a href="https://t.me/''' + CONTACT_TG + '''" target="_blank" rel="noopener">@''' + CONTACT_TG + '''</a></li>
<li>Email: <a href="mailto:''' + CONTACT_EMAIL + '''">''' + CONTACT_EMAIL + '''</a></li>
</ul>
<p>Пн–Пт 9:00–18:00, Сб 10:00–15:00.</p>'''),
]


def instruction(write, page, crumbs_ld):
    toc = ''.join('<li><a href="#%s">%s</a></li>' % (a, t) for a, t, _ in INSTR)
    secs = ''.join('<h2 id="%s">%d. %s</h2>%s' % (a, i + 1, t, b) for i, (a, t, b) in enumerate(INSTR))
    body = ('<article class="container-narrow page-hero"><div class="crumbs"><a href="/">Каталог</a> › '
            '<a href="/dlya-brokeriv">Для брокерів</a> › Інструкція</div>'
            '<h1 class="h-lg" style="font-size:clamp(28px,5vw,40px)">Інструкція для брокерів</h1>'
            '<p class="lead">Як зареєструватися, заповнити профіль, працювати із заявками, рахувати митні платежі й надсилати клієнтам PDF.</p>'
            '<div class="card" style="margin-top:1.5rem"><div class="card-title">Зміст</div><ol class="prose" style="margin:0 0 0 1.2rem">' + toc + '</ol></div>'
            '<div class="prose" style="margin-top:1rem">' + secs +
            '<div class="cta-band"><h3>Ще не зареєстровані?</h3><p>Реєстрація займає 3 хвилини, базовий профіль безкоштовний.</p>'
            '<div class="row"><a class="btn btn-primary" href="/vhid?role=broker"><i class="ti ti-user-plus"></i>Зареєструватись</a>'
            '<a class="btn btn-ghost" href="/prezentatsiya">Презентація платформи</a></div></div></div></article>')
    ld = [crumbs_ld([('Каталог', '/'), ('Для брокерів', '/dlya-brokeriv'), ('Інструкція', '/instruktsiya')]),
          {"@type": "HowTo", "name": "Як почати отримувати заявки в каталозі МитнийБрокер",
           "step": [{"@type": "HowToStep", "name": t, "url": "https://forwardcarua.com/instruktsiya#" + a} for a, t, _ in INSTR[:5]]}]
    write('instruktsiya.html', page('/instruktsiya', 'Інструкція для митних брокерів | МитнийБрокер',
          'Покрокова інструкція: реєстрація, профіль, послуги, заявки, митний калькулятор і PDF для клієнта, відгуки, тарифи.',
          body, ld, active='/dlya-brokeriv'))
