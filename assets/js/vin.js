/* vin.js — розшифровка VIN, країна виробництва та орієнтовний екологічний клас (Євро).
   Безкоштовні джерела: власна таблиця WMI (ISO 3779) + відкрита база NHTSA vPIC. */
const VinTools = (() => {
  const SEQ = 'ABCDEFGHJKLMNPRSTUVWXYZ1234567890';
  // [перший символ, діапазон другого символу (від, до), країна]
  const REGIONS = [
    ['A','A','H','ПАР'], ['A','J','N','Кот-д\'Івуар'],
    ['J','A','0','Японія'],
    ['K','A','E','Шрі-Ланка'], ['K','F','K','Ізраїль'], ['K','L','R','Південна Корея'], ['K','S','0','Казахстан'],
    ['L','A','0','Китай'],
    ['M','A','E','Індія'], ['M','F','K','Індонезія'], ['M','L','R','Таїланд'], ['M','S','0','М\'янма'],
    ['N','A','E','Іран'], ['N','F','K','Пакистан'], ['N','L','R','Туреччина'],
    ['P','A','E','Філіппіни'], ['P','F','K','Сінгапур'], ['P','L','R','Малайзія'],
    ['R','A','E','ОАЕ'], ['R','F','K','Тайвань'], ['R','L','R','В\'єтнам'], ['R','S','0','Саудівська Аравія'],
    ['S','A','M','Велика Британія'], ['S','N','T','Німеччина'], ['S','U','Z','Польща'], ['S','1','4','Латвія'],
    ['T','A','H','Швейцарія'], ['T','J','P','Чехія'], ['T','R','V','Угорщина'], ['T','W','1','Португалія'],
    ['U','H','M','Данія'], ['U','N','T','Ірландія'], ['U','U','Z','Румунія'], ['U','5','7','Словаччина'],
    ['V','A','E','Австрія'], ['V','F','R','Франція'], ['V','S','W','Іспанія'], ['V','X','2','Сербія'],
    ['V','3','5','Хорватія'], ['V','6','0','Естонія'],
    ['W','A','0','Німеччина'],
    ['X','A','E','Болгарія'], ['X','F','K','Греція'], ['X','L','R','Нідерланди'], ['X','S','W','росія'],
    ['X','X','2','Люксембург'], ['X','3','0','росія'],
    ['Y','A','E','Бельгія'], ['Y','F','K','Фінляндія'], ['Y','L','R','Мальта'], ['Y','S','W','Швеція'],
    ['Y','X','2','Норвегія'], ['Y','3','5','білорусь'], ['Y','6','0','Україна'],
    ['Z','A','R','Італія'], ['Z','X','2','Словенія'], ['Z','3','5','Литва'], ['Z','6','0','росія'],
    ['1','A','0','США'], ['4','A','0','США'], ['5','A','0','США'], ['7','A','0','США'],
    ['2','A','0','Канада'], ['3','A','W','Мексика'], ['3','X','7','Коста-Рика'],
    ['6','A','W','Австралія'], ['7','A','E','Нова Зеландія'],
    ['8','A','E','Аргентина'], ['8','F','K','Чилі'], ['8','X','2','Венесуела'],
    ['9','A','E','Бразилія'], ['9','F','K','Колумбія'], ['9','3','9','Бразилія']
  ];
  // Найпоширеніші WMI в імпорті до України (марка; країна, якщо відрізняється від діапазону)
  const WMI = {
    WVW:'Volkswagen', WV1:'Volkswagen (комерційні)', WV2:'Volkswagen (комерційні)', WVG:'Volkswagen (SUV)', '3VW':'Volkswagen', '1VW':'Volkswagen',
    WAU:'Audi', WA1:'Audi (SUV)', WUA:'Audi Sport', TRU:'Audi', WBA:'BMW', WBS:'BMW M', WBY:'BMW i', '5UX':'BMW', '5YM':'BMW M', WMW:'MINI',
    WDD:'Mercedes-Benz', WDB:'Mercedes-Benz', WDC:'Mercedes-Benz (SUV)', WDF:'Mercedes-Benz (комерційні)', W1K:'Mercedes-Benz', W1N:'Mercedes-Benz (SUV)', W1V:'Mercedes-Benz (комерційні)', '4JG':'Mercedes-Benz', '55S':'Mercedes-Benz',
    WP0:'Porsche', WP1:'Porsche (SUV)', WF0:'Ford', '1FA':'Ford', '1FM':'Ford', '1FT':'Ford', '3FA':'Ford', '1LN':'Lincoln', '5LM':'Lincoln',
    WOL:'Opel', W0L:'Opel', W0V:'Opel', VF1:'Renault', VF3:'Peugeot', VR3:'Peugeot', VF7:'Citroën', VR7:'Citroën', VR1:'DS', UU1:'Dacia',
    VSS:'SEAT', VSK:'Nissan', TMB:'Škoda', TMA:'Hyundai', U5Y:'Kia', ZFA:'Fiat', ZAR:'Alfa Romeo', ZFF:'Ferrari', ZHW:'Lamborghini', ZAM:'Maserati',
    YV1:'Volvo', YV4:'Volvo (SUV)', LYV:'Volvo', SAL:'Land Rover', SAJ:'Jaguar', SCC:'Lotus', SCF:'Aston Martin',
    JTD:'Toyota', JTE:'Toyota', JTJ:'Lexus', JTH:'Lexus', JTN:'Toyota', JTM:'Toyota', '2T1':'Toyota', '2T3':'Toyota', '4T1':'Toyota', '4T3':'Toyota', '5TD':'Toyota', '5TF':'Toyota', VNK:'Toyota', NMT:'Toyota', SB1:'Toyota',
    JN1:'Nissan', JN8:'Nissan', '1N4':'Nissan', '5N1':'Nissan', SJN:'Nissan', JHM:'Honda', '1HG':'Honda', '2HG':'Honda', '5J6':'Honda', '5FN':'Honda', '19X':'Honda',
    JMZ:'Mazda', JM1:'Mazda', JF1:'Subaru', JF2:'Subaru', '4S3':'Subaru', '4S4':'Subaru', JA4:'Mitsubishi', JMB:'Mitsubishi', JS3:'Suzuki', TSM:'Suzuki',
    KMH:'Hyundai', KM8:'Hyundai', '5NP':'Hyundai', '5NM':'Hyundai', KNA:'Kia', KND:'Kia', '5XY':'Kia', '5XX':'Kia',
    '5YJ':'Tesla', '7SA':'Tesla', LRW:'Tesla', XP7:'Tesla|Німеччина',
    '1G1':'Chevrolet', '1GC':'Chevrolet', '1GN':'Chevrolet', '3GN':'Chevrolet', '1C4':'Jeep / Chrysler', '1J4':'Jeep', '1C6':'RAM', '2C3':'Dodge', '2C4':'Chrysler', '1C3':'Chrysler',
    LSV:'Volkswagen', LFV:'Volkswagen / Audi', LBV:'BMW', LE4:'Mercedes-Benz', LVS:'Ford', LGX:'BYD', LC0:'BYD', LJ1:'JAC', LB3:'Geely', L6T:'Geely', LVV:'Chery', LNB:'BAIC',
    LVG:'Toyota', LHG:'Honda', LMG:'GAC', LSG:'Chevrolet / Buick', LPS:'Polestar', LRB:'Buick', LDC:'Dongfeng',
    Y6D:'ЗАЗ', XTA:'ВАЗ (Lada)', WMA:'MAN', YS2:'Scania', YV2:'Volvo Trucks', XLR:'DAF', WDA:'Mercedes-Benz (вантажні)', VF6:'Renault Trucks', ZCF:'Iveco'
  };
  const YEAR = 'ABCDEFGHJKLMNPRSTVWXY123456789';   // 10-й символ, цикл 30 років (1980/2010)
  const TRANS = { A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9 };
  const WEIGHTS = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];

  function normalize(v){ return String(v || '').toUpperCase().replace(/[\s-]/g, '').replace(/[IOQ]/g, c => ({ I:'1', O:'0', Q:'0' })[c]); }
  function valid(v){ return /^[A-HJ-NPR-Z0-9]{17}$/.test(v); }
  const isNA = v => /^[1-5]/.test(v);

  function checkDigit(v){
    let s = 0;
    for (let i = 0; i < 17; i++){ const c = v[i]; s += (/\d/.test(c) ? +c : TRANS[c] || 0) * WEIGHTS[i]; }
    const r = s % 11; return r === 10 ? 'X' : String(r);
  }

  function country(v){
    const w = WMI[v.slice(0, 3)];
    if (w && w.includes('|')) return w.split('|')[1];
    const a = v[0], b = v[1], ib = SEQ.indexOf(b);
    for (const [f, from, to, name] of REGIONS){
      if (f !== a) continue;
      if (ib >= SEQ.indexOf(from) && ib <= SEQ.indexOf(to)) return name;
    }
    return '';
  }
  function make(v){ const w = WMI[v.slice(0, 3)]; return w ? w.split('|')[0] : ''; }

  // Модельний рік з 10-го символу. Для Північної Америки 7-й символ-літера означає 2010+.
  function modelYear(v){
    const i = YEAR.indexOf(v[9]); if (i < 0) return null;
    const now = new Date().getFullYear() + 1;
    if (isNA(v)) return /[A-Z]/.test(v[6]) ? 2010 + i : 1980 + i;
    const y2 = 2010 + i; return y2 <= now ? y2 : 1980 + i;   // для інших ринків — ймовірніший пізніший цикл
  }

  const CAPS = ['BMW','GMC','RAM','BYD','MG','DS','MINI','JAC','BAIC','GAC','SEAT','FIAT'];
  function niceMake(m){
    m = String(m || '').trim(); if (!m) return '';
    if (CAPS.includes(m.toUpperCase())) return m.toUpperCase() === 'FIAT' ? 'Fiat' : m.toUpperCase();
    return m.toLowerCase().split(/([\s-])/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  }

  async function nhtsa(v){
    try{
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
      const r = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + v + '?format=json', { signal: ctl.signal });
      clearTimeout(t);
      const x = (await r.json()).Results[0] || {};
      const fuel = String(x.FuelTypePrimary || '').toLowerCase();
      return {
        make: niceMake(x.Make),
        model: [x.Model, x.Trim || x.Series].filter(Boolean).join(' '),
        year: +x.ModelYear || null,
        cc: x.DisplacementCC ? Math.round(+x.DisplacementCC) : null,
        body: x.BodyClass || '',
        plant: x.PlantCountry || '',
        fuel: /electric/.test(fuel) && !/gasoline|diesel/.test(fuel) ? 'electric'
            : /diesel/.test(fuel) ? 'diesel' : /gasoline|flexible/.test(fuel) ? (x.ElectrificationLevel && /hev|hybrid/i.test(x.ElectrificationLevel) ? 'hybrid' : 'petrol') : ''
      };
    }catch(e){ return null; }
  }

  const PLANT = { 'UNITED STATES (USA)':'США', 'UNITED STATES':'США', 'GERMANY':'Німеччина', 'JAPAN':'Японія', 'MEXICO':'Мексика', 'CANADA':'Канада',
    'SOUTH KOREA':'Південна Корея', 'KOREA (SOUTH)':'Південна Корея', 'CHINA':'Китай', 'UNITED KINGDOM (UK)':'Велика Британія', 'SWEDEN':'Швеція',
    'FRANCE':'Франція', 'ITALY':'Італія', 'SPAIN':'Іспанія', 'SLOVAKIA':'Словаччина', 'CZECH REPUBLIC':'Чехія', 'HUNGARY':'Угорщина', 'AUSTRIA':'Австрія',
    'BELGIUM':'Бельгія', 'NETHERLANDS':'Нідерланди', 'POLAND':'Польща', 'TURKEY':'Туреччина', 'BRAZIL':'Бразилія', 'SOUTH AFRICA':'ПАР', 'INDIA':'Індія' };

  /* Європейські VIN: модель за кодом моделі виробника (концерн VW — 7–8 символи, Mercedes-Benz — шасі 4–6) */
  const VAG = {
    WVW: { '1J':'Golf IV / Bora', '1K':'Golf V / Jetta', '5K':'Golf VI', '5G':'Golf VII', 'AU':'Golf VII', 'CD':'Golf VIII', '3B':'Passat B5',
           '3C':'Passat B6/B7', '3G':'Passat B8', '6R':'Polo V', 'AW':'Polo VI', '1T':'Touran', '5T':'Touran II', '7N':'Sharan II', '3H':'Arteon', '5C':'Beetle' },
    WVG: { '5N':'Tiguan', 'AD':'Tiguan II', '7L':'Touareg I', '7P':'Touareg II', 'CR':'Touareg III' },
    WV1: { '7H':'Transporter T5', '2K':'Caddy' }, WV2: { '7H':'Transporter / Multivan T5', '2K':'Caddy' },
    WAU: { '8L':'A3 (8L)', '8P':'A3 (8P)', '8V':'A3 (8V)', '8Y':'A3 (8Y)', '8E':'A4 B6/B7', '8K':'A4 B8', '8W':'A4 B9', '8T':'A5', 'F5':'A5 II',
           '4F':'A6 C6', '4G':'A6 / A7 (C7)', '4E':'A8 D3', '4H':'A8 D4', '8U':'Q3', 'F3':'Q3 II', '8R':'Q5', 'FY':'Q5 II', 'GE':'e-tron' },
    WA1: { '4L':'Q7', '4M':'Q7 II / Q8', '8R':'Q5', 'FY':'Q5 II', 'GE':'e-tron' },
    TMB: { '1Z':'Octavia II', '5E':'Octavia III', 'NX':'Octavia IV', '3U':'Superb I', '3T':'Superb II', '3V':'Superb III', '5J':'Fabia II / Roomster',
           'NJ':'Fabia III', '5L':'Yeti', 'NS':'Kodiaq', 'NU':'Karoq' },
    VSS: { '1P':'Leon II', '5F':'Leon III', '6J':'Ibiza IV' }
  };
  const MB = { '169':'A-Class', '176':'A-Class', '177':'A-Class', '245':'B-Class', '246':'B-Class', '247':'B-Class / GLB', '203':'C-Class', '204':'C-Class',
    '205':'C-Class', '206':'C-Class', '211':'E-Class', '212':'E-Class', '213':'E-Class', '214':'E-Class', '207':'E-Class Coupé', '238':'E-Class Coupé',
    '220':'S-Class', '221':'S-Class', '222':'S-Class', '223':'S-Class', '117':'CLA', '118':'CLA', '156':'GLA', '219':'CLS', '218':'CLS', '257':'CLS',
    '253':'GLC', '254':'GLC', '164':'M-Class', '166':'M-Class / GLE', '167':'GLE', '292':'GLE Coupé', '463':'G-Class', '251':'R-Class',
    '639':'Vito / Viano', '447':'Vito / V-Class', '906':'Sprinter', '907':'Sprinter', '910':'Sprinter', '293':'EQC' };

  function euModel(v){
    const w = v.slice(0, 3);
    if (VAG[w]) return VAG[w][v.slice(6, 8)] || '';
    if (/^(WDD|WDB|WDC|W1K|W1N|WDF|W1V)$/.test(w)) return MB[v.slice(3, 6)] || '';
    return '';
  }

  async function decode(raw){
    const v = normalize(raw);
    if (!valid(v)) throw new Error('VIN має містити 17 символів: латинські літери (крім I, O, Q) і цифри');
    const na = isNA(v);
    const res = { vin: v, make: make(v), model: na ? '' : euModel(v), year: modelYear(v), cc: null, fuel: '', body: '', country: country(v),
                  market: na ? 'na' : 'other', checkOk: null, source: 'WMI', modelGuess: !na && !!euModel(v) };
    // Для європейських VIN 10-й символ рік кодує не завжди (напр., у BMW — «0»): «0», «Z» і т.п. означають «невідомо»
    // Рік у 10-му символі надійно кодують лише частина виробників для Європи (концерн VW, Volvo, корейці, японці, Tesla)
    const YEAR_OK = /^(WVW|WVG|WV1|WV2|WAU|WA1|WUA|TRU|TMB|VSS|YV1|YV4|KMH|KNA|KND|KM8|U5Y|TMA|XP7|LRW|J)/;
    if (!na && (!YEAR_OK.test(v) || !/[A-HJ-NPR-TV-Y1-9]/.test(v[9]))) res.year = null;
    if (na) res.checkOk = checkDigit(v) === v[8];
    const n = await nhtsa(v);
    if (n){
      if (n.make && !res.make) res.make = n.make;
      // База NHTSA надійна лише для авто ринку США/Канади; для європейських VIN вона вгадує завод і рік — не беремо
      if (na){
        if (n.model) res.model = n.model;
        if (n.year) res.year = n.year;
        if (n.cc) res.cc = n.cc;
        if (n.fuel) res.fuel = n.fuel;
        if (n.body) res.body = n.body;
        if (n.plant && PLANT[n.plant.toUpperCase()]) res.country = PLANT[n.plant.toUpperCase()];
        if (n.make || n.model) res.source = 'NHTSA';
      }
    }
    res.missing = ['model', 'year', 'cc', 'fuel'].filter(k => !res[k]);
    return res;
  }

  /* Екологічний клас для легкових (M1) за датою першої реєстрації в ЄС:
     з цих дат нові авто в ЄС реєструють лише з відповідним класом. */
  const EURO = [['1993-01-01','Euro 1'],['1997-01-01','Euro 2'],['2001-01-01','Euro 3'],['2006-01-01','Euro 4'],
                ['2011-01-01','Euro 5'],['2015-09-01','Euro 6'],['2018-09-01','Euro 6c'],['2019-09-01','Euro 6d-TEMP'],['2021-01-01','Euro 6d']];

  function euroEstimate({ fuel, firstReg, year, market, category }){
    if (fuel === 'electric') return { value: 'Не застосовується', note: 'Електромобіль — нульові прямі викиди, клас Євро не присвоюється.' };
    if (category && category !== 'M1' && category !== 'N1') return { value: '', note: 'Для вантажних і автобусів клас визначається лише за документом (COC або техпаспорт).' };
    const na = market === 'na' ? ' Авто з ринку США/Канади сертифіковане за нормами EPA/CARB, клас Євро для нього умовний — уточніть за документом.' : '';
    if (firstReg){
      const d = String(firstReg).slice(0, 10); let cls = '';
      for (const [from, name] of EURO) if (d >= from) cls = name;
      return cls ? { value: cls, note: 'За датою першої реєстрації (' + d.split('-').reverse().join('.') + ') та строками введення норм у ЄС.' + na }
                 : { value: 'Нижче Euro 1', note: 'Перша реєстрація до 1993 року.' + na };
    }
    if (year){
      let cls = '', amb = '';
      for (const [from, full] of EURO){
        const name = full.startsWith('Euro 6') ? 'Euro 6' : full, y = +from.slice(0, 4);
        if (year > y) cls = name; else if (year === y && name !== cls) amb = name;
      }
      if (amb === cls) amb = '';
      if (amb) return { value: (cls || 'Нижче Euro 1') + ' / ' + amb, note: 'Модельний рік ' + year + ' — перехідний для норм ' + amb + '. Перевірте поле V.9 техпаспорта або COC.' + na };
      return { value: cls || 'Нижче Euro 1', note: 'За модельним роком ' + year + '. Для точності вкажіть дату першої реєстрації.' + na };
    }
    return { value: '', note: 'Вкажіть рік випуску або дату першої реєстрації.' };
  }

  return { normalize, valid, decode, euroEstimate, country, make, modelYear };
})();
