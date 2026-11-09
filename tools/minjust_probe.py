#!/usr/bin/env python3
"""Разова розвідка: структура відкритих даних Мін'юсту (Єдиний реєстр боржників, АСВП, банкрутства) — пише data/minjust-probe.txt."""
import csv, io, json, os, urllib.request, urllib.parse, zipfile
UA = {'User-Agent': 'Mozilla/5.0 (forwardcarua.com open-data import)'}
out = []
def log(*a): out.append(' '.join(str(x) for x in a)); print(*a)
def get(url, path=None):
    r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=900)
    if not path: return r.read()
    with open(path, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b: break
            f.write(b)
for q in ['боржників', 'виконавчого провадження', 'банкрутство', 'судових рішень', 'призначені до розгляду']:
    try:
        j = json.loads(get('https://data.gov.ua/api/3/action/package_search?rows=8&q=' + urllib.parse.quote(q)))
        for p in j['result']['results']:
            log('PKG', q, '|', p['title'], '|', p['id'], '|', p.get('organization', {}).get('title'), '|', p.get('metadata_modified'))
            for r in p.get('resources', [])[:6]:
                log('   RES', r.get('name'), r.get('format'), r.get('url'), r.get('size'))
    except Exception as e: log('ERR search', q, e)
def peek_zip(name, url):
    path = name + '.zip'
    try: get(url, path)
    except Exception as e: log('ERR download', name, e); return
    log('ZIP', name, os.path.getsize(path) // 2**20, 'MB')
    with zipfile.ZipFile(path) as z:
        for n in z.namelist():
            log('  file', n, z.getinfo(n).file_size // 2**20, 'MB')
            with z.open(n) as f:
                raw = f.read(400000)
            for enc in ('utf-8-sig', 'cp1251'):
                try: txt = raw.decode(enc); break
                except UnicodeDecodeError: continue
            lines = txt.splitlines()[:6]
            for l in lines: log('   |', l[:600])
peek_zip('erb', 'https://data.gov.ua/dataset/783b9b50-faba-4cc9-a393-60485e395b1d/resource/e6ea76c1-01f4-4bd0-a282-7d92d6ecc2a1/download/29-ex_csv_erb.zip')
# повний прохід по ЄРБ: скільки юросіб, які категорії
try:
    with zipfile.ZipFile('erb.zip') as z:
        n = [x for x in z.namelist() if x.lower().endswith('.csv')][0]
        with z.open(n) as f:
            head = f.read(4096); f.seek(0) if hasattr(f, 'seek') else None
        enc = 'utf-8-sig'
        try: head.decode('utf-8')
        except UnicodeDecodeError: enc = 'cp1251'
        with z.open(n) as f:
            rd = csv.reader(io.TextIOWrapper(f, encoding=enc, errors='replace'), delimiter=',' if head.count(b',') > head.count(b';') else ';')
            hdr = next(rd); log('HEADER', hdr)
            total = 0; sample = []
            for row in rd:
                total += 1
                if len(sample) < 3 and any(x and x.isdigit() and len(x) == 8 for x in row): sample.append(row)
            log('ROWS', total)
            for s in sample: log('SAMPLE8', s)
except Exception as e: log('ERR erb scan', e)
os.makedirs('data', exist_ok=True)
open('data/minjust-probe.txt', 'w', encoding='utf-8').write('\n'.join(out))
