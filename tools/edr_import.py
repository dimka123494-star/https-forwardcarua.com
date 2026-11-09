#!/usr/bin/env python3
"""Щотижневий імпорт відкритих даних ЄДР (data.gov.ua, набір UO.zip — юридичні особи) лише для перевізників
з нашого ліцензійного реєстру. Результат — data/edr-carriers.json, який раз на тиждень забирає Supabase
(edr_fetch_start/finish). Запускається GitHub Actions (.github/workflows/edr.yml), бо архів — кілька ГБ.

Беремо: повну й скорочену назву, ОПФ, стан, дату реєстрації, керівника, статутний капітал, засновників-юросіб
і кількість засновників. Адрес, КВЕДів і контактів у відкритих даних немає (воєнний стан)."""
import json, os, re, sys, zipfile, urllib.request, xml.etree.ElementTree as ET

UO = 'https://data.gov.ua/dataset/03cc1239-3988-4451-aa0d-aadb77448714/resource/d40cc921-39bb-44fd-be06-dc02589f45c6/download/uo.zip'
SB = 'https://ecdfpqhbaqjqurzedunh.supabase.co'
ANON = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjZGZwcWhiYXFqcXVyemVkdW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzU3NTIsImV4cCI6MjA5NDg1MTc1Mn0.'
        't0ry-slbPVwVHmF1KLzWX6EDonWBMC2Uu3KUobH8oFY')
OUT = 'data/edr-carriers.json'
UA = {'User-Agent': 'Mozilla/5.0 (forwardcarua.com open-data import)'}


def carrier_codes():
    req = urllib.request.Request(SB + '/rest/v1/rpc/carrier_sitemap', data=b'{}', method='POST',
                                 headers={'apikey': ANON, 'Authorization': 'Bearer ' + ANON, 'Content-Type': 'application/json'})
    return {c for c, _ in json.load(urllib.request.urlopen(req, timeout=60))}


def download(path):
    if os.path.exists(path):
        return
    with urllib.request.urlopen(urllib.request.Request(UO, headers=UA), timeout=600) as r, open(path, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)


def todict(el):
    """XML-елемент → dict/list/str (повторювані теги — у список)."""
    kids = list(el)
    if not kids:
        return (el.text or '').strip()
    d = {}
    for k in kids:
        v = todict(k)
        if k.tag in d:
            if not isinstance(d[k.tag], list):
                d[k.tag] = [d[k.tag]]
            d[k.tag].append(v)
        else:
            d[k.tag] = v
    return d


def find(d, *names):
    """Перше непорожнє значення за будь-якою з назв тегу (без урахування регістру), пошук углиб."""
    want = {n.upper() for n in names}
    stack = [d]
    while stack:
        x = stack.pop(0)
        if isinstance(x, dict):
            for k, v in x.items():
                if k.upper() in want and v not in ('', None, {}, []):
                    return v
            stack.extend(x.values())
        elif isinstance(x, list):
            stack.extend(x)
    return None


def as_list(v):
    return v if isinstance(v, list) else ([] if v in (None, '') else [v])


def pick(d):
    head = find(d, 'BOSS', 'HEAD', 'KERIVNYK')
    heads = []
    for h in as_list(find(d, 'HEADS', 'SIGNERS') or head):
        if isinstance(h, dict):
            nm = find(h, 'NAME', 'FIO', 'PIB')
            role = find(h, 'ROLE', 'ROLE_TEXT', 'POSITION')
            if nm:
                heads.append({'name': nm, 'role': role})
        elif isinstance(h, str) and h:
            heads.append({'name': h, 'role': None})
    founders = as_list(find(d, 'FOUNDERS'))
    if len(founders) == 1 and isinstance(founders[0], dict) and len(founders[0]) == 1:
        founders = as_list(list(founders[0].values())[0])
    f_orgs = []
    for f in founders:
        if isinstance(f, dict):
            code = find(f, 'CODE', 'EDRPOU', 'IDENT')
            nm = find(f, 'NAME', 'FOUNDER_NAME')
            if code and re.fullmatch(r'\d{8}', str(code)) and nm:
                f_orgs.append({'name': nm, 'code': code})
        elif isinstance(f, str) and re.search(r'\b\d{8}\b', f) and re.search(r'ТОВАРИСТВО|\bТОВ\b|\bПП\b|ПІДПРИЄМСТВО|КОМПАНІ|LIMITED|LTD|GMBH|SP\. Z O\.O', f, re.I):
            f_orgs.append({'name': f, 'code': re.search(r'\b\d{8}\b', f).group(0)})
    return {
        'name': find(d, 'NAME'),
        'short_name': find(d, 'SHORT_NAME'),
        'opf': find(d, 'OPF'),
        'state': find(d, 'STAN', 'STATE', 'STATUS'),
        'reg_date': find(d, 'REGISTRATION_DATE', 'REG_DATE', 'RECORD_DATE'),
        'capital': find(d, 'AUTHORIZED_CAPITAL', 'CAPITAL', 'STATUTORY_CAPITAL'),
        'heads': heads[:5],
        'founders_total': len(founders),
        'founder_orgs': f_orgs[:10],
    }


def main():
    probe = '--probe' in sys.argv
    codes = carrier_codes()
    print('carrier codes:', len(codes))
    zpath = os.environ.get('UO_ZIP', 'uo.zip')
    download(zpath)
    print('zip MB:', os.path.getsize(zpath) // 2**20)
    out, samples, total = {}, [], 0
    with zipfile.ZipFile(zpath) as z:
        names = [n for n in z.namelist() if n.lower().endswith('.xml')]
        print('xml files:', [(n, z.getinfo(n).file_size // 2**20) for n in names])
        for n in names:
            with z.open(n) as f:
                depth, rec_tag = 0, None
                for ev, el in ET.iterparse(f, events=('start', 'end')):
                    if ev == 'start':
                        depth += 1
                        if depth == 2 and rec_tag is None:
                            rec_tag = el.tag
                        continue
                    depth -= 1
                    if depth != 1 or el.tag != rec_tag:
                        continue
                    total += 1
                    code = (el.findtext('EDRPOU') or el.findtext('edrpou') or '').strip()
                    if total <= 2 and probe:
                        samples.append(ET.tostring(el, encoding='unicode')[:6000])
                    if code in codes:
                        d = todict(el)
                        if probe and len(samples) < 6:
                            samples.append(json.dumps(d, ensure_ascii=False)[:6000])
                        rec = pick(d)
                        prev = out.get(code)
                        # кілька записів з одним кодом — беремо зареєстрований / новіший
                        if not prev or (str(rec.get('state') or '').lower().startswith('зареєстр') and not str(prev.get('state') or '').lower().startswith('зареєстр')):
                            out[code] = rec
                    el.clear()
    print('records:', total, 'matched:', len(out))
    os.makedirs('data', exist_ok=True)
    if probe:
        with open('data/edr-sample.txt', 'w', encoding='utf-8') as f:
            f.write('\n\n=====\n\n'.join(samples))
    if len(out) < 0.5 * len(codes):
        print('too few matches — keeping previous file'); sys.exit(0 if probe else 1)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


if __name__ == '__main__':
    main()
