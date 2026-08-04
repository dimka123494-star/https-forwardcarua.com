// Завантаження заявок з бази з кнопками швидкого зв'язку
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

    // Форматування номера для посилань (видаляємо пробіли, плюси, дужки)
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

          <!-- 📲 Кнопки швидкого зв'язку -->
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

          <div class="req-actions" id="actions-${req.id}" style="margin-top:8px;">
            ${isNew ? `
              <button class="btn-accept" onclick="updateRequestStatus('${req.id}', 'accepted')">✓ Прийняти</button>
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
