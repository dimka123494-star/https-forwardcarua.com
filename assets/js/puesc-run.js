/* puesc-run.js — запускається закладкою «MB → PUESC» на сторінці форми RMPD100 (puesc.gov.pl).
   Бере дані «MBPUESC:[…]» з буфера обміну (або з віконця, куди їх вставляють Cmd/Ctrl+V)
   і ставить у поля форми через jQuery самої форми, щоб спрацювали її обробники. */
(async () => {
  const ns = '_Sent_Rmpd100Portlet_', w = m => new Promise(r => setTimeout(r, m));
  if (!document.getElementById(ns + 'carrierName')){ alert('Відкрийте форму RMPD100 на puesc.gov.pl (увійшовши в акаунт) і натисніть закладку ще раз.'); return; }
  let t = '';
  try{ t = await navigator.clipboard.readText(); }catch(e){}
  if (!t || !t.startsWith('MBPUESC:')) t = prompt('Вставте дані заявки (Cmd+V або Ctrl+V) і натисніть OK.\n\nСпершу натисніть «⚡ Автозаповнення PUESC» у заявці на forwardcarua.com.') || '';
  t = t.trim();
  if (!t.startsWith('MBPUESC:')){ if (t) alert('Це не дані заявки. Натисніть «⚡ Автозаповнення PUESC» у заявці ще раз.'); return; }
  let d; try{ d = JSON.parse(t.slice(8)); }catch(e){ alert('Дані пошкоджені — скопіюйте ще раз.'); return; }
  const J = (window.pl_gov_mf_sent_Sent && pl_gov_mf_sent_Sent.$) || window.jQuery, miss = [];
  for (const [k, v] of d){
    if (k === '@wait'){ await w(v); continue; }
    const e = document.getElementById(ns + k);
    if (!e){ miss.push(k); continue; }
    if (e.type === 'checkbox'){ if (e.checked !== !!v) e.click(); }
    else {
      if (e.tagName === 'SELECT' && ![...e.options].some(o => o.value === String(v))){ miss.push(k + '=' + v); continue; }
      if (J) J(e).val(String(v)).trigger('change'); else { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    await w(40);
  }
  alert('Готово: заповнено ' + (d.filter(x => x[0] !== '@wait').length - miss.length) + ' полів.' + (miss.length ? '\nНе вдалося: ' + miss.join(', ') : '') +
    '\n\nПеревірте форму, позначте декларацію в розділі 8 і лише тоді натискайте «Wyślij».');
})();
