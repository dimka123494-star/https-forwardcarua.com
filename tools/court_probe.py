#!/usr/bin/env python3
"""Разова розвідка: склад набору ЄДРСР 2026 (data.gov.ua) і діапазон дат у «Списку справ, призначених до розгляду»."""
import csv, io, json, os, subprocess, urllib.request, zipfile
UA = 'Mozilla/5.0 (forwardcarua.com open-data import)'
out = []
def log(*a): out.append(' '.join(str(x) for x in a)); print(*a, flush=True)
j = json.loads(urllib.request.urlopen(urllib.request.Request('https://data.gov.ua/api/3/action/package_show?id=16ab7f06-7414-405f-8354-0a492475272d', headers={'User-Agent': UA}), timeout=120).read())
for r in j['result']['resources']: log('RES', r.get('name'), r.get('format'), r.get('url'), r.get('size'))
url = [r['url'] for r in j['result']['resources'] if r['url'].endswith('.zip')][0]
subprocess.run(['curl', '-sSLf', '-A', UA, '-o', 'edrsr.zip', url], check=True)
log('zip MB', os.path.getsize('edrsr.zip') // 2**20)
log(subprocess.run(['unzip', '-l', 'edrsr.zip'], capture_output=True, text=True).stdout[-3000:])
with zipfile.ZipFile('edrsr.zip') as z:
    for n in z.namelist():
        if n.lower().endswith(('.csv', '.txt')):
            with z.open(n) as f: raw = f.read(3000)
            for enc in ('utf-8-sig', 'cp1251'):
                try: t = raw.decode(enc); break
                except UnicodeDecodeError: pass
            log('FILE', n); [log('  |', l[:400]) for l in t.splitlines()[:4]]
subprocess.run(['curl', '-sSLf', '-A', UA, '-o', 'sched.csv', 'https://data.gov.ua/dataset/3a321301-a06f-487b-9d19-e6b917250aee/resource/98d6ba0d-1c18-4835-ae68-bfc0af724bfa/download/spisok-sprav-priznachenih-do-rozglyadu.csv'], check=True)
mn = mx = None; n = 0
with open('sched.csv', encoding='utf-8-sig', errors='replace', newline='') as f:
    for r in csv.DictReader(f, delimiter='\t'):
        d = (r.get('date') or '')[:10]; k = d[6:10] + d[3:5] + d[:2]; n += 1
        if len(k) == 8: mn = min(mn or k, k); mx = max(mx or k, k)
log('SCHED rows', n, 'from', mn, 'to', mx)
os.makedirs('data', exist_ok=True); open('data/court-probe.txt', 'w').write('\n'.join(out))
