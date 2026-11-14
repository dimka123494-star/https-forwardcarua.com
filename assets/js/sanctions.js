/* sanctions.js — безкоштовна перевірка за Державним реєстром санкцій РНБО (edge-функція sanctions-search).
   Sanctions.search(q) → {at,total,items}; Sanctions.html(d) — блок результату; Sanctions.statuses(codes) → {code: status};
   елементи [data-sanctions-code] заповнюються автоматично. */
const Sanctions = (() => {
  const FN = 'https://ecdfpqhbaqjqurzedunh.supabase.co/functions/v1/sanctions-search';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const dt = d => d ? String(d).slice(0, 10).split('-').reverse().join('.') : '';
  const ST = { active: ['Під чинними санкціями РНБО', 'var(--red)', 'ti-alert-octagon'], expired: ['Строк санкцій закінчився', 'var(--amber)', 'ti-clock'], excluded: ['Санкції скасовано', 'var(--muted)', 'ti-circle-check'] };
  async function get(qs){ const r = await fetch(FN + '?' + qs); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.status); return d; }
  const search = q => get('q=' + encodeURIComponent(q));
  const statuses = codes => codes.length ? get('codes=' + codes.join(',')).then(d => d.codes || {}) : Promise.resolve({});
  function item(i, anon){
    const [t, c, ic] = ST[i.status] || ST.active;
    return '<div class="card" style="padding:10px 12px;margin-top:8px;border-color:' + c + '"><div style="color:' + c + ';font-weight:600;font-size:13px"><i class="ti ' + ic + '"></i> ' + t + '</div>' +
      (anon ? '' : '<div style="font-weight:600;margin-top:2px">' + esc(i.name) + '</div>') +
      '<div class="text-xs text-muted" style="margin-top:2px">' + [i.kind === 'person' ? 'фізична особа' + (i.birth_year && !anon ? ', ' + esc(i.birth_year) + ' р.н.' : '') : 'юридична особа', i.country && esc(i.country),
        i.codes && i.codes.length ? 'код ' + i.codes.map(esc).join(', ') : '', i.decree && 'указ № ' + esc(i.decree) + (i.decree_date ? ' від ' + dt(i.decree_date) : ''), i.end_date && 'до ' + dt(i.end_date)].filter(Boolean).join(' · ') + '</div>' +
      (i.aliases && !anon ? '<div class="text-xs text-muted" style="margin-top:2px;overflow-wrap:anywhere">Також: ' + esc(i.aliases.slice(0, 160)) + (i.aliases.length > 160 ? '…' : '') + '</div>' : '') + '</div>';
  }
  function html(d, q, anon){
    const src = '<p class="text-xs text-muted" style="margin:.5rem 0 0">Державний реєстр санкцій РНБО (drs.nsdc.gov.ua)' + (d.at ? ', дані на ' + dt(d.at) : '') + '. Збіг назви чи ПІБ — ще не доказ, що це та сама особа: звіряйте код, дату народження, країну.</p>';
    if (!d.items || !d.items.length) return '<div class="card" style="padding:10px 12px;border-color:rgba(16,185,129,.4)"><div style="color:var(--green);font-weight:600"><i class="ti ti-shield-check"></i> У реєстрі санкцій РНБО не значиться</div><div class="text-xs text-muted">за запитом «' + esc(q) + '»</div></div>' + src;
    return '<div class="text-sm" style="font-weight:600">Знайдено в реєстрі санкцій: ' + d.total + (d.total > d.items.length ? ' (показано ' + d.items.length + ')' : '') + '</div>' + d.items.map(i => item(i, anon)).join('') + src;
  }
  async function mount(el){
    const code = el.dataset.sanctionsCode; if (!code) return;
    try{ const d = await search(code); el.innerHTML = '<h2 style="font-size:16px;margin:1rem 0 .4rem"><i class="ti ti-gavel"></i> Санкції РНБО</h2>' + html(d, code, !!el.dataset.anon); }catch(e){ el.innerHTML = ''; }
  }
  // позначки в списку перевізників: .cp-item з href /perevizhnyk/<код>
  async function markList(box){
    const els = [...box.querySelectorAll('a.cp-item[href*="/perevizhnyk/"]')], codes = els.map(a => a.getAttribute('href').split('/').pop());
    try{
      const st = await statuses(codes);
      els.forEach((a, i) => { const s = st[codes[i]]; if (!s) return; const [t, c] = ST[s];
        const b = document.createElement('div'); b.className = 'text-xs'; b.style.cssText = 'color:' + c + ';font-weight:600;margin-top:2px'; b.innerHTML = '<i class="ti ti-gavel"></i> ' + t;
        (a.firstElementChild || a).appendChild(b); });
    }catch(e){}
  }
  const auto = () => document.querySelectorAll('[data-sanctions-code]:not([data-done])').forEach(el => { el.dataset.done = '1'; mount(el); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
  return { search, statuses, html, mount, auto, markList };
})();
