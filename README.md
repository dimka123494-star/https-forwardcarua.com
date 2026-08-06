# forwardcarua.com — структура і розгортання

## 1. Що має лишитись у репозиторії

```
/
├── index.html            каталог брокерів + тарифи
├── vhid.html             вхід і реєстрація (брокер / клієнт)
├── broker.html           публічний профіль брокера → /broker/{id}
├── request.html          майстер заявки → /zayavka
├── kabinet.html          кабінет брокера → /kabinet
├── moi-zayavky.html      кабінет клієнта → /moi-zayavky
├── admin.html            адмін-панель → /admin
├── terms.html            публічна оферта → /terms
├── _redirects            маршрути Netlify
├── _headers              заголовки безпеки
├── robots.txt
├── sitemap.xml
└── assets/
    ├── css/app.css       дизайн-система
    └── js/
        ├── config.js     ключі, довідники, хелпери
        └── db.js         увесь доступ до бази
```

Окремо, поза репозиторієм сайту:
- `db-setup-full.sql` — виконується в Supabase SQL Editor
- `wayforpay-checkout.ts`, `wayforpay-callback.ts` — Supabase Edge Functions

## 2. Що ВИДАЛИТИ з репозиторію

Ці файли замінені. Поки вони лежать у репозиторії, Netlify їх публікує,
і на них можна зайти напряму за прямим посиланням.

**Обов'язково — містять форму картки або вигадані дані:**

| Файл | Чому |
|---|---|
| `subscription.html` | Збирає номер картки і CVV на своїй сторінці, показує «Оплата успішна» без списання |
| `cabinet/subscription.html` | Те саме |
| `catalog.html` | Каталог із 8 вигаданих брокерів у коді |
| `broker-profile.html` | Вигаданий профіль з чужим телефоном і email |
| `request.html` (стара версія) | Заявка нікуди не зберігалась |
| `reviews.html`, `cabinet/reviews.html` | Вигадані відгуки в масиві |
| `admin-reviews.html` | Модерація змінювала змінну в браузері, не базу |
| `analytics.html`, `cabinet/analytics.html` | Намальовані графіки з вигаданими цифрами |

**Замінені новими:**

`login.html` (обидві копії) · `dashboard.html` · `cabinet/dashboard.html` ·
`broker-dashboard.html` · `client-dashboard.html` · `profile.html` ·
`broker/profile.html` · `assets/js/main.js` · `assets/js/supabase.js` ·
`assets/js/dashboard.js` · `assets/css/style.css` · `style.css` · `ai-chat.js`

**Про `ai-chat.js` окремо:** він звертався до api.anthropic.com напряму з браузера.
Без ключа це не працює, а з ключем — ключ стає публічним. Якщо AI-чат потрібен,
його треба переносити в Edge Function; поки що видаляємо.

Після видалення перевірте, що жодна папка `cabinet/` і `broker/` не лишилась.

## 3. Порядок розгортання

1. **База.** Supabase → Database → Backups (бекап) → SQL Editor → виконати `db-setup-full.sql`.
2. **Адмін.** Authentication → Users → Add user (`custom@forwardcarua.com`, Auto Confirm),
   потім у SQL Editor:
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'custom@forwardcarua.com'
   on conflict (user_id) do nothing;
   ```
3. **Свій профіль брокера:**
   ```sql
   update public.brokers b set user_id = u.id
   from auth.users u
   where u.email = 'custom@forwardcarua.com'
     and b.email = 'custom@forwardcarua.com' and b.user_id is null;
   ```
4. **Вигадані брокери.** Спершу перевірити, чи немає на них заявок:
   ```sql
   select b.name, count(r.id) from public.brokers b
   left join public.requests r on r.broker_id = b.id
   where b.email like '%@example.com' group by b.name;
   ```
   Якщо нуль — `delete from public.brokers where email like '%@example.com';`
5. **Файли.** Видалити старі, залити нові, дочекатись деплою Netlify.
6. **Оплата.**
   ```
   supabase secrets set WFP_MERCHANT=... WFP_SECRET=...
   supabase functions deploy wayforpay-checkout
   supabase functions deploy wayforpay-callback --no-verify-jwt
   ```
   У WayForPay вказати Service URL:
   `https://<project>.supabase.co/functions/v1/wayforpay-callback`

## 4. Що перевірити після деплою

- [ ] `/` — каталог показує реальних брокерів
- [ ] Вибір області міняє URL на `/brokery/odeska` і title сторінки
- [ ] `/broker/{id}` — профіль відкривається, видно послуги й контакти
- [ ] `/zayavka` — заявка проходить усі 4 кроки і з'являється в кабінеті брокера
- [ ] `/vhid` — реєстрація клієнта веде в `/moi-zayavky`, брокера — в `/kabinet`
- [ ] `/kabinet` — заявки, зміна статусу, збереження профілю, послуги
- [ ] `/admin` — вхід лише під адмінським акаунтом
- [ ] Відгук з профілю брокера з'являється в адмінці зі статусом «На модерації»
- [ ] Після публікації відгуку рейтинг брокера перерахувався автоматично

## 5. Що лишилось зробити

- **Ціни в трьох місцях.** `PLANS` у `config.js`, таблиця в `terms.html`
  і `PLANS` в `wayforpay-checkout.ts` мають збігатися. При зміні — правити всі три.
- **ПДВ в оферті.** Зараз написано «ціни остаточні». Якщо ТОВ на єдиному податку
  без ПДВ — краще вказати прямо.
- **Нагадування про завершення підписки.** Оферта обіцяє лист за кілька днів
  до кінця періоду — це ще не реалізовано. Потрібен cron у Supabase.
- **Статичні сторінки регіонів.** Зараз `/brokery/{область}` рендериться
  на клієнті. Коли в каталозі буде 20+ брокерів, варто генерувати
  справжні HTML для кожної області.
