/* puesc-run.js — запускається закладкою «MB → PUESC» на сторінці форми PUESC.
   Підтримує RMPD100 і SENT_EDIT (крок 1: номер SENT + ключ; крок 2: дані перевізника).
   Бере дані «MBPUESC:[…]» з буфера обміну (або з віконця, куди їх вставляють Cmd/Ctrl+V)
   і ставить у поля через jQuery самої форми, щоб спрацювали її обробники. */
(async () => {
  const w = m => new Promise(r => setTimeout(r, m));
  const find = k => document.querySelector('[id$="_' + k + '"]:not([type=hidden])') || document.querySelector('[id$="_' + k + '"]');
  const vis = e => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  if (!find('carrierName') && !find('sentNumber') && !find('truckNumber')){ alert('Відкрийте форму на puesc.gov.pl (RMPD100 або SENT_EDIT), увійшовши в акаунт, і натисніть закладку ще раз.'); return; }
  let t = '';
  try{ t = await navigator.clipboard.readText(); }catch(e){}
  if (!t || !t.startsWith('MBPUESC:')) t = prompt('Вставте дані заявки (Cmd+V або Ctrl+V) і натисніть OK.\n\nСпершу натисніть «⚡ Автозаповнення PUESC» у заявці на forwardcarua.com.') || '';
  t = t.trim();
  if (!t.startsWith('MBPUESC:')){ if (t) alert('Це не дані заявки. Натисніть «⚡ Автозаповнення PUESC» у заявці ще раз.'); return; }
  let d; try{ d = JSON.parse(t.slice(8)); }catch(e){ alert('Дані пошкоджені — скопіюйте ще раз.'); return; }
  const J = (window.pl_gov_mf_sent_Sent && pl_gov_mf_sent_Sent.$) || window.jQuery;
  const set = (e, v) => { if (e.type === 'checkbox'){ if (e.checked !== !!v) e.click(); return true; }
    if (e.tagName === 'SELECT' && ![...e.options].some(o => o.value === String(v))) return false;
    if (J) J(e).val(String(v)).trigger('change'); else { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); e.dispatchEvent(new Event('input', { bubbles: true })); }
    return true; };
  // SENT, крок 1: лише номер і ключ
  const sn = find('sentNumber');
  const step = d.findIndex(x => x[0] === '@step2');
  if (sn && vis(sn) && step >= 0){
    d.slice(0, step).forEach(([k, v]) => { const e = find(k); if (e) set(e, v); });
    alert('Номер SENT і ключ вписано. Натисніть «Confirm / Zatwierdź», а на наступному кроці — закладку «MB → PUESC» ще раз.');
    return;
  }
  const list = step >= 0 ? d.slice(step + 1) : d, miss = [], done = [];
  for (const [k, v] of list){
    if (k === '@wait'){ await w(v); continue; }
    const e = find(k);
    if (!e){ miss.push(k); continue; }
    if (set(e, v)) done.push(e); else miss.push(k + '=' + v);
    await w(40);
  }
  // Які видимі поля лишились порожніми — щоб довести автозаповнення під цю форму
  const empty = [...document.querySelectorAll('form input:not([type=hidden]):not([type=checkbox]):not([type=file]):not([type=submit]):not([type=button]), form select, form textarea')]
    .filter(e => vis(e) && !e.disabled && !e.readOnly && !e.value && e.id && !/search|Search/.test(e.id)).map(e => e.id.replace(/^_[A-Za-z0-9]+_/, ''));
  alert('Готово: заповнено ' + done.length + ' полів.' +
    (step >= 0 && miss.length ? '\nЦих полів на сторінці немає: ' + miss.join(', ') : (miss.length ? '\nНе вдалося: ' + miss.join(', ') : '')) +
    (empty.length ? '\n\nПорожні поля, заповніть вручну: ' + empty.slice(0, 25).join(', ') : '') +
    '\n\nПеревірте форму, позначте декларацію і лише тоді надсилайте.');
})();
