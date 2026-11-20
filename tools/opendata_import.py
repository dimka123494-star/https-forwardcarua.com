#!/usr/bin/env python3
"""Відкриті дані для платної «Перевірки компанії» (лише юрособи з 8-значним ЄДРПОУ; фізособи не зберігаємо):
  • Єдиний реєстр боржників (Мін'юст) → відкриті виконавчі провадження, де компанія — боржник
  • Відомості про справи про банкрутство (ДСА)
  • Список справ, призначених до розгляду (ДСА) → судові справи. Сторони там лише назвами, тож назву звіряємо
    з ЄДР (форма власності + назва в лапках) і привʼязуємо справу до коду, лише якщо збіг однозначний.
  • Єдиний державний реєстр судових рішень (ДСА, 2025–2026) → рішення в цих справах (дата, форма, суд, посилання на текст).
Судові справи накопичуються між запусками (історія з гілки opendata).
Результат — out/{erb,bankrupt,courts,decisions}/NNN.json (шарди: int(код) % 128) і out/meta.json; workflow кладе їх у гілку opendata,
звідки edge-функція company-check бере один невеликий файл на запит. Запуск: python3 tools/opendata_import.py"""
import collections, csv, io, json, os, re, subprocess, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET

UA = 'Mozilla/5.0 (forwardcarua.com open-data import)'
ERB = 'https://data.gov.ua/dataset/783b9b50-faba-4cc9-a393-60485e395b1d/resource/e6ea76c1-01f4-4bd0-a282-7d92d6ecc2a1/download/29-ex_csv_erb.zip'
BANKRUPT = 'https://data.gov.ua/dataset/544d4dad-0b6d-4972-b0b8-fb266829770f/resource/deb76481-a6c8-4a45-ae6c-f02aa87e9f4a/download/vidomosti-pro-spravi-pro-bankrutstvo.csv'
SCHED = 'https://data.gov.ua/dataset/3a321301-a06f-487b-9d19-e6b917250aee/resource/98d6ba0d-1c18-4835-ae68-bfc0af724bfa/download/spisok-sprav-priznachenih-do-rozglyadu.csv'
PREV = 'prev'  # попередній вміст гілки opendata (workflow клонує її сюди) — для накопичення історії справ
AEO = 'https://data.gov.ua/dataset/ddfb4a77-fee4-45b2-a683-c0595052964f/resource/17aa3773-9072-4c65-89ad-8ae56147e3e1/download/authorizedoperators.csv'
UO = 'https://data.gov.ua/dataset/03cc1239-3988-4451-aa0d-aadb77448714/resource/d40cc921-39bb-44fd-be06-dc02589f45c6/download/uo.zip'
SHARDS = 128
OUT = 'out'
csv.field_size_limit(10 ** 7)
clean = lambda s: ' '.join(str(s or '').split())
is_firm = lambda c: len(c) == 8 and c.isdigit()


# Ті самі набори на сайті розпорядника (НАІС) — запасне джерело: з 19.11.2026 data.gov.ua відповідає 403 серверам GitHub.
# НАІС відхиляє «браузерний» User-Agent, тож туди — стандартний curl.
NAIS_ALT = {
    'uo.zip': 'https://nais.gov.ua/m/ediniy-derjavniy-reestr-yuridichnih-osib-fizichnih-osib-pidpriemtsiv-ta-gromadskih-formuvan',
    'erb.zip': 'https://nais.gov.ua/m/ediniy-reestr-borjnikiv-549',
}


def nais_latest(page):
    """посилання /files/general/РРРР/ММ/ДД/….zip з найновішою датою на сторінці набору НАІС"""
    html = subprocess.run(['curl', '-sSLf', '--retry', '3', page], check=True, capture_output=True).stdout.decode('utf-8', 'ignore')
    links = sorted(set(re.findall(r'/files/general/\d{4}/\d{2}/\d{2}/[\w.-]+\.zip', html)))
    if not links:
        raise RuntimeError('НАІС: архів не знайдено на ' + page)
    return 'https://nais.gov.ua' + links[-1]


def fetch(url, path):
    if not os.path.exists(path):
        try:
            subprocess.run(['curl', '-sSLf', '--retry', '3', '-A', UA, '-o', path, url], check=True)
        except subprocess.CalledProcessError:
            if path not in NAIS_ALT:
                raise
            if os.path.exists(path):
                os.remove(path)
            alt = nais_latest(NAIS_ALT[path])
            print('data.gov.ua недоступний, беремо з НАІС:', alt, flush=True)
            subprocess.run(['curl', '-sSLf', '--retry', '3', '-o', path, alt], check=True)
    print(path, os.path.getsize(path) // 2 ** 20, 'MB', flush=True)


def text_stream(path):
    """CSV з data.gov.ua: utf-8 або cp1251 — визначаємо за початком файлу"""
    with open(path, 'rb') as f:
        head = f.read(200000)
    try:
        head.decode('utf-8'); enc = 'utf-8-sig'
    except UnicodeDecodeError as e:
        # символ, розрізаний межею 200 КБ, — ще не ознака cp1251
        enc = 'utf-8-sig' if e.start >= len(head) - 4 else 'cp1251'
    return open(path, encoding=enc, errors='replace', newline='')


# ---------- назви компаній: «ТОВ "НАЗВА"» ↔ ЄДР ----------
OPF = [
    (r'ТОВАРИСТВО\s+З\s+ОБМЕЖЕНОЮ\s+ВІДПОВІДАЛЬНІСТЮ|ТОВ', 'ТОВ'),
    (r'ТОВАРИСТВО\s+З\s+ДОДАТКОВОЮ\s+ВІДПОВІДАЛЬНІСТЮ|ТДВ', 'ТДВ'),
    (r'ПРИВАТНЕ\s+АКЦІОНЕРНЕ\s+ТОВАРИСТВО|ПУБЛІЧНЕ\s+АКЦІОНЕРНЕ\s+ТОВАРИСТВО|АКЦІОНЕРНЕ\s+ТОВАРИСТВО(?:\s+КОМЕРЦІЙНИЙ\s+БАНК)?|ПРАТ|ПАТ|АТ(?:\s+КБ)?', 'АТ'),
    (r'ПРИВАТНЕ\s+ПІДПРИЄМСТВО|ПП', 'ПП'),
    (r'ДОЧІРНЄ\s+ПІДПРИЄМСТВО|ДП', 'ДП'),
    (r'КОМУНАЛЬНЕ\s+ПІДПРИЄМСТВО|КП', 'КП'),
    (r'ФЕРМЕРСЬКЕ\s+ГОСПОДАРСТВО|ФГ', 'ФГ'),
]
OPF_RE = re.compile(r'(?<![А-ЯІЇЄҐA-Z])(' + '|'.join(p for p, _ in OPF) + r')\s*["«“„]', re.I)
ROLE_RE = re.compile(r'(?:^|,\s*)([^,:]{2,60}?):\s*')


def opf_norm(s):
    for p, n in OPF:
        if re.fullmatch(p, re.sub(r'\s+', ' ', s.strip()), re.I):
            return n
    return None


def qname_norm(q):
    q = re.sub(r'["«»“”„\']', '', q.upper())
    return re.sub(r'[^0-9A-ZА-ЯІЇЄҐ]+', ' ', q).strip()


def orgs(text):
    out = []
    for m in OPF_RE.finditer(text or ''):
        mm = re.match(r'(.+?)["»”](?=\s*(?:$|,|;|\(|\)))', text[m.end():])
        if not mm:
            continue
        n = qname_norm(mm.group(1))
        if len(n) >= 3:
            out.append((opf_norm(m.group(1)), n, m.start()))
    return out


def edr_index():
    """(форма, назва) → ЄДРПОУ для чинних юросіб; неоднозначні назви → None"""
    fetch(UO, 'uo.zip')
    idx = {}
    import zipfile
    with zipfile.ZipFile('uo.zip') as z:
        xmls = [x for x in z.namelist() if x.lower().endswith('.xml')]
        for n in [x for x in xmls if 'UO' in x.upper()] or xmls:   # архів НАІС: ще FOP і FSU — не потрібні
            with z.open(n) as f:
                depth, rec = 0, None
                for ev, el in ET.iterparse(f, events=('start', 'end')):
                    if ev == 'start':
                        depth += 1
                        if depth == 2 and rec is None:
                            rec = el.tag
                        continue
                    depth -= 1
                    if depth != 1 or el.tag != rec:
                        continue
                    code = (el.findtext('EDRPOU') or '').strip()
                    stan = (el.findtext('STAN') or '').lower()
                    if is_firm(code) and not stan.startswith(('припинено', 'скасовано')):
                        keys = set()
                        for nm in (el.findtext('SHORT_NAME'), el.findtext('NAME')):
                            for o, q, _ in orgs(nm or ''):
                                keys.add((o, q))
                        opf = opf_norm(el.findtext('OPF') or '')
                        nm = el.findtext('NAME') or ''
                        if opf and '"' in nm:   # NAME без форми: «"ФЕРДАУС"»
                            mm = re.search(r'["«](.+)["»]', nm)
                            if mm:
                                keys.add((opf, qname_norm(mm.group(1))))
                        for k in keys:
                            idx[k] = code if k not in idx or idx[k] == code else None
                    el.clear()
    print('edr index', len(idx), 'ambiguous', sum(1 for v in idx.values() if v is None), flush=True)
    return idx


# ---------- фізособи в ЄРБ: ключ — нормалізований ПІБ, шард — FNV-1a (так само в edge-функції erb-search) ----------
ERB_PERSONS = {}   # (ПІБ-ключ, дата народження) → {індекс категорії: кількість}
PCATS = {}         # категорія стягнення → індекс (список — erbp/cats.json)
PSHARDS = 2048
def person_key(name):
    n = (name or '').lower().replace('ё', 'е').replace('(не діє)', '')
    n = re.sub(r"[ʼ'’`\"«»]", '', n)
    n = re.sub(r'[^0-9a-zа-яіїєґ]+', ' ', n).strip()
    return n if len(n.split()) >= 2 else ''
def fnv(s):
    h = 0x811c9dc5
    for b in s.encode('utf-8'):
        h = ((h ^ b) * 0x01000193) & 0xffffffff
    return h
def write_persons(data):
    os.makedirs(f'{OUT}/erbp', exist_ok=True)
    shards = [dict() for _ in range(PSHARDS)]
    # формат шарду: {ПІБ-ключ: [[дата народження, кількість, {індекс категорії: кількість}], ...]}
    for (k, bd), c in data.items():
        shards[fnv(k) % PSHARDS].setdefault(k, []).append([bd, sum(c.values()), c])
    json.dump([c for c, _ in sorted(PCATS.items(), key=lambda x: x[1])], open(f'{OUT}/erbp/cats.json', 'w', encoding='utf-8'), ensure_ascii=False)
    for i, sh in enumerate(shards):
        with open(f'{OUT}/erbp/{i:03d}.json', 'w', encoding='utf-8') as f:
            json.dump(sh, f, ensure_ascii=False, separators=(',', ':'))


# ---------- джерела ----------
def erb():
    fetch(ERB, 'erb.zip')
    p = subprocess.Popen(['unzip', '-p', 'erb.zip'], stdout=subprocess.PIPE)
    f = io.TextIOWrapper(p.stdout, encoding='cp1251', errors='replace', newline='')
    f.readline()  # заголовок (через ';', а дані — через ',')
    agg, rows = {}, 0
    global ERB_PERSONS
    ERB_PERSONS = {}
    for r in csv.reader(f, delimiter=','):
        rows += 1
        if len(r) < 11:
            continue
        if not is_firm(r[2].strip()):
            # фізособи й ФОП: у відкритих даних лише ПІБ і (не завжди) дата народження — без РНОКПП
            k = person_key(r[0])
            if k:
                bd = clean(r[1])[:10]
                ci = PCATS.setdefault(clean(r[10]) or 'інше', len(PCATS))
                a = ERB_PERSONS.setdefault((k, bd), {})
                a[ci] = a.get(ci, 0) + 1
            continue
        code = r[2].strip()
        a = agg.setdefault(code, {'name': clean(r[0]), 'n': 0, 'cats': collections.Counter(), 'items': []})
        a['n'] += 1
        a['cats'][clean(r[10]) or 'інше'] += 1
        if len(a['items']) < 10:
            a['items'].append({'vp': clean(r[9]), 'cat': clean(r[10]), 'issuer': clean(r[3]), 'executor': clean(r[4]), 'phone': clean(r[5])[:80]})
    if p.wait() != 0:
        raise SystemExit('unzip failed')
    for a in agg.values():
        a['cats'] = dict(a['cats'].most_common())
    print('erb rows', rows, 'firms', len(agg), flush=True)
    if rows < 1_000_000 or len(agg) < 10_000:
        raise SystemExit('ЄРБ: підозріло мало даних — не оновлюємо')
    return agg


def bankrupt():
    fetch(BANKRUPT, 'bankrupt.csv')
    agg = {}
    with text_stream('bankrupt.csv') as f:
        for r in csv.DictReader(f, delimiter='\t'):
            code = (r.get('firm_edrpou') or '').strip()
            if not is_firm(code):
                continue
            a = agg.setdefault(code, {'name': clean(r.get('firm_name')), 'items': []})
            a['items'].append({'date': clean(r.get('date')), 'type': clean(r.get('type')), 'case': clean(r.get('case_number')), 'court': clean(r.get('court_name'))})
    key = lambda x: x['date'][6:10] + x['date'][3:5] + x['date'][:2]
    for a in agg.values():
        a['items'].sort(key=key, reverse=True)
        a['items'] = a['items'][:20]
    print('bankrupt firms', len(agg), flush=True)
    if len(agg) < 1000:
        raise SystemExit('Банкрутство: підозріло мало даних — не оновлюємо')
    return agg


def courts(idx):
    fetch(SCHED, 'sched.csv')
    agg, rows, linked, ambiguous = {}, 0, 0, 0
    with text_stream('sched.csv') as f:
        for r in csv.DictReader(f, delimiter='\t'):
            rows += 1
            inv = r.get('case_involved') or ''
            if '"' not in inv and '«' not in inv:
                continue
            for o, q, pos in orgs(inv):
                code = idx.get((o, q))
                if code is None:
                    ambiguous += (o, q) in idx
                    continue
                role = None
                for m in ROLE_RE.finditer(inv[:pos + 1]):
                    role = m.group(1).strip().lower()
                case = clean(r.get('case'))
                a = agg.setdefault(code, {'cases': {}, 'name': f'{o} «{q}»'})
                c = a['cases'].get(case)
                d = clean(r.get('date'))
                item = {'date': d, 'case': case, 'court': clean(r.get('court_name')), 'role': role, 'what': clean(r.get('case_description'))[:160]}
                if not c or (d[6:10] + d[3:5] + d[:2]) > (c['date'][6:10] + c['date'][3:5] + c['date'][:2]):
                    a['cases'][case] = item
                linked += 1
    out = {}
    key = lambda x: x['date'][6:10] + x['date'][3:5] + x['date'][:2] + x['date'][11:16]
    for code, a in agg.items():
        items = sorted(a['cases'].values(), key=key, reverse=True)
        roles = collections.Counter((i['role'] or 'інше') for i in items)
        out[code] = {'name': a['name'], 'n': len(items), 'roles': dict(roles.most_common()), 'items': items}  # обрізаємо в merge_prev
    print('sched rows', rows, 'links', linked, 'ambiguous names skipped', ambiguous, 'firms', len(out), flush=True)
    if rows < 100_000 or len(out) < 1000:
        raise SystemExit('Суди: підозріло мало даних — не оновлюємо')
    return out


def aeo():
    """Єдиний державний реєстр авторизованих економічних операторів (Держмитслужба): ЄДРПОУ → рядки авторизацій як є"""
    fetch(AEO, 'aeo.csv')
    with text_stream('aeo.csv') as f:
        head = f.readline(); f.seek(0)
        delim = max([',', ';', '\t'], key=head.count)
        rows = list(csv.DictReader(f, delimiter=delim))
    out = {}
    for r in rows:
        r = {clean(k): clean(v) for k, v in r.items() if k}
        code = next((v for v in r.values() if is_firm(v)), None)
        if code:
            out.setdefault(code, []).append(r)
    print('aeo rows', len(rows), 'firms', len(out), 'columns', list(rows[0].keys()) if rows else None, flush=True)
    return out


# ---------- ліцензії й дозволи з відкритих даних (Єдиного ліцензійного реєстру ДРС у відкритих даних немає — беремо реєстри органів) ----------
LIC_SETS = [   # (набір data.gov.ua, підказка в назві ресурсу, орган)
    ('c38266a0-049c-4f96-8a8b-d657a88632cd', '', 'Держмитслужба'),        # митна брокерська діяльність
    ('4725d7d2-95aa-4239-a832-7f1d484c4120', 'lits-reestr', 'НКРЕКП'),      # енергетика й комунальні послуги
    ('9cc77e6e-7f9e-4f6b-aac0-2a671ca1e2dd', '', 'Держлікслужба'),        # обіг наркотичних засобів і прекурсорів
    ('e133fa58-97f6-4cb7-9a4c-b2d7da71d639', 'touroperator', 'ДАРТ'),       # туроператорська діяльність
]


def latest_csv(ds, hint):
    j = json.loads(urllib.request.urlopen(urllib.request.Request(
        'https://data.gov.ua/api/3/action/package_show?id=' + ds, headers={'User-Agent': UA}), timeout=60).read())['result']
    rs = [r for r in j['resources'] if 'csv' in (r.get('format') or '').lower() and hint in (r.get('url') or '') + (r.get('name') or '')]
    rs.sort(key=lambda r: r.get('last_modified') or r.get('created') or '')
    return rs[-1]['url']


def lic_rows(ds, hint):
    path = f'lic-{ds[:8]}.csv'
    fetch(latest_csv(ds, hint), path)
    with text_stream(path) as f:
        head = f.readline(); f.seek(0)
        delim = max([',', ';', '\t'], key=head.count)
        return [{clean(k): ('' if clean(v) == 'null' else clean(v)) for k, v in r.items() if k} for r in csv.DictReader(f, delimiter=delim)]


def iso(d):
    d = d[:10]
    if re.match(r'^\d{2}\.\d{2}\.\d{4}$', d): return d[6:] + '-' + d[3:5] + '-' + d[:2]
    return d if re.match(r'^\d{4}-\d{2}-\d{2}$', d) else ''


def licenses():
    """ЄДРПОУ → [{org, kind, status, ok, from, to, num}] — лише юрособи (8 цифр), ФОП не показуємо"""
    out, today = {}, time.strftime('%Y-%m-%d')
    add = lambda code, it: is_firm(code) and out.setdefault(code, []).append(it)
    for ds, hint, org in LIC_SETS:
        try:
            rows = lic_rows(ds, hint)
        except Exception as e:   # кожне джерело необовʼязкове
            print('licenses', org, 'failed', e, flush=True); continue
        n0 = sum(len(v) for v in out.values())
        if org == 'Держмитслужба':
            for r in rows:
                st = r.get('authorizationStatus', '')
                add(r.get('enterpriseId', ''), {'org': org, 'kind': 'Митна брокерська діяльність', 'status': st, 'ok': st.lower() == 'чинна',
                    'from': iso(r.get('authorizationStartDate', '')), 'to': iso(r.get('cancellationDate') or r.get('annulmentDate') or ''), 'num': r.get('authorizationNumber', '')})
        elif org == 'НКРЕКП':
            last = {}   # рядок на кожне рішення — беремо найсвіжіше по ліцензії
            for r in rows:
                k = (r.get('Код згідно з ЄДРПОУ', ''), r.get('Сфера діяльності', ''), r.get('Вид діяльності', ''))
                if k not in last or r.get('Дата рішення', '') >= last[k].get('Дата рішення', ''): last[k] = r
            for (code, sphere, kind), r in last.items():
                st = r.get('Статус ліцензії', '')
                add(code, {'org': org, 'kind': kind or sphere, 'status': st, 'ok': st == 'Чинна', 'from': iso(r.get('Дата початку дії ліцензії', '')),
                    'to': iso(r.get('Дата закінчення дії ліцензії', '')), 'num': ''})
        elif org == 'Держлікслужба':
            for r in rows:
                to = iso(r.get('licenseExpirationDate', ''))
                add(r.get('codeUSREOU', ''), {'org': org, 'kind': 'Обіг наркотичних засобів, психотропних речовин і прекурсорів' +
                    (' (' + r['activities'] + ')' if r.get('activities') else ''), 'status': 'Чинна' if not to or to >= today else 'Строк дії минув',
                    'ok': not to or to >= today, 'from': iso(r.get('licenseIssueDate', '')), 'to': to, 'num': ''})
        else:
            for r in rows:
                bad = r.get('cancellationOfLicense') or r.get('licenseSuspended')
                add(r.get('idOfEnterpreneur', ''), {'org': org, 'kind': r.get('kindOfEconomicActivity') or 'Туроператорська діяльність',
                    'status': 'Анульована / зупинена' if bad else 'Чинна', 'ok': not bad, 'from': '', 'to': '', 'num': r.get('orderOfLicenseIssuance', '')})
        print('licenses', org, 'rows', len(rows), 'items', sum(len(v) for v in out.values()) - n0, flush=True)
    for v in out.values():
        v.sort(key=lambda x: (not x['ok'], x['org']))
    return out


def merge_prev(new):
    """Справи накопичуються: додаємо до збереженої історії нові, зберігаючи найсвіжіший запис кожної справи"""
    old = {}
    if os.path.isdir(f'{PREV}/courts'):
        for n in os.listdir(f'{PREV}/courts'):
            try:
                old.update(json.load(open(f'{PREV}/courts/{n}', encoding='utf-8')))
            except Exception:
                pass
    key = lambda x: x['date'][6:10] + x['date'][3:5] + x['date'][:2] + x['date'][11:16]
    merged = 0
    for code, o in old.items():
        cur = new.setdefault(code, {'name': o.get('name'), 'n': 0, 'roles': {}, 'items': []})
        have = {i['case'] for i in cur['items']}
        for it in o.get('items', []):
            if it['case'] not in have:
                cur['items'].append(it); have.add(it['case']); merged += 1
    for v in new.values():
        v['items'].sort(key=key, reverse=True)
        v['n'] = max(v['n'], len(v['items']))   # повна кількість і ролі — до обрізання списку
        v['roles'] = dict(collections.Counter((i.get('role') or 'інше') for i in v['items']).most_common())
        v['items'] = v['items'][:40]
    print('courts merged from history', merged, 'firms', len(new), flush=True)
    return new


def edrsr_url(year):
    q = urllib.parse.quote(f'Єдиний державний реєстр судових рішень за {year} рік')
    j = json.loads(urllib.request.urlopen(urllib.request.Request('https://data.gov.ua/api/3/action/package_search?rows=5&q=' + q, headers={'User-Agent': UA}), timeout=120).read())
    for p in j['result']['results']:
        if str(year) in p['title'] and 'судових рішень' in p['title']:
            for r in p['resources']:
                if r['url'].endswith('.zip'):
                    return r['url']
    return None


def decisions(cases):
    """Номер справи → рішення в ЄДРСР за 2025–2026 рр.: дата, форма, суд, вид судочинства, посилання на текст"""
    found = collections.defaultdict(list)
    for year in (2025, 2026):
        url = edrsr_url(year)
        if not url:
            print('ЄДРСР', year, 'не знайдено', flush=True); continue
        path = f'edrsr{year}.zip'
        fetch(url, path)
        import zipfile
        with zipfile.ZipFile(path) as z:
            def table(n):
                with z.open(n) as f:
                    rd = csv.reader(io.TextIOWrapper(f, encoding='utf-8-sig', errors='replace'), delimiter='\t')
                    next(rd); return {r[0]: r[1] for r in rd if len(r) > 1}
            courts_, forms, kinds = table('courts.csv'), table('judgment_forms.csv'), table('justice_kinds.csv')
        p = subprocess.Popen(['unzip', '-p', path, 'documents.csv'], stdout=subprocess.PIPE)
        rd = csv.reader(io.TextIOWrapper(p.stdout, encoding='utf-8-sig', errors='replace', newline=''), delimiter='\t')
        next(rd); rows = 0
        for r in rd:
            rows += 1
            if len(r) < 11 or r[5] not in cases or r[10] != '1':
                continue
            found[r[5]].append({'date': r[6][:10], 'form': forms.get(r[2], ''), 'court': courts_.get(r[1], ''), 'kind': kinds.get(r[3], ''), 'url': r[9]})
        p.wait()
        print('ЄДРСР', year, 'rows', rows, 'cases with decisions', len(found), flush=True)
    for v in found.values():
        v.sort(key=lambda x: x['date'], reverse=True)
        del v[8:]
    return found


def write(name, data):
    os.makedirs(f'{OUT}/{name}', exist_ok=True)
    shards = [dict() for _ in range(SHARDS)]
    for code, v in data.items():
        shards[int(code) % SHARDS][code] = v
    for i, sh in enumerate(shards):
        with open(f'{OUT}/{name}/{i:03d}.json', 'w', encoding='utf-8') as f:
            json.dump(sh, f, ensure_ascii=False, separators=(',', ':'))


def main():
    e = erb(); write('erb', e)
    write_persons(ERB_PERSONS); np_ = len(ERB_PERSONS); ERB_PERSONS.clear()
    b = bankrupt(); write('bankrupt', b)
    c = merge_prev(courts(edr_index()))
    cases = {i['case'] for v in c.values() for i in v['items']} | {i['case'] for v in b.values() for i in v['items']}
    d = decisions(cases)
    dec = {}
    for code, v in list(c.items()) + [(k, {'items': x['items']}) for k, x in b.items()]:
        for i in v['items']:
            if i['case'] in d:
                dec.setdefault(code, {})[i['case']] = d[i['case']]
    write('courts', c); write('decisions', dec)
    try:
        a = aeo()
        json.dump(a, open(f'{OUT}/aeo.json', 'w', encoding='utf-8'), ensure_ascii=False)
    except Exception as e:   # AEO — додаткове джерело: його збій не зупиняє оновлення решти
        print('AEO failed', e, flush=True); a = {}
    try:
        lic = licenses(); write('lic', lic)
    except Exception as e:
        print('licenses failed', e, flush=True); lic = {}
    meta = {'generated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'erb_firms': len(e), 'bankrupt_firms': len(b),
            'court_firms': len(c), 'decision_firms': len(dec), 'aeo_firms': len(a), 'lic_firms': len(lic), 'shards': SHARDS, 'erb_persons': np_, 'pshards': PSHARDS}
    json.dump(meta, open(f'{OUT}/meta.json', 'w'))
    print(meta)


if __name__ == '__main__':
    main()
