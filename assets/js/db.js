/* =========================================================
   assets/js/db.js
   Р„РґРёРЅРёР№ С€Р°СЂ РґРѕСЃС‚СѓРїСѓ РґРѕ Р±Р°Р·Рё. РЎС‚РѕСЂС–РЅРєРё РЅРµ Р·РІРµСЂС‚Р°СЋС‚СЊСЃСЏ
   РґРѕ Supabase РЅР°РїСЂСЏРјСѓ вЂ” С‚С–Р»СЊРєРё С‡РµСЂРµР· С†С– С„СѓРЅРєС†С–С—.
   РќР°Р·РІРё РєРѕР»РѕРЅРѕРє РІС–РґРїРѕРІС–РґР°СЋС‚СЊ СЃС…РµРјС– РїС–СЃР»СЏ db-setup-full.sql.
   ========================================================= */

/* ================= РђР’РўРћР РР—РђР¦Р†РЇ ================= */

async function currentUser(){
  const sb = await sbReady();
  const { data:{ user } } = await sb.auth.getUser();
  return user || null;
}

async function currentSession(){
  const sb = await sbReady();
  const { data:{ session } } = await sb.auth.getSession();
  return session || null;
}

/** РџРѕРІРµСЂС‚Р°С” РєРѕСЂРёСЃС‚СѓРІР°С‡Р° Р°Р±Рѕ РІС–РґРїСЂР°РІР»СЏС” РЅР° РІС…С–Рґ. */
async function requireAuth(redirect = '/vhid'){
  const user = await currentUser();
  if (!user){ location.href = redirect + '?next=' + encodeURIComponent(location.pathname); return null; }
  return user;
}

async function signIn(email, password){
  const sb = await sbReady();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authMessage(error.message));
  return data.user;
}

/** role: 'broker' | 'client' */
async function signUp({ email, password, name, phone, role = 'client' }){
  const sb = await sbReady();
  if (!isValidEmail(email)) throw new Error('Р’РєР°Р¶С–С‚СЊ РєРѕСЂРµРєС‚РЅРёР№ email');
  if ((password || '').length < 8) throw new Error('РџР°СЂРѕР»СЊ РјР°С” РјС–СЃС‚РёС‚Рё С‰РѕРЅР°Р№РјРµРЅС€Рµ 8 СЃРёРјРІРѕР»С–РІ');
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: name || '', phone: phone || '', user_role: role } }
  });
  if (error) throw new Error(authMessage(error.message));
  return data.user;
}

async function signOut(){
  const sb = await sbReady();
  await sb.auth.signOut();
}

async function resetPassword(email){
  const sb = await sbReady();
  if (!isValidEmail(email)) throw new Error('Р’РєР°Р¶С–С‚СЊ РєРѕСЂРµРєС‚РЅРёР№ email');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/vhid' });
  if (error) throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ РЅР°РґС–СЃР»Р°С‚Рё Р»РёСЃС‚');
}

async function isAdmin(){
  const user = await currentUser();
  if (!user) return false;
  const sb = await sbReady();
  const { data } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  return !!data;
}

/** Р РѕР»СЊ РІРёР·РЅР°С‡Р°С”С‚СЊСЃСЏ РЅР°СЏРІРЅС–СЃС‚СЋ РїСЂРѕС„С–Р»СЋ Р±СЂРѕРєРµСЂР°, Р° РЅРµ РјРµС‚Р°РґР°РЅРёРјРё:
    РјРµС‚Р°РґР°РЅС– РєРѕСЂРёСЃС‚СѓРІР°С‡ РјРѕР¶Рµ РїС–РґРјС–РЅРёС‚Рё РїСЂРё СЂРµС”СЃС‚СЂР°С†С–С—. */
async function userRole(){
  const user = await currentUser();
  if (!user) return 'guest';
  if (await isAdmin()) return 'admin';
  const broker = await getMyBroker();
  return broker ? 'broker' : 'client';
}

function authMessage(m){
  if (/Invalid login/i.test(m))            return 'РќРµРІС–СЂРЅРёР№ email Р°Р±Рѕ РїР°СЂРѕР»СЊ';
  if (/already registered|User already/i.test(m)) return 'Р¦РµР№ email СѓР¶Рµ Р·Р°СЂРµС”СЃС‚СЂРѕРІР°РЅРёР№ вЂ” СѓРІС–Р№РґС–С‚СЊ Сѓ РєР°Р±С–РЅРµС‚';
  if (/Email not confirmed/i.test(m))      return 'РџС–РґС‚РІРµСЂРґС–С‚СЊ email вЂ” Р»РёСЃС‚ СѓР¶Рµ Сѓ РІР°С€С–Р№ РїРѕС€С‚С–';
  if (/Password/i.test(m))                 return 'РџР°СЂРѕР»СЊ РЅР°РґС‚Рѕ РєРѕСЂРѕС‚РєРёР№';
  if (/rate limit|too many/i.test(m))      return 'Р—Р°Р±Р°РіР°С‚Рѕ СЃРїСЂРѕР±. РЎРїСЂРѕР±СѓР№С‚Рµ Р·Р° РєС–Р»СЊРєР° С…РІРёР»РёРЅ';
  return m || 'РЎС‚Р°Р»Р°СЃСЏ РїРѕРјРёР»РєР°';
}

/* ================= РљРђРўРђР›РћР“ ================= */

const BROKER_FIELDS = 'id, name, city, region, plan, plan_expires_at, rating_avg, rating_count, experience, is_verified, views_count, about, phone, telegram, whatsapp, viber, instagram, facebook, tiktok, youtube, created_at';

async function listBrokers({ region = '', city = '', service = '', search = '', sort = 'plan', verifiedOnly = false } = {}){
  const sb = await sbReady();
  let query = sb.from('brokers')
    .select(BROKER_FIELDS + ', broker_services(id, name, price_from, price_to)')
    .eq('is_active', true);

  if (region) query = query.eq('region', region);
  if (verifiedOnly) query = query.eq('is_verified', true);

  const { data, error } = await query;
  if (error){ console.error('listBrokers:', error); throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІР°РЅС‚Р°Р¶РёС‚Рё РєР°С‚Р°Р»РѕРі'); }

  let list = data || [];
  const q = search.trim().toLowerCase();
  const c = city.trim().toLowerCase();

  if (c) list = list.filter(b => (b.city || '').toLowerCase().includes(c));
  if (service) list = list.filter(b => (b.broker_services || []).some(s => s.name === service));
  if (q) list = list.filter(b =>
    (b.name || '').toLowerCase().includes(q) ||
    (b.city || '').toLowerCase().includes(q) ||
    (b.about || '').toLowerCase().includes(q) ||
    (b.broker_services || []).some(s => (s.name || '').toLowerCase().includes(q)));

  return sortBrokers(list, sort);
}

function sortBrokers(list, sort = 'plan'){
  const arr = [...list];
  const byPlan = (a,b) => (PLAN_RANK[a.plan] ?? 3) - (PLAN_RANK[b.plan] ?? 3);
  const minPrice = b => Math.min(...((b.broker_services || []).map(s => s.price_from ?? Infinity)), Infinity);

  if (sort === 'rating')  arr.sort((a,b) => (b.rating_avg||0) - (a.rating_avg||0) || byPlan(a,b));
  else if (sort === 'reviews') arr.sort((a,b) => (b.rating_count||0) - (a.rating_count||0) || byPlan(a,b));
  else if (sort === 'price')   arr.sort((a,b) => minPrice(a) - minPrice(b));
  else if (sort === 'exp')      arr.sort((a,b) => (b.experience||0) - (a.experience||0) || byPlan(a,b));
  else arr.sort((a,b) => byPlan(a,b) || (b.rating_avg||0) - (a.rating_avg||0));
  return arr;
}

async function getBroker(id){
  const sb = await sbReady();
  const { data, error } = await sb.from('brokers')
    .select(BROKER_FIELDS + ', broker_services(id, name, price_from, price_to)')
    .eq('id', id).eq('is_active', true).maybeSingle();
  if (error) console.error('getBroker:', error);
  return data || null;
}

async function countBrokers(){
  const sb = await sbReady();
  const { count } = await sb.from('brokers').select('id', { count:'exact', head:true }).eq('is_active', true);
  return count || 0;
}

async function incrementViews(brokerId){
  const sb = await sbReady();
  const key = 'viewed_' + brokerId;
  if (sessionStorage.getItem(key)) return;      // РѕРґРёРЅ РїРµСЂРµРіР»СЏРґ Р·Р° СЃРµСЃС–СЋ
  sessionStorage.setItem(key, '1');
  await sb.rpc('increment_broker_views', { broker: brokerId }).catch(() => {});
}

/* ================= Р—РђРЇР’РљР ================= */

/**
 * @param {object} p
 *   brokerId вЂ” id Р±СЂРѕРєРµСЂР° Р°Р±Рѕ null (В«Р±СѓРґСЊ-СЏРєРёР№ РІС–Р»СЊРЅРёР№В»)
 *   service, comment, urgency
 *   car: { make, model, year, country }
 *   contact: { name, phone, telegram, email }
 */
async function createRequest(p){
  const sb = await sbReady();
  if (!p.contact?.name || p.contact.name.trim().length < 2) throw new Error('Р’РєР°Р¶С–С‚СЊ С–Рј\'СЏ');
  if (!isValidPhone(p.contact?.phone)) throw new Error('Р’РєР°Р¶С–С‚СЊ РєРѕСЂРµРєС‚РЅРёР№ РЅРѕРјРµСЂ С‚РµР»РµС„РѕРЅСѓ');

  const user = await currentUser();
  const { error } = await sb.from('requests').insert({
    broker_id:       p.brokerId || null,
    client_user_id:  user?.id || null,
    service:         p.service || null,
    comment:         p.comment || null,
    urgency:         p.urgency || null,
    car_make:        p.car?.make || null,
    car_model:       p.car?.model || null,
    car_year:        p.car?.year || null,
    car_country:     p.car?.country || null,
    client_name:     p.contact.name.trim(),
    client_phone:    p.contact.phone.trim(),
    client_telegram: p.contact.telegram || null,
    client_email:    p.contact.email || null,
    status:          'new'
  });
  if (error){ console.error('createRequest:', error); throw new Error('Р—Р°СЏРІРєСѓ РЅРµ РЅР°РґС–СЃР»Р°РЅРѕ. РЎРїСЂРѕР±СѓР№С‚Рµ С‰Рµ СЂР°Р·'); }
  track('generate_lead', { service: p.service || 'Р—Р°РіР°Р»СЊРЅРёР№ Р·Р°РїРёС‚' });
}

async function brokerRequests(brokerId, { status = null, limit = 100 } = {}){
  const sb = await sbReady();
  let q = sb.from('requests').select('*').eq('broker_id', brokerId)
    .order('created_at', { ascending:false }).limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error){ console.error('brokerRequests:', error); return []; }
  return data || [];
}

async function clientRequests(){
  const sb = await sbReady();
  const user = await currentUser();
  if (!user) return [];
  const { data, error } = await sb.from('requests')
    .select('*, brokers(name, phone, telegram)')
    .eq('client_user_id', user.id)
    .order('created_at', { ascending:false });
  if (error){ console.error('clientRequests:', error); return []; }
  return data || [];
}

async function updateRequestStatus(id, status){
  const sb = await sbReady();
  if (!REQUEST_STATUS[status]) throw new Error('РќРµРІС–РґРѕРјРёР№ СЃС‚Р°С‚СѓСЃ');
  const { error } = await sb.from('requests').update({ status }).eq('id', id);
  if (error) throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ РѕРЅРѕРІРёС‚Рё СЃС‚Р°С‚СѓСЃ');
}

/* ================= Р’Р†Р”Р“РЈРљР ================= */

async function listReviews(brokerId, { rating = 'all', sort = 'newest' } = {}){
  const sb = await sbReady();
  let q = sb.from('reviews').select('*, review_replies(body, created_at)')
    .eq('broker_id', brokerId).eq('status', 'published');
  if (rating !== 'all') q = q.eq('rating', Number(rating));
  q = sort === 'helpful'
    ? q.order('helpful_count', { ascending:false })
    : q.order('created_at', { ascending:false });
  const { data, error } = await q;
  if (error){ console.error('listReviews:', error); return []; }
  return data || [];
}

/** Р’С–РґРіСѓРєРё Р±СЂРѕРєРµСЂР° РІ РєР°Р±С–РЅРµС‚С– вЂ” РІРєР»СЋС‡РЅРѕ Р· С‚РёРјРё, С‰Рѕ РЅР° РјРѕРґРµСЂР°С†С–С—. */
async function myReviews(brokerId){
  const sb = await sbReady();
  const { data, error } = await sb.from('reviews')
    .select('*, review_replies(body, created_at)')
    .eq('broker_id', brokerId).order('created_at', { ascending:false });
  if (error){ console.error('myReviews:', error); return []; }
  return data || [];
}

async function submitReview({ brokerId, authorName, rating, service, body }){
  const sb = await sbReady();
  if (!authorName || authorName.trim().length < 2) throw new Error('Р’РєР°Р¶С–С‚СЊ С–Рј\'СЏ');
  if (!rating) throw new Error('РџРѕСЃС‚Р°РІС‚Рµ РѕС†С–РЅРєСѓ');
  if (!service) throw new Error('РћР±РµСЂС–С‚СЊ РїРѕСЃР»СѓРіСѓ');
  if (!body || body.trim().length < 20) throw new Error('РћРїРёС€С–С‚СЊ РґРѕСЃРІС–Рґ вЂ” С‰РѕРЅР°Р№РјРµРЅС€Рµ 20 СЃРёРјРІРѕР»С–РІ');

  const user = await currentUser();
  const { error } = await sb.from('reviews').insert({
    broker_id: brokerId,
    author_name: authorName.trim(),
    author_user_id: user?.id || null,
    rating: Number(rating),
    service, body: body.trim()
    // status СЃС‚Р°РІРёС‚СЊ С‚СЂРёРіРµСЂ Сѓ Р±Р°Р·С– вЂ” Р·Р°РІР¶РґРё 'pending'
  });
  if (error){ console.error('submitReview:', error); throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ РЅР°РґС–СЃР»Р°С‚Рё РІС–РґРіСѓРє'); }
}

async function markHelpful(reviewId){
  const sb = await sbReady();
  const key = 'helpful_' + reviewId;
  if (localStorage.getItem(key)) throw new Error('Р’Рё РІР¶Рµ РїРѕР·РЅР°С‡РёР»Рё С†РµР№ РІС–РґРіСѓРє');
  const voter = (await currentUser())?.id || ('anon-' + reviewId + '-' + Math.random().toString(36).slice(2,10));
  const { data, error } = await sb.rpc('mark_review_helpful', { review: reviewId, voter });
  if (error) throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°СЂР°С…СѓРІР°С‚Рё РіРѕР»РѕСЃ');
  localStorage.setItem(key, '1');
  return data;
}

async function replyToReview(reviewId, brokerId, body){
  const sb = await sbReady();
  if (!body || body.trim().length < 10) throw new Error('Р’С–РґРїРѕРІС–РґСЊ вЂ” С‰РѕРЅР°Р№РјРµРЅС€Рµ 10 СЃРёРјРІРѕР»С–РІ');
  const { error } = await sb.from('review_replies')
    .upsert({ review_id: reviewId, broker_id: brokerId, body: body.trim() }, { onConflict:'review_id' });
  if (error){ console.error('replyToReview:', error); throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ Р·Р±РµСЂРµРіС‚Рё РІС–РґРїРѕРІС–РґСЊ'); }
}

function ratingSummary(reviews){
  const counts = { 5:0, 4:0, 3:0, 2:0, 1:0 };
  (reviews || []).forEach(r => { if (counts[r.rating] !== undefined) counts[r.rating]++; });
  const total = (reviews || []).length;
  const avg = total ? reviews.reduce((s,r) => s + r.rating, 0) / total : 0;
  return { counts, total, avg };
}

/* ================= РљРђР‘Р†РќР•Рў Р‘Р РћРљР•Р Рђ ================= */

async function getMyBroker(){
  const sb = await sbReady();
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await sb.from('brokers')
    .select('*, broker_services(id, name, price_from, price_to)')
    .eq('user_id', user.id).maybeSingle();
  if (error) console.error('getMyBroker:', error);
  return data || null;
}

async function createBrokerProfile(fields){
  const sb = await sbReady();
  const user = await currentUser();
  if (!user) throw new Error('РЎРїРѕС‡Р°С‚РєСѓ СѓРІС–Р№РґС–С‚СЊ Сѓ РєР°Р±С–РЅРµС‚');
  const { data, error } = await sb.from('brokers').insert({
    user_id: user.id,
    email: user.email,
    plan: 'free',
    is_active: true,
    ...fields
  }).select().single();
  if (error){
    console.error('createBrokerProfile:', error);
    if (/duplicate|unique/i.test(error.message)) throw new Error('РџСЂРѕС„С–Р»СЊ Р±СЂРѕРєРµСЂР° РІР¶Рµ С–СЃРЅСѓС”');
    throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ СЃС‚РІРѕСЂРёС‚Рё РїСЂРѕС„С–Р»СЊ');
  }
  track('sign_up', { method:'broker' });
  return data;
}

/** РўР°СЂРёС„, СЂРµР№С‚РёРЅРі С– РІРµСЂРёС„С–РєР°С†С–СЋ Р·РІС–РґСЃРё Р·РјС–РЅРёС‚Рё РЅРµ РјРѕР¶РЅР° вЂ” Р±Р»РѕРєСѓС” С‚СЂРёРіРµСЂ Сѓ Р±Р°Р·С–. */
async function updateMyBroker(updates){
  const sb = await sbReady();
  const user = await currentUser();
  if (!user) throw new Error('РЎРµСЃС–СЏ Р·Р°РІРµСЂС€РёР»Р°СЃСЊ вЂ” СѓРІС–Р№РґС–С‚СЊ Р·РЅРѕРІСѓ');
  const allowed = ['name','city','region','about','experience','phone','telegram',
                   'whatsapp','viber','instagram','facebook','tiktok','youtube'];
  const patch = {};
  allowed.forEach(k => { if (k in updates) patch[k] = updates[k] || null; });
  if (!patch.name || patch.name.trim().length < 2) throw new Error('Р’РєР°Р¶С–С‚СЊ С–Рј\'СЏ Р°Р±Рѕ РЅР°Р·РІСѓ РєРѕРјРїР°РЅС–С—');

  const { error } = await sb.from('brokers').update(patch).eq('user_id', user.id);
  if (error){ console.error('updateMyBroker:', error); throw new Error('Р—РјС–РЅРё РЅРµ Р·Р±РµСЂРµР¶РµРЅРѕ'); }
}

async function setMyServices(brokerId, services){
  const sb = await sbReady();
  await sb.from('broker_services').delete().eq('broker_id', brokerId);
  if (!services.length) return;
  const { error } = await sb.from('broker_services').insert(
    services.map(s => ({
      broker_id: brokerId,
      name: s.name,
      price_from: s.price_from ?? null,
      price_to: s.price_to ?? null
    })));
  if (error){ console.error('setMyServices:', error); throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ Р·Р±РµСЂРµРіС‚Рё РїРѕСЃР»СѓРіРё'); }
}

async function brokerStats(brokerId){
  const sb = await sbReady();
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const [{ count:total }, { count:month }, { count:fresh }] = await Promise.all([
    sb.from('requests').select('id', { count:'exact', head:true }).eq('broker_id', brokerId),
    sb.from('requests').select('id', { count:'exact', head:true }).eq('broker_id', brokerId).gte('created_at', monthStart.toISOString()),
    sb.from('requests').select('id', { count:'exact', head:true }).eq('broker_id', brokerId).eq('status','new')
  ]);
  return { total: total||0, month: month||0, fresh: fresh||0 };
}

/* ================= РџР†Р”РџРРЎРљРђ ================= */

async function myPayments(brokerId){
  const sb = await sbReady();
  const { data } = await sb.from('payments').select('*')
    .eq('broker_id', brokerId).order('created_at', { ascending:false }).limit(20);
  return data || [];
}

function planActive(broker){
  if (!broker || broker.plan === 'free') return false;
  if (!broker.plan_expires_at) return true;
  return new Date(broker.plan_expires_at) > new Date();
}

/**
 * Р“РѕС‚СѓС” РїР»Р°С‚С–Р¶ РЅР° СЃРµСЂРІРµСЂС– Р№ РІРµРґРµ РЅР° WayForPay.
 * РЎСѓРјСѓ СЂР°С…СѓС” edge-С„СѓРЅРєС†С–СЏ вЂ” Р· Р±СЂР°СѓР·РµСЂР° С—С— РїС–РґРјС–РЅРёС‚Рё РЅРµ РјРѕР¶РЅР°.
 */
async function startCheckout(planKey, period = 'month'){
  const session = await currentSession();
  if (!session) throw new Error('РЈРІС–Р№РґС–С‚СЊ Сѓ РєР°Р±С–РЅРµС‚, С‰РѕР± РѕС„РѕСЂРјРёС‚Рё РїС–РґРїРёСЃРєСѓ');
  if (!PLANS[planKey] || planKey === 'free') throw new Error('РћР±РµСЂС–С‚СЊ С‚Р°СЂРёС„');

  const res = await fetch(CHECKOUT_FN, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + session.access_token },
    body: JSON.stringify({ plan: planKey, period })
  });
  if (!res.ok) throw new Error('РћРїР»Р°С‚Р° С‚РёРјС‡Р°СЃРѕРІРѕ РЅРµРґРѕСЃС‚СѓРїРЅР°. РќР°РїРёС€С–С‚СЊ РЅР° ' + CONTACTS.email + ' вЂ” РІРёСЃС‚Р°РІРёРјРѕ СЂР°С…СѓРЅРѕРє');

  const fields = await res.json();
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://secure.wayforpay.com/pay';
  form.acceptCharset = 'utf-8';
  Object.entries(fields).forEach(([k,v]) => {
    (Array.isArray(v) ? v : [v]).forEach(val => {
      const i = document.createElement('input');
      i.type = 'hidden';
      i.name = Array.isArray(v) ? k + '[]' : k;
      i.value = val;
      form.appendChild(i);
    });
  });
  document.body.appendChild(form);
  form.submit();
}

/* ================= РљР›Р†Р„РќРў ================= */

async function getMyProfile(){
  const sb = await sbReady();
  const user = await currentUser();
  if (!user) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data || null;
}

async function updateMyProfile({ full_name, phone }){
  const sb = await sbReady();
  const user = await currentUser();
  if (!user) throw new Error('РЎРµСЃС–СЏ Р·Р°РІРµСЂС€РёР»Р°СЃСЊ');
  const { error } = await sb.from('profiles')
    .upsert({ id: user.id, full_name: full_name || null, phone: phone || null });
  if (error) throw new Error('Р—РјС–РЅРё РЅРµ Р·Р±РµСЂРµР¶РµРЅРѕ');
}

/* ================= РђР”РњР†Рќ ================= */

async function adminBrokers(){
  const sb = await sbReady();
  const { data, error } = await sb.from('brokers').select('*').order('created_at', { ascending:false });
  if (error) throw new Error('Р‘СЂРѕРєРµСЂРё РЅРµ Р·Р°РІР°РЅС‚Р°Р¶РёР»РёСЃСЊ: ' + error.message);
  return data || [];
}

async function adminRequests(){
  const sb = await sbReady();
  const { data, error } = await sb.from('requests')
    .select('*, brokers(name)').order('created_at', { ascending:false });
  if (error) throw new Error('Р—Р°СЏРІРєРё РЅРµ Р·Р°РІР°РЅС‚Р°Р¶РёР»РёСЃСЊ: ' + error.message);
  return data || [];
}

async function adminPayments(){
  const sb = await sbReady();
  const { data } = await sb.from('payments')
    .select('*, brokers(name)').order('created_at', { ascending:false }).limit(100);
  return data || [];
}

async function adminReviews(status = null){
  const sb = await sbReady();
  let q = sb.from('reviews').select('*, brokers(name)').order('created_at', { ascending:false });
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return data || [];
}

async function moderateReview(id, status, reason = ''){
  const sb = await sbReady();
  const { error } = await sb.from('reviews')
    .update({ status, rejection_reason: reason || null }).eq('id', id);
  if (error) throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ Р·РјС–РЅРёС‚Рё СЃС‚Р°С‚СѓСЃ РІС–РґРіСѓРєСѓ');
}

async function adminSetPlan(brokerId, plan){
  const sb = await sbReady();
  const patch = { plan };
  if (plan === 'free') patch.plan_expires_at = null;
  else { const d = new Date(); d.setMonth(d.getMonth()+1); patch.plan_expires_at = d.toISOString(); }
  const { error } = await sb.from('brokers').update(patch).eq('id', brokerId);
  if (error) throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ Р·РјС–РЅРёС‚Рё С‚Р°СЂРёС„');
}

async function adminSetVerified(brokerId, value){
  const sb = await sbReady();
  const { error } = await sb.from('brokers').update({ is_verified: value }).eq('id', brokerId);
  if (error) throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ Р·РјС–РЅРёС‚Рё РїРѕР·РЅР°С‡РєСѓ');
}

async function adminSetActive(brokerId, value){
  const sb = await sbReady();
  const { error } = await sb.from('brokers').update({ is_active: value }).eq('id', brokerId);
  if (error) throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ Р·РјС–РЅРёС‚Рё РІРёРґРёРјС–СЃС‚СЊ РїСЂРѕС„С–Р»СЋ');
}

async function adminDeleteBroker(brokerId){
  const sb = await sbReady();
  const { error } = await sb.from('brokers').delete().eq('id', brokerId);
  if (error) throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ РІРёРґР°Р»РёС‚Рё РїСЂРѕС„С–Р»СЊ');
}

/* ================= Р—РђРџР РћРЁР•РќРќРЇ Р‘Р РћРљР•Р Р†Р’ ================= */

const INVITE_FN = SUPABASE_URL + '/functions/v1/invite-broker';

/**
 * Р“РѕС‚СѓС” РїСЂРѕС„С–Р»СЊ Р±СЂРѕРєРµСЂР° С– РЅР°РґСЃРёР»Р°С” Р№РѕРјСѓ Р»РёСЃС‚-Р·Р°РїСЂРѕС€РµРЅРЅСЏ.
 * РџСЂРѕС„С–Р»СЊ Р»РёС€Р°С”С‚СЊСЃСЏ РїСЂРёС…РѕРІР°РЅРёРј, РґРѕРєРё Р±СЂРѕРєРµСЂ РЅРµ РїС–РґС‚РІРµСЂРґРёС‚СЊ РґР°РЅС–.
 */
async function inviteBroker(fields){
  const session = await currentSession();
  if (!session) throw new Error('РЎРµСЃС–СЏ Р·Р°РІРµСЂС€РёР»Р°СЃСЊ вЂ” СѓРІС–Р№РґС–С‚СЊ Р·РЅРѕРІСѓ');

  const res = await fetch(INVITE_FN, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + session.access_token },
    body: JSON.stringify(fields)
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok){
    const map = {
      unauthorized:    'РќРµРјР°С” РїСЂР°РІ. РЈРІС–Р№РґС–С‚СЊ СЏРє Р°РґРјС–РЅС–СЃС‚СЂР°С‚РѕСЂ',
      forbidden:       'Р¦РµР№ Р°РєР°СѓРЅС‚ РЅРµ РјР°С” РїСЂР°РІ Р°РґРјС–РЅС–СЃС‚СЂР°С‚РѕСЂР°',
      bad_email:       'Р’РєР°Р¶С–С‚СЊ РєРѕСЂРµРєС‚РЅРёР№ email',
      bad_name:        'Р’РєР°Р¶С–С‚СЊ РЅР°Р·РІСѓ РєРѕРјРїР°РЅС–С— Р°Р±Рѕ С–Рј\'СЏ',
      already_exists:  data.claimed ? 'РўР°РєРёР№ Р±СЂРѕРєРµСЂ СѓР¶Рµ С” РІ РєР°С‚Р°Р»РѕР·С–' : 'Р—Р°РїСЂРѕС€РµРЅРЅСЏ С†СЊРѕРјСѓ Р±СЂРѕРєРµСЂСѓ РІР¶Рµ РЅР°РґС–СЃР»Р°РЅРѕ',
      email_registered:'Р¦РµР№ email СѓР¶Рµ Р·Р°СЂРµС”СЃС‚СЂРѕРІР°РЅРёР№ РЅР° РїР»Р°С‚С„РѕСЂРјС–',
      invite_failed:   'Р›РёСЃС‚ РЅРµ РЅР°РґС–СЃР»Р°РІСЃСЏ. РџРµСЂРµРІС–СЂС‚Рµ email',
      profile_failed:  'РџСЂРѕС„С–Р»СЊ РЅРµ СЃС‚РІРѕСЂРµРЅРѕ'
    };
    throw new Error(map[data.error] || 'РќРµ РІРґР°Р»РѕСЃСЏ РЅР°РґС–СЃР»Р°С‚Рё Р·Р°РїСЂРѕС€РµРЅРЅСЏ');
  }
  return data;
}

/** Р—Р°РїСЂРѕС€РµРЅС–, СЏРєС– С‰Рµ РЅРµ РїС–РґС‚РІРµСЂРґРёР»Рё РїСЂРѕС„С–Р»СЊ. */
async function pendingInvites(){
  const sb = await sbReady();
  const { data } = await sb.from('brokers')
    .select('id, name, email, city, region, invited_at')
    .is('claimed_at', null)
    .order('invited_at', { ascending:false });
  return data || [];
}

/** РЎРєР°СЃСѓРІР°С‚Рё Р·Р°РїСЂРѕС€РµРЅРЅСЏ (РїСЂРѕС„С–Р»СЊ С‰Рµ РЅРµ РїС–РґС‚РІРµСЂРґР¶РµРЅРёР№). */
async function cancelInvite(brokerId){
  const sb = await sbReady();
  const { error } = await sb.from('brokers')
    .delete().eq('id', brokerId).is('claimed_at', null);
  if (error) throw new Error('РќРµ РІРґР°Р»РѕСЃСЏ СЃРєР°СЃСѓРІР°С‚Рё Р·Р°РїСЂРѕС€РµРЅРЅСЏ');
}
