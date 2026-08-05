/* =========================================================
   assets/js/config.js
   Підключати ПЕРШИМ на кожній сторінці:
   <script src="/assets/js/config.js"></script>
   <script src="/assets/js/db.js"></script>

   Anon-ключ публічний за задумом — доступ до даних
   визначають політики RLS у базі, а не секретність ключа.
   ========================================================= */

const SUPABASE_URL  = 'https://ecdfpqhbaqjqurzedunh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjZGZwcWhiYXFqcXVyemVkdW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzU3NTIsImV4cCI6MjA5NDg1MTc1Mn0.t0ry-slbPVwVHmF1KLzWX6EDonWBMC2Uu3KUobH8oFY';
const CHECKOUT_FN   = SUPABASE_URL + '/functions/v1/wayforpay-checkout';

/* ---------- Завантаження SDK ---------- */
(function loadSupabase(){
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  s.onload = () => {
    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    window.dispatchEvent(new Event('supabase-ready'));
  };
  s.onerror = () => {
    document.body?.insertAdjacentHTML('afterbegin',
      '<div style="background:#F1654B;color:#fff;padding:12px;text-align:center;font-size:14px">' +
      'Не вдалося підключитись до сервера. Перевірте інтернет і оновіть сторінку.</div>');
  };
  document.head.appendChild(s);
})();

window.sbReady = () => new Promise(res => {
  if (window.sb) return res(window.sb);
  window.addEventListener('supabase-ready', () => res(window.sb), { once:true });
});

/* ---------- Довідники ---------- */
const REGIONS = ['Вінницька','Волинська','Дніпропетровська','Донецька','Житомирська','Закарпатська','Запорізька','Івано-Франківська','Київська','Кіровоградська','Луганська','Львівська','Миколаївська','Одеська','Полтавська','Рівненська','Сумська','Тернопільська','Харківська','Херсонська','Хмельницька','Черкаська','Чернівецька','Чернігівська','м. Київ'];
const SLUGS   = ['vinnytska','volynska','dnipropetrovska','donetska','zhytomyrska','zakarpatska','zaporizka','ivano-frankivska','kyivska','kirovohradska','luhanska','lvivska','mykolaivska','odeska','poltavska','rivnenska','sumska','ternopilska','kharkivska','khersonska','khmelnytska','cherkaska','chernivetska','chernihivska','kyiv'];

const SERVICES = [
  { id:'customs',  name:'Розмитнення авто',        icon:'🚗', desc:'Авто з-за кордону' },
  { id:'usa',      name:'Авто зі США',             icon:'🇺🇸', desc:'Аукціони Copart / IAAI' },
  { id:'eval',     name:'Оцінка авто',             icon:'📄', desc:'Для банку або продажу' },
  { id:'contract', name:'Договір купівлі-продажу', icon:'✍️', desc:'Оформлення угоди' },
  { id:'clearing', name:'Митне оформлення',        icon:'🏛️', desc:'Вантажі та товари' },
  { id:'consult',  name:'Консультація',            icon:'💬', desc:'Питання та поради' }
];
const SERVICE_NAMES = SERVICES.map(s => s.name);

const URGENCIES = ['Терміново (сьогодні)','Найближчі 2–3 дні','Цього тижня','Не поспішаю'];

/* Ціни в одному місці. Річна = 12 місяців мінус 20%.
   Ті самі числа стоять в оферті та в edge-функції — при зміні
   правити всі три, інакше еквайр побачить розбіжність. */
const PLANS = {
  free:     { label:'Безкоштовний', month:0,   year:0,    emoji:'🆓', desc:'Профіль у каталозі, до 5 заявок на місяць' },
  standard: { label:'Стандарт',     month:299, year:2870, emoji:'⚡', desc:'Вся Україна, до 30 заявок на місяць' },
  pro:      { label:'Про',          month:599, year:5750, emoji:'🏆', desc:'Без ліміту заявок, вища позиція в списку' },
  premium:  { label:'Преміум',      month:999, year:9590, emoji:'💎', desc:'Перша позиція в каталозі, банер на головній' }
};
const PLAN_RANK = { premium:0, pro:1, standard:2, free:3 };

const REQUEST_STATUS = {
  new:      { label:'Нова',       color:'var(--blue)'  },
  accepted: { label:'В роботі',   color:'var(--amber)' },
  done:     { label:'Завершена',  color:'var(--green)' },
  declined: { label:'Відхилена',  color:'var(--red)'   }
};

const REVIEW_STATUS = {
  pending:   { label:'На модерації' },
  published: { label:'Опублікований' },
  rejected:  { label:'Відхилений' }
};

const CONTACTS = {
  email: 'custom@forwardcarua.com',
  phone: '+380981722342',
  phoneLabel: '+38 098 172 23 42',
  telegram: 'Dimakrykun95',
  company: 'ТОВ «ФОРВАРД КАР ЮА»',
  edrpou: '45002097',
  address: '45400, Волинська обл., м. Нововолинськ, вул. Святого Володимира, 23, офіс 1',
  hours: 'Пн–Пт 9:00–18:00, Сб 10:00–15:00'
};

/* ---------- Хелпери ---------- */
function esc(v){
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function initials(n){
  return (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase();
}
function planLabel(p){ return (PLANS[p] || PLANS.free).label; }
function planEmoji(p){ return (PLANS[p] || PLANS.free).emoji; }
function regionSlug(region){ const i = REGIONS.indexOf(region); return i < 0 ? null : SLUGS[i]; }
function slugRegion(slug){ const i = SLUGS.indexOf(slug); return i < 0 ? null : REGIONS[i]; }

function plural(n, one, few, many){
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
function timeAgo(iso){
  if (!iso) return '';
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60)    return 'щойно';
  if (d < 3600)  return Math.floor(d/60) + ' хв тому';
  if (d < 86400) return Math.floor(d/3600) + ' год тому';
  if (d < 2592000) return Math.floor(d/86400) + ' ' + plural(Math.floor(d/86400),'день','дні','днів') + ' тому';
  return new Date(iso).toLocaleDateString('uk-UA');
}
function fmtDate(iso){ return iso ? new Date(iso).toLocaleDateString('uk-UA') : '—'; }
function fmtMoney(n){ return Number(n || 0).toLocaleString('uk-UA') + ' грн'; }

function telHref(p){ return 'tel:' + String(p || '').replace(/[^\d+]/g, ''); }
function tgHref(t){  return 'https://t.me/' + String(t || '').replace(/^@/,'').replace(/[^A-Za-z0-9_]/g,''); }
function waHref(p){  return 'https://wa.me/' + String(p || '').replace(/\D/g,''); }
function normalizePhone(p){ return String(p || '').replace(/\D/g,''); }
function isValidPhone(p){ return normalizePhone(p).length >= 9; }
function isValidEmail(e){ return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '').trim()); }

/* ---------- Тост ---------- */
function showToast(msg, type = 'success'){
  let t = document.getElementById('app-toast');
  if (!t){
    t = document.createElement('div');
    t.id = 'app-toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'toast show' + (type === 'error' ? ' toast-error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 4000);
}

/* ---------- Аналітика ---------- */
function track(event, params = {}){
  if (typeof gtag === 'function') gtag('event', event, params);
}
