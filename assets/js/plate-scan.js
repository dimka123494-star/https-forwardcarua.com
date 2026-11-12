/* plate-scan.js — розпізнавання номерного знака з камери телефона (без сервера, Tesseract.js у браузері).
   PlateScan.open(onPlate) — відкриває камеру з рамкою під номер; знімок у рамці → OCR → onPlate('АА1234ВВ').
   Немає доступу до камери — пропонує вибрати фото. Розпізнавання повністю на пристрої, фото нікуди не надсилається. */
const PlateScan = (() => {
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const LAT = 'ABCEHIKMOPTXY', CYR = 'АВСЕНІКМОРТХУ';
  const toCyr = s => [...s].map(c => { const i = LAT.indexOf(c); return i < 0 ? c : CYR[i]; }).join('');
  let worker = null, stream = null, onPlate = null;

  function load(src){ return new Promise((res, rej) => { if (window.Tesseract) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  async function getWorker(){
    if (worker) return worker;
    await load(TESS);
    worker = await Tesseract.createWorker('eng', 1, { logger: () => {} });
    await worker.setParameters({ tessedit_char_whitelist: 'ABCEHIKMOPTXYZV0123456789', tessedit_pageseg_mode: '7' });
    return worker;
  }

  // з тексту OCR — кандидати у форматі АА1234ВВ (у т.ч. електромобілі з Z/V/Y у другій парі)
  const L_OK = 'ABCEHIKMOPTX', TO_L = { '0': 'O', '1': 'I', '8': 'B', '4': 'A', '6': 'B' }, TO_D = { O: '0', D: '0', Q: '0', I: '1', L: '1', B: '8', S: '5', Z: '2', G: '6', T: '7', A: '4' };
  function candidates(text){
    const s = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const out = new Map();   // номер → кількість виправлень (менше — надійніше)
    for (let i = 0; i + 8 <= s.length; i++){
      const w = s.slice(i, i + 8).split('');
      let ok = true, fix = 0;
      const toL = k => { if (TO_L[w[k]]) { w[k] = TO_L[w[k]]; fix++; } };
      for (const k of [0, 1, 7]) { toL(k); if (!L_OK.includes(w[k])) ok = false; }
      toL(6); if (!(L_OK + 'ZVY').includes(w[6])) ok = false;
      for (const k of [2, 3, 4, 5]) { if (TO_D[w[k]]) { w[k] = TO_D[w[k]]; fix++; } if (!/\d/.test(w[k])) ok = false; }
      if (!ok) continue;
      const p = toCyr(w.join(''));
      if (!out.has(p) || out.get(p) > fix) out.set(p, fix);
    }
    const best = Math.min(...out.values());
    return [...out].filter(([, f]) => f === best).map(([p]) => p);
  }

  // підготовка: збільшити, у сірий, підсилити контраст — Tesseract краще читає чорне на білому
  function prep(src, sx, sy, sw, sh){
    const scale = Math.max(1, 900 / sw);
    const c = document.createElement('canvas'); c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
    const x = c.getContext('2d'); x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    let sum = 0; for (let i = 0; i < p.length; i += 4){ const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = p[i + 1] = p[i + 2] = g; sum += g; }
    const avg = sum / (p.length / 4);
    for (let i = 0; i < p.length; i += 4){ const v = p[i] > avg * 0.85 ? 255 : 0; p[i] = p[i + 1] = p[i + 2] = v; }
    x.putImageData(d, 0, 0);
    return c;
  }

  // без бінаризації — для фото з нерівним світлом
  function raw(src, sx, sy, sw, sh){
    const scale = Math.max(1, Math.min(3, 1200 / sw));
    const c = document.createElement('canvas'); c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
    c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }

  async function recognize(canvas){
    const w = await getWorker();
    const { data } = await w.recognize(canvas);
    return { text: data.text, plates: candidates(data.text) };
  }

  function ui(){
    let o = document.getElementById('psOverlay');
    if (o) return o;
    o = document.createElement('div'); o.id = 'psOverlay'; o.className = 'ps-overlay';
    o.innerHTML = '<div class="ps-top"><button class="ps-x" aria-label="Закрити" data-close><i class="ti ti-x"></i></button><span>Наведіть рамку на номерний знак</span></div>' +
      '<div class="ps-view"><video playsinline muted autoplay></video><div class="ps-frame"></div></div>' +
      '<div class="ps-msg" data-msg>Тримайте телефон рівно, номер — на всю рамку</div>' +
      '<div class="ps-bar"><label class="ps-alt"><input type="file" accept="image/*" hidden data-file><i class="ti ti-photo"></i>Фото з галереї</label>' +
      '<button class="ps-shot" data-shot aria-label="Сфотографувати"></button><span class="ps-alt" style="visibility:hidden"><i class="ti ti-photo"></i>Фото</span></div>';
    document.body.appendChild(o);
    o.querySelector('[data-close]').onclick = close;
    o.querySelector('[data-shot]').onclick = shoot;
    o.querySelector('[data-file]').onchange = e => { const f = e.target.files[0]; if (f) fromFile(f); };
    return o;
  }
  const msg = (t, err) => { const m = document.querySelector('#psOverlay [data-msg]'); if (m){ m.innerHTML = t; m.classList.toggle('err', !!err); } };

  async function open(cb){
    onPlate = cb;
    const o = ui(); o.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    getWorker().catch(() => {});      // завантажуємо розпізнавання, поки людина цілиться
    try{
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      o.querySelector('video').srcObject = stream;
    }catch(e){
      o.querySelector('.ps-view').style.display = 'none'; o.querySelector('[data-shot]').style.display = 'none';
      msg('Немає доступу до камери. Дозвольте його в налаштуваннях браузера або виберіть фото номера з галереї.', true);
    }
  }
  function close(){
    const o = document.getElementById('psOverlay'); if (o) o.classList.remove('open');
    document.documentElement.style.overflow = '';
    if (stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  async function shoot(){
    const o = document.getElementById('psOverlay'), v = o.querySelector('video'), f = o.querySelector('.ps-frame');
    if (!v.videoWidth) return;
    // координати рамки на екрані → пікселі відео (object-fit: cover)
    const vr = v.getBoundingClientRect(), fr = f.getBoundingClientRect();
    const k = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    const ox = (v.videoWidth * k - vr.width) / 2, oy = (v.videoHeight * k - vr.height) / 2;
    const sx = (fr.left - vr.left + ox) / k, sy = (fr.top - vr.top + oy) / k, sw = fr.width / k, sh = fr.height / k;
    await run([() => prep(v, sx, sy, sw, sh), () => raw(v, sx, sy, sw, sh)]);
  }

  async function fromFile(file){
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = async () => {
      // фото з галереї: весь кадр (як є і контрастний) і центральна смуга
      const W = im.naturalWidth, H = im.naturalHeight;
      await run([() => raw(im, 0, 0, W, H), () => prep(im, 0, 0, W, H), () => prep(im, W * 0.1, H * 0.35, W * 0.8, H * 0.3), () => raw(im, W * 0.1, H * 0.35, W * 0.8, H * 0.3)]);
      URL.revokeObjectURL(url);
    };
    im.src = url;
  }

  async function run(attempts){
    const btn = document.querySelector('#psOverlay [data-shot]'); if (btn) btn.disabled = true;
    msg('<i class="ti ti-loader-2 ps-spin"></i> Розпізнаємо номер…');
    try{
      let r = { plates: [] };
      for (const a of attempts){ r = await recognize(a()); if (r.plates.length) break; }
      try{ track('plate_scan', { found: r.plates.length }); }catch(e){}
      if (!r.plates.length){ msg('Не вдалося прочитати номер. Підійдіть ближче, щоб номер заповнив рамку, і спробуйте ще раз.', true); return; }
      if (r.plates.length === 1){ close(); onPlate && onPlate(r.plates[0]); return; }
      msg('Який номер? ' + r.plates.map(p => '<button class="ps-chip" data-p="' + p + '">' + p + '</button>').join(' '));
      document.querySelectorAll('#psOverlay [data-p]').forEach(b => b.onclick = () => { close(); onPlate && onPlate(b.dataset.p); });
    }catch(e){ msg('Розпізнавання не завантажилось — перевірте інтернет і спробуйте ще раз.', true); }
    finally{ if (btn) btn.disabled = false; }
  }

  return { open, close, candidates, recognize, prep, raw };
})();
