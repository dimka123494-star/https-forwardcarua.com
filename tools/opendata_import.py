#!/usr/bin/env python3
"""Відкриті дані для перевірки компаній (лише юрособи з 8-значним ЄДРПОУ; фізособи не беремо):
  • Єдиний реєстр боржників (Мін'юст, data.gov.ua) → відкриті виконавчі провадження, де компанія — боржник
  • Відомості про справи про банкрутство (ДСА)
Пише out/erb-00..15.json (шарди за кодом), out/bankrupt.json, out/meta.json. Workflow кладе їх у гілку opendata,
звідки їх забирає Supabase (opendata_fetch_start/finish). Запуск: python3 tools/opendata_import.py"""
import collections, csv, io, json, os, subprocess, sys, time, urllib.request

UA = 'Mozilla/5.0 (forwardcarua.com open-data import)'
ERB = 'https://data.gov.ua/dataset/783b9b50-faba-4cc9-a393-60485e395b1d/resource/e6ea76c1-01f4-4bd0-a282-7d92d6ecc2a1/download/29-ex_csv_erb.zip'
BANKRUPT = 'https://data.gov.ua/dataset/544d4dad-0b6d-4972-b0b8-fb266829770f/resource/deb76481-a6c8-4a45-ae6c-f02aa87e9f4a/download/vidomosti-pro-spravi-pro-bankrutstvo.csv'
SHARDS = 16
OUT = 'out'
csv.field_size_limit(10 ** 7)
clean = lambda s: ' '.join(str(s or '').split())


def is_firm(code):
    return len(code) == 8 and code.isdigit()


def erb():
    if not os.path.exists('erb.zip'):
        subprocess.run(['curl', '-sSLf', '--retry', '3', '-A', UA, '-o', 'erb.zip', ERB], check=True)
    p = subprocess.Popen(['unzip', '-p', 'erb.zip'], stdout=subprocess.PIPE)
    f = io.TextIOWrapper(p.stdout, encoding='cp1251', errors='replace', newline='')
    f.readline()  # заголовок (через ';', а дані — через ',')
    agg, rows = {}, 0
    for r in csv.reader(f, delimiter=','):
        rows += 1
        if len(r) < 11 or not is_firm(r[2].strip()):
            continue
        code = r[2].strip()
        a = agg.setdefault(code, {'name': clean(r[0]), 'n': 0, 'cats': collections.Counter(), 'items': []})
        a['n'] += 1
        a['cats'][clean(r[10]) or 'інше'] += 1
        if len(a['items']) < 5:   # компактно: БД обмежена, повний список — за номером ВП в АСВП
            a['items'].append({'vp': clean(r[9]), 'cat': clean(r[10])[:60], 'issuer': clean(r[3])[:100], 'executor': clean(r[4])[:120]})
    if p.wait() != 0:
        raise SystemExit('unzip failed')
    for a in agg.values():
        a['cats'] = dict(a['cats'].most_common())
    print('erb rows', rows, 'firms', len(agg), flush=True)
    if rows < 1_000_000 or len(agg) < 10_000:
        raise SystemExit('ЄРБ: підозріло мало даних — не оновлюємо')
    return agg, rows


def bankrupt():
    raw = urllib.request.urlopen(urllib.request.Request(BANKRUPT, headers={'User-Agent': UA}), timeout=600).read()
    for enc in ('utf-8-sig', 'cp1251'):
        try:
            txt = raw.decode(enc); break
        except UnicodeDecodeError:
            continue
    rd = csv.DictReader(io.StringIO(txt), delimiter='\t')
    agg = {}
    for r in rd:
        code = (r.get('firm_edrpou') or '').strip()
        if not is_firm(code):
            continue
        a = agg.setdefault(code, {'name': clean(r.get('firm_name')), 'items': []})
        a['items'].append({'date': clean(r.get('date')), 'type': clean(r.get('type')), 'case': clean(r.get('case_number')),
                           'court': clean(r.get('court_name'))})
    for a in agg.values():  # найновіші вгорі, не більше 20
        a['items'].sort(key=lambda x: x['date'][6:] + x['date'][3:5] + x['date'][:2], reverse=True)
        a['items'] = a['items'][:5]
    print('bankrupt firms', len(agg), flush=True)
    if len(agg) < 1000:
        raise SystemExit('Банкрутство: підозріло мало даних — не оновлюємо')
    return agg


def main():
    os.makedirs(OUT, exist_ok=True)
    e, rows = erb()
    shards = [dict() for _ in range(SHARDS)]
    for code, v in e.items():
        shards[int(code) % SHARDS][code] = v
    for i, sh in enumerate(shards):
        with open(f'{OUT}/erb-{i:02d}.json', 'w', encoding='utf-8') as f:
            json.dump(sh, f, ensure_ascii=False, separators=(',', ':'))
    b = bankrupt()
    with open(f'{OUT}/bankrupt.json', 'w', encoding='utf-8') as f:
        json.dump(b, f, ensure_ascii=False, separators=(',', ':'))
    meta = {'generated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'erb_rows': rows, 'erb_firms': len(e),
            'bankrupt_firms': len(b), 'shards': SHARDS}
    json.dump(meta, open(f'{OUT}/meta.json', 'w'))
    print(meta)
    for n in sorted(os.listdir(OUT)):
        print(n, os.path.getsize(f'{OUT}/{n}') // 1024, 'KB')


if __name__ == '__main__':
    main()
