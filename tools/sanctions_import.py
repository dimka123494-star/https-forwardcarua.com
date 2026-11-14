#!/usr/bin/env python3
"""Індекс Державного реєстру санкцій РНБО з CSV-експорту drs.nsdc.gov.ua/export/actions.

Використання: python3 tools/sanctions_import.py <legal_actions.csv> <individual_actions.csv> [дата експорту YYYY-MM-DD]
Результат: data/sanctions_names.json — усі субʼєкти для пошуку за назвою; data/sanctions.json — {код ЄДРПОУ/РНОКПП: [субʼєкти]}; читає edge-функція company-check
(поки немає ключа NSDC_API_KEY для sanctions-sync). Статус рахується по останній дії субʼєкта (sid):
«Скасування» → excluded, минув sanctions_end_date → expired, інакше active.
"""
import csv, json, re, sys, datetime

def load(fn, kind, today):
    by = {}
    for x in csv.DictReader(open(fn, encoding='utf-8-sig')):
        by.setdefault(x['sid'], []).append(x)
    out = []
    for sid, acts in by.items():
        acts.sort(key=lambda a: (a['decree_date'], a['id']))
        last = acts[-1]
        applied = [a for a in acts if a['action_type'].startswith('Застос')]
        base = applied[-1] if applied else last
        end = max((a['sanctions_end_date'] for a in acts if a['sanctions_end_date']), default='')
        st = 'excluded' if last['action_type'].startswith('Скасув') else 'expired' if end and end < today else 'active'
        codes = set()
        for a in acts:
            for f in ('reg_id', 'tax_id'):
                codes.update(re.findall(r':\s*([0-9]{8,10})\s*\[Україна', a.get(f) or ''))
        al = ' ; '.join(x for x in {base.get('translit_name') or '', base.get('aliases') or ''} if x)
        out.append((sorted(codes), {'sid': sid, 'a': al[:250], 'c': base.get('country') or base.get('citizenship') or None,
                    'b': base.get('birthdate') or None, 'k': kind, 'n': last['name'] or base['name'], 's': st,
                    'd': base['decree'], 'dd': base['decree_date'], 't': base['sanctions_term'] or None, 'e': end or None}))
    return out, len(by)

def main():
    today = sys.argv[3] if len(sys.argv) > 3 else datetime.date.today().isoformat()
    L, nl = load(sys.argv[1], 'J', today)
    P, np_ = load(sys.argv[2], 'P', today)
    idx, names = {}, []
    for codes, it in L + P:
        short = {k: it[k] for k in ('sid', 'k', 'n', 's', 'd', 'dd', 't', 'e')}
        for c in codes:
            idx.setdefault(c, []).append(short)
        names.append([it['sid'], it['k'], it['n'], it['a'], it['s'], it['d'], it['dd'], it['e'], it['c'], it['b'], codes])
    # повний перелік для пошуку за назвою / ПІБ (функція sanctions-search)
    json.dump({'_at': today, 'rows': names}, open('data/sanctions_names.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'_at': today, '_subjects': nl + np_, '_legal': nl, '_individuals': np_, 'codes': idx},
              open('data/sanctions.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('subjects', nl, np_, 'codes', len(idx))

if __name__ == '__main__':
    main()
