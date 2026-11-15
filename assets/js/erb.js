/* erb.js — безкоштовна перевірка за Єдиним реєстром боржників (edge-функція erb-search).
   Erb.byCode(code) / Erb.byName(name) → дані; Erb.html(d) — блок; елементи [data-erb-code] заповнюються автоматично. */
const Erb = (() => {
  const FN = 'https://ecdfpqhbaqjqurzedunh.supabase.co/functions/v1/erb-search';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const dt = d => d ? String(d).slice(0, 10).split('-').reverse().join('.') : '';
  async function get(qs){ const r = await fetch(FN + '?' + qs); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.status); return d; }
  const byCode = c => get('code=' + encodeURIComponent(c));
  const byName = n => get('name=' + encodeURIComponent(n));
  const cats = c => Object.entries(c || {}).slice(0, 4).map(([k, v]) => esc(k) + ' — ' + v).join('; ');
  const src = d => '<p class="text-xs text-muted" style="margin:.5rem 0 0">Єдиний реєстр боржників, відкриті дані Мін’юсту' + (d.at ? ' на ' + dt(d.at) : '') + '.</p>';
  const bad = (t, sub) => '<div class="card" style="padding:10px 12px;margin-top:8px;border-color:var(--red)"><div style="color:var(--red);font-weight:600"><i class="ti ti-file-alert"></i> ' + t + '</div>' + (sub ? '<div class="text-xs text-muted" style="margin-top:2px">' + sub + '</div>' : '') + '</div>';
  const good = t => '<div class="card" style="padding:10px 12px;margin-top:8px;border-color:rgba(16,185,129,.4)"><div style="color:var(--green);font-weight:600"><i class="ti ti-circle-check"></i> ' + t + '</div></div>';
  function html(d){
    if (d.code) return (d.found ? bad('Є в Єдиному реєстрі боржників: ' + d.n + ' провадж.', cats(d.cats) + '<br>Хто стягувач і виконавець, контакти — у повному звіті.') : good('У Єдиному реєстрі боржників не значиться')) + src(d);
    if (!d.items || !d.items.length) return good('Боржника з таким ПІБ не знайдено') + src(d);
    return d.items.map(i => bad(esc(i.name) + (i.birth_year ? ', ' + esc(i.birth_year) + ' р.н.' : '') + ' — ' + i.n + ' провадж.', cats(i.cats))).join('') +
      '<p class="text-xs text-muted" style="margin:.5rem 0 0">Збіг ПІБ — ще не доказ, що це та сама людина: звіряйте рік народження. Повні дані — на erb.minjust.gov.ua.</p>' + src(d);
  }
  async function mount(el){
    try{ const d = await byCode(el.dataset.erbCode); el.innerHTML = '<h2 style="font-size:16px;margin:1rem 0 .4rem"><i class="ti ti-file-alert"></i> Реєстр боржників</h2>' + html(d); }catch(e){ el.innerHTML = ''; }
  }
  const auto = () => document.querySelectorAll('[data-erb-code]:not([data-done])').forEach(el => { el.dataset.done = '1'; mount(el); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
  return { byCode, byName, html, auto };
})();
