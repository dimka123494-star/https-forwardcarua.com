// mobile.js — мобільна навігація і touch покращення
// Підключи перед закриваючим </body> на кожній сторінці:
// <script src="/assets/js/mobile.js"></script>

(function() {
  'use strict';

  // ---- БУРГЕР МЕНЮ ----
  function initBurger() {
    // Додаємо бургер і мобільне меню якщо їх ще немає
    const nav = document.querySelector('.nav');
    if (!nav) return;

    // Збираємо посилання з десктопної навігації
    const navLinks = nav.querySelector('.nav-links');
    const links = navLinks ? Array.from(navLinks.querySelectorAll('a')) : [];

    // Додаємо бургер
    if (!document.querySelector('.nav-burger')) {
      const burger = document.createElement('div');
      burger.className = 'nav-burger';
      burger.setAttribute('aria-label', 'Меню');
      burger.setAttribute('role', 'button');
      burger.innerHTML = '<span></span><span></span><span></span>';
      nav.insertBefore(burger, nav.querySelector('.nav-cta') || nav.lastChild);

      // Мобільне меню
      const mobileMenu = document.createElement('div');
      mobileMenu.className = 'nav-mobile-menu';

      // Поточний шлях для підсвічування активного пункту
      const path = location.pathname;

      const menuLinks = [
        { href: '/catalog.html', label: '🔍 Каталог брокерів' },
        { href: '/request.html', label: '📨 Залишити заявку' },
        { href: '/index.html', label: '💰 Тарифи' },
      ];

      menuLinks.forEach(l => {
        const a = document.createElement('a');
        a.href = l.href;
        a.textContent = l.label;
        if (path.includes(l.href.replace('.html', ''))) a.className = 'active';
        mobileMenu.appendChild(a);
      });

      // Розділювач
      const div = document.createElement('div');
      div.className = 'nav-divider';
      mobileMenu.appendChild(div);

      // Кабінет
      const cab = document.createElement('a');
      cab.href = '/cabinet/dashboard.html';
      cab.textContent = '👤 Кабінет брокера';
      cab.style.cssText = 'background:#FAEEDA;color:#633806;font-weight:500';
      mobileMenu.appendChild(cab);

      document.body.insertBefore(mobileMenu, document.body.firstChild.nextSibling);

      // Toggle
      burger.addEventListener('click', () => {
        burger.classList.toggle('open');
        mobileMenu.classList.toggle('open');
        document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
      });

      // Закрити при кліку поза меню
      document.addEventListener('click', e => {
        if (!nav.contains(e.target) && !mobileMenu.contains(e.target)) {
          burger.classList.remove('open');
          mobileMenu.classList.remove('open');
          document.body.style.overflow = '';
        }
      });
    }
  }

  // ---- НИЖНЯ НАВІГАЦІЯ ----
  function initBottomNav() {
    if (document.querySelector('.mobile-bottom-nav')) return;

    const path = location.pathname;
    const isCabinet = path.includes('/cabinet/');

    const nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Мобільна навігація');

    const items = isCabinet ? [
      { href: '/cabinet/dashboard.html', icon: '📊', label: 'Дашборд' },
      { href: '/cabinet/reviews.html', icon: '⭐', label: 'Відгуки', badge: 2 },
      { href: '/catalog.html', icon: '🔍', label: 'Каталог' },
      { href: '/cabinet/analytics.html', icon: '📈', label: 'Аналітика' },
      { href: '/cabinet/subscription.html', icon: '💳', label: 'Тариф' },
    ] : [
      { href: '/index.html', icon: '🏠', label: 'Головна' },
      { href: '/catalog.html', icon: '🔍', label: 'Каталог' },
      { href: '/request.html', icon: '📨', label: 'Заявка' },
      { href: '/cabinet/dashboard.html', icon: '👤', label: 'Кабінет' },
    ];

    items.forEach(item => {
      const a = document.createElement('a');
      a.href = item.href;

      const isActive = path === item.href || (item.href !== '/index.html' && path.includes(item.href.replace('.html', '')));
      if (isActive) a.className = 'active';

      a.innerHTML = `<span class="icon">${item.icon}</span><span>${item.label}</span>`;

      if (item.badge) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = item.badge;
        a.appendChild(badge);
      }

      nav.appendChild(a);
    });

    document.body.appendChild(nav);
  }

  // ---- МОБІЛЬНИЙ HERO CTA ----
  function initMobileCta() {
    // Додаємо мобільні кнопки під hero якщо є .hero-cta
    const heroCta = document.querySelector('.hero-cta');
    if (!heroCta) return;
    if (document.querySelector('.hero-cta-mobile')) return;

    const mobileCta = document.createElement('div');
    mobileCta.className = 'hero-cta-mobile';
    mobileCta.style.display = 'none'; // показується через CSS на мобільному

    // Клонуємо кнопки
    heroCta.querySelectorAll('.btn, button, a').forEach(btn => {
      const clone = btn.cloneNode(true);
      mobileCta.appendChild(clone);
    });

    // Вставляємо після hero
    const hero = document.querySelector('.hero');
    if (hero) hero.after(mobileCta);
  }

  // ---- ПЛАВНИЙ СКРОЛ ДО ФОРМИ ----
  function initScrollToForm() {
    document.querySelectorAll('[data-scroll-to]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.querySelector(btn.dataset.scrollTo);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ---- PULL-TO-REFRESH ЗАПОБІГАННЯ ----
  // Запобігаємо небажаному pull-to-refresh на iOS
  let startY = 0;
  document.addEventListener('touchstart', e => { startY = e.touches[0].pageY; }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (window.scrollY === 0 && e.touches[0].pageY > startY + 10) {
      // Дозволяємо нативний скрол
    }
  }, { passive: true });

  // ---- ІНІЦІАЛІЗАЦІЯ ----
  function init() {
    const isMobile = window.innerWidth <= 768;

    initBurger();

    if (isMobile) {
      initBottomNav();
      initMobileCta();
      initScrollToForm();
    }

    // Оновлення при зміні розміру вікна
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const nowMobile = window.innerWidth <= 768;
        if (nowMobile) {
          initBottomNav();
          initMobileCta();
        }
      }, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
