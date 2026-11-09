#!/usr/bin/env python3
"""Розвідка №2: заголовки наборів ДСА (банкрутство, справи до розгляду) і обсяг Реєстру боржників."""
import csv, io, os, subprocess, sys, urllib.request
UA = {'User-Agent': 'Mozilla/5.0 (forwardcarua.com open-data import)'}
out = []
def log(*a): out.append(' '.join(str(x) for x in a)); print(*a, flush=True)
def head(url, n=200000):
    r = urllib.request.urlopen(urllib.request.Request(url, headers={**UA, 'Range': f'bytes=0-{n}'}), timeout=300)
    raw = r.read(n)
    for enc in ('utf-8-sig', 'cp1251'):
        try: return raw.decode(enc)
        except UnicodeDecodeError: pass
    return raw.decode('utf-8', 'replace')
for name, url in [] and [('bankrut', 'https://data.gov.ua/dataset/544d4dad-0b6d-4972-b0b8-fb266829770f/resource/deb76481-a6c8-4a45-ae6c-f02aa87e9f4a/download/vidomosti-pro-spravi-pro-bankrutstvo.csv'),
                  ('sched', 'https://data.gov.ua/dataset/3a321301-a06f-487b-9d19-e6b917250aee/resource/98d6ba0d-1c18-4835-ae68-bfc0af724bfa/download/spisok-sprav-priznachenih-do-rozglyadu.csv')]:
    try:
        t = head(url)
        for l in t.splitlines()[:8]: log(name, '|', l[:700])
    except Exception as e: log('ERR', name, e)
# Реєстр боржників: повний прохід через unzip -p (zip64)
url = 'https://data.gov.ua/dataset/783b9b50-faba-4cc9-a393-60485e395b1d/resource/e6ea76c1-01f4-4bd0-a282-7d92d6ecc2a1/download/29-ex_csv_erb.zip'
subprocess.run(['curl', '-sSL', '-A', UA['User-Agent'], '-o', 'erb.zip', url], check=True)
log('erb.zip MB', os.path.getsize('erb.zip') // 2**20)
log(subprocess.run(['unzip', '-l', 'erb.zip'], capture_output=True, text=True).stdout[-600:])
p = subprocess.Popen(['unzip', '-p', 'erb.zip'], stdout=subprocess.PIPE)
csv.field_size_limit(10**7)
rd = csv.reader(io.TextIOWrapper(p.stdout, encoding='utf-8-sig', errors='replace'), delimiter=';')
hdr = next(rd); log('HDR', hdr)
import collections
total = 0; lens = collections.Counter(); firm_codes = set(); cats = collections.Counter(); shown = 0
for row in rd:
    total += 1
    if shown < 4: log('ROW', row[:4], len(row)); shown += 1
    code = (row[2] if len(row) > 2 else '').strip()
    lens[(len(code), code.isdigit())] += 1
    if len(code) == 8 and code.isdigit():
        firm_codes.add(code); cats[row[10] if len(row) > 10 else ''] += 1
    if total in (1000000, 5000000): log('AT', total, 'ROW', row[:3])
log('ROWS', total, 'LENS', lens.most_common(8), 'FIRM_CODES', len(firm_codes))
for c, n in cats.most_common(12): log('CAT', n, c)
log('unzip rc', p.wait())
os.makedirs('data', exist_ok=True)
open('data/minjust-probe.txt', 'w', encoding='utf-8').write('\n'.join(out))
