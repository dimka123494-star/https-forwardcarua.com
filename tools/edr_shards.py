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

Запуск: python3 tools/edr_shards.py [uo.zip]   (без аргументу — UO_ZIP або uo.zip; якщо файлу немає — завантажить)"""
import gzip, json, os, sys, time, zipfile, xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from edr_import import download, todict, pick  # noqa: E402

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


def main():
    zpath = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('UO_ZIP', 'uo.zip')
    download(zpath)
    t0, total, out = time.time(), 0, {}
    with zipfile.ZipFile(zpath) as z:
        xmls = [x for x in z.namelist() if x.lower().endswith('.xml')]
        # повний архів НАІС має ще FOP (без кодів, 5 ГБ, з битими &#…;) і FSU — беремо лише юрособи
        for n in [x for x in xmls if 'UO' in x.upper()] or xmls:
            with z.open(n) as f:
                for _, el in ET.iterparse(f):
                    if el.tag != 'SUBJECT':
                        continue
                    code = (el.findtext('EDRPOU') or '').strip()
                    if len(code) == 8 and code.isdigit():   # ФОП у відкритих даних без коду — пропускаються самі
                        total += 1
                        rec = compact(pick(todict(el)))
                        prev = out.get(code)
                        # кілька записів з одним кодом — беремо зареєстрований
                        if not prev or (rec['s'].startswith('зареєстр') and not prev['s'].startswith('зареєстр')):
                            out[code] = rec
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
    meta = {'generated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'codes': len(out), 'shards': SHARDS,
            'active': sum(1 for v in out.values() if not v['s'].startswith(('припинено', 'скасовано')))}
    json.dump(meta, open(f'{OUT}/edr-meta.json', 'w'))
    print(meta, 'gz MB', size // 2 ** 20, flush=True)


if __name__ == '__main__':
    main()
