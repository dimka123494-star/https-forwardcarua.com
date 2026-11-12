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
    const res = [...out].filter(([, f]) => f === best).map(([p]) => p);
    res.fix = best; return res;
  }

  // підготовка: збільшити, у сірий, підсилити контраст — Tesseract краще читає чорне на білому
  function prep(src, sx, sy, sw, sh){
    const scale = Math.max(1, Math.min(4, 900 / sw));
    const c = document.createElement('canvas'); c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
    const x = c.getContext('2d'); x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data, n = p.length / 4, hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4){ const g = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) | 0; p[i] = g; hist[g]++; }
    // поріг Оцу — розділяє темні символи й світле тло навіть на тьмяному, розмитому номері
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++){ wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best){ best = v; thr = t; } }
    for (let i = 0; i < p.length; i += 4){ const v = p[i] > thr ? 255 : 0; p[i] = p[i + 1] = p[i + 2] = v; }
    x.putImageData(d, 0, 0);
    return c;
  }

  // розтягнути контраст (без бінаризації) — для тьмяних фото, дощу, вечора
  function stretch(src, sx, sy, sw, sh){
    const scale = Math.max(1, Math.min(4, 900 / sw));
    const c = document.createElement('canvas'); c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
    const x = c.getContext('2d'); x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data, hist = new Uint32Array(256), n = p.length / 4;
    for (let i = 0; i < p.length; i += 4){ const g = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) | 0; p[i] = g; hist[g]++; }
    let lo = 0, hi = 255, acc = 0; for (; lo < 255 && (acc += hist[lo]) < n * 0.02; lo++); acc = 0; for (; hi > 0 && (acc += hist[hi]) < n * 0.02; hi--);
    const k = 255 / Math.max(1, hi - lo);
    for (let i = 0; i < p.length; i += 4){ const v = Math.max(0, Math.min(255, (p[i] - lo) * k)); p[i] = p[i + 1] = p[i + 2] = v; }
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

  // пошук номера в кадрі: рядки з густими вертикальними краями (літери/цифри) → прямокутники з пропорціями номера
  function locate(src, sx, sy, sw, sh){
    const W = 640, H = Math.max(1, Math.round(sh * W / sw)), k = sw / W;
    const c = locC || (locC = document.createElement('canvas')); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
    const p = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    // поріг краю — від контрасту самого кадру (дощ, вечір, брудний номер дають слабкі краї)
    const gh = new Uint32Array(256); let gn = 0;
    for (let y = 1; y < H - 1; y += 2) for (let xx = 1; xx < W - 1; xx += 2){ gh[Math.min(255, Math.abs(g[y * W + xx + 1] - g[y * W + xx - 1]) | 0)]++; gn++; }
    let T = 255, acc = 0; while (T > 0 && (acc += gh[T]) < gn * 0.04) T--;
    T = Math.max(12, Math.min(45, T));
    const m = new Uint8Array(W * H), gap = Math.round(W * 0.025);
    for (let y = 1; y < H - 1; y++){
      let start = -1, last = -1, n = 0;
      const flush = () => { if (start >= 0 && n >= 8 && last - start >= W * 0.05 && last - start <= W * 0.8) m.fill(1, y * W + start, y * W + last + 1); };
      for (let xx = 1; xx < W - 1; xx++){
        const o = y * W + xx;
        if (Math.abs(g[o + 1] - g[o - 1]) > T){
          if (start < 0 || xx - last > gap){ flush(); start = xx; n = 0; }
          last = xx; n++;
        }
      }
      flush();
    }
    // звʼязні області маски
    const lab = new Int32Array(W * H), boxes = [], st = [];
    for (let i = 0; i < m.length; i++){
      if (!m[i] || lab[i]) continue;
      let x0 = W, x1 = 0, y0 = H, y1 = 0, area = 0; lab[i] = 1; st.push(i);
      while (st.length){
        const o = st.pop(), ox = o % W, oy = (o - ox) / W; area++;
        if (ox < x0) x0 = ox; if (ox > x1) x1 = ox; if (oy < y0) y0 = oy; if (oy > y1) y1 = oy;
        for (const q of [o - 1, o + 1, o - W, o + W, o - 2 * W, o + 2 * W]) if (q >= 0 && q < m.length && m[q] && !lab[q] && Math.abs((q % W) - ox) <= 1){ lab[q] = 1; st.push(q); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, r = bw / bh, fill = area / (bw * bh);
      if (bh >= 6 && bw >= W * 0.02 && r >= 0.8 && r <= 12 && fill > 0.35) boxes.push({ x0, y0, bw, bh, score: area * fill * (r >= 3 && r <= 8 ? 1.5 : 1) });
    }
    // великий номер зблизька: «АА», «1234», «ВВ» можуть знайтись окремо — склеюємо сусідів на одному рядку
    for (let merged = true; merged;){
      merged = false;
      for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length && !merged; j++){
        const A = boxes[i], B = boxes[j];
        const ov = Math.min(A.y0 + A.bh, B.y0 + B.bh) - Math.max(A.y0, B.y0), h = Math.max(A.bh, B.bh);
        const dist = Math.max(A.x0, B.x0) - Math.min(A.x0 + A.bw, B.x0 + B.bw);
        if (ov > 0.5 * Math.min(A.bh, B.bh) && dist < 1.5 * h){
          const x0 = Math.min(A.x0, B.x0), y0 = Math.min(A.y0, B.y0);
          boxes[i] = { x0, y0, bw: Math.max(A.x0 + A.bw, B.x0 + B.bw) - x0, bh: Math.max(A.y0 + A.bh, B.y0 + B.bh) - y0, score: A.score + B.score };
          boxes.splice(j, 1); merged = true;
        }
      }
    }
    const good = boxes.filter(b => { const r = b.bw / b.bh; return b.bw >= W * 0.06 && r >= 2 && r <= 12; }).sort((a, b) => b.score - a.score);
    return good.slice(0, 3).map(b => {
      const px = b.bw * 0.12, py = b.bh * 0.35;
      return { sx: sx + Math.max(0, b.x0 - px) * k, sy: sy + Math.max(0, b.y0 - py) * k, sw: Math.min(W, b.bw + 2 * px) * k, sh: Math.min(H, b.bh + 2 * py) * k };
    });
  }

  async function recognize(canvas){
    const w = await getWorker();
    let data; try{ ({ data } = await w.recognize(canvas)); } finally { if (canvas !== snapC){ canvas.width = canvas.height = 0; } }
    const plates = candidates(data.text); return { text: data.text, plates, fix: plates.fix };
  }

  function ui(){
    let o = document.getElementById('psOverlay');
    if (o) return o;
    o = document.createElement('div'); o.id = 'psOverlay'; o.className = 'ps-overlay';
    o.innerHTML = '<div class="ps-top"><button class="ps-x" aria-label="Закрити" data-close><i class="ti ti-x"></i></button><span>Наведіть рамку на номерний знак</span></div>' +
      '<div class="ps-view"><video playsinline muted autoplay></video><div class="ps-frame"></div></div>' +
      '<div class="ps-msg" data-msg>Наведіть камеру на номер — розпізнаємо автоматично</div>' +
      '<div class="ps-bar"><label class="ps-alt"><input type="file" accept="image/*" hidden data-file><i class="ti ti-photo"></i>Фото з галереї</label>' +
      '<button class="ps-shot" data-shot aria-label="Сфотографувати"></button><span class="ps-alt" style="visibility:hidden"><i class="ti ti-photo"></i>Фото</span></div>';
    document.body.appendChild(o);
    o.querySelector('[data-close]').onclick = close;
    o.querySelector('[data-shot]').onclick = shoot;
    o.querySelector('[data-file]').onchange = e => { const f = e.target.files[0]; if (f) fromFile(f); };
    return o;
  }
  const msg = (t, err) => { const m = document.querySelector('#psOverlay [data-msg]'); if (m){ m.innerHTML = t; m.classList.toggle('err', !!err); } };

  let scanning = false, busy = false, prev = null, snapC = null, locC = null;
  // один canvas на кадр замість нового щоразу — iPhone обмежує памʼять під canvas
  function grab(v){
    const c = snapC || (snapC = document.createElement('canvas'));
    if (c.width !== v.videoWidth) c.width = v.videoWidth; if (c.height !== v.videoHeight) c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0); return c;
  }
  async function open(cb){
    onPlate = cb; prev = null;
    const o = ui(); o.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    getWorker().catch(() => {});      // завантажуємо розпізнавання, поки людина цілиться
    try{
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      const v = o.querySelector('video'); v.srcObject = stream;
      // легкий зум, якщо камера підтримує, — номер здалеку стає більшим
      try{ const t = stream.getVideoTracks()[0], cp = t.getCapabilities ? t.getCapabilities() : {}; if (cp.zoom && cp.zoom.max >= 1.5) await t.applyConstraints({ advanced: [{ zoom: Math.min(2, cp.zoom.max) }] }); }catch(e){}
      msg('Наведіть камеру на номер — розпізнаємо автоматично');
      scanning = true; loop();
    }catch(e){
      o.querySelector('.ps-view').style.display = 'none'; o.querySelector('[data-shot]').style.display = 'none';
      msg('Немає доступу до камери. Дозвольте його в налаштуваннях браузера або виберіть фото номера з галереї.', true);
    }
  }
  function close(){
    scanning = false;
    const o = document.getElementById('psOverlay'); if (o) o.classList.remove('open');
    document.documentElement.style.overflow = '';
    if (stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (snapC){ snapC.width = snapC.height = 0; snapC = null; }
  }

  // видима частина відео (object-fit: cover) і рамка → пікселі відео
  function geom(){
    const o = document.getElementById('psOverlay'), v = o.querySelector('video'), f = o.querySelector('.ps-frame');
    const vr = v.getBoundingClientRect(), fr = f.getBoundingClientRect();
    const k = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    const ox = (v.videoWidth * k - vr.width) / 2, oy = (v.videoHeight * k - vr.height) / 2;
    return { v, view: { sx: ox / k, sy: oy / k, sw: vr.width / k, sh: vr.height / k },
      frame: { sx: (fr.left - vr.left + ox) / k, sy: (fr.top - vr.top + oy) / k, sw: fr.width / k, sh: fr.height / k } };
  }
  // спроби для кадру: знайдені номери у всьому кадрі + рамка
  function attemptsFor(src, view, frame, all){
    const list = [];
    for (const b of locate(src, view.sx, view.sy, view.sw, view.sh)) { list.push(() => prep(src, b.sx, b.sy, b.sw, b.sh)); if (all) list.push(() => raw(src, b.sx, b.sy, b.sw, b.sh)); }
    if (frame){ list.push(() => prep(src, frame.sx, frame.sy, frame.sw, frame.sh)); if (all) list.push(() => raw(src, frame.sx, frame.sy, frame.sw, frame.sh)); }
    return list;
  }

  // безперервне сканування: кожні ~0,4 с беремо кадр, поки не знайдемо номер
  async function loop(){
    while (scanning){
      const g = document.getElementById('psOverlay') && geom();
      if (g && g.v.videoWidth && !busy){
        busy = true;
        try{
          const snap = grab(g.v);
          const tries = attemptsFor(snap, g.view, g.frame, false);
          for (const a of tries){
            if (!scanning) break;
            const r = await recognize(a());
            if (!r.plates.length) continue;
            // без виправлень — одразу; з виправленнями — коли той самий номер прочитано двічі поспіль
            if (r.plates.length === 1 && (r.fix === 0 || prev === r.plates[0])){ done(r.plates[0]); break; }
            prev = r.plates[0];
          }
        }catch(e){}
        busy = false;
      }
      await new Promise(res => setTimeout(res, 700));
    }
  }
  function done(plate){ try{ track('plate_scan', { found: 1, auto: 1 }); }catch(e){} if (navigator.vibrate) navigator.vibrate(60); close(); onPlate && onPlate(plate); }

  async function shoot(){
    const g = geom(); if (!g.v.videoWidth) return;
    const snap = grab(g.v);
    scanning = false; while (busy) await new Promise(r => setTimeout(r, 50));
    await run(attemptsFor(snap, g.view, g.frame, true));
    if (stream && document.getElementById('psOverlay').classList.contains('open') && !document.querySelector('#psOverlay [data-p]')){ scanning = true; loop(); }
  }

  async function fromFile(file){
    scanning = false;
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = async () => {
      const W = im.naturalWidth, H = im.naturalHeight, all = { sx: 0, sy: 0, sw: W, sh: H };
      await run([...attemptsFor(im, all, null, true), () => raw(im, 0, 0, W, H), () => prep(im, 0, 0, W, H), () => prep(im, W * 0.1, H * 0.35, W * 0.8, H * 0.3)]);
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
      if (!r.plates.length){ msg('Номер не знайдено. Наведіть камеру так, щоб номер був чітким, — розпізнаємо автоматично.', true); return; }
      if (r.plates.length === 1){ close(); onPlate && onPlate(r.plates[0]); return; }
      scanning = false;
      msg('Який номер? ' + r.plates.map(p => '<button class="ps-chip" data-p="' + p + '">' + p + '</button>').join(' '));
      document.querySelectorAll('#psOverlay [data-p]').forEach(b => b.onclick = () => { close(); onPlate && onPlate(b.dataset.p); });
    }catch(e){ msg('Розпізнавання не завантажилось — перевірте інтернет і спробуйте ще раз.', true); }
    finally{ if (btn) btn.disabled = false; }
  }

  return { open, close, candidates, recognize, prep, raw, stretch, locate, attemptsFor };
})();
