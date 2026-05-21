// Shared nav highlight
document.addEventListener('DOMContentLoaded', () => {
  const path = location.pathname;
  document.querySelectorAll('.nav-link').forEach(a => {
    if (a.getAttribute('href') && path.includes(a.getAttribute('href').replace('.html',''))) {
      a.classList.add('active');
    }
  });
});

// Stars helper
function renderStars(n, size = 13) {
  let h = '';
  for (let i = 1; i <= 5; i++) {
    h += `<span class="star${i <= Math.round(n) ? '' : ' empty'}" style="font-size:${size}px">★</span>`;
  }
  return h;
}

// Toast helper
function showToast(msg, type = 'success') {
  const colors = { success: '#E1F5EE', danger: '#FCEBEB' };
  const borders = { success: '#5DCAA5', danger: '#F09595' };
  const textC = { success: '#085041', danger: '#791F1F' };
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '20px', right: '20px',
    padding: '10px 18px', borderRadius: '8px',
    background: colors[type], border: `0.5px solid ${borders[type]}`,
    color: textC[type], fontSize: '13px', zIndex: 9999,
    boxShadow: '0 2px 8px rgba(0,0,0,.1)'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
