# МитнийБрокер × Supabase — Готова інтеграція

Ключі вже вставлені. Зроби 3 кроки:

---

## Крок 1 — Виконай SQL схему

1. Supabase → **SQL Editor**
2. Вставити весь текст з `schema.sql`
3. Натиснути **Run**

---

## Крок 2 — Завантаж JS файли на сайт

Скопіюй `assets/js/` у GitHub репозиторій поруч з існуючими файлами.

---

## Крок 3 — Підключи на кожній сторінці

Додай у `<head>` кожного HTML **перед** іншими скриптами:

```html
<script src="/assets/js/supabase.js"></script>
<script src="/assets/js/auth.js"></script>
<script src="/assets/js/db.js"></script>
```

---

## Використання в коді

### Реєстрація брокера
```js
// Кнопка "Зареєструватись"
<button onclick="submitRegistration()">Зареєструватись</button>
```

### Вхід
```js
<button onclick="submitLogin()">Увійти</button>
// + поля з id="loginEmail" і id="loginPassword"
```

### Захист кабінету (на початку cabinet/*.html)
```html
<script>
window.addEventListener('supabase-ready', async () => {
  const user = await requireAuth();
  if (!user) return;
  const dash = await loadDashboard();
  // рендер даних
});
</script>
```

### Каталог брокерів з БД
```js
const brokers = await loadBrokers({ region: 'Київська', sort: 'rating' });
```

### Зберегти заявку клієнта
```js
await saveRequest(data); // data — об'єкт з формою request.html
```

### Завантажити відгуки
```js
const reviews = await loadReviews(brokerId, { filter: '5', sort: 'newest' });
```

### Залишити відгук
```js
await submitReview({ brokerId, authorName, rating, service, body });
```

### Відповідь брокера на відгук
```js
await replyToReview(reviewId, brokerId, 'Дякуємо за відгук!');
```

---

## Файли

| Файл | Призначення |
|---|---|
| `schema.sql` | Таблиці + тригери + RLS |
| `assets/js/supabase.js` | Підключення (ключі вже є) |
| `assets/js/auth.js` | Реєстрація, вхід, захист |
| `assets/js/db.js` | Всі функції БД в одному файлі |
