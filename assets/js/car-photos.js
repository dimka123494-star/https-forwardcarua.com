/* car-photos.js — фото конкретного авто від користувачів (сторінка /avto/{номер}, довідка, звіт).
   Схвалені — з RPC vehicle_photos_public; нові — через функцію car-photo, зʼявляються після модерації.
   У браузері фото зменшується до 1600 px і перекодовується в JPEG — так зникають EXIF і геолокація.
   CarPhotos.scan(root) — заповнює всі <div class="cp-mount" data-plate="…"> у root. */
const CarPhotos = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const FN = () => SUPABASE_URL + '/functions/v1/car-photo';

  async function list(plate){
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/vehicle_photos_public', { method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON }, body: JSON.stringify({ p_plate: plate }) });
    return res.ok ? res.json() : [];
  }

  function scan(root){
    (root || document).querySelectorAll('.cp-mount:not([data-done])').forEach(el => { el.dataset.done = '1'; mount(el, el.dataset.plate, el.dataset.compact === '1'); });
  }

  async function mount(el, plate, compact){
    if (!el || !plate) return;
    let photos = [];
    try{ photos = await list(plate); }catch(e){}
    const scope = el.closest('.vc-card, .modal, main, #zv') || document;
    if (photos.length) scope.querySelectorAll('.vc-photo').forEach(f => f.remove());   // справжні фото важливіші за ілюстрацію моделі
    el.innerHTML = (photos.length ? '<div class="cp-grid">' + photos.map(p => '<a href="' + esc(p.url) + '" target="_blank" rel="noopener"><img src="' + esc(p.url) + '" alt="Фото авто ' + esc(plate) + '" loading="lazy"></a>').join('') + '</div>' +
        '<div class="text-xs text-muted" style="margin-top:4px">Фото надіслали користувачі МитнийБрокер</div>' : '') +
      '<div class="cp-add"><button type="button" class="btn btn-ghost btn-sm" onclick="CarPhotos.form(this, \'' + esc(plate) + '\')"><i class="ti ti-camera-plus"></i>' +
        (photos.length ? 'Додати ще фото' : compact ? 'Додати фото цього авто' : 'Бачили це авто? Додайте фото') + '</button></div>';
  }

  function form(btn, plate){
    const box = btn.closest('.cp-add');
    box.innerHTML = '<div class="card" style="padding:12px 14px;margin-top:8px">' +
      '<div class="text-sm" style="margin-bottom:8px"><b>Фото авто ' + esc(plate) + '</b> — зʼявиться на сторінці після перевірки модератором.</div>' +
      '<input type="file" accept="image/*" class="input" style="padding:8px" data-f>' +
      '<input type="email" class="input" style="margin-top:8px" placeholder="Email (необовʼязково — повідомимо, коли фото опублікують)" data-e>' +
      '<label class="text-xs" style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;line-height:1.5"><input type="checkbox" data-c style="margin-top:2px">' +
        '<span>Я зробив це фото або маю право ним ділитися. На фото немає облич людей і чужих документів; номер цього авто можна показувати.</span></label>' +
      '<div class="msg" data-m style="margin-top:8px"></div>' +
      '<button type="button" class="btn btn-primary btn-sm" style="margin-top:8px" data-s><i class="ti ti-upload"></i>Надіслати</button></div>';
    const q = s => box.querySelector('[data-' + s + ']');
    q('s').onclick = async () => {
      const m = q('m'), file = q('f').files[0], s = q('s');
      const fail = t => { m.className = 'msg show msg-err'; m.textContent = t; s.disabled = false; s.innerHTML = '<i class="ti ti-upload"></i>Надіслати'; };
      if (!file) return fail('Оберіть фото');
      if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return fail('Це не схоже на фото');
      if (!q('c').checked) return fail('Підтвердьте, що маєте право на фото');
      s.disabled = true; s.textContent = 'Надсилаємо…';
      try{
        const img = await shrink(file);
        const fd = new FormData();
        fd.append('plate', plate); fd.append('consent', '1'); fd.append('email', q('e').value || '');
        fd.append('w', img.w); fd.append('h', img.h); fd.append('file', img.blob, 'photo.jpg');
        const h = { apikey: SUPABASE_ANON };
        try{ const ses = await currentSession(); if (ses) h.Authorization = 'Bearer ' + ses.access_token; }catch(e){}
        const res = await fetch(FN(), { method: 'POST', headers: h, body: fd });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) return fail(d.error === 'too_many' ? 'Забагато фото за годину — спробуйте пізніше' : d.error === 'too_big' ? 'Фото завелике' : 'Не вдалося надіслати фото. Спробуйте ще раз.');
        try{ track('car_photo_upload', {}); }catch(e){}
        box.innerHTML = '<div class="msg show msg-ok" style="margin-top:8px">Дякуємо! Фото зʼявиться після перевірки — зазвичай протягом доби.</div>';
      }catch(e){ fail('Не вдалося обробити фото. Спробуйте інше.'); }
    };
  }

  // зменшення до 1600 px по довшій стороні; canvas → JPEG прибирає EXIF (зокрема GPS)
  function shrink(file){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
        const w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve({ blob: b, w, h }) : reject(new Error('encode')), 'image/jpeg', 0.85);
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      im.src = url;
    });
  }

  return { scan, mount, form, list };
})();
