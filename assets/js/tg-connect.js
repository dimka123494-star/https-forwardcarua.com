/* tg-connect.js — картка «Сповіщення в Telegram» для кабінетів.
   TgConnect.mount('elId', { prefs: [['offers','Нові ставки на мої вантажі'], ...] }) */
const TgConnect = (() => {
  const FN = SUPABASE_URL + '/functions/v1/tg';
  let bot = null;
  async function botInfo(){
    if (bot) return bot;
    try{ const r = await fetch(FN, { headers: { apikey: SUPABASE_ANON } }); bot = r.ok ? await r.json() : { configured: false }; }
    catch(e){ bot = { configured: false }; }
    return bot;
  }
  async function mySub(){
    const sb = await sbReady(); const u = await currentUser(); if (!u) return null;
    const { data } = await sb.from('tg_subs').select('chat_id, tg_username, prefs, created_at').eq('user_id', u.id).maybeSingle();
    return data;
  }

  async function mount(id, opts = {}){
    const el = document.getElementById(id); if (!el) return;
    const prefs = opts.prefs || [];
    const [b, sub] = await Promise.all([botInfo(), mySub().catch(() => null)]);
    if (!b.configured || !b.username){
      el.innerHTML = '<div class="card-title"><i class="ti ti-brand-telegram"></i> Сповіщення в Telegram</div><p class="text-sm text-muted">Скоро: миттєві сповіщення про нові ставки, вантажі й заявки.</p>';
      return;
    }
    if (sub){
      const p = sub.prefs || {};
      el.innerHTML = '<div class="card-title"><i class="ti ti-brand-telegram" style="color:#2aabee"></i> Сповіщення в Telegram</div>' +
        '<p class="text-sm" style="margin-bottom:10px"><i class="ti ti-circle-check" style="color:var(--green)"></i> Підключено' + (sub.tg_username ? ' — @' + esc(sub.tg_username) : '') + '</p>' +
        prefs.map(([k, l]) => '<label class="check-row"><input type="checkbox" data-k="' + k + '"' + (p[k] !== false ? ' checked' : '') + '> ' + esc(l) + '</label>').join('') +
        '<button class="btn btn-ghost btn-sm" style="margin-top:8px" data-off><i class="ti ti-bell-off"></i> Відключити</button>';
      el.querySelectorAll('input[data-k]').forEach(i => i.onchange = async () => {
        const np = { ...(sub.prefs || {}) }; el.querySelectorAll('input[data-k]').forEach(x => np[x.dataset.k] = x.checked);
        const sb = await sbReady(); const u = await currentUser();
        const { error } = await sb.from('tg_subs').update({ prefs: np }).eq('user_id', u.id);
        if (error) showToast('Не вдалося зберегти', 'error'); else { sub.prefs = np; showToast('Збережено'); }
      });
      el.querySelector('[data-off]').onclick = async () => {
        const sb = await sbReady(); const u = await currentUser();
        await sb.from('tg_subs').delete().eq('user_id', u.id); mount(id, opts);
      };
      return;
    }
    el.innerHTML = '<div class="card-title"><i class="ti ti-brand-telegram" style="color:#2aabee"></i> Сповіщення в Telegram</div>' +
      '<p class="text-sm text-muted" style="margin-bottom:10px">' + esc(opts.hint || 'Миттєво дізнавайтесь про нові ставки, вантажі й заявки — без перевірки кабінету.') + '</p>' +
      '<button class="btn btn-primary btn-sm" data-on><i class="ti ti-brand-telegram"></i> Підключити Telegram</button><div class="text-xs text-muted" data-wait style="margin-top:8px"></div>';
    el.querySelector('[data-on]').onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      // вкладку відкриваємо одразу (інакше браузер заблокує спливаюче вікно), посилання підставимо після отримання коду
      const w = window.open('', '_blank');
      try{
        const sb = await sbReady();
        const { data: code, error } = await sb.rpc('tg_link_code');
        if (error) throw error;
        const url = 'https://t.me/' + b.username + '?start=' + code;
        if (w) w.location = url; else location.href = url;
        el.querySelector('[data-wait]').innerHTML = 'Натисніть «Start» у боті @' + esc(b.username) + '. Не відкрився Telegram? <a href="' + url + '" target="_blank" rel="noopener">Відкрити бота</a>';
        let n = 0; const t = setInterval(async () => {
          if (++n > 60){ clearInterval(t); btn.disabled = false; return; }
          if (await mySub().catch(() => null)){ clearInterval(t); showToast('Telegram підключено'); mount(id, opts); }
        }, 3000);
      }catch(err){ if (w) w.close(); btn.disabled = false; showToast('Не вдалося створити посилання', 'error'); }
    };
  }
  return { mount, botInfo, FN };
})();
