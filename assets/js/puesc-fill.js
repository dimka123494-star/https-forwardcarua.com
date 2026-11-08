/* puesc-fill.js — автозаповнення форми RMPD100 на puesc.gov.pl.
   Кнопка «⚡ Автозаповнення» копіює дані заявки в буфер (рядок «MBPUESC:[…]»),
   закладка «MB → PUESC» на сторінці форми читає буфер і ставить значення в поля.
   Назви полів і значення списків — з самої форми PUESC (портлет Sent_Rmpd100Portlet). */
const PuescFill = (() => {
  /* Пункти пропуску з довідника форми (entranceRouteSelect / exitRouteSelect) */
  const ROUTES = ['Barwinek - Vyżny Komarnik','Berżniki - Kapciamiestis','Bezledy - Bagrationowsk','Boboszów - Kraliky','Bobrowniki - Bierestowica','Bogatynia - Kunratice',
    'Brzozowie - Ceska Cermna','Budomierz - Hruszew','Budzisko - Kalwaria','Chałupki - Bohumin','Chochołów - Suchá Hora','Chyżne - Trstená','Cieszyn Boguszowice - Chotěbuz',
    'Cieszyn przywóz - Czeski Cieszyn','Cieszyn wywóz - Czeski Cieszyn','Czerniawa Zdrój - Nowe Mesto','Dobieszczyn - Hintersee','Dorohusk - Jogodzin','Dołhobyczów - Uhrynów',
    'Dusznica - Tarnauka','Glinka - Novot','Golińsk - Mezimesti','Gorzyczki - Vernowice','Gołdap - Gusiew','Gołkowice - Zavada','Gronowo - Mamonowo','Grzechotki - Mamonowo',
    'Grzybina - Varteliai','Gubin - Guben','Gubinek - Schlagsdorf','Głuchołazy - Mikulovice','Hrebenne - Rawa Ruska','Jakuszyce - Harrachov','Jasnowice - Bukovec','Jurgów - Podspady',
    'Jędrzychowice - Ludwigsdorf','Kaczyce - Karvina','Kaczyce - Karvina Raj','Kamieńczyk - Mladkov','Kocioł - Olesnice','Konieczna - Becherov','Konradów - Zlate Hory',
    'Kopaczów - Hradek nad Nisou','Korbielów - Oravska Półgóra','Korczowa - Krakowiec','Kostrzyn - Kietz','Kołbaskowo - Pomellen','Krajnik Dolny - Schwedt','Krejwiany - Senoji Radiske',
    'Krościenko - Smolnica','Krzanowice - Chuchelna','Kudowa - Mala Cermna','Kudowa Słone - Nachod','Kukuryki - Kozłowicze','Kuźnica Białostocka - Bruzgi','Leluchów - Circ',
    'Leszna Górna - Horni Lisna','Lubawka - Kralovec','Lubieszyn - Linken','Lutynia - Javornik','Malohowice-Niżankowice','Marklowice - Petrovice','Medyka - Szeginie',
    'Miłoszów - Srbska','Mostowice - Kunstat','Muszynka - Kurov','Nidzica - Lysa nad Dunajcem','Niemojów - Bartoszowice','Ogrodniki - Łoździeje','Olszyna - Forst','Ostra Góra - Machov',
    'Owciszcze - Pist','Paczków - Bily Potok','Pietraszyn - Sudice','Pietrowice - Krnov','Piwniczna - Mnisek n Popradom','Porajów - Hradek nad Nisou','Porajów - Zittau',
    'Poszeszupie - Salaperaugis-Lubavas','Połowce - Pieszczatka','Przewóz - Podrosche','Przełęcz Okraj - Pomezní Boudy','Radków - Bozanov','Radomierzyce - Hagenwerder',
    'Radoszyce - Palota','Rosówek - Rosow','Rudyszwałd - Hat','Sankury - Galiniai','Sieniawka - Zittau Miasto','Sieniawka - Zittau Płn','Skrbeńsko - Petrovice',
    'Stronie Śląskie - Nova Morava','Sudawskie - Vygreliai','Sławatycze - Domaczewo','Słubice - Frankfurt nO','Terespol - Brześć','Trompole - Sangruda','Trzebina - Bartultowice',
    'Tłumaczów - Otovice','Tłumaczówek - Sonov','Warnik - Ladenthin','Winiarczykówka - Bobrov','Wydale - Hat','Zasieki - Forst','Zawidów - Habartice','Zgorzelec - Görlitz',
    'Zosin - Ustiług','Zwardoń Skalite - Svrcinovec','Złoty Stok - Bila Voda','Łysa Polana - Tatranská Javorina','Łęknica - Bad Muskau','Świecko - Frankfurt nO',
    'Świnoujście - Ahlbeck','Świnoujście - Garz','Świnoujście - Terminal Promowy','Świnoujście Port - Terminal Promowy','Żytowań - Coschen'];
  const PROV = { 'dolnośląskie':'02', 'kujawsko-pomorskie':'04', 'lubelskie':'06', 'lubuskie':'08', 'łódzkie':'10', 'małopolskie':'12', 'mazowieckie':'14', 'opolskie':'16',
    'podkarpackie':'18', 'podlaskie':'20', 'pomorskie':'22', 'śląskie':'24', 'świętokrzyskie':'26', 'warmińsko-mazurskie':'28', 'wielkopolskie':'30', 'zachodniopomorskie':'32' };
  const TRANSPORT = { bilateral:'BILATERAL_TRANSPORT', transit:'TRANSIT_TRANSPORT', third:'THIRD_COUNTRY_TRANSPORT', cabotage:'CABOTAGE' };
  const PERMIT = { eu_ua:'NOT_OBLIGED', ecmt:'EKMT_PERMISSION', bilateral:'ROAD_PERMISSION', transit:'ROAD_PERMISSION', third:'ROAD_PERMISSION', other:'ROAD_PERMISSION' };
  const IDT = { NIP:'NIP', VAT:'VAT UE', INNY:'INNY' };

  const key = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z]/g, '');
  /* «Dorohusk» → «Dorohusk - Jogodzin»; невідомий пункт → '' (у формі це «Place off the book») */
  function route(name){
    const k = key(name); if (!k) return '';
    return ROUTES.find(r => key(r.split(' - ')[0]) === k) || ROUTES.find(r => key(r.split(' - ')[0]).startsWith(k) || k.startsWith(key(r.split(' - ')[0]))) || '';
  }
  function splitAddr(t){
    t = String(t || '').trim().replace(/\s+/g, ' ');
    const m = t.match(/^(.*?)[\s,]+(\d+[A-Za-z]?)(?:\s*[\/-]\s*(\d+[A-Za-z]?))?$/);
    return m && m[1] ? { street: m[1].replace(/,$/, '').trim(), bld: m[2], apt: m[3] || '' } : { street: t || 'NONE', bld: 'NONE', apt: '' };
  }
  /* Правова підстава «без дозволу» за Угодою ЄС–Україна (довідник notObligedLegalBaseHelp форми PUESC):
     182 — з вантажем між територіями двох різних Сторін; 183 — з України в Україну транзитом через ЄС;
     184 — з/до третьої країни транзитом через ЄС; 185 — порожній пробіг, повʼязаний з цими рейсами */
  const EU = ['AT','BE','BG','CY','CZ','DE','DK','EE','GR','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'];
  function legalBase(r){
    if (!r.with_goods) return '185';
    const L = r.load_country, U = r.unload_country;
    if (L === 'UA' && U === 'UA') return '183';
    if ((L === 'UA' && EU.includes(U)) || (U === 'UA' && EU.includes(L))) return '182';
    if (L === 'UA' || U === 'UA') return '184';
    return '182';
  }
  const coord = n => n === null || n === undefined || n === '' ? '' : Number(n).toFixed(6);

  /* Пари [поле, значення] у порядку заповнення; '@wait' — пауза, поки форма перебудовує розділи */
  function pairs(r){
    const out = [], add = (k, v) => { if (v !== undefined && v !== null) out.push([k, v]); }, wait = () => out.push(['@wait', 900]);
    const loadPL = r.load_country === 'PL', unloadPL = r.unload_country === 'PL';
    // Країни й тип перевезення першими — від них залежить, які розділи покаже форма
    add('countryLoadCode', r.load_country); add('countryUnloadCode', r.unload_country); add('loaded', !!r.with_goods);
    add('typeOfRoadTransport', TRANSPORT[r.trip_type] || ''); wait();
    // 1. Перевізник
    const cb = splitAddr([r.carrier_street, r.carrier_building].filter(Boolean).join(' '));
    add('carrierIdentityType', r.carrier_id_type || 'INNY'); add('carrierIdentityNumber', r.carrier_code || ''); add('carrierName', r.carrier_name || '');
    add('carrierCountry', r.carrier_country || 'UA'); add('carrierCity', r.carrier_city || ''); add('carrierPostalCode', r.carrier_postcode || '');
    add('carrierStreet', r.carrier_street || cb.street); add('carrierHouseNumber', r.carrier_building ? splitAddr('x ' + r.carrier_building).bld : cb.bld);
    if (r.carrier_building && splitAddr('x ' + r.carrier_building).apt) add('carrierFlatNumber', splitAddr('x ' + r.carrier_building).apt);
    // 2. Транспорт
    add('truckCountry', r.plate_country || 'UA'); add('truckNumber', r.plate || '');
    if (r.trailer_plate){ add('trailerCountry', r.trailer_country || r.plate_country || 'UA'); add('trailerNumber', r.trailer_plate); }
    add('geoLocatorNumber', r.gps_id || ''); add('failoverCarrierEmail', r.carrier_email || '');
    // 3.1 Дати
    add('startTransportDate', r.start_date || ''); add('endTransportDate', r.end_date || r.start_date || '');
    // 3.3 Документ
    if (r.with_goods){ add('typeOfTransportDocument', 'CMR'); add('numberOfTransportDocument', r.cmr_number || 'BRAK'); }
    // 3.4–3.5 Дозвіл
    const perm = PERMIT[r.permit_type] || '';
    if (perm && r.trip_type !== 'cabotage'){ add('typeOfRoadPermission', perm); wait();
      if (perm === 'NOT_OBLIGED') add('notObligedLegalBaseHelp', legalBase(r));
      if (perm !== 'NOT_OBLIGED'){ add('permissionCountry', r.permit_country || 'PL'); add('permissionNumber', r.permit_number || ''); if (r.permit_valid_from) add('validFrom', r.permit_valid_from); if (r.permit_valid_to) add('validTo', r.permit_valid_to); }
    }
    // 3.6
    if (r.prev_rmpd) add('previousRmpdNumber', r.prev_rmpd);
    add('journeyDirection', r.direction === 'back' ? '2' : '1');
    // 3.7 старт / в'їзд, 3.8 призначення / виїзд
    const place = (pre, a, cityFallback) => {
      a = a || { city: cityFallback };
      add(pre + 'City', a.city || ''); add(pre + 'PostalCode', a.zip || ''); add(pre + 'Street', a.street || 'NONE'); add(pre + 'HouseNumber', a.bld || 'NONE');
      if (a.apt) add(pre + 'FlatNumber', a.apt);
      const code = PROV[String(a.prov || '').toLowerCase()]; if (code) add(pre + 'ProvinceHelp', code);
      add(pre + 'Latitude', coord(a.lat)); add(pre + 'Longitude', coord(a.lon));
    };
    const border = (pre, name, a) => {
      const rt = route(name);
      add(pre + 'RouteSelect', rt); wait();
      if (!rt){ add(pre + 'OtherPlace', name || ''); const code = a && PROV[String(a.prov || '').toLowerCase()]; if (code) add(pre + 'Province', code);
        if (a && a.lat != null){ add(pre + 'Latitude', coord(a.lat)); add(pre + 'Longitude', coord(a.lon)); } }
    };
    if (loadPL) place('start', r.start_addr, r.load_place); else border('entrance', r.entry_point, r.start_addr);
    if (unloadPL) place('end', r.end_addr, r.unload_place); else border('exit', r.exit_point, r.end_addr);
    // 4–5 Відправник / отримувач
    if (r.with_goods) ['sender','recipient'].forEach(s => {
      const a = splitAddr(r[s + '_address']);
      add(s + 'IdentityType', r[s + '_id'] ? (IDT[r[s + '_id_type']] || 'INNY') : 'BRAK');
      if (r[s + '_id']) add(s + 'IdentityNumber', r[s + '_id']);
      add(s + 'Name', r[s + '_name'] || ''); add(s + 'Country', r[s + '_country'] || ''); add(s + 'City', r[s + '_city'] || '');
      add(s + 'PostalCode', r[s + '_postcode'] || ''); add(s + 'Street', a.street); add(s + 'HouseNumber', a.bld); if (a.apt) add(s + 'FlatNumber', a.apt);
    });
    // 6–7 Власний номер і пошта для підтвердження (копія клієнту — в адресу 2)
    if (r.id) add('documentSelfNumber', 'MB-' + String(r.id).slice(0, 8).toUpperCase());
    add('emailCheckbox', true); wait();
    const cc = r.contact_email || r.carrier_email; if (cc) add('emailAddress2', cc);
    return out;
  }
  /* SENT_EDIT (доповнення перевізником): крок 1 — номер SENT і ключ; крок 2 — поля перевізника.
     Назви полів кроку 2 взято за аналогією з RMPD100 (спільна основа форм SENT); ті, яких на сторінці немає, закладка пропускає й показує список порожніх полів */
  function sentPairs(r){
    const out = [], add = (k, v) => { if (v !== undefined && v !== null && v !== '') out.push([k, v]); };
    add('sentNumber', r.sent_number); add('sentKey', r.carrier_key); out.push(['@step2', 0]);
    const cb = splitAddr([r.carrier_street, r.carrier_building].filter(Boolean).join(' '));
    add('carrierIdentityType', r.carrier_id_type === 'NIP' ? 'NIP' : r.carrier_id_type === 'VAT' ? 'VAT UE' : 'INNY'); add('carrierIdentityNumber', r.carrier_id);
    add('carrierName', r.carrier_name); add('carrierCountry', r.carrier_country); add('carrierCity', r.carrier_city); add('carrierPostalCode', r.carrier_postcode);
    add('carrierStreet', r.carrier_street || cb.street); add('carrierHouseNumber', r.carrier_building || cb.bld);
    add('truckCountry', r.plate_country || 'UA'); add('truckNumber', r.plate); add('trailerNumber', r.trailer_plate);
    add('geoLocatorNumber', r.gps_id); add('failoverGeoLocatorNumber', r.gps_backup); add('failoverCarrierEmail', r.carrier_email);
    add('startTransportDate', r.start_date); add('endTransportDate', r.end_date);
    add('permissionNumber', r.permit_number);
    if (r.entry_point){ const rt = route(r.entry_point); if (rt){ add('entranceRouteSelect', rt); out.push(['@wait', 700]); } }
    if (r.exit_point){ const rt = route(r.exit_point); if (rt){ add('exitRouteSelect', rt); out.push(['@wait', 700]); } }
    add('emailCheckbox', true); if (r.carrier_email){ out.push(['@wait', 700]); add('emailAddress2', r.carrier_email); }
    if (r.signer_first) add('statementsFirstName', r.signer_first); if (r.signer_last) add('statementsLastName', r.signer_last);
    return out;
  }
  async function copySent(r){ try{ await navigator.clipboard.writeText('MBPUESC:' + JSON.stringify(sentPairs(r))); return true; }catch(e){ return false; } }
  const text = r => 'MBPUESC:' + JSON.stringify(pairs(r));
  async function copy(r){
    try{ await navigator.clipboard.writeText(text(r)); return true; }catch(e){ return false; }
  }

  /* Закладка: читає буфер, ставить значення через jQuery форми (щоб спрацювали її обробники), чекає перебудови розділів */
  /* Закладка — лише завантажувач: сам код у /assets/js/puesc-run.js, тож виправлення не вимагають перетягувати закладку заново */
  const BOOKMARKLET = "javascript:(()=>{const s=document.createElement('script');s.src='https://forwardcarua.com/assets/js/puesc-run.js?v='+Date.now();s.onerror=()=>alert('Не вдалося завантажити автозаповнення з forwardcarua.com');document.body.appendChild(s)})()";

  /* Блок з інструкцією й закладкою для перетягування */
  function howto(){
    return '<details class="text-sm" style="margin:8px 0"><summary style="cursor:pointer">Як працює ⚡ автозаповнення PUESC — RMPD і SENT (налаштування 1 раз)</summary><ol style="margin:8px 0 0 18px;line-height:1.6">' +
      '<li>Перетягніть цю кнопку на панель закладок браузера: <a href="' + BOOKMARKLET.replace(/"/g, '&quot;') + '" onclick="alert(\'Не натискайте тут — перетягніть кнопку на панель закладок (Cmd/Ctrl+Shift+B показує панель).\');return false" ' +
        'style="display:inline-block;padding:3px 10px;border-radius:7px;background:var(--blue);color:var(--on-accent);font-weight:600;text-decoration:none">MB → PUESC</a></li>' +
      '<li>У заявці натисніть «⚡ Автозаповнення PUESC» — дані скопіюються.</li>' +
      '<li>Відкрийте форму на puesc.gov.pl (RMPD100 або для SENT — «SENT_EDIT Uzupełnienie») (увійшовши в акаунт) і натисніть закладку «MB → PUESC». Якщо браузер попросить — вставте дані у віконце (Cmd/Ctrl+V) і натисніть OK.</li>' +
      '<li>Перевірте поля, позначте декларацію (розділ 8) і надішліть.</li></ol></details>';
  }
  return { pairs, sentPairs, text, copy, copySent, route, howto, BOOKMARKLET, ROUTES };
})();
