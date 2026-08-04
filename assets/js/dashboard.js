// Конфігурація Supabase
const SUPABASE_URL = 'https://ecdfpqhbaqjqurzedunh.supabase.co';
const SUPABASE_ANON_KEY = 'EyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjZGZwcWhiYXFqcXVyemVkdW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzU3NTIsImV4cCI6MjA5NDg1MTc1Mn0.t0ry-slbPVwVHmF1KLzWX6EDonWBMC2Uu3KUobH8oFY';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Перевірка чи залогінений брокер
  const { data: { session } } = await sb.auth.getSession();
  
  if (!session) {
    // Якщо не авторизований — перенаправляємо на сторінку входу
    window.location.href = '/login.html';
    return;
  }

  const userId = session.user.id;

  // 2. Завантажуємо профіль брокера
  loadBrokerProfile(userId);

  // 3. Завантажуємо заявки брокера
  loadBrokerRequests(userId);

  // 4. Реальний час: відстежуємо нові заявки
  subscribeToRealtimeRequests(userId);
});

// Завантаження даних профілю
async function loadBrokerProfile(userId) {
  const { data: profile, error } = await sb
    .from('brokers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Помилка завантаження профілю:', error);
    return;
  }

  if (profile) {
    // Аватарка (ініціали)
    const initials = profile.name ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'БР';
    document.querySelector('.av').textContent = initials;
    
    // Ім'я та статус
    document.querySelector('.broker-info .name').textContent = profile.name || 'Брокер';
    const plan = profile.plan || 'Стандарт';
    const city = profile.city || 'Київ';
    document.querySelector('.broker-info .meta').innerHTML = `⚡ Тариф ${plan} · 🟢 Онлайн · 📍 ${city}`;

    // Статистика
    if(profile.views) document.getElementById('stat-views').textContent = profile.views;
    if(profile.rating) document.getElementById('stat-rating').textContent = `${profile.rating}★`;
  }
}

// Завантаження заявок з бази
async function loadBrokerRequests(brokerId) {
  const container = document.getElementById('requests-container');

  const { data: requests, error } = await sb
    .from('requests')
    .select('*')
    .eq('broker_id', brokerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Помилка завантаження заявок:', error);
    container.innerHTML = '<div style="color:red; padding:10px;">Помилка завантаження даних</div>';
    return;
  }

  // Лічильник заявок
  document.getElementById('stat-reqs').textContent = requests ? requests.length : 0;

  if (!requests || requests.length === 0) {
    container.innerHTML = '<div style="color:#73726c; padding: 15px; text-align:center;">У вас поки немає заявок</div>';
    return;
  }

  // Відображення списку заявок
  container.innerHTML = requests.map(req => {
    const isNew = req.status === 'new';
    const name = req.client_name || 'Анонімний клієнт';
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();
    const timeAgo = formatTimeAgo(req.created_at);

    return `
      <div class="req-item ${isNew ? 'new-req' : ''}" id="req-${req.id}">
        <div class="req-av">${initials}</div>
        <div class="req-info">
          <div class="req-name">
            ${name} 
            ${isNew ? '<span class="new-pill">Новий</span>' : ''}
          </div>
          <div class="req-meta">
            📞 <a href="tel:${req.client_phone}">${req.client_phone}</a> 
            ${req.comment ? '· ' + req.comment : ''}
          </div>
          <div class="req-actions" id="actions-${req.id}">
            ${isNew ? `
              <button class="btn-accept" onclick="updateRequestStatus('${req.id}', 'accepted')">Відповісти</button>
              <button class="btn-decline" onclick="updateRequestStatus('${req.id}', 'declined')">Відхилити</button>
            ` : `
              <span style="font-size:11px; color:${req.status === 'accepted' ? '#085041' : '#73726c'}">
                ${req.status === 'accepted' ? '✓ Прийнято' : 'Відхилено'}
              </span>
            `}
          </div>
        </div>
        <div class="req-time">${timeAgo}</div>
      </div>
    `;
  }).join('');
}

// Функція приклику зміни статусу (Прийняти / Відхилити)
async function updateRequestStatus(requestId, newStatus) {
  const { error } = await sb
    .from('requests')
    .update({ status: newStatus })
    .eq('id', requestId);

  if (error) {
    alert('Помилка оновлення статусу');
    return;
  }

  const actionsDiv = document.getElementById(`actions-${requestId}`);
  const reqItem = document.getElementById(`req-${requestId}`);

  if (newStatus === 'accepted') {
    reqItem.style.borderColor = '#5DCAA5';
    actionsDiv.innerHTML = '<span style="color:#085041; font-size:11px; font-weight:500;">✓ Прийнято</span>';
  } else if (newStatus === 'declined') {
    reqItem.style.opacity = '0.4';
    actionsDiv.innerHTML = '<span style="color:#73726c; font-size:11px;">Відхилено</span>';
  }
}

// Форматування відносного часу
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

// Підписка на реальний час (Realtime)
function subscribeToRealtimeRequests(brokerId) {
  sb.channel('public:requests')
    .on('postgres_changes', { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'requests',
      filter: `broker_id=eq.${brokerId}`
    }, payload => {
      // Прийшла нова заявка — перезавантажуємо список
      loadBrokerRequests(brokerId);
    })
    .subscribe();
}
