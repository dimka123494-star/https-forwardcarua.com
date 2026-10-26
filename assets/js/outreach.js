/* =========================================================
   Адмінка → «Залучення»: база потенційних брокерів, шаблони
   повідомлень і надсилання запрошень у месенджери / email.
   Потрібні: config.js, db.js, regions-loc.js. Таблиці prospects
   і outreach_templates доступні лише адміністратору (RLS is_admin()).
   ========================================================= */
(function(){
  const SITE = 'https://forwardcarua.com';
  const STATUS = {
    new:        { l:'Новий',            c:'var(--muted-strong)' },
    contacted:  { l:'Написали',         c:'var(--blue)' },
    interested: { l:'Зацікавлений',     c:'var(--amber)' },
    invited:    { l:'Запрошення в кабінет', c:'var(--purple)' },
    registered: { l:'Зареєструвався',   c:'var(--green)' },
    declined:   { l:'Відмова',          c:'var(--red)' }
  };
  const CH = { whatsapp:'WhatsApp', viber:'Viber', telegram:'Telegram', email:'Email', copy:'Скопійовано', call:'Дзвінок' };

  let list = [], tpls = [], brokersIdx = null, filt = { q:'', status:'', region:'' }, cur = null, curTpl = null;
  const $ = id => document.getElementById(id);
  const digits = p => String(p || '').replace(/\D/g, '');
  const normPhone = p => { let d = digits(p); if (d.length === 10 && d[0] === '0') d = '38' + d; if (d.length === 9) d = '380' + d; return d; };
  const tgUser = t => String(t || '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '');

  /* ---------------- база ---------------- */
  async function db(){ return await sbReady(); }
  async function loadProspects(){
    const sb = await db();
    const { data, error } = await sb.from('prospects').select('*').order('created_at', { ascending:false });
    if (error) throw new Error('Не вдалося завантажити контакти: ' + error.message);
    return data || [];
  }
  async function loadTemplates(){
    const sb = await db();
    const { data, error } = await sb.from('outreach_templates').select('*').order('sort');
    if (error) throw new Error('Не вдалося завантажити шаблони');
    return data || [];
  }
  async function saveProspect(p){
    const sb = await db();
    const row = { ...p, updated_at: new Date().toISOString() };
    const q = p.id ? sb.from('prospects').update(row).eq('id', p.id).select().single()
                   : sb.from('prospects').insert(row).select().single();
    const { data, error } = await q;
    if (error) throw new Error('Не вдалося зберегти: ' + error.message);
    return data;
  }

  /* ---------------- посилання і шаблони ---------------- */
  function links(p){
    const ref = 'utm_source=outreach&utm_medium=invite&utm_content=' + (p && p.id ? p.id.slice(0, 8) : 'manual');
    const reg = REGION_LOC[(p && p.region) || ''];
    return {
      pres: SITE + '/prezentatsiya?' + ref,
      instr: SITE + '/instruktsiya?' + ref,
      reg: SITE + '/vhid?role=broker&' + ref,
      regionPage: reg ? SITE + '/brokery/' + reg[0] : SITE + '/',
      profile: p && p.edrpou ? SITE + '/kompaniya/' + p.edrpou + '?' + ref : SITE + '/reyestr-brokeriv?' + ref
    };
  }
  function render(tpl, p){
    const L = links(p);
    const who = ((p && (p.contact_person || '')) || '').trim();
    const reg = REGION_LOC[(p && p.region) || ''];
    const regionSentence = reg
      ? ' ' + reg[1].charAt(0).toUpperCase() + reg[1].slice(1) + ' в каталозі поки мало брокерів, тож ваш профіль побачать серед перших.'
      : '';
    return String(tpl || '')
      .replace(/\{,\s*імʼя\}/g, who ? ', ' + who : '')
      .replace(/\{імʼя\}/gi, who || '')
      .replace(/\{компанія\}/g, (p && p.name) || '')
      .replace(/\{місто\}/g, (p && p.city) || '')
      .replace(/\{речення_про_регіон\}/g, regionSentence)
      .replace(/\{презентація\}/g, L.pres)
      .replace(/\{інструкція\}/g, L.instr)
      .replace(/\{реєстрація\}/g, L.reg)
      .replace(/\{сторінка_області\}/g, L.regionPage)
      .replace(/\{профіль\}/g, L.profile);
  }

  /* ---------------- автоматичне визначення «зареєструвався» ---------------- */
  async function syncRegistered(){
    const brokers = (typeof window.brokers !== 'undefined' && Array.isArray(window.brokers)) ? window.brokers : await adminBrokers();
    const byEmail = {}, byPhone = {};
    brokers.forEach(b => {
      if (!b.claimed_at) return;
      if (b.email) byEmail[b.email.toLowerCase().trim()] = b;
      if (b.phone) byPhone[normPhone(b.phone).slice(-9)] = b;
    });
    const upd = [];
    list.forEach(p => {
      if (p.status === 'registered') return;
      const b = (p.email && byEmail[p.email.toLowerCase().trim()]) || (p.phone && digits(p.phone).length >= 9 && byPhone[normPhone(p.phone).slice(-9)]);
      if (b){ p.status = 'registered'; p.broker_id = b.id; upd.push(saveProspect({ id:p.id, status:'registered', broker_id:b.id })); }
    });
    if (upd.length){ await Promise.allSettled(upd); showToast('Зареєструвались: ' + upd.length); }
  }

  /* ---------------- рендер вкладки ---------------- */
  function stats(){
    const c = s => list.filter(p => p.status === s).length;
    $('oStats').innerHTML = [
      ['Усього', list.length, 'var(--text)'], ['Нові', c('new'), 'var(--muted-strong)'], ['Написали', c('contacted'), 'var(--blue)'],
      ['Зацікавлені', c('interested'), 'var(--amber)'], ['Зареєструвались', c('registered'), 'var(--green)']
    ].map(x => '<div class="stat"><div class="stat-val" style="color:' + x[2] + '">' + x[1] + '</div><div class="stat-label">' + x[0] + '</div></div>').join('');
  }
  function table(){
    const q = filt.q.toLowerCase();
    const rows = list.filter(p =>
      (!filt.status || p.status === filt.status) && (!filt.region || p.region === filt.region) &&
      (!q || [p.name, p.contact_person, p.phone, p.email, p.telegram, p.city, p.notes].join(' ').toLowerCase().includes(q)));
    $('oCount').textContent = '(' + rows.length + ')';
    $('oTable').innerHTML = rows.length ? rows.map(p => {
      const st = STATUS[p.status] || STATUS.new;
      const ic = [p.phone ? '<i class="ti ti-phone" title="' + esc(p.phone) + '"></i>' : '', p.email ? '<i class="ti ti-mail" title="' + esc(p.email) + '"></i>' : '',
                  p.telegram ? '<i class="ti ti-brand-telegram" title="' + esc(p.telegram) + '"></i>' : ''].join(' ');
      return '<tr>' +
        '<td><div style="font-weight:500;cursor:pointer" onclick="Outreach.edit(\'' + p.id + '\')">' + esc(p.name) + '</div>' +
          '<div class="text-xs text-muted">' + esc(p.contact_person || '') + (p.source ? ' · ' + esc(p.source) : '') + '</div></td>' +
        '<td class="text-sm text-muted">' + esc([p.city, p.region].filter(Boolean).join(', ') || '—') + '</td>' +
        '<td class="text-muted" style="white-space:nowrap">' + (ic || '—') + '</td>' +
        '<td><select class="input" style="padding:6px 8px;font-size:12px;width:auto;color:' + st.c + '" onchange="Outreach.setStatus(\'' + p.id + '\',this.value)">' +
          Object.keys(STATUS).map(k => '<option value="' + k + '"' + (k === p.status ? ' selected' : '') + '>' + STATUS[k].l + '</option>').join('') + '</select></td>' +
        '<td class="text-xs text-muted">' + (p.last_contact_at ? timeAgo(p.last_contact_at) + (p.contacts_count > 1 ? ' · ' + p.contacts_count + '×' : '') : '—') + '</td>' +
        '<td><div class="row-actions"><button class="btn btn-primary btn-sm" onclick="Outreach.compose(\'' + p.id + '\')"><i class="ti ti-send"></i>Написати</button>' +
          '<button class="btn-quiet" onclick="Outreach.edit(\'' + p.id + '\')"><i class="ti ti-pencil"></i></button></div></td></tr>';
    }).join('') : '<tr><td colspan="6" class="text-sm text-muted" style="text-align:center;padding:2rem">' +
      (list.length ? 'Нічого не знайдено' : 'Додайте перших брокерів — вручну або списком через «Імпорт»') + '</td></tr>';
  }
  function refresh(){ stats(); table(); }

  /* ---------------- композер ---------------- */
  function compose(id){
    cur = list.find(p => p.id === id) || null;
    curTpl = tpls[0] || null;
    $('cmpTo').innerHTML = cur
      ? '<b>' + esc(cur.name) + '</b>' + (cur.contact_person ? ' · ' + esc(cur.contact_person) : '') +
        '<div class="text-xs text-muted">' + esc([cur.phone, cur.email, cur.telegram ? '@' + tgUser(cur.telegram) : ''].filter(Boolean).join(' · ') || 'контактів немає') + '</div>'
      : '<b>Без контакту</b><div class="text-xs text-muted">Текст для розсилки вручну — у групи, чати, на email</div>';
    $('cmpTpl').innerHTML = tpls.map((t, i) => '<button class="chip' + (i ? '' : ' active') + '" onclick="Outreach.pickTpl(' + i + ',this)">' + esc(t.title) + '</button>').join('');
    fillText();
    channels();
    $('cmpModal').classList.add('open');
  }
  function fillText(){
    $('cmpSubject').value = curTpl ? render(curTpl.subject || '', cur) : '';
    $('cmpText').value = curTpl ? render(curTpl.body, cur) : '';
  }
  function channels(){
    const p = cur || {};
    const ph = normPhone(p.phone), tg = tgUser(p.telegram);
    const b = (ch, ic, label, ok, hint) => '<button class="btn ' + (ok ? 'btn-ghost' : 'btn-quiet') + '" ' + (ok ? '' : 'disabled title="' + hint + '"') +
      ' onclick="Outreach.send(\'' + ch + '\')"><i class="ti ti-' + ic + '"></i>' + label + '</button>';
    $('cmpCh').innerHTML =
      b('whatsapp', 'brand-whatsapp', 'WhatsApp', true, '') +
      b('viber', 'brand-viber', 'Viber', true, '') +
      b('telegram', 'brand-telegram', 'Telegram', true, '') +
      b('email', 'mail', 'Email', !!p.email || !cur, 'Немає email') +
      b('copy', 'copy', 'Копіювати', true, '') +
      (cur ? b('call', 'phone', 'Записати дзвінок', true, '') : '') +
      (cur ? '<button class="btn btn-ghost" onclick="Outreach.official()"><i class="ti ti-mail-plus"></i>Запрошення в кабінет</button>' : '');
    $('cmpHint').innerHTML =
      'WhatsApp відкриє чат з номером і вставить текст. ' +
      'Viber і Telegram не дозволяють підставити текст у чат конкретної людини — текст <b>скопіюється автоматично</b>, ' +
      'відкриється чат' + (tg || ph ? '' : ' (або вибір контакту)') + ', залишиться вставити (Ctrl/⌘+V). ' +
      '«Запрошення в кабінет» створює прихований профіль і надсилає офіційний лист для підтвердження.';
  }
  async function copyText(t){
    try{ await navigator.clipboard.writeText(t); return true; }
    catch(e){ const ta = $('cmpText'); ta.select(); try{ document.execCommand('copy'); return true; }catch(_){ return false; } }
  }
  async function send(ch){
    const text = $('cmpText').value, subj = $('cmpSubject').value || 'Каталог митних брокерів МитнийБрокер';
    const p = cur || {}, ph = normPhone(p.phone), tg = tgUser(p.telegram), enc = encodeURIComponent;
    let url = '';
    if (ch === 'whatsapp') url = 'https://wa.me/' + (ph || '') + '?text=' + enc(text);
    if (ch === 'viber'){ await copyText(text); url = ph ? 'viber://chat?number=%2B' + ph : 'viber://forward?text=' + enc(text); if (ph) showToast('Текст скопійовано — вставте в чат Viber'); }
    if (ch === 'telegram'){
      await copyText(text);
      url = tg ? 'https://t.me/' + tg : (ph ? 'https://t.me/+' + ph : 'https://t.me/share/url?url=' + enc(links(p).pres) + '&text=' + enc(text));
      if (tg || ph) showToast('Текст скопійовано — вставте в чат Telegram');
    }
    if (ch === 'email') url = 'mailto:' + (p.email || '') + '?subject=' + enc(subj) + '&body=' + enc(text);
    if (ch === 'copy'){ showToast(await copyText(text) ? 'Текст скопійовано' : 'Скопіюйте текст вручну', 'success'); }
    if (url){
      if (/^https?:/.test(url)) window.open(url, '_blank', 'noopener'); else location.href = url;
    }
    if (cur && ch !== 'copy') await logContact(ch);
    else if (cur && ch === 'copy') await logContact('copy');
  }
  async function logContact(ch){
    const p = cur;
    const h = Array.isArray(p.history) ? p.history.slice(-49) : [];
    h.push({ at: new Date().toISOString(), ch, tpl: curTpl ? curTpl.title : '' });
    const upd = { id:p.id, history:h, contacts_count:(p.contacts_count || 0) + 1, last_contact_at:new Date().toISOString() };
    if (p.status === 'new') upd.status = 'contacted';
    try{ Object.assign(p, await saveProspect(upd)); refresh(); historyBox(); }catch(e){ showToast(e.message, 'error'); }
  }
  function historyBox(){
    const h = (cur && cur.history) || [];
    $('cmpHist').innerHTML = h.length ? '<div class="card-title" style="margin-top:1rem">Історія</div>' +
      h.slice().reverse().slice(0, 8).map(x => '<div class="text-xs text-muted">' + new Date(x.at).toLocaleString('uk-UA') + ' — ' + esc(CH[x.ch] || x.ch) +
        (x.tpl ? ' · ' + esc(x.tpl) : '') + '</div>').join('') : '';
  }
  function official(){
    const p = cur; if (!p) return;
    $('cmpModal').classList.remove('open');
    openInvite();
    const set = (id, v) => { const el = $(id); if (el) el.value = v || ''; };
    set('i-name', p.name); set('i-email', p.email); set('i-city', p.city); set('i-phone', p.phone); set('i-tg', p.telegram);
    if ($('i-region')) $('i-region').value = p.region || '';
    window.__outreachInvite = p.id;
  }

  /* ---------------- редагування / додавання ---------------- */
  function edit(id){
    cur = id ? list.find(p => p.id === id) : null;
    const p = cur || {};
    $('peTitle').textContent = cur ? 'Контакт' : 'Новий контакт';
    $('pe-region').innerHTML = '<option value="">—</option>' + REGIONS.map(r => '<option>' + r + '</option>').join('');
    ['name','contact_person','phone','email','telegram','city','source','notes'].forEach(k => $('pe-' + k).value = p[k] || '');
    $('pe-region').value = p.region || '';
    $('pe-del').style.display = cur ? '' : 'none';
    $('peModal').classList.add('open');
  }
  async function saveEdit(){
    const v = k => $('pe-' + k).value.trim();
    if (!v('name')) return showToast('Вкажіть назву компанії або ім\'я', 'error');
    const row = { name:v('name'), contact_person:v('contact_person') || null, phone:v('phone') || null, email:v('email') || null,
                  telegram:v('telegram') || null, city:v('city') || null, region:$('pe-region').value || null,
                  source:v('source') || null, notes:v('notes') || null };
    if (cur) row.id = cur.id;
    try{
      const saved = await saveProspect(row);
      if (cur) Object.assign(cur, saved); else list.unshift(saved);
      $('peModal').classList.remove('open'); refresh(); showToast('Збережено');
    }catch(e){ showToast(e.message, 'error'); }
  }
  async function del(){
    if (!cur || !confirm('Видалити контакт «' + cur.name + '»?')) return;
    const sb = await db();
    const { error } = await sb.from('prospects').delete().eq('id', cur.id);
    if (error) return showToast('Не вдалося видалити', 'error');
    list = list.filter(p => p.id !== cur.id); $('peModal').classList.remove('open'); refresh();
  }
  async function setStatus(id, s){
    const p = list.find(x => x.id === id); if (!p) return;
    try{ Object.assign(p, await saveProspect({ id, status:s })); refresh(); }catch(e){ showToast(e.message, 'error'); }
  }

  /* ---------------- імпорт ---------------- */
  function parseImport(text){
    const out = [];
    text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
      const parts = line.split(/\t|;|\s\|\s/).map(s => s.trim());
      const row = { name:'', phone:null, email:null, telegram:null, city:null, region:null };
      const rest = [];
      parts.forEach(x => {
        if (!x) return;
        if (!row.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) row.email = x;
        else if (!row.telegram && /^(@|https?:\/\/t\.me\/)/i.test(x)) row.telegram = x;
        else if (!row.phone && /^[+\d][\d\s()\-]{8,}$/.test(x)) row.phone = x;
        else if (!row.region && REGIONS.includes(x.replace(/\s*(обл\.?|область)$/i, ''))) row.region = x.replace(/\s*(обл\.?|область)$/i, '');
        else rest.push(x);
      });
      row.name = rest.shift() || '';
      row.city = rest.shift() || null;
      if (row.name) out.push(row);
    });
    return out;
  }
  function importPreview(){
    const rows = parseImport($('impText').value);
    $('impPrev').innerHTML = rows.length
      ? 'Розпізнано: <b>' + rows.length + '</b>. Перший: ' + esc([rows[0].name, rows[0].phone, rows[0].email, rows[0].telegram, rows[0].city, rows[0].region].filter(Boolean).join(' · '))
      : 'Вставте рядки — по одному брокеру в рядку.';
  }
  async function doImport(){
    const rows = parseImport($('impText').value);
    if (!rows.length) return showToast('Немає рядків для імпорту', 'error');
    const src = $('impSource').value.trim() || null;
    const seen = new Set(list.map(p => (p.email || '').toLowerCase()).filter(Boolean).concat(list.map(p => normPhone(p.phone).slice(-9)).filter(x => x.length === 9)));
    const fresh = rows.filter(r => !(r.email && seen.has(r.email.toLowerCase())) && !(r.phone && seen.has(normPhone(r.phone).slice(-9))))
                      .map(r => ({ ...r, source: src }));
    const sb = await db();
    const { data, error } = await sb.from('prospects').insert(fresh).select();
    if (error) return showToast('Імпорт не вдався: ' + error.message, 'error');
    list = (data || []).concat(list); refresh();
    syncRegistered().then(refresh).catch(() => {});
    $('impModal').classList.remove('open'); $('impText').value = '';
    showToast('Додано ' + (data || []).length + (rows.length - fresh.length ? ', дублікатів пропущено: ' + (rows.length - fresh.length) : ''));
  }

  /* ---------------- шаблони ---------------- */
  function tplOpen(){
    $('tplList').innerHTML = tpls.map((t, i) =>
      '<div class="card" style="margin-bottom:10px"><div class="field"><label class="label">Назва</label><input class="input" id="tt-' + i + '" value="' + esc(t.title) + '"></div>' +
      '<div class="field"><label class="label">Тема листа</label><input class="input" id="ts-' + i + '" value="' + esc(t.subject || '') + '"></div>' +
      '<div class="field"><label class="label">Текст</label><textarea class="input" id="tb-' + i + '" style="min-height:220px">' + esc(t.body) + '</textarea></div>' +
      '<div class="row"><button class="btn btn-primary btn-sm" onclick="Outreach.tplSave(' + i + ')">Зберегти</button>' +
      '<button class="btn-quiet" onclick="Outreach.tplDel(' + i + ')">Видалити</button></div></div>').join('') +
      '<button class="btn btn-ghost" onclick="Outreach.tplAdd()"><i class="ti ti-plus"></i>Новий шаблон</button>';
    $('tplModal').classList.add('open');
  }
  async function tplSave(i){
    const t = tpls[i], sb = await db();
    const row = { title:$('tt-' + i).value.trim() || 'Шаблон', subject:$('ts-' + i).value.trim() || null, body:$('tb-' + i).value, updated_at:new Date().toISOString() };
    const q = t.id ? sb.from('outreach_templates').update(row).eq('id', t.id).select().single()
                   : sb.from('outreach_templates').insert({ ...row, sort: tpls.length }).select().single();
    const { data, error } = await q;
    if (error) return showToast('Не збереглося', 'error');
    tpls[i] = data; showToast('Шаблон збережено');
  }
  async function tplDel(i){
    const t = tpls[i];
    if (!confirm('Видалити шаблон «' + t.title + '»?')) return;
    if (t.id){ const sb = await db(); await sb.from('outreach_templates').delete().eq('id', t.id); }
    tpls.splice(i, 1); tplOpen();
  }
  function tplAdd(){ tpls.push({ title:'Новий шаблон', subject:'', body:'Добрий день{, імʼя}!\n\n…\n\nПрезентація: {презентація}\nРеєстрація: {реєстрація}' }); tplOpen(); }

  /* ---------------- старт ---------------- */
  /* ---------------- реєстр Держмитслужби: імпорт і заявки на підтвердження ---------------- */
  async function importRegistry(){
    let reg;
    try{ reg = await (await fetch('/assets/data/registry.json', { cache:'no-store' })).json(); }
    catch(e){ return showToast('Не вдалося завантажити реєстр', 'error'); }
    const have = new Set(list.map(p => p.edrpou).filter(Boolean));
    const fresh = reg.filter(r => !have.has(r.code)).map(r => ({
      name: r.name, edrpou: r.code, source: 'Реєстр Держмитслужби',
      notes: 'Авторизація ' + r.auth + ' від ' + r.date + '. Профіль: ' + SITE + '/kompaniya/' + r.code
    }));
    if (!fresh.length) return showToast('Усі компанії з реєстру вже в базі');
    if (!confirm('Додати ' + fresh.length + ' компаній з реєстру в базу контактів?\n\nКонтактів (телефон, email) у реєстрі немає — їх треба буде знайти й додати вручну.')) return;
    const sb = await db();
    const { data, error } = await sb.from('prospects').insert(fresh).select();
    if (error) return showToast('Імпорт не вдався: ' + error.message, 'error');
    list = (data || []).concat(list); refresh(); showToast('Додано ' + (data || []).length + ' компаній');
  }
  let claims = [];
  async function loadClaims(){
    const sb = await db();
    const { data } = await sb.from('registry_claims').select('*').order('created_at', { ascending:false }).limit(200);
    claims = data || [];
    const box = $('oClaims'); if (!box) return;
    const open = claims.filter(c => c.status === 'new' || c.status === 'verified');
    box.style.display = open.length ? '' : 'none';
    $('oClaimsList').innerHTML = open.map(c =>
      '<tr><td><div style="font-weight:500">' + esc(c.company) + '</div><div class="text-xs text-muted">ЄДРПОУ ' + esc(c.edrpou) + ' · <a href="/kompaniya/' + esc(c.edrpou) + '" target="_blank">профіль</a></div></td>' +
      '<td class="text-sm">' + esc(c.contact_name) + (c.position ? '<div class="text-xs text-muted">' + esc(c.position) + '</div>' : '') + '</td>' +
      '<td class="text-sm"><a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a><div class="text-xs"><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a></div></td>' +
      '<td class="text-xs text-muted">' + timeAgo(c.created_at) + (c.comment ? '<div>' + esc(c.comment) + '</div>' : '') + '</td>' +
      '<td><div class="row-actions">' +
        (c.status === 'new' ? '<button class="btn-quiet" onclick="Outreach.claimVerify(\'' + c.id + '\')">Підтвердив по телефону</button>' : '<span class="text-xs" style="color:var(--green)">Підтверджено</span>') +
        '<button class="btn btn-primary btn-sm" onclick="Outreach.claimInvite(\'' + c.id + '\')">Запросити в кабінет</button>' +
        '<button class="btn-quiet" onclick="Outreach.claimReject(\'' + c.id + '\')">Відхилити</button></div></td></tr>').join('');
  }
  async function claimSet(id, status){
    const sb = await db();
    const { error } = await sb.from('registry_claims').update({ status }).eq('id', id);
    if (error) return showToast('Не вдалося оновити', 'error');
    await loadClaims();
  }
  function claimInvite(id){
    const c = claims.find(x => x.id === id); if (!c) return;
    openInvite();
    const set = (k, v) => { const el = $(k); if (el) el.value = v || ''; };
    set('i-name', c.company); set('i-email', c.email); set('i-phone', c.phone);
    set('i-about', c.comment || '');
    window.__claimInvite = c;
  }
  async function afterClaimInvite(){
    const c = window.__claimInvite; if (!c) return; window.__claimInvite = null;
    await claimSet(c.id, 'invited');
    const p = list.find(x => x.edrpou === c.edrpou);
    if (p) try{ Object.assign(p, await saveProspect({ id:p.id, status:'invited', email: p.email || c.email, phone: p.phone || c.phone, contact_person: p.contact_person || c.contact_name })); refresh(); }catch(e){}
  }

  async function init(){
    $('oRegion').innerHTML = '<option value="">Усі області</option>' + REGIONS.map(r => '<option>' + r + '</option>').join('');
    $('oStatus').innerHTML = '<option value="">Усі статуси</option>' + Object.keys(STATUS).map(k => '<option value="' + k + '">' + STATUS[k].l + '</option>').join('');
    const L = links(null);
    $('oLinks').innerHTML = [['Презентація', L.pres], ['Інструкція', L.instr], ['Реєстрація брокера', L.reg]].map(x =>
      '<div class="spread" style="gap:8px;padding:6px 0"><a href="' + x[1] + '" target="_blank" rel="noopener" class="text-sm">' + x[0] + '</a>' +
      '<button class="btn-quiet" onclick="navigator.clipboard.writeText(\'' + x[1] + '\').then(()=>showToast(\'Скопійовано\'))"><i class="ti ti-copy"></i> Копіювати</button></div>').join('');
    try{
      [list, tpls] = await Promise.all([loadProspects(), loadTemplates()]);
      refresh();
      loadClaims().catch(() => {});
      syncRegistered().then(refresh).catch(() => {});
    }catch(e){
      $('oTable').innerHTML = '<tr><td colspan="6" class="text-sm" style="color:var(--red)">' + esc(e.message) + '</td></tr>';
    }
  }

  window.Outreach = {
    init, compose, edit, saveEdit, del, setStatus, send, official,
    pickTpl(i, btn){ curTpl = tpls[i]; document.querySelectorAll('#cmpTpl .chip').forEach(c => c.classList.toggle('active', c === btn)); fillText(); },
    filter(k, v){ filt[k] = v; table(); },
    importOpen(){ $('impModal').classList.add('open'); importPreview(); }, importPreview, doImport,
    tplOpen, tplSave, tplDel, tplAdd,
    afterInvite(){ afterClaimInvite(); const id = window.__outreachInvite; if (!id) return; window.__outreachInvite = null; setStatus(id, 'invited'); },
    importRegistry, claimInvite, claimVerify: id => claimSet(id, 'verified'),
    claimReject: id => { if (confirm('Відхилити заявку на підтвердження?')) claimSet(id, 'rejected'); },
    _render: render
  };
  const _origCompose = compose;
  window.Outreach.compose = id => { _origCompose(id); historyBox(); };
})();
