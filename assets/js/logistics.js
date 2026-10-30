/* logistics.js — довідники для розділу перевізників і карти пунктів пропуску */
const CARGO_COUNTRIES = ['Україна', 'Польща', 'Німеччина', 'Литва', 'Латвія', 'Естонія', 'Чехія', 'Словаччина', 'Угорщина', 'Румунія',
  'Молдова', 'Болгарія', 'Австрія', 'Нідерланди', 'Бельгія', 'Франція', 'Італія', 'Іспанія', 'Данія', 'Швеція', 'Фінляндія',
  'Велика Британія', 'Туреччина', 'Грузія', 'Казахстан', 'Китай', 'США', 'Інша країна'];

const TRANSPORT_TYPES = ['Тент', 'Рефрижератор', 'Ізотерм', 'Контейнер', 'Автовоз', 'Мега / Jumbo', 'Бус до 3,5 т',
  'Платформа / негабарит', 'Цистерна', 'Самоскид', 'ADR (небезпечні вантажі)', 'Збірні вантажі'];

/* Пункти пропуску й митні термінали, де працюють брокери (id — стабільний ключ у базі) */
const BORDER_POSTS = [
  { id: 'yahodyn',     name: 'Ягодин — Дорогуськ',      country: 'Польща',     region: 'Волинська' },
  { id: 'ustyluh',     name: 'Устилуг — Зосин',          country: 'Польща',     region: 'Волинська' },
  { id: 'shehyni',     name: 'Шегині — Медика',          country: 'Польща',     region: 'Львівська' },
  { id: 'krakovets',   name: 'Краківець — Корчова',      country: 'Польща',     region: 'Львівська' },
  { id: 'rava',        name: 'Рава-Руська — Гребенне',   country: 'Польща',     region: 'Львівська' },
  { id: 'hrushiv',     name: 'Грушів — Будомєж',         country: 'Польща',     region: 'Львівська' },
  { id: 'uhryniv',     name: 'Угринів — Долгобичув',     country: 'Польща',     region: 'Львівська' },
  { id: 'smilnytsia',  name: 'Смільниця — Кросценко',    country: 'Польща',     region: 'Львівська' },
  { id: 'horodok',     name: 'Митний термінал у Городку', country: '',          region: 'Львівська' },
  { id: 'chop',        name: 'Чоп (Тиса) — Захонь',      country: 'Угорщина',   region: 'Закарпатська' },
  { id: 'luzhanka',    name: 'Лужанка — Берегшурань',    country: 'Угорщина',   region: 'Закарпатська' },
  { id: 'uzhhorod',    name: 'Ужгород — Вишнє Нємецьке', country: 'Словаччина', region: 'Закарпатська' },
  { id: 'malyi',       name: 'Малий Березний — Убля',    country: 'Словаччина', region: 'Закарпатська' },
  { id: 'diakove',     name: 'Дякове — Халмеу',          country: 'Румунія',    region: 'Закарпатська' },
  { id: 'solotvyno',   name: 'Солотвино — Сігету-Мармацієй', country: 'Румунія', region: 'Закарпатська' },
  { id: 'porubne',     name: 'Порубне — Сірет',          country: 'Румунія',    region: 'Чернівецька' },
  { id: 'diakivtsi',   name: 'Дяківці — Раковець',       country: 'Румунія',    region: 'Чернівецька' },
  { id: 'mamalyha',    name: 'Мамалига — Крива',         country: 'Молдова',    region: 'Чернівецька' },
  { id: 'rososhany',   name: 'Росошани — Бричень',       country: 'Молдова',    region: 'Чернівецька' },
  { id: 'mohyliv',     name: 'Могилів-Подільський — Отач', country: 'Молдова',  region: 'Вінницька' },
  { id: 'palanka',     name: 'Паланка — Маяки-Удобне',   country: 'Молдова',    region: 'Одеська' },
  { id: 'kuchurhan',   name: 'Кучурган — Первомайськ',   country: 'Молдова',    region: 'Одеська' },
  { id: 'orlivka',     name: 'Орлівка — Ісакча (пором)', country: 'Румунія',    region: 'Одеська' },
  { id: 'odesa-port',  name: 'Порти Одеса / Чорноморськ / Південний', country: '', region: 'Одеська' },
  { id: 'izmail-port', name: 'Порти Ізмаїл / Рені',      country: '',           region: 'Одеська' },
  { id: 'kyiv-msz',    name: 'Київ — митні пости та МЛС', country: '',          region: 'м. Київ' }
];
const postName = id => (BORDER_POSTS.find(p => p.id === id) || {}).name || id;
const CURRENCIES = ['UAH', 'EUR', 'USD', 'PLN'];
const PAY_TERMS = ['Готівка при завантаженні', 'Готівка при вивантаженні', 'Безготівка з ПДВ', 'Безготівка без ПДВ', 'Передоплата', 'Відстрочка оплати'];
/* ISO-коди країн — для пошуку міст на карті */
const COUNTRY_CODES = { 'Україна':'ua', 'Польща':'pl', 'Німеччина':'de', 'Литва':'lt', 'Латвія':'lv', 'Естонія':'ee', 'Чехія':'cz', 'Словаччина':'sk',
  'Угорщина':'hu', 'Румунія':'ro', 'Молдова':'md', 'Болгарія':'bg', 'Австрія':'at', 'Нідерланди':'nl', 'Бельгія':'be', 'Франція':'fr', 'Італія':'it',
  'Іспанія':'es', 'Данія':'dk', 'Швеція':'se', 'Фінляндія':'fi', 'Велика Британія':'gb', 'Туреччина':'tr', 'Грузія':'ge', 'Казахстан':'kz', 'Китай':'cn', 'США':'us' };
/* Підпис габаритів і кілометражу для карток вантажу */
function cargoDims(x){
  const d = [x.length_m, x.width_m, x.height_m].every(v => v) ? x.length_m + '×' + x.width_m + '×' + x.height_m + ' м' : '';
  return [d, x.places ? x.places + ' місць' : ''].filter(Boolean).join(', ');
}
function cargoMapsUrl(x){
  const p = (c, ct, la, lo) => la && lo ? la + ',' + lo : [c, ct].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(p(x.from_city, x.from_country, x.from_lat, x.from_lon)) +
    '&destination=' + encodeURIComponent(p(x.to_city, x.to_country, x.to_lat, x.to_lon));
}
