#!/usr/bin/env python3
"""Разова розвідка джерел: санкції РНБО, реєстр платників ПДВ, AEO (data.gov.ua)."""
import json, os, urllib.parse, urllib.request
UA = 'Mozilla/5.0 (forwardcarua.com open-data import)'
out = []
def log(*a): out.append(' '.join(str(x) for x in a)); print(*a, flush=True)
def get(u, n=None):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA, **({'Range': f'bytes=0-{n}'} if n else {})}), timeout=120)
    return r.read(n) if n else r.read()
for q in ['санкцій РНБО', 'санкції', 'реєстр платників податку на додану вартість', 'платників ПДВ', 'уповноважених економічних операторів', 'AEO']:
    try:
        j = json.loads(get('https://data.gov.ua/api/3/action/package_search?rows=6&q=' + urllib.parse.quote(q)))
        for p in j['result']['results']:
            log('PKG', q, '|', p['title'][:100], '|', p['id'], '|', (p.get('organization') or {}).get('title', '')[:60], '|', p.get('metadata_modified'))
            for r in p.get('resources', [])[:4]:
                log('   RES', r.get('name', '')[:60], r.get('format'), r.get('url'), r.get('size'))
    except Exception as e: log('ERR', q, e)
for u in ['https://sanctions.nsdc.gov.ua/', 'https://drs.nsdc.gov.ua/', 'https://sanctions.nazk.gov.ua/api/']:
    try: log('URL', u, get(u, 600)[:300])
    except Exception as e: log('URLERR', u, e)
os.makedirs('data', exist_ok=True); open('data/src-probe.txt', 'w').write('\n'.join(out))
