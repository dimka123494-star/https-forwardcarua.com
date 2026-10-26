/* Блок «3 брокери + заявка» у статтях і на сторінці калькулятора.
   Розмітка: <div class="bw" data-service="Розмитнення авто" data-title="…"></div>
   Потрібні config.js і db.js. */
(function(){
  function card(b){
    const svcs = (b.broker_services || []).slice(0, 3).map(s => '<span class="tag">' + esc(s.name) + '</span>').join('');
    const rating = Number(b.rating_avg) || 0;
    return '<div class="card" style="display:flex;flex-direction:column;gap:.6rem">' +
      '<div style="display:flex;gap:10px;align-items:center"><div class="avatar av-' + esc(b.plan || 'free') + '" style="width:40px;height:40px;font-size:15px">' + avatarInner(b) + '</div>' +
      '<div style="min-width:0"><div style="font-weight:600">' + esc(b.name) + '</div>' +
      '<div class="text-xs text-muted">' + esc([b.city, b.region].filter(Boolean).join(', ') || 'Україна') +
      (rating ? ' · ★ ' + rating.toFixed(1) : '') + '</div></div></div>' +
      (svcs ? '<div class="row" style="gap:6px">' + svcs + '</div>' : '') +
      '<div class="row" style="gap:6px;margin-top:auto"><a class="btn btn-ghost btn-sm" href="/broker/' + esc(b.id) + '">Профіль</a>' +
      '<a class="btn btn-primary btn-sm" href="/zayavka?broker=' + esc(b.id) + '">Заявка</a></div></div>';
  }
  async function fill(el){
    const service = el.dataset.service || '';
    const title = el.dataset.title || 'Брокери, які допоможуть';
    const q = service ? '?service=' + encodeURIComponent(service) : '';
    el.innerHTML = '<div class="card" style="padding:1.5rem;margin:2rem 0;border-color:rgba(16,185,129,.35)">' +
      '<div style="font-family:var(--display);font-size:20px;font-weight:800;margin-bottom:.25rem">' + esc(title) + '</div>' +
      '<p class="text-sm text-muted" style="margin-bottom:1rem">Оберіть брокера або залиште одну заявку — відповідь прийде від брокера вашого регіону.</p>' +
      '<div class="bw-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:1rem">' +
      '<div class="text-sm text-muted">Завантажуємо брокерів…</div></div>' +
      '<a class="btn btn-primary" href="/zayavka' + q + '"><i class="ti ti-send"></i>Залишити заявку безкоштовно</a></div>';
    const grid = el.querySelector('.bw-grid');
    try{
      let list = await listBrokers({ service, sort: 'plan' });
      if (list.length < 3 && service){
        const more = (await listBrokers({ sort: 'plan' })).filter(b => !list.some(x => x.id === b.id));
        list = list.concat(more);
      }
      list = list.slice(0, 3);
      grid.innerHTML = list.length ? list.map(card).join('')
        : '<div class="text-sm text-muted">Залиште заявку — ми передамо її брокеру, який працює з вашим регіоном.</div>';
    }catch(e){
      grid.innerHTML = '<div class="text-sm text-muted">Залиште заявку — ми передамо її брокеру, який працює з вашим регіоном.</div>';
    }
  }
  function init(){ document.querySelectorAll('.bw').forEach(fill); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
