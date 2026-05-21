// supabase-init.js
// Цей файл підключає Supabase і замінює демо-реєстрацію на реальну
// Завантаж на GitHub і він підключиться через supabase.js який вже є

(function() {

  const SURL = 'https://ecdfpqhbaqjqurzedunh.supabase.co';
  const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjZGZwcWhiYXFqcXVyemVkdW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzU3NTIsImV4cCI6MjA5NDg1MTc1Mn0.t0ry-slbPVwVHmF1KLzWX6EDonWBMC2Uu3KUobH8oFY';

  // Чекаємо поки завантажиться бібліотека Supabase
  function waitForSupabase(cb) {
    if (window.supabase) {
      window.sb = window.supabase.createClient(SURL, SKEY);
      cb();
    } else {
      // Підвантажуємо бібліотеку якщо ще немає
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload = () => {
        window.sb = window.supabase.createClient(SURL, SKEY);
        cb();
      };
      document.head.appendChild(s);
    }
  }

  // =============================================
  // РЕЄСТРАЦІЯ БРОКЕРА
  // =============================================
  window.registerBroker = async function() {
    // Збираємо дані з форми (підтримує обидві версії форми)
    const name     = (document.getElementById('regName')     || document.getElementById('reg-name'))?.value?.trim();
    const city     = (document.getElementById('regCity')     || document.getElementById('reg-city'))?.value?.trim();
    const region   = (document.getElementById('regRegion')   || document.getElementById('reg-region'))?.value;
    const phone    = (document.getElementById('regPhone')    || document.getElementById('reg-phone'))?.value?.trim();
    const telegram = (document.getElementById('regTelegram') || document.getElementById('reg-telegram'))?.value?.trim();
    const email    = (document.getElementById('regEmail')    || document.getElementById('reg-email'))?.value?.trim();
    const password = (document.getElementById('regPassword') || document.getElementById('reg-password'))?.value;

    // Валідація
    if (!name)     { showMsg('❌ Введіть імʼя або назву компанії', 'error'); return; }
    if (!email)    { showMsg('❌ Введіть email', 'error'); return; }
    if (!password || password.length < 6) { showMsg('❌ Пароль мінімум 6 символів', 'error'); return; }

    const btn = document.getElementById('registerBtn') || document.querySelector('[data-action="register"]');
    const origText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Реєстрація...'; }

    try {
      // 1. Створити акаунт
      const { data: authData, error: authErr } = await window.sb.auth.signUp({ email, password });
      if (authErr) throw authErr;

      // 2. Зберегти профіль брокера
      const { error: brokerErr } = await window.sb.from('brokers').insert({
        user_id: authData.user.id,
        name:    name     || null,
        city:    city     || null,
        region:  region   || null,
        phone:   phone    || null,
        telegram:telegram || null,
        email:   email,
        plan:    'free',
        is_active: true
      });
      if (brokerErr) throw brokerErr;

      showMsg('✅ Реєстрація успішна! Переходимо в кабінет...', 'success');
      setTimeout(() => { location.href = '/dashboard.html'; }, 1500);

    } catch (err) {
      console.error('Помилка реєстрації:', err);
      let msg = err.message || 'Невідома помилка';
      if (msg.includes('already registered')) msg = 'Цей email вже зареєстрований. Спробуйте увійти.';
      if (msg.includes('Password should be')) msg = 'Пароль мінімум 6 символів';
      showMsg('❌ ' + msg, 'error');
      if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
  };

  // =============================================
  // ВХІД В КАБІНЕТ
  // =============================================
  window.loginBroker = async function() {
    const email    = (document.getElementById('loginEmail')    || document.getElementById('login-email'))?.value?.trim();
    const password = (document.getElementById('loginPassword') || document.getElementById('login-password'))?.value;

    if (!email || !password) { showMsg('❌ Введіть email і пароль', 'error'); return; }

    try {
      const { error } = await window.sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      location.href = '/dashboard.html';
    } catch (err) {
      let msg = err.message || 'Помилка входу';
      if (msg.includes('Invalid login')) msg = 'Невірний email або пароль';
      showMsg('❌ ' + msg, 'error');
    }
  };

  // =============================================
  // ВИХІД
  // =============================================
  window.logoutBroker = async function() {
    await window.sb.auth.signOut();
    location.href = '/index.html';
  };

  // =============================================
  // ЗАВАНТАЖЕННЯ КАТАЛОГУ БРОКЕРІВ
  // =============================================
  window.loadCatalog = async function() {
    const container = document.getElementById('brokersList') || document.getElementById('catalog');
    if (!container) return;

    try {
      const { data: brokers } = await window.sb
        .from('brokers')
        .select('*, broker_services(name, price_from)')
        .eq('is_active', true)
        .order('plan', { ascending: false })
        .limit(50);

      if (!brokers || brokers.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#73726c;padding:2rem">Поки немає брокерів. Будьте першим!</p>';
        return;
      }

      const planEmoji = { premium: '💎', pro: '🏆', standard: '⚡', free: '🆓' };

      container.innerHTML = brokers.map(b => `
        <div class="broker-card" onclick="location.href='/profile.html?id=${b.id}'">
          <div class="card-top">
            <div class="av">${(b.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>
            <div class="card-info">
              <div class="card-name">${b.name || 'Брокер'} <span class="badge">${planEmoji[b.plan]||''} ${b.plan||''}</span></div>
              <div class="card-loc">📍 ${b.city || ''} ${b.region ? '· '+b.region : ''}</div>
            </div>
            <div class="card-rating">
              <div>${b.rating_avg ? b.rating_avg+'★' : '—'}</div>
              <div style="font-size:11px;color:#73726c">${b.rating_count || 0} відгуків</div>
            </div>
          </div>
          ${b.broker_services?.length ? `<div class="svcs">${b.broker_services.slice(0,3).map(s=>`<span class="svc-tag">${s.name}${s.price_from?' від '+s.price_from+' ₴':''}</span>`).join('')}</div>` : ''}
        </div>
      `).join('');

    } catch (err) {
      console.error('Помилка завантаження каталогу:', err);
    }
  };

  // =============================================
  // ХЕЛПЕР: показати повідомлення
  // =============================================
  function showMsg(text, type) {
    // Шукаємо існуючий елемент для повідомлень
    let el = document.getElementById('regMessage') || document.getElementById('authMessage');

    if (!el) {
      // Створюємо новий якщо немає
      el = document.createElement('div');
      el.id = 'regMessage';
      el.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;font-size:14px;z-index:9999;max-width:320px;box-shadow:0 4px 12px rgba(0,0,0,.15)';
      document.body.appendChild(el);
    }

    el.textContent = text;
    el.style.display = 'block';
    el.style.background = type === 'success' ? '#E1F5EE' : '#FCEBEB';
    el.style.color = type === 'success' ? '#085041' : '#791F1F';
    el.style.border = type === 'success' ? '0.5px solid #5DCAA5' : '0.5px solid #F09595';

    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  // =============================================
  // ПЕРЕХОПЛЕННЯ ІСНУЮЧИХ КНОПОК
  // =============================================
  function hookButtons() {
    // Шукаємо кнопку реєстрації по тексту і атрибутах
    document.querySelectorAll('button, [role="button"]').forEach(btn => {
      const txt = btn.textContent?.trim().toLowerCase() || '';
      if (
        txt.includes('зареєструватись') ||
        txt.includes('реєстрація') ||
        btn.id === 'registerBtn' ||
        btn.dataset?.action === 'register'
      ) {
        if (!btn.dataset.hooked) {
          btn.dataset.hooked = '1';
          btn.addEventListener('click', (e) => {
            // Не чіпаємо кнопки "демо"
            if (btn.textContent.toLowerCase().includes('демо')) return;
            e.preventDefault();
            e.stopPropagation();
            window.registerBroker();
          });
        }
      }

      // Кнопка входу
      if (txt.includes('увійти') && !txt.includes('демо') && !btn.dataset.hooked) {
        btn.dataset.hooked = '1';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          window.loginBroker();
        });
      }
    });
  }

  // =============================================
  // СТАРТ
  // =============================================
  waitForSupabase(() => {
    // Після завантаження DOM — чіпляємо кнопки
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        hookButtons();
        // Якщо сторінка каталогу — завантажуємо брокерів
        if (window.location.pathname.includes('catalog')) {
          window.loadCatalog();
        }
      });
    } else {
      hookButtons();
      if (window.location.pathname.includes('catalog')) {
        window.loadCatalog();
      }
    }

    // Спостерігаємо за змінами DOM (для SPA і багатокрокових форм)
    const observer = new MutationObserver(() => hookButtons());
    observer.observe(document.body, { childList: true, subtree: true });
  });

})();
