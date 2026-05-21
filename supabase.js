// =============================================
// supabase.js — підключення до Supabase
// Підключи цей файл ПЕРШИМ на кожній сторінці:
// <script src="/assets/js/supabase.js"></script>
// =============================================

const SUPABASE_URL = 'https://ecdfpqhbaqjqurzedunh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjZGZwcWhiYXFqcXVyemVkdW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzU3NTIsImV4cCI6MjA5NDg1MTc1Mn0.t0ry-slbPVwVHmF1KLzWX6EDonWBMC2Uu3KUobH8oFY';

const _sbScript = document.createElement('script');
_sbScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
_sbScript.onload = () => {
  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.dispatchEvent(new Event('supabase-ready'));
};
document.head.appendChild(_sbScript);

// Хелпер: чекати поки sb готовий
window.sbReady = () => new Promise(res => {
  if (window.sb) return res(window.sb);
  window.addEventListener('supabase-ready', () => res(window.sb), { once: true });
});

// Toast helper
window.showToast = (msg, type = 'success') => {
  const colors = { success: '#E1F5EE', danger: '#FCEBEB' };
  const borders = { success: '#5DCAA5', danger: '#F09595' };
  const texts = { success: '#085041', danger: '#791F1F' };
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '20px', right: '20px',
    padding: '10px 18px', borderRadius: '8px', zIndex: 9999,
    background: colors[type], border: `0.5px solid ${borders[type]}`,
    color: texts[type], fontSize: '13px',
    boxShadow: '0 2px 12px rgba(0,0,0,.12)'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
};
