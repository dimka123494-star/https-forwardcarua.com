// Конфігурація Supabase
const SUPABASE_URL = 'https://ecdfpqhbaqjqurzedunh.supabase.co';
const SUPABASE_ANON_KEY = 'EyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjZGZwcWhiYXFqcXVyemVkdW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzU3NTIsImV4cCI6MjA5NDg1MTc1Mn0.t0ry-slbPVwVHmF1KLzWX6EDonWBMC2Uu3KUobH8oFY';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentFilter = 'all'; // Поточний активний фільтр
let allRequestsData = [];   // Локальне збереження всіх заявок

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Перевірка авторизації
  const { data: { session } } = await sb.auth.getSession();
  
  if (!session) {
    window.location.href = '/login.html';
    return;
  }

  const userId = session.user.id;

  // 2. Завантажуємо профіль та заявки
  loadBrokerProfile(userId);
  loadBrokerRequests(userId);
  subscribeToRealtimeRequests(userId);
});

// Завантаження профілю
async function loadBrokerProfile(userId) {
  const { data: profile, error } = await sb
    .from('brokers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Помилка профілю:', error);
    return;
  }

  if (profile) {
    const initials = profile.name ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'БР';
    document.querySelector('.av').textContent = initials;
    document.querySelector('.broker-info .name').textContent = profile.name || 'Брокер';
    const plan = profile.plan || 'Стандарт';
    const city = profile.city || 'Київ';
    document.querySelector('.broker-info .meta').innerHTML = `⚡ Тариф ${plan} · 🟢 Онлайн · 📍 ${city}`;

    if(profile.views) document.getElementById('stat-views').textContent = profile.views;
    if(profile.rating) document.getElementById('stat-rating').textContent = `${profile.rating}★`;
  }
}

// Завантаження всіх заявок брокера
async function loadBrokerRequests(brokerId) {
  const { data: requests, error } = await sb
    .from('requests')
    .select('*')
    .eq('broker_id', brokerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Помилка заявок:', error);
    document.getElementById('requests-container').innerHTML = '<div style="color:red; padding:10px;">Помилка завантаження даних</div>';
    return;
  }

  allRequestsData = requests || [];
  document.getElementById('stat-reqs').textContent = allRequestsData.length;
  
  // Рендеримо відповідно до поточного фільтра
  renderRequests();
}

// Функція малювання заявок на екрані
function renderRequests() {
  const container = document.getElementById('requests-container');
  
  // Фільтрація
  let filtered = allRequestsData;
  if (currentFilter !== 'all') {
    filtered = allRequestsData.filter(r => r.status === currentFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color:#73726c; padding: 15px; text-align:center;">Заявок у цій категорії немає</div>';
    return;
  }

  container.innerHTML = filtered.map(req => {
    const isNew = req.status === 'new';
    const isAccepted = req.status === 'accepted';
    const isCompleted = req.status === 'completed';
    
    const name = req.client_name || 'Анонімний клієнт';
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();
    const timeAgo = formatTimeAgo(req.created_at);
    const rawPhone = req.client_phone ? req.client_phone.replace(/\D/g, '') : '';

    return `
      <div class="req-item ${isNew ? 'new-req' : ''}" id="req-${req.id}">
        <div class="req-av">${initials}</div>
        <div class="req-info">
          <div class="req-name">
            ${name} 
            ${isNew ? '<span class="new-pill">Новий</span>' : ''}
          </div>
          <div class="req-meta">
            ${req.comment ? '💬 ' + req.comment : 'Запит на консультацію'}
          </div>

          <!-- 📲 Кнопки зв'язку -->
          <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
            <a href="tel:+${rawPhone}" class="btn-decline" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px; color:#185FA5; border-color:#BEE3F8;">
              📞 +${rawPhone}
            </a>
            <a href="https://t.me/+${rawPhone}" target="_blank" class="btn-decline" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px; color:#0088cc; border-color:#b3e5fc;">
              💬 Telegram
            </a>
            <a href="viber://chat?number=%2B${rawPhone}" class="btn-decline" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px; color:#7360f2; border-color:#d1c4e9;">
              🟣 Viber
            </a>
          </div>

          <!-- 🎛️ Дії залежно від статусу -->
          <div class="req-actions" style="margin-top:8px;">
            ${isNew ? `
              <button class="btn-accept" onclick="updateRequestStatus('${req.id}', 'accepted')">🟢 Взяти в роботу</button>
              <button class="btn-decline" onclick="updateRequestStatus('${req.id}', 'declined')">Відхилити</button>
            ` : ''}

            ${isAccepted ? `
              <span style="font-size:11px; color:#085041; font-weight:500; margin-right:8px;">🟢 В роботі</span>
              <button class="btn-done" onclick="updateRequestStatus('${req.id}', 'completed')">🔵 Завершити</button>
            ` : ''}

            ${isCompleted ? `
              <span style="font-size:11px; color:#2B6CB0; font-weight:500;">🔵 Розмитнено / Завершено</span>
            ` : ''}

            ${req.status === 'declined' ? `
              <span style="font-size:11px; color:#73726c;">Відхилено</span>
            ` : ''}
          </div>
        </div>
        <div class="req-time">${timeAgo}</div>
      </div>
    `;
  }).join('');
}

// Перемикання табів-фільтрів
function filterRequests(status, btnElement) {
  currentFilter = status;
  
  // Стилі активної кнопки
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btnElement.classList.add('active');

  renderRequests();
}

// Зміна статусу в БД Supabase
async function updateRequestStatus(requestId, newStatus) {
  const { error } = await sb
    .from('requests')
    .update({ status: newStatus })
    .eq('id', requestId);

  if (error) {
    alert('Помилка оновлення статусу');
    return;
  }

  // Оновлюємо статус в локальному масиві і перемальовуємо
  const reqObj = allRequestsData.find(r => r.id === requestId);
  if (reqObj) reqObj.status = newStatus;

  renderRequests();
}

// Форматування часу
function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now - date) / 60000);
  
  if (diffInMinutes < 1) return 'Тільки що';
  if (diffInMinutes < 60) return `${diffInMinutes} хв тому`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} год тому`;
  return date.toLocaleDateString('uk-UA');
}

//
