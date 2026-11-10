/* pdf-snap.js — HTML → PDF (A4), однаково в усіх браузерах.
   html2pdf робить знімок через власний position:fixed-шар; у Safari на iPhone на прокрученій сторінці
   він зсувається — PDF виходить з порожнечею вгорі й обрізаним низом. Тут HTML рендериться в окремому
   невидимому iframe (без прокрутки), знімається html2canvas і кладеться в jsPDF.
   PdfSnap.render(html) → Promise<jsPDF>; PdfSnap.blob(html) → Promise<Blob> */
const PdfSnap = (() => {
  const LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
  let ready = null;
  function load(){
    if (window.html2canvas && window.jspdf) return Promise.resolve();
    return ready || (ready = Promise.all(LIBS.map(src => new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = () => { ready = null; rej(new Error('PDF-бібліотека не завантажилась')); };
      document.head.appendChild(s);
    }))));
  }

  async function render(html, opts = {}){
    await load();
    const W = opts.width || 800;
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:absolute;left:-10000px;top:0;width:' + W + 'px;height:2000px;border:0;visibility:hidden';
    document.body.appendChild(f);
    try{
      const d = f.contentDocument;
      d.open(); d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}</style></head><body>' + html + '</body></html>'); d.close();
      await new Promise(r => setTimeout(r, 60));
      if (d.fonts && d.fonts.ready) await d.fonts.ready.catch(() => {});
      const el = d.body.firstElementChild;
      f.style.height = Math.max(1200, el.scrollHeight + 40) + 'px';
      const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
        windowWidth: W, windowHeight: el.scrollHeight + 40, scrollX: 0, scrollY: 0 });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const M = 8, pw = 210 - 2 * M, ph = 297 - 2 * M;
      let iw = pw, ih = canvas.height * pw / canvas.width;
      // трохи довше за аркуш — зменшуємо в один аркуш, а не переносимо кілька рядків на другий
      if (ih > ph && ih < ph * 1.15){ iw = pw * ph / ih; ih = ph; }
      const img = canvas.toDataURL('image/jpeg', 0.95);
      if (ih <= ph) pdf.addImage(img, 'JPEG', M + (pw - iw) / 2, M, iw, ih);
      else for (let y = 0, i = 0; y < ih; y += ph, i++){ if (i) pdf.addPage(); pdf.addImage(img, 'JPEG', M, M - y, iw, ih); }
      return pdf;
    } finally { f.remove(); }
  }
  const blob = async (html, opts) => (await render(html, opts)).output('blob');
  return { load, render, blob };
})();
