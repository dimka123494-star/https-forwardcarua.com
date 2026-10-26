/* bizcard.js — електронна візитівка брокера (платні тарифи).
   Спільне для /v/{id} (vizytka.html) і кабінету. Потребує config.js. */
const BizCard = (() => {
  const PRESETS = ['#10B981', '#0EA5E9', '#2563EB', '#6366F1', '#A855F7', '#EC4899',
                   '#EF4444', '#F97316', '#F5A623', '#84CC16', '#14B8A6', '#64748B'];
  const DEFAULT = '#10B981';

  const url = id => 'https://forwardcarua.com/v/' + id;

  function paid(b){
    if (!b || !b.plan || b.plan === 'free') return false;
    return !b.plan_expires_at || new Date(b.plan_expires_at) > new Date();
  }

  function color(b){
    const c = b && b.card_color;
    return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : DEFAULT;
  }

  // Темний чи світлий текст на кольорі (відносна яскравість WCAG)
  function onColor(hex){
    const n = parseInt(hex.slice(1), 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => {
      v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
    });
    const L = .2126 * ch[0] + .7152 * ch[1] + .0722 * ch[2];
    return L > .35 ? '#0b0f0d' : '#ffffff';
  }

  function vcfEsc(s){ return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
  function digits(p){ return String(p || '').replace(/[^\d+]/g, ''); }

  function vcard(b){
    const L = ['BEGIN:VCARD', 'VERSION:3.0',
      'N:' + vcfEsc(b.name) + ';;;;', 'FN:' + vcfEsc(b.name),
      'ORG:' + vcfEsc(b.name), 'TITLE:Митний брокер'];
    if (b.phone) L.push('TEL;TYPE=CELL,VOICE:' + digits(b.phone));
    if (b.whatsapp && digits(b.whatsapp) !== digits(b.phone)) L.push('TEL;TYPE=CELL:' + digits(b.whatsapp));
    if (b.viber && digits(b.viber) !== digits(b.phone) && digits(b.viber) !== digits(b.whatsapp)) L.push('TEL;TYPE=CELL:' + digits(b.viber));
    if (b.city || b.region) L.push('ADR;TYPE=WORK:;;;' + vcfEsc(b.city) + ';' + vcfEsc(b.region) + ';;Україна');
    if (b.website) L.push('URL;TYPE=WORK:' + siteHref(b.website));
    L.push('URL:' + url(b.id));
    if (b.telegram) L.push('X-SOCIALPROFILE;TYPE=telegram:' + tgHref(b.telegram));
    if (b.instagram) L.push('X-SOCIALPROFILE;TYPE=instagram:https://instagram.com/' + String(b.instagram).replace(/^@/, ''));
    const note = [b.card_tagline, b.about].filter(Boolean).join('\n');
    if (note) L.push('NOTE:' + vcfEsc(note.slice(0, 500)));
    L.push('END:VCARD');
    return L.join('\r\n');
  }

  function downloadVcf(b){
    const blob = new Blob([vcard(b)], { type: 'text/vcard;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (b.name || 'broker').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40) + '.vcf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // QR як SVG (qrcode-generator має бути підключений)
  function qrSvg(text, fg = '#000', bg = '#fff'){
    if (typeof qrcode !== 'function') return '';
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), m = 2, s = n + m * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
      if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" shape-rendering="crispEdges">' +
      '<rect width="' + s + '" height="' + s + '" fill="' + bg + '"/><path d="' + d + '" fill="' + fg + '"/></svg>';
  }

  // PNG з QR для друку (1024px)
  function downloadQrPng(text, name){
    const svg = qrSvg(text);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 1024;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, 1024, 1024);
      c.toBlob(bl => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(bl);
        a.download = (name || 'qr') + '.png'; document.body.appendChild(a); a.click(); a.remove();
      });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function shareText(b){
    return (b.name || 'Митний брокер') + ' — митний брокер' + (b.city ? ', ' + b.city : '') +
      '. Моя візитівка з контактами й послугами: ' + url(b.id);
  }

  function shareLinks(b){
    const u = encodeURIComponent(url(b.id)), t = encodeURIComponent(shareText(b));
    return {
      telegram: 'https://t.me/share/url?url=' + u + '&text=' + encodeURIComponent((b.name || '') + ' — митний брокер'),
      viber: 'viber://forward?text=' + t,
      whatsapp: 'https://wa.me/?text=' + t,
      email: 'mailto:?subject=' + encodeURIComponent('Візитівка: ' + (b.name || 'митний брокер')) + '&body=' + t
    };
  }

  return { PRESETS, DEFAULT, url, paid, color, onColor, vcard, downloadVcf, qrSvg, downloadQrPng, shareText, shareLinks };
})();
