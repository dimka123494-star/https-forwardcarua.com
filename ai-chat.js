// ai-chat.js — AI-помічник для клієнтів МитнийБрокер
// Powered by Claude API (через Anthropic)
// Підключи перед </body>: <script src="/assets/js/ai-chat.js"></script>

(function () {
  'use strict';

  const SYSTEM_PROMPT = `Ти — AI-помічник платформи МитнийБрокер (forwardcarua.com). 
Допомагаєш клієнтам з питаннями про розмитнення авто, митне оформлення, оцінку авто, договори купівлі-продажу в Україні.

Ти знаєш:
- Розмитнення авто зі США (аукціони Copart, IAAI) — акцизний збір, ПДВ, митний збір
- Авто з Європи, Японії, ОАЕ — різні ставки мита
- Оцінка авто для банку, страховки, продажу
- Договір купівлі-продажу — де оформити, що потрібно
- Митне оформлення вантажів

Правила:
- Відповідай тільки українською мовою
- Будь конкретним і корисним, давай реальні цифри
- Якщо питання складне — рекомендуй залишити заявку на сайті
- Не давай юридичних гарантій, додавай "уточніть у брокера"
- Максимум 3-4 речення у відповіді — коротко і по суті
- Якщо клієнт готовий діяти — запропонуй залишити заявку`;

  // ---- СТИЛІ ----
  const styles = `
    .ai-chat-btn {
      position: fixed; bottom: 80px; right: 20px; z-index: 1000;
      width: 52px; height: 52px; border-radius: 50%;
      background: #BA7517; border: none; cursor: pointer;
      box-shadow: 0 4px 16px rgba(186,117,23,.4);
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; transition: transform .15s, box-shadow .15s;
      animation: pulse 3s ease-in-out infinite;
    }
    .ai-chat-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(186,117,23,.5); }
    @keyframes pulse { 0%,100%{box-shadow:0 4px 16px rgba(186,117,23,.4)} 50%{box-shadow:0 4px 24px rgba(186,117,23,.65)} }

    .ai-chat-window {
      position: fixed; bottom: 145px; right: 20px; z-index: 1000;
      width: 340px; max-height: 480px;
      background: #fff; border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,.15);
      display: none; flex-direction: column;
      border: 0.5px solid rgba(0,0,0,.1);
      overflow: hidden;
    }
    .ai-chat-window.open { display: flex; }

    .ai-chat-header {
      background: #FAEEDA; padding: 12px 16px;
      display: flex; align-items: center; gap: 10px;
      border-bottom: 0.5px solid rgba(0,0,0,.08);
    }
    .ai-chat-avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: #BA7517; color: #fff;
      display: flex; align-items: center; justify-content: center; font-size: 16px;
    }
    .ai-chat-header-info { flex: 1; }
    .ai-chat-header-name { font-size: 13px; font-weight: 600; color: #1a1a18; }
    .ai-chat-header-status { font-size: 11px; color: #1D9E75; }
    .ai-chat-close {
      background: none; border: none; cursor: pointer;
      font-size: 18px; color: #73726c; padding: 0; line-height: 1;
    }

    .ai-chat-messages {
      flex: 1; overflow-y: auto; padding: 12px;
      display: flex; flex-direction: column; gap: 8px;
      scroll-behavior: smooth;
    }
    .ai-chat-messages::-webkit-scrollbar { width: 4px; }
    .ai-chat-messages::-webkit-scrollbar-track { background: transparent; }
    .ai-chat-messages::-webkit-scrollbar-thumb { background: rgba(0,0,0,.15); border-radius: 2px; }

    .ai-msg {
      max-width: 85%; padding: 8px 12px; border-radius: 12px;
      font-size: 13px; line-height: 1.5;
    }
    .ai-msg.bot {
      background: #F5F4EF; color: #1a1a18;
      border-bottom-left-radius: 4px; align-self: flex-start;
    }
    .ai-msg.user {
      background: #BA7517; color: #fff;
      border-bottom-right-radius: 4px; align-self: flex-end;
    }
    .ai-msg.typing { background: #F5F4EF; align-self: flex-start; }
    .ai-msg.typing span {
      display: inline-flex; gap: 3px; align-items: center; padding: 2px 0;
    }
    .ai-msg.typing span i {
      width: 6px; height: 6px; border-radius: 50%; background: #73726c;
      animation: typing .8s ease-in-out infinite;
    }
    .ai-msg.typing span i:nth-child(2) { animation-delay: .15s; }
    .ai-msg.typing span i:nth-child(3) { animation-delay: .3s; }
    @keyframes typing { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }

    .ai-quick-btns {
      display: flex; flex-wrap: wrap; gap: 5px;
      padding: 0 12px 8px; 
    }
    .ai-quick-btn {
      padding: 4px 10px; border-radius: 12px; font-size: 11px;
      border: 0.5px solid rgba(186,117,23,.4); background: #FAEEDA;
      color: #633806; cursor: pointer; transition: all .12s; white-space: nowrap;
    }
    .ai-quick-btn:hover { background: #FAC775; }

    .ai-chat-input-row {
      display: flex; gap: 6px; padding: 10px 12px;
      border-top: 0.5px solid rgba(0,0,0,.08);
    }
    .ai-chat-input {
      flex: 1; padding: 8px 12px; border-radius: 20px; font-size: 13px;
      border: 0.5px solid rgba(0,0,0,.2); outline: none;
      font-family: inherit; resize: none; max-height: 80px;
      transition: border-color .15s;
    }
    .ai-chat-input:focus { border-color: #BA7517; }
    .ai-chat-send {
      width: 34px; height: 34px; border-radius: 50%;
      background: #BA7517; border: none; cursor: pointer;
      color: #fff; font-size: 15px; display: flex;
      align-items: center; justify-content: center; flex-shrink: 0;
      transition: background .15s; margin-top: 2px;
    }
    .ai-chat-send:hover { background: #9a6012; }
    .ai-chat-send:disabled { background: #ccc; cursor: not-allowed; }

    .ai-cta-btn {
      display: inline-block; margin-top: 6px; padding: 5px 12px;
      background: #FAEEDA; border: 0.5px solid #EF9F27; color: #633806;
      border-radius: 8px; font-size: 12px; font-weight: 500;
      text-decoration: none; cursor: pointer;
    }

    @media (max-width: 768px) {
      .ai-chat-window { width: calc(100vw - 24px); right: 12px; bottom: 130px; }
      .ai-chat-btn { bottom: 76px; right: 16px; }
    }
  `;

  // ---- ШВИДКІ ПИТАННЯ ----
  const quickQuestions = [
    'Скільки коштує розмитнення?',
    'Авто зі США — з чого почати?',
    'Як обрати брокера?',
    'Що таке акцизний збір?',
  ];

  // ---- ІНІЦІАЛІЗАЦІЯ ----
  function init() {
    // Стилі
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    // Кнопка
    const btn = document.createElement('button');
    btn.className = 'ai-chat-btn';
    btn.innerHTML = '🤖';
    btn.setAttribute('aria-label', 'AI-помічник');
    document.body.appendChild(btn);

    // Вікно
    const win = document.createElement('div');
    win.className = 'ai-chat-window';
    win.innerHTML = `
      <div class="ai-chat-header">
        <div class="ai-chat-avatar">🤖</div>
        <div class="ai-chat-header-info">
          <div class="ai-chat-header-name">AI-помічник</div>
          <div class="ai-chat-header-status">● Онлайн</div>
        </div>
        <button class="ai-chat-close" aria-label="Закрити">✕</button>
      </div>
      <div class="ai-chat-messages" id="aiMessages"></div>
      <div class="ai-quick-btns" id="aiQuickBtns"></div>
      <div class="ai-chat-input-row">
        <textarea class="ai-chat-input" id="aiInput" placeholder="Запитай про розмитнення..." rows="1"></textarea>
        <button class="ai-chat-send" id="aiSend" aria-label="Надіслати">➤</button>
      </div>
    `;
    document.body.appendChild(win);

    // Швидкі питання
    const quickBtns = win.querySelector('#aiQuickBtns');
    quickQuestions.forEach(q => {
      const b = document.createElement('button');
      b.className = 'ai-quick-btn';
      b.textContent = q;
      b.onclick = () => sendMessage(q);
      quickBtns.appendChild(b);
    });

    // Привітання
    const history = [];
    addMessage('bot', '👋 Привіт! Я AI-помічник МитнийБрокер. Допоможу розібратись з розмитненням авто, митним оформленням і вибором брокера. Що цікавить?');

    // Обробники
    btn.onclick = () => {
      win.classList.toggle('open');
      if (win.classList.contains('open')) {
        win.querySelector('#aiInput').focus();
      }
    };
    win.querySelector('.ai-chat-close').onclick = () => win.classList.remove('open');

    const input = win.querySelector('#aiInput');
    const sendBtn = win.querySelector('#aiSend');

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    });
    sendBtn.onclick = () => sendMessage();

    // Надіслати повідомлення
    async function sendMessage(text) {
      const msg = text || input.value.trim();
      if (!msg) return;

      addMessage('user', msg);
      history.push({ role: 'user', content: msg });
      input.value = '';
      input.style.height = 'auto';
      sendBtn.disabled = true;

      // Ховаємо швидкі питання після першого повідомлення
      quickBtns.style.display = 'none';

      // Індикатор набору
      const typingId = addTyping();

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 400,
            system: SYSTEM_PROMPT,
            messages: history
          })
        });

        const data = await response.json();
        const reply = data.content?.[0]?.text || 'Вибачте, сталась помилка. Спробуйте ще раз.';

        removeTyping(typingId);
        history.push({ role: 'assistant', content: reply });

        // Перевіряємо чи є CTA
        const hasCta = reply.toLowerCase().includes('заявк') || reply.toLowerCase().includes('брокер');
        addMessage('bot', reply, hasCta);

      } catch (err) {
        removeTyping(typingId);
        addMessage('bot', '😔 Не вдалось отримати відповідь. Перевірте підключення або зверніться до брокера напряму.');
      }

      sendBtn.disabled = false;
      input.focus();
    }

    function addMessage(role, text, showCta = false) {
      const msgs = win.querySelector('#aiMessages');
      const div = document.createElement('div');
      div.className = `ai-msg ${role}`;
      div.textContent = text;

      if (showCta && role === 'bot') {
        const cta = document.createElement('div');
        cta.innerHTML = `<br><a class="ai-cta-btn" href="/request.html">📨 Залишити заявку →</a>`;
        div.appendChild(cta);
      }

      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
      return div;
    }

    function addTyping() {
      const msgs = win.querySelector('#aiMessages');
      const div = document.createElement('div');
      div.className = 'ai-msg typing';
      div.innerHTML = '<span><i></i><i></i><i></i></span>';
      const id = 'typing_' + Date.now();
      div.id = id;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
      return id;
    }

    function removeTyping(id) {
      document.getElementById(id)?.remove();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
