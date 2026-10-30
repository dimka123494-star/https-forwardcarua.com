/* shipper.js — вантажовласник: список моїх вантажів і пропозицій перевізників.
   Використовується в кабінеті клієнта (/moi-zayavky) і в кабінеті брокера («Мої вантажі»). */
const Shipper = (() => {
  const $ = id => document.getElementById(id);
  const fmtD = d => d ? d.split('-').reverse().join('.') : '';
  const money = (v, c) => Number(v).toLocaleString('uk-UA') + ' ' + (c || 'UAH');
  const routeTxt = x => [x.from_city, x.from_country].filter(Boolean).join(', ') + ' → ' + [x.to_city, x.to_country].filter(Boolean).join(', ');
  let favs = null;
  const favSet = async () => {
    if (favs === null){ try{ favs = new Set((await myFavorites()).map(f => f.carrier_id)); }catch(e){ favs = new Set(); } }
    return favs;
  };

  /* Картка вантажу з кнопками; opts.onRepeat(x) — підставити у форму */
  function cargoCard(x, opts = {}){
    const closed = x.status === 'closed';
    return '<div class="cargo-item" id="sc-' + x.id + '"' + (closed && !x.chosen_response ? ' style="opacity:.6"' : '') + '>' +
      '<div class="spread" style="gap:10px;align-items:flex-start;flex-wrap:wrap"><div style="min-width:0">' +
        '<div class="cargo-route">' + esc(routeTxt(x)) + '</div>' +
        '<div style="margin-top:3px">' + esc(x.cargo) + '</div>' +
        '<div class="text-xs text-muted" style="margin-top:4px">' + (x.distance_km ? '<a href="' + cargoMapsUrl(x) + '" target="_blank" rel="noopener"><i class="ti ti-route"></i> ' + x.distance_km.toLocaleString('uk-UA') + ' км</a> · ' : '') +
          [x.weight_t ? x.weight_t + ' т' : '', x.volume_m3 ? x.volume_m3 + ' м³' : '', cargoDims(x), x.transport || 'будь-який транспорт',
          x.load_date ? 'завантаження ' + fmtD(x.load_date) : '', x.pay_terms || ''].filter(Boolean).map(esc).join(' · ') + ' ' +
          (x.price ? '<span class="fx-badge ok">' + money(x.price, x.currency) + '</span>' : '<span class="fx-badge">запит ставок</span>') + '</div>' +
        '<div class="text-xs text-muted" style="margin-top:4px">' + fmtDate(x.created_at) + ' · ' +
          (x.chosen_response ? '<b style="color:var(--green)">перевізника обрано</b>' : closed ? 'закрито' : 'на біржі') + '</div>' +
      '</div><div class="row" style="gap:6px;flex-wrap:wrap">' +
        '<button class="btn ' + (x.responses_count && !closed ? 'btn-primary' : 'btn-ghost') + ' btn-sm" onclick="Shipper.toggleOffers(\'' + x.id + '\')">' +
          '<i class="ti ti-list-details"></i> Пропозиції · ' + (x.responses_count || 0) + '</button>' +
        (opts.onRepeat ? '<button class="btn btn-ghost btn-sm" title="Розмістити такий самий вантаж" onclick="Shipper.repeat(\'' + x.id + '\')"><i class="ti ti-copy"></i></button>' : '') +
        (x.chosen_response ? '' : '<button class="btn btn-ghost btn-sm" onclick="Shipper.toggleStatus(\'' + x.id + '\')">' + (closed ? 'Відкрити' : 'Закрити') + '</button>') +
      '</div></div><div class="sc-offers" id="so-' + x.id + '" style="display:none;margin-top:10px"></div></div>';
  }

  let state = { list: [], el: null, opts: {} };
  function mount(el, list, opts = {}){
    state = { list, el, opts };
    el.innerHTML = list.length ? list.map(x => cargoCard(x, opts)).join('')
      : '<div class="card"><div class="text-sm text-muted">' + (opts.empty || 'Ви ще не розміщували вантажів.') + '</div></div>';
  }
  const find = id => state.list.find(x => x.id === id);

  async function toggleOffers(id){
    const box = $('so-' + id); if (!box) return;
    if (box.style.display !== 'none'){ box.style.display = 'none'; return; }
    box.style.display = ''; box.innerHTML = '<div class="text-sm text-muted">Завантаження пропозицій…</div>';
    await renderOffers(id);
  }
  async function renderOffers(id){
    const box = $('so-' + id), x = find(id);
    let list; try{ list = await cargoOffers(id); }catch(e){ box.innerHTML = '<div class="text-sm" style="color:var(--red)">' + esc(e.message) + '</div>'; return; }
    const fs = await favSet();
    if (!list.length){
      box.innerHTML = '<div class="cs-ans text-sm">Ставок ще немає. Перевізники бачать ваш вантаж на біржі й надсилають пропозиції — зазвичай протягом кількох годин. ' +
        'Можна також подзвонити перевізникам із <a href="/transport" target="_blank">вільним транспортом</a> за вашим напрямком.</div>';
      return;
    }
    const prices = list.filter(o => o.price && o.currency === (list.find(q => q.price) || {}).currency).map(o => +o.price);
    const best = prices.length ? Math.min(...prices) : null;
    box.innerHTML = '<div class="card" style="padding:4px 14px">' + list.map(o => {
      const c = o.carrier || {}, v = o.vehicle, acc = o.status === 'accepted';
      return '<div class="of-card' + (acc ? ' of-acc' : '') + '"' + (o.status === 'declined' ? ' style="opacity:.55"' : '') + '><div style="min-width:0;flex:1">' +
        '<div><a href="/broker/' + esc(c.id) + '" target="_blank" style="font-weight:600">' + esc(c.name || 'Перевізник') + '</a>' +
          (c.is_verified ? ' <i class="ti ti-rosette-discount-check" style="color:var(--green)" title="Контакти перевірено"></i>' : '') +
          ' <button class="btn-quiet" title="Обрані перевізники" onclick="Shipper.fav(\'' + c.id + '\',this)"><i class="ti ti-star' + (fs.has(c.id) ? '-filled' : '') + '" style="color:var(--amber)"></i></button></div>' +
        '<div class="text-xs text-muted">' + [c.city, c.rating_count ? '★ ' + Number(c.rating_avg).toFixed(1) + ' (' + c.rating_count + ')' : 'ще без відгуків',
          c.verified_vehicles ? 'перевірених авто: ' + c.verified_vehicles : (c.fleet ? c.fleet + ' авто' : '')].filter(Boolean).map(esc).join(' · ') + '</div>' +
        (v ? '<div class="text-xs" style="margin-top:3px">' + esc([v.kind, v.make, v.capacity_t ? v.capacity_t + ' т' : '', v.plate].filter(Boolean).join(' · ')) +
          (v.status === 'verified' ? ' <span class="fx-badge ok"><i class="ti ti-shield-check"></i> авто перевірено</span>' : '') + '</div>' : '') +
        (o.comment ? '<div class="text-sm" style="margin-top:5px">' + esc(o.comment) + '</div>' : '') +
        '<div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">' +
          (c.phone ? '<a class="btn btn-ghost btn-sm" href="' + telHref(c.phone) + '"><i class="ti ti-phone"></i>' + esc(c.phone) + '</a>' : '') +
          (c.telegram ? '<a class="btn btn-ghost btn-sm" href="' + tgHref(c.telegram) + '" target="_blank" rel="noopener"><i class="ti ti-brand-telegram"></i></a>' : '') +
          (c.viber ? '<a class="btn btn-ghost btn-sm" href="viber://chat?number=' + encodeURIComponent(String(c.viber).replace(/[^\d+]/g, '')) + '"><i class="ti ti-brand-viber"></i></a>' : '') +
        '</div></div>' +
        '<div style="text-align:right;display:flex;flex-direction:column;gap:6px;align-items:flex-end">' +
          '<div class="of-price">' + (o.price ? money(o.price, o.currency) : '<span class="text-sm text-muted">ціна за домовленістю</span>') + '</div>' +
          (best !== null && +o.price === best && list.length > 1 ? '<span class="fx-badge ok">найнижча ставка</span>' : '') +
          (acc ? '<b class="text-sm" style="color:var(--green)"><i class="ti ti-circle-check"></i> Обраний перевізник</b><a class="text-xs" href="/broker/' + esc(c.id) + '#reviews" target="_blank">Залишити відгук після рейсу</a>'
            : o.status === 'declined' ? '<span class="text-xs text-muted">відхилено</span>'
            : x && x.chosen_response ? '' :
              '<button class="btn btn-primary btn-sm" onclick="Shipper.choose(\'' + id + '\',\'' + o.id + '\')">Обрати</button>' +
              '<button class="btn-quiet" onclick="Shipper.decline(\'' + id + '\',\'' + o.id + '\')">Відхилити</button>') +
        '</div></div>';
    }).join('') + '</div>';
  }
  async function choose(cid, rid){
    if (!confirm('Обрати цього перевізника? Вантаж знімемо з біржі, іншим перевізникам буде видно, що обрано іншого.')) return;
    try{
      await setOfferStatus2(rid, 'accepted');
      const x = find(cid); if (x){ x.status = 'closed'; x.chosen_response = rid; }
      $('sc-' + cid).outerHTML = cargoCard(x, state.opts);
      await toggleOffers(cid); showToast('Перевізника обрано. Зателефонуйте йому, щоб підтвердити рейс.');
      if (typeof track === 'function') track('carrier_chosen');
    }catch(e){ showToast(e.message, 'error'); }
  }
  async function decline(cid, rid){
    try{ await setOfferStatus2(rid, 'declined'); await renderOffers(cid); }catch(e){ showToast(e.message, 'error'); }
  }
  async function toggleStatus(id){
    const x = find(id); if (!x) return;
    const st = x.status === 'open' ? 'closed' : 'open';
    try{ await setMyCargoStatus(id, st); x.status = st; $('sc-' + id).outerHTML = cargoCard(x, state.opts); }catch(e){ showToast(e.message, 'error'); }
  }
  async function fav(carrierId, btn){
    const fs = await favSet(), on = !fs.has(carrierId);
    try{ await toggleFavorite(carrierId, on); on ? fs.add(carrierId) : fs.delete(carrierId);
      document.querySelectorAll('[onclick^="Shipper.fav(\'' + carrierId + '\'"] i').forEach(i => i.className = 'ti ti-star' + (on ? '-filled' : ''));
      showToast(on ? 'Додано в обрані перевізники' : 'Прибрано з обраних');
    }catch(e){ showToast(e.message, 'error'); }
  }
  function repeat(id){ const x = find(id); if (x && state.opts.onRepeat) state.opts.onRepeat(x); }

  /* Підставити вантаж у форму CargoPublic.mountForm */
  function fillForm(x){
    const set = (i, v) => { const el = $(i); if (el && v !== null && v !== undefined) el.value = v; };
    set('cg-fc', x.from_country); set('cg-fcity', x.from_city || ''); set('cg-tc', x.to_country); set('cg-tcity', x.to_city || '');
    set('cg-cargo', x.cargo); set('cg-w', x.weight_t ?? ''); set('cg-v', x.volume_m3 ?? ''); set('cg-tr', x.transport || '');
    set('cg-l', x.length_m ?? ''); set('cg-wd', x.width_m ?? ''); set('cg-h', x.height_m ?? ''); set('cg-pl', x.places ?? '');
    set('cg-price', x.price ?? ''); set('cg-cur', x.currency || 'UAH'); set('cg-pay', x.pay_terms || ''); set('cg-notes', x.notes || '');
    set('cg-date', '');
    const c = $('cg-customs'); if (c) c.checked = !!x.customs;
    if (typeof CargoPublic !== 'undefined' && CargoPublic.planRoute) CargoPublic.planRoute();
    const f = $('cg-date'); if (f){ f.focus(); f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    showToast('Дані підставлено — вкажіть нову дату завантаження');
  }

  return { mount, toggleOffers, choose, decline, toggleStatus, fav, repeat, fillForm, favSet };
})();
