# Мобільна адаптація — Інструкція

## Що додати на КОЖНУ HTML сторінку

### 1. У `<head>` — після style.css

```html
<!-- Мобільні стилі -->
<link rel="stylesheet" href="/assets/css/mobile.css">

<!-- PWA meta теги (для iOS/Android) -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="МитнийБрокер">
<meta name="theme-color" content="#FAEEDA">
<link rel="apple-touch-icon" href="/assets/img/icon-192.png">
```

### 2. Перед `</body>` — мобільний скрипт

```html
<script src="/assets/js/mobile.js"></script>
```

---

## Що додається автоматично

`mobile.js` автоматично додає на кожну сторінку:

- **Бургер-меню** (☰) замість горизонтальних посилань
- **Нижню навігацію** (як в додатках) — з іконками і підписами
- **Мобільні CTA кнопки** під шапкою профілю брокера

---

## Виправлення для конкретних сторінок

### index.html — форма реєстрації

```html
<!-- Кнопка "Зареєструватись" має data-scroll-to -->
<button data-scroll-to="#registration-form">Зареєструватись як брокер</button>
```

### catalog.html — пошук

Вже адаптовано через CSS — `.search-row` стає вертикальним на мобільному.

### broker/profile.html — кнопки CTA

Вже адаптовано — `.hero-cta` ховається, `.hero-cta-mobile` показується під шапкою.

### request.html — форма заявки

Вже адаптовано — `.form-row` стає одноколонковим, `.actions` — вертикальним.

### cabinet/*.html — кабінет

Горизонтальний скрол у `.cab-nav`, нижня навігація з іконками кабінету.

---

## Швидка перевірка на мобільному

1. Chrome DevTools → F12 → Toggle Device Toolbar (Ctrl+Shift+M)
2. Вибери "iPhone 14" або "Samsung Galaxy S21"
3. Перевір всі сторінки

Ключові точки перевірки:
- [ ] Навігація відкривається бургером
- [ ] Форми не вимагають горизонтального скролу
- [ ] Кнопки не менше 44px висотою
- [ ] Текст не менше 14px (без зуму на iOS)
- [ ] Нижня навігація не перекриває контент
- [ ] Safe area на iPhone з чубчиком (notch)
