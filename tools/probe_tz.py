# Розвідка: набір МВС «Відомості про транспортні засоби та їх власників»
import json, urllib.request, zipfile, io, csv, sys, os, collections
UA = 'Mozilla/5.0 forwardcarua-probe'
def get(u, t=300):
    return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=t).read()
out = []
p = lambda *a: out.append(' '.join(str(x) for x in a))
for q in ['транспортні засоби та їх власників', 'tz_opendata']:
    j = json.loads(get('https://data.gov.ua/api/3/action/package_search?rows=10&q=' + urllib.parse.quote(q)))
    for r in j['result']['results']:
        p('PKG', r['id'], r['name'], r['title'][:100], len(r.get('resources', [])))
import urllib.parse
j = json.loads(get('https://data.gov.ua/api/3/action/package_show?id=06779371-308f-42d7-895e-5a39833375f0'))
res = j['result']['resources']
p('RESOURCES', len(res), j['result']['title'])
for r in res:
    p('RES', r['id'], r.get('name'), r.get('format'), r.get('size'), r.get('last_modified') or r.get('created'), r['url'])
os.makedirs('probe', exist_ok=True)
# зразки: найновіший і найстаріший
def sample(r):
    p('==== SAMPLE', r.get('name'), r['url'])
    data = get(r['url'], 1200)
    p('bytes', len(data))
    if data[:2] == b'PK':
        z = zipfile.ZipFile(io.BytesIO(data))
        for i in z.infolist(): p('  zip', i.filename, i.file_size)
        raw = z.read(z.infolist()[0])
    else:
        raw = data
    enc = 'utf-8'
    try: raw[:200000].decode('utf-8')
    except UnicodeDecodeError: enc = 'cp1251'
    text = raw.decode(enc, errors='replace')
    lines = text.splitlines()
    p('enc', enc, 'lines', len(lines))
    for l in lines[:6]: p('  >', l[:400])
    sep = ';' if lines[0].count(';') > lines[0].count(',') else ','
    rd = csv.reader(lines, delimiter=sep)
    hdr = next(rd)
    hdr = [h.strip().strip('﻿').strip('"').upper() for h in hdr]
    p('hdr', hdr)
    plates = collections.Counter(); vins = 0; n = 0; ops = collections.Counter(); person = collections.Counter()
    for row in rd:
        n += 1
        d = dict(zip(hdr, row))
        pl = d.get('N_REG_NEW', '').strip()
        if pl: plates[pl] += 1
        if d.get('VIN', '').strip(): vins += 1
        ops[d.get('OPER_NAME', '')[:60]] += 1
        person[d.get('PERSON', '')] += 1
    p('rows', n, 'with plate', sum(plates.values()), 'uniq plates', len(plates), 'with vin', vins)
    p('person', person.most_common(5))
    for o, c in ops.most_common(25): p('  op', c, o)
    p('top plates', plates.most_common(5))
cands = [r for r in res if r.get('url')]
for r in [cands[-1], cands[0]]:
    try: sample(r)
    except Exception as e: p('ERR', repr(e))
open('probe/report.txt', 'w').write('\n'.join(out))
print('\n'.join(out))
