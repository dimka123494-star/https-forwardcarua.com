#!/usr/bin/env python3
"""ЄДР для всіх юридичних осіб (≈2 млн кодів) — для безкоштовної картки /c/{ЄДРПОУ} і звіту «Перевірка компанії».

Supabase на безкоштовному плані (500 МБ) повний ЄДР не вмістить, тому дані лежать шардами в GitHub Release `edr-data`:
  edr-NNN.json.gz (NNN = int(код) % 512, ≈240 КБ кожен, ≈120 МБ разом) і edr-meta.json.
Netlify Edge (company-page.ts) та Supabase Edge (company-check) на запит беруть один шард.

Формат запису (короткі ключі, порожні поля пропущені):
  n — назва, sn — скорочена, s — стан, d — дата реєстрації, o — ОПФ, c — статутний капітал,
  h — [керівник], fn — кількість засновників, fo — [[назва, код]] засновників-юросіб, b — к-сть філій,
  t — припинення, bk — банкрутство/санація, x — [[реєстр ДПС, з дати, по дату]].
Для припинених і скасованих — лише n, sn, s, d, t.
Імена засновників-фізосіб, бенефіціарів і представників не беремо (як і в edr_import.py) — лише керівника.

Розширені дані для платного «Витягу з ЄДР» (лише чинні юрособи) — окремо, ЗАШИФРОВАНІ, бо містять імена фізосіб:
  edrx-NNN.bin = AES-256-GCM(gzip(json)), ключ AES загорнутий RSA-OAEP-SHA256 публічним ключем tools/edrx_public.pem.
  Приватний ключ — лише в Supabase (app_secrets.EDRX_PRIVATE_KEY), розшифровують функції company-check / check-pay.
  Формат файлу: 2 байти довжини загорнутого ключа (big-endian) + загорнутий ключ + 12 байт nonce + шифротекст.
  Запис: rn — номер запису, rd — дата запису, m — органи управління, sg — [[ПІБ, роль]] (керівник і представники),
  f — [[назва/ПІБ, код|null, частка грн|null]] засновників, bf — [ПІБ] бенефіціарів (без адрес), br — [[назва, код]] філій,
  pr — [правонаступники/попередники]. Адрес, КВЕДів і контактів у відкритих даних немає (воєнний стан).

Запуск: python3 tools/edr_shards.py [uo.zip]   (без аргументу — UO_ZIP або uo.zip; якщо файлу немає — завантажить)"""
import gzip, json, os, re, sys, time, zipfile, xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from edr_import import download, todict, pick, uo_files, kids, iso  # noqa: E402

SHARDS = 512
OUT = 'out-edr'
MIN_CODES = 1_500_000   # у ЄДР ≈2 млн кодів юросіб; набагато менше — битий архів, не публікуємо


def compact(r):
    st = str(r.get('state') or '')
    o = {'n': r.get('name'), 'sn': r.get('short_name') if r.get('short_name') != r.get('name') else None, 's': st, 'd': r.get('reg_date')}
    if st.startswith(('припинено', 'скасовано')):
        o['t'] = (r.get('termination') or '')[:200] or None
    else:
        heads = [h['name'] for h in r.get('heads') or [] if (h.get('role') or '').startswith('керівник')][:2]
        o.update({
            'o': r.get('opf'), 'c': r.get('capital'), 'h': heads,
            'fn': r.get('founders_total') or None,
            'fo': [[f['name'], f['code']] for f in r.get('founder_orgs') or []],
            'b': r.get('branches') or None,
            't': (r.get('termination') or '')[:200] or None,
            'bk': (r.get('bankruptcy') or '')[:200] or None,
            'x': [[t['type'], t['date'], t['end']] for t in r.get('taxes') or []],
        })
    return {k: v for k, v in o.items() if v not in (None, '', [], {})}


def texts(v):
    """усі рядки всередині елемента (будь-яка вкладеність)"""
    if isinstance(v, str):
        return [v] if v.strip() else []
    if isinstance(v, dict):
        return [t for x in v.values() for t in texts(x)]
    if isinstance(v, list):
        return [t for x in v for t in texts(x)]
    return []


def extended(d):
    """розширені поля для «Витягу з ЄДР» (без адрес фізосіб)"""
    reg = [x.strip() for x in str(d.get('REGISTRATION') or '').split(';')]
    sg = []
    for s in kids(d, 'SIGNERS', 'SIGNER'):
        if isinstance(s, str):
            name, _, role = s.partition(' - ')
            name, role = name.split(';')[0].strip(), role.strip(' ;') or None
            if name and [name, role] not in sg:
                sg.append([name, role])
    f = []
    for x in kids(d, 'FOUNDERS', 'FOUNDER'):
        parts = [p.strip() for p in str(x).split(';')]
        code = next((p for p in parts[1:] if re.fullmatch(r'\d{8}', p)), None)
        m = re.search(r'частки\s*-\s*([\d\s]+(?:,\d+)?)', str(x))
        share = float(m.group(1).replace(' ', '').replace(',', '.')) if m else None
        f.append([parts[0][:300], code, share])
    bf = []
    for t in texts(d.get('BENEFICIARIES')):
        name = re.split(r'[;,]', t)[0].strip()
        if name and name not in bf:
            bf.append(name[:200])
    br = []
    for b in kids(d, 'BRANCHES', 'BRANCH'):
        if isinstance(b, dict) and b.get('NAME'):
            br.append([str(b.get('NAME'))[:300], b.get('CODE') or None])
    pr = [t[:300] for t in texts(d.get('PREDECESSORS')) + texts(d.get('ASSIGNEES'))][:10]
    o = {'rn': reg[2] if len(reg) > 2 else None, 'rd': iso(reg[1]) if len(reg) > 1 else None,
         'm': d.get('SUPERIOR_MANAGEMENT') or None, 'sg': sg[:20], 'f': f[:50], 'bf': bf[:20], 'br': br[:50], 'pr': pr}
    return {k: v for k, v in o.items() if v not in (None, '', [], {})}


def encrypt(pub, data):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes
    key, nonce = AESGCM.generate_key(256), os.urandom(12)
    wrapped = pub.encrypt(key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    return len(wrapped).to_bytes(2, 'big') + wrapped + nonce + AESGCM(key).encrypt(nonce, data, None)


def main():
    zpath = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('UO_ZIP', 'uo.zip')
    download(zpath)
    t0, total, out, ext = time.time(), 0, {}, {}
    with zipfile.ZipFile(zpath) as z:
        for n in uo_files(z):
            with z.open(n) as f:
                for _, el in ET.iterparse(f):
                    if el.tag != 'SUBJECT':
                        continue
                    code = (el.findtext('EDRPOU') or '').strip()
                    if len(code) == 8 and code.isdigit():   # ФОП у відкритих даних без коду — пропускаються самі
                        total += 1
                        d = todict(el)
                        rec = compact(pick(d))
                        prev = out.get(code)
                        # кілька записів з одним кодом — беремо зареєстрований
                        if not prev or (rec['s'].startswith('зареєстр') and not prev['s'].startswith('зареєстр')):
                            out[code] = rec
                            if rec['s'].startswith(('припинено', 'скасовано')):
                                ext.pop(code, None)
                            else:
                                ext[code] = extended(d)
                    el.clear()
    print('records', total, 'codes', len(out), 'sec', int(time.time() - t0), flush=True)
    if len(out) < MIN_CODES:
        raise SystemExit(f'ЄДР: лише {len(out)} кодів — підозріло мало, не публікуємо')
    shards = [dict() for _ in range(SHARDS)]
    for code, v in out.items():
        shards[int(code) % SHARDS][code] = v
    os.makedirs(OUT, exist_ok=True)
    size = 0
    for i, sh in enumerate(shards):
        b = gzip.compress(json.dumps(sh, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode('utf-8'), 6, mtime=0)
        with open(f'{OUT}/edr-{i:03d}.json.gz', 'wb') as f:
            f.write(b)
        size += len(b)
    # розширені дані — шифровані шарди edrx-NNN.bin
    xs = 0
    pem = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'edrx_public.pem')
    try:
        from cryptography.hazmat.primitives import serialization
        pub = serialization.load_pem_public_key(open(pem, 'rb').read())
        xsh = [dict() for _ in range(SHARDS)]
        for code, v in ext.items():
            xsh[int(code) % SHARDS][code] = v
        for i, sh in enumerate(xsh):
            b = encrypt(pub, gzip.compress(json.dumps(sh, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode('utf-8'), 6, mtime=0))
            with open(f'{OUT}/edrx-{i:03d}.bin', 'wb') as f:
                f.write(b)
            xs += len(b)
    except Exception as e:   # без розширених даних картки й звіти однаково працюють
        print('edrx: не зібрано —', e, flush=True)
    meta = {'ext': len(ext) if xs else 0, 'generated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'codes': len(out), 'shards': SHARDS,
            'active': sum(1 for v in out.values() if not v['s'].startswith(('припинено', 'скасовано')))}
    json.dump(meta, open(f'{OUT}/edr-meta.json', 'w'))
    print(meta, 'gz MB', size // 2 ** 20, 'edrx MB', xs // 2 ** 20, flush=True)


if __name__ == '__main__':
    main()
