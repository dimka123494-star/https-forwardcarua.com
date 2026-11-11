# Історія транспортних засобів з відкритих даних МВС (ГСЦ МВС, data.gov.ua):
#   «Відомості про транспортні засоби та їх власників» — усі реєстраційні операції з 2013 р.;
#   «Інформація про транспортні засоби, що перебувають у розшуку».
# Результат (каталог out/, гілка vehicles):
#   p/NNNN.json.gz — {номер: [[дата, код_операції, P|J, регіон, ТСЦ, марка, модель, рік, колір, тип, кузов, призначення,
#                              пальне, обʼєм, власна_маса, повна_маса, VIN], ...]}; записи без номера — під ключем "#VIN"
#   v/NNN.json.gz  — {VIN: [номери]}
#   wanted.json.gz — {номер|VIN: [рядки з реєстру розшуку]}
#   meta.json      — дата, джерела, довідник операцій
# Персональних даних власників у джерелі немає: лише тип (фізична / юридична особа) і код КОАТУУ місця реєстрації.
import codecs, csv, gzip, hashlib, io, json, os, re, sys, time, urllib.parse, urllib.request, zipfile, zlib
from collections import defaultdict

UA = 'Mozilla/5.0 (forwardcarua.com opendata import)'
PKG = '06779371-308f-42d7-895e-5a39833375f0'
WANTED_PKG = '2a746426-b289-4eb2-be8f-aac03e68948c'
CACHE = 'tzcache'
TMP = 'tztmp'
OUT = 'out'
PSH, VSH = 4096, 1024
csv.field_size_limit(10 ** 7)

LAT = str.maketrans('ABCEHIKMOPTXY', 'АВСЕНІКМОРТХУ')


def norm_plate(s):
    s = re.sub(r'[\s\-"\'.]', '', (s or '').upper()).translate(LAT)
    return '' if s in ('', 'NULL', 'НЕМАЄ', '-') else s


def norm_vin(s):
    s = re.sub(r'[\s\-]', '', (s or '').upper())
    # кирилиця у VIN — помилка введення, VIN лише латиницею
    s = s.translate(str.maketrans('АВСЕНІКМОРТХУ', 'ABCEHIKMOPTXY'))
    return s if len(s) >= 6 and s not in ('NULL',) else ''


def pshard(key):
    return zlib.crc32(key.encode()) % PSH


def vshard(vin):
    return zlib.crc32(vin.encode()) % VSH


def get(url, t=600):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=t)


def api(action, **kw):
    return json.load(get('https://data.gov.ua/api/3/action/%s?%s' % (action, urllib.parse.urlencode(kw)), 120))['result']


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    for attempt in range(4):
        try:
            with get(url, 1800) as r, open(path + '.part', 'wb') as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            os.replace(path + '.part', path)
            return path
        except Exception as e:
            print('retry', url, e, flush=True)
            time.sleep(20 * (attempt + 1))
    raise RuntimeError('download failed ' + url)


def open_text(path):
    """zip або csv; кодування utf-8 чи cp1251 — за першими мегабайтами (з урахуванням обрізаного символу)"""
    if zipfile.is_zipfile(path):
        z = zipfile.ZipFile(path)
        m = max(z.infolist(), key=lambda i: i.file_size)
        raw = lambda: z.open(m)
    else:
        raw = lambda: open(path, 'rb')
    with raw() as f:
        head = f.read(4 << 20)
    enc = 'utf-8-sig'
    try:
        codecs.getincrementaldecoder('utf-8')().decode(head, final=False)
    except UnicodeDecodeError:
        enc = 'cp1251'
    return io.TextIOWrapper(raw(), encoding=enc, errors='replace', newline='')


def ddate(s):
    s = (s or '').strip()
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', s)
    if m:
        return m.group(1) + m.group(2) + m.group(3)
    m = re.match(r'(\d{2})\.(\d{2})\.(\d{2,4})', s)
    if m:
        y = m.group(3)
        y = ('20' + y) if len(y) == 2 else y
        return y + m.group(2) + m.group(1)
    return ''


def num(s):
    s = (s or '').strip().replace(',', '.')
    try:
        v = float(s)
        return int(v) if v == int(v) else v
    except ValueError:
        return None


OPS = {}


class Spool:
    """рядки JSON по шардах у тимчасові файли (менше памʼяті)"""
    def __init__(self, d, n):
        self.d, self.buf = d, defaultdict(list)
        os.makedirs(d, exist_ok=True)
        self.size = 0

    def add(self, sh, line):
        self.buf[sh].append(line)
        self.size += 1
        if self.size >= 400000:
            self.flush()

    def flush(self):
        for sh, lines in self.buf.items():
            with open(os.path.join(self.d, '%d.tmp' % sh), 'a', encoding='utf-8') as f:
                f.write('\n'.join(lines) + '\n')
        self.buf.clear()
        self.size = 0


def process(path, spool, vins):
    n = 0
    with open_text(path) as t:
        rd = csv.reader(t, delimiter=';')
        hdr = [h.strip().strip('﻿').strip('"').upper() for h in next(rd)]
        ix = {h: i for i, h in enumerate(hdr)}
        g = lambda row, k: row[ix[k]].strip() if k in ix and ix[k] < len(row) else ''
        for row in rd:
            if len(row) < 10:
                continue
            code, name = g(row, 'OPER_CODE'), g(row, 'OPER_NAME')
            m = re.match(r'\s*(\d+)\s*-\s*(.*)', name)
            if m:
                code = code or m.group(1)
                name = m.group(2)
            if code and name and code not in OPS:
                OPS[code] = name.strip()
            plate, vin = norm_plate(g(row, 'N_REG_NEW')), norm_vin(g(row, 'VIN'))
            brand, model = re.sub(r'\s+', ' ', g(row, 'BRAND')), re.sub(r'\s+', ' ', g(row, 'MODEL'))
            if model and brand.upper().endswith(' ' + model.upper()):
                brand = brand[: -len(model) - 1].strip()
            koatuu = g(row, 'REG_ADDR_KOATUU')
            ev = [ddate(g(row, 'D_REG')), code, g(row, 'PERSON')[:1].upper(), koatuu[:2] if koatuu[:1].isdigit() else '',
                  g(row, 'DEP_CODE'), brand, model, num(g(row, 'MAKE_YEAR')), g(row, 'COLOR'), g(row, 'KIND'), g(row, 'BODY'),
                  g(row, 'PURPOSE'), g(row, 'FUEL'), num(g(row, 'CAPACITY')), num(g(row, 'OWN_WEIGHT')), num(g(row, 'TOTAL_WEIGHT')), vin]
            key = plate or ('#' + vin if vin else '')
            if not key:
                continue
            spool.add(pshard(key), json.dumps([key, ev], ensure_ascii=False, separators=(',', ':')))
            if vin and plate:
                vins[vshard(vin)].append(vin + '\t' + plate)
            n += 1
    return n


def wanted():
    """реєстр розшуку: індексуємо кожне поле, схоже на номер чи VIN"""
    res = {}
    try:
        pkg = api('package_show', id=WANTED_PKG)
    except Exception as e:
        print('wanted pkg', e)
        return None, None
    sample = []
    for r in pkg['resources']:
        url = r.get('url') or ''
        if not url:
            continue
        p = os.path.join(CACHE, 'wanted_' + r['id'])
        if os.path.exists(p):
            os.remove(p)        # невеликий і часто оновлюється — завжди свіжий
        try:
            fetch(url, p)
        except Exception as e:
            print('wanted', e)
            continue
        try:
            if (r.get('format') or '').lower().find('json') >= 0 or url.lower().endswith('.json'):
                data = json.load(open(p, encoding='utf-8-sig'))
                rows = data if isinstance(data, list) else next((v for v in data.values() if isinstance(v, list)), [])
                rows = [{k: str(v) for k, v in x.items()} for x in rows if isinstance(x, dict)]
            else:
                with open_text(p) as t:
                    first = t.readline()
                    sep = ';' if first.count(';') >= first.count(',') else ','
                    hdr = [h.strip().strip('﻿').strip('"') for h in next(csv.reader([first], delimiter=sep))]
                    rows = [dict(zip(hdr, x)) for x in csv.reader(t, delimiter=sep)]
        except Exception as e:
            print('wanted parse', e)
            continue
        sample.append({'resource': r.get('name'), 'url': url, 'rows': len(rows), 'head': rows[:3]})
        for x in rows:
            for k, v in x.items():
                v = (v or '').strip()
                if not v or len(v) > 20:
                    continue
                pv = norm_plate(v)
                if re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}', v.upper().replace(' ', '')):
                    res.setdefault(norm_vin(v), []).append(x)
                elif re.search(r'\d', pv) and re.search(r'[А-ЯІЇЄ]', pv) and 5 <= len(pv) <= 10:
                    res.setdefault(pv, []).append(x)
    return res, sample


def main():
    os.makedirs(CACHE, exist_ok=True)
    pkg = api('package_show', id=PKG)
    # по одному ресурсу на рік (назва reestrTZYYYY): найсвіжіший
    best = {}
    for r in pkg['resources']:
        y = re.search(r'(20\d\d)', (r.get('name') or '') + ' ' + (r.get('url') or ''))
        if not y or not r.get('url'):
            continue
        k = y.group(1)
        if k not in best or (r.get('created') or '') > (best[k].get('created') or ''):
            best[k] = r
    sig = sorted((y, best[y]['id'], best[y].get('last_modified') or best[y].get('created')) for y in best)
    if not os.environ.get('FORCE'):
        try:
            prev = json.load(get('https://raw.githubusercontent.com/dimka123494-star/https-forwardcarua.com/vehicles/meta.json', 60))
            if sorted((s['year'], s['id'], s['modified']) for s in prev.get('sources', [])) == [list(x) for x in sig] or \
               sorted(tuple(x) for x in (( s['year'], s['id'], s['modified']) for s in prev.get('sources', []))) == sig:
                print('NOCHANGE: джерела не оновлювались')
                open('NOCHANGE', 'w').close()
                return
        except Exception as e:
            print('prev meta', e)
    used = []
    spool, vins = Spool(TMP, PSH), defaultdict(list)
    keep = set()
    for y in sorted(best):
        r = best[y]
        p = os.path.join(CACHE, r['id'] + '.bin')
        keep.add(os.path.basename(p))
        t0 = time.time()
        fetch(r['url'], p)
        n = process(p, spool, vins)
        print(y, r['name'], n, 'rows', round(time.time() - t0), 's', flush=True)
        used.append({'year': y, 'id': r['id'], 'rows': n, 'modified': r.get('last_modified') or r.get('created')})
    spool.flush()
    for f in os.listdir(CACHE):     # прибираємо старі версії з кешу
        if f.endswith('.bin') and f not in keep:
            os.remove(os.path.join(CACHE, f))

    os.makedirs(OUT + '/p', exist_ok=True)
    os.makedirs(OUT + '/v', exist_ok=True)
    total_keys = total_ev = 0
    for sh in range(PSH):
        p = os.path.join(TMP, '%d.tmp' % sh)
        data = defaultdict(list)
        seen = set()
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f:
                for line in f:
                    if line in seen:
                        continue
                    seen.add(line)
                    k, ev = json.loads(line)
                    data[k].append(ev)
            os.remove(p)
        for k in data:
            data[k].sort(key=lambda e: e[0])
            total_ev += len(data[k])
        total_keys += len(data)
        with gzip.open(OUT + '/p/%04d.json.gz' % sh, 'wt', encoding='utf-8', compresslevel=9) as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    for sh in range(VSH):
        m = defaultdict(set)
        for line in vins.get(sh, []):
            v, pl = line.split('\t')
            m[v].add(pl)
        with gzip.open(OUT + '/v/%03d.json.gz' % sh, 'wt', encoding='utf-8', compresslevel=9) as f:
            json.dump({k: sorted(v) for k, v in m.items()}, f, ensure_ascii=False, separators=(',', ':'))
    w, wsample = wanted()
    if w is not None:
        with gzip.open(OUT + '/wanted.json.gz', 'wt', encoding='utf-8', compresslevel=9) as f:
            json.dump(w, f, ensure_ascii=False, separators=(',', ':'))
    meta = {'generated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'sources': used, 'ops': OPS,
            'keys': total_keys, 'events': total_ev, 'pshards': PSH, 'vshards': VSH,
            'wanted': len(w) if w is not None else None, 'wanted_sample': wsample}
    json.dump(meta, open(OUT + '/meta.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('keys', total_keys, 'events', total_ev, 'wanted', meta['wanted'], flush=True)


if __name__ == '__main__':
    main()
