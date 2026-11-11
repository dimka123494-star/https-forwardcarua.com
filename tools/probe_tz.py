# Розвідка: набір МВС із VIN (00a6c5c6…) і назви ТСЦ (DEP) у файлах реєстраційних операцій
import json, urllib.request, urllib.parse, zipfile, io, csv, os, collections, codecs
UA = 'Mozilla/5.0 forwardcarua-probe'
csv.field_size_limit(10**7)
def get(u, t=1800): return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=t)
out = []
p = lambda *a: (out.append(' '.join(str(x) for x in a)), print(*a, flush=True))
VIN = 'JTJZK1BA3F2424991'
def text(data):
    if data[:2] == b'PK':
        z = zipfile.ZipFile(io.BytesIO(data)); i = max(z.infolist(), key=lambda x: x.file_size); p('  zip', i.filename, i.file_size); raw = z.read(i)
    else: raw = data
    try: codecs.getincrementaldecoder('utf-8')().decode(raw[:4<<20], final=False); enc = 'utf-8-sig'
    except UnicodeDecodeError: enc = 'cp1251'
    return raw.decode(enc, errors='replace')
try:
    j = json.load(get('https://data.gov.ua/api/3/action/package_show?id=00a6c5c6-ff57-406c-a6e5-795acbaca5c3', 120))['result']
    p('PKG', j['title'], j.get('metadata_modified'))
    for r in j['resources']: p('RES', r['id'], r.get('name'), r.get('format'), r.get('size'), r.get('last_modified') or r.get('created'), r['url'])
    for r in j['resources'][:3]:
        try:
            t = text(get(r['url']).read()); lines = t.splitlines(); p('lines', len(lines))
            for l in lines[:4]: p('  >', l[:500])
            hits = [l for l in lines if VIN in l or 'АС4020НВ' in l]
            p('hits', len(hits)); [p('  H', h[:500]) for h in hits[:10]]
        except Exception as e: p('ERR', r.get('name'), repr(e))
except Exception as e: p('ERR pkg', repr(e))
# назви ТСЦ
pk = json.load(get('https://data.gov.ua/api/3/action/package_show?id=06779371-308f-42d7-895e-5a39833375f0', 120))['result']
for name in ['reestrTZ2025', 'reestrTZ2022', 'reestrTZ2019']:
    rs = sorted([r for r in pk['resources'] if r.get('name') == name], key=lambda r: r.get('created') or '')
    if not rs: continue
    t = text(get(rs[-1]['url']).read())
    rd = csv.reader(io.StringIO(t), delimiter=';')
    hdr = [h.strip().strip('"').upper() for h in next(rd)]; p(name, hdr)
    ix = {h: i for i, h in enumerate(hdr)}
    c = collections.Counter()
    for row in rd:
        if len(row) > ix['DEP']: c[(row[ix['DEP_CODE']], row[ix['DEP']])] += 1
    for (k, v), n in c.most_common(25): p('  DEP', k, v, n)
    for (k, v), n in c.items():
        if k in ('12238', '10000', '12235'): p('  DEP*', k, v, n)
os.makedirs('probe', exist_ok=True)
open('probe/report.txt', 'w').write('\n'.join(out))
