/* =========================================================
   assets/js/db.js
   Єдиний шар доступу до бази. Сторінки не звертаються
   до Supabase напряму — тільки через ці функції.
   Назви колонок відповідають схемі після db-setup-full.sql.
   ========================================================= */

/* ================= АВТОРИЗАЦІЯ ================= */

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

/** Повертає користувача або відправляє на вхід. */
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
  if (!isValidEmail(email)) throw new Error('Вкажіть коректний email');
  if ((password || '').length < 8) throw new Error('Пароль має містити щонайменше 8 символів');
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
  if (!isValidEmail(email)) throw new Error('Вкажіть коректний email');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/vhid' });
  if (error) throw new Error('Не вдалося надіслати лист');
}

async function isAdmin(){
  const user = await currentUser();
  if (!user) return false;
  const sb = await sbReady();
  const { data } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  return !!data;
}

/** Роль визначається наявністю профілю брокера, а не метаданими:
    метадані користувач може підмінити при реєстрації. */
async function userRole(){
  const user = await currentUser();
  if (!user) return 'guest';
  if (await isAdmin()) return 'admin';
  const broker = await getMyBroker();
  return broker ? 'broker' : 'client';
}

function authMessage(m){
  if (/Invalid login/i.test(m))            return 'Невірний email або пароль';
  if (/already registered|User already/i.test(m)) return 'Цей email уже зареєстрований — увійдіть у кабінет';
  if (/Email not confirmed/i.test(m))      return 'Підтвердіть email — лист уже у вашій пошті';
  if (/Password/i.test(m))                 return 'Пароль надто короткий';
  if (/rate limit|too many/i.test(m))      return 'Забагато спроб. Спробуйте за кілька хвилин';
  return m || 'Сталася помилка';
}

/* ================= КАТАЛОГ ================= */

const BROKER_FIELDS = 'id, name, city, region, plan, plan_expires_at, rating_avg, rating_count, experience, is_verified, views_count, about, phone, telegram, whatsapp, viber, instagram, facebook, tiktok, youtube, created_at';

async function listBrokers({ region = '', city = '', service = '', search = '', sort = 'plan', verifiedOnly = false } = {}){
  const sb = await sbReady();
  let query = sb.from('brokers')
    .select(BROKER_FIELDS + ', broker_services(id, name, price_from, price_to)')
    .eq('is_active', true);

  if (region) query = query.eq('region', region);
  if (verifiedOnly) query = query.eq('is_verified', true);

  const { data, error } = await query;
  if (error){ console.error('listBrokers:', error); throw new Error('Не вдалося завантажити каталог'); }

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
  if (sessionStorage.getItem(key)) return;      // один перегляд за сесію
  sessionStorage.setItem(key, '1');
  await sb.rpc('increment_broker_views', { broker: brokerId }).catch(() => {});
}

/* ================= ЗАЯВКИ ================= */

/**
 * @param {object} p
 *   brokerId — id брокера або null («будь-який вільний»)
 *   service, comment, urgency
 *   car: { make, model, year, country }
 *   contact: { name, phone, telegram, email }
 */
async function createRequest(p){
  const sb = await sbReady();
  if (!p.contact?.name || p.contact.name.trim().length < 2) throw new Error('Вкажіть ім\'я');
  if (!isValidPhone(p.contact?.phone)) throw new Error('Вкажіть коректний номер телефону');

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
  if (error){ console.error('createRequest:', error); throw new Error('Заявку не надіслано. Спробуйте ще раз'); }
  track('generate_lead', { service: p.service || 'Загальний запит' });
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
  if (!REQUEST_STATUS[status]) throw new Error('Невідомий статус');
  const { error } = await sb.from('requests').update({ status }).eq('id', id);
  if (error) throw new Error('Не вдалося оновити статус');
}

/* ================= ВІДГУКИ ================= */

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

/** Відгуки брокера в кабінеті — включно з тими, що на модерації. */
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
  if (!authorName || authorName.trim().length < 2) throw new Error('Вкажіть ім\'я');
  if (!rating) throw new Error('Поставте оцінку');
  if (!service) throw new Error('Оберіть послугу');
  if (!body || body.trim().length < 20) throw new Error('Опишіть досвід — щонайменше 20 символів');

  const user = await currentUser();
  const { error } = await sb.from('reviews').insert({
    broker_id: brokerId,
    author_name: authorName.trim(),
    author_user_id: user?.id || null,
    rating: Number(rating),
    service, body: body.trim()
    // status ставить тригер у базі — завжди 'pending'
  });
  if (error){ console.error('submitReview:', error); throw new Error('Не вдалося надіслати відгук'); }
}

async function markHelpful(reviewId){
  const sb = await sbReady();
  const key = 'helpful_' + reviewId;
  if (localStorage.getItem(key)) throw new Error('Ви вже позначили цей відгук');
  const voter = (await currentUser())?.id || ('anon-' + reviewId + '-' + Math.random().toString(36).slice(2,10));
  const { data, error } = await sb.rpc('mark_review_helpful', { review: reviewId, voter });
  if (error) throw new Error('Не вдалося зарахувати голос');
  localStorage.setItem(key, '1');
  return data;
}

async function replyToReview(reviewId, brokerId, body){
  const sb = await sbReady();
  if (!body || body.trim().length < 10) throw new Error('Відповідь — щонайменше 10 символів');
  const { error } = await sb.from('review_replies')
    .upsert({ review_id: reviewId, broker_id: brokerId, body: body.trim() }, { onConflict:'review_id' });
  if (error){ console.error('replyToReview:', error); throw new Error('Не вдалося зберегти відповідь'); }
}

function ratingSummary(reviews){
  const counts = { 5:0, 4:0, 3:0, 2:0, 1:0 };
  (reviews || []).forEach(r => { if (counts[r.rating] !== undefined) counts[r.rating]++; });
  const total = (reviews || []).length;
  const avg = total ? reviews.reduce((s,r) => s + r.rating, 0) / total : 0;
  return { counts, total, avg };
}

/* ================= КАБІНЕТ БРОКЕРА ================= */

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
  if (!user) throw new Error('Спочатку увійдіть у кабінет');
  const { data, error } = await sb.from('brokers').insert({
    user_id: user.id,
    email: user.email,
    plan: 'free',
    is_active: true,
    ...fields
  }).select().single();
  if (error){
    console.error('createBrokerProfile:', error);
    if (/duplicate|unique/i.test(error.message)) throw new Error('Профіль брокера вже існує');
    throw new Error('Не вдалося створити профіль');
  }
  track('sign_up', { method:'broker' });
  return data;
}

/** Тариф, рейтинг і верифікацію звідси змінити не можна — блокує тригер у базі. */
async function updateMyBroker(updates){
  const sb = await sbReady();
  const user = await currentUser();
  if (!user) throw new Error('Сесія завершилась — увійдіть знову');
  const allowed = ['name','city','region','about','experience','phone','telegram',
                   'whatsapp','viber','instagram','facebook','tiktok','youtube'];
  const patch = {};
  allowed.forEach(k => { if (k in updates) patch[k] = updates[k] || null; });
  if (!patch.name || patch.name.trim().length < 2) throw new Error('Вкажіть ім\'я або назву компанії');

  const { error } = await sb.from('brokers').update(patch).eq('user_id', user.id);
  if (error){ console.error('updateMyBroker:', error); throw new Error('Зміни не збережено'); }
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
  if (error){ console.error('setMyServices:', error); throw new Error('Не вдалося зберегти послуги'); }
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

/* ================= ПІДПИСКА ================= */

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
 * Готує платіж на сервері й веде на WayForPay.
 * Суму рахує edge-функція — з браузера її підмінити не можна.
 */
async function startCheckout(planKey, period = 'month'){
  const session = await currentSession();
  if (!session) throw new Error('Увійдіть у кабінет, щоб оформити підписку');
  if (!PLANS[planKey] || planKey === 'free') throw new Error('Оберіть тариф');

  const res = await fetch(CHECKOUT_FN, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + session.access_token },
    body: JSON.stringify({ plan: planKey, period })
  });
  if (!res.ok) throw new Error('Оплата тимчасово недоступна. Напишіть на ' + CONTACTS.email + ' — виставимо рахунок');

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

/* ================= КЛІЄНТ ================= */

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
  if (!user) throw new Error('Сесія завершилась');
  const { error } = await sb.from('profiles')
    .upsert({ id: user.id, full_name: full_name || null, phone: phone || null });
  if (error) throw new Error('Зміни не збережено');
}

/* ================= АДМІН ================= */

async function adminBrokers(){
  const sb = await sbReady();
  const { data, error } = await sb.from('brokers').select('*').order('created_at', { ascending:false });
  if (error) throw new Error('Брокери не завантажились: ' + error.message);
  return data || [];
}

async function adminRequests(){
  const sb = await sbReady();
  const { data, error } = await sb.from('requests')
    .select('*, brokers(name)').order('created_at', { ascending:false });
  if (error) throw new Error('Заявки не завантажились: ' + error.message);
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
  if (error) throw new Error('Не вдалося змінити статус відгуку');
}

async function adminSetPlan(brokerId, plan){
  const sb = await sbReady();
  const patch = { plan };
  if (plan === 'free') patch.plan_expires_at = null;
  else { const d = new Date(); d.setMonth(d.getMonth()+1); patch.plan_expires_at = d.toISOString(); }
  const { error } = await sb.from('brokers').update(patch).eq('id', brokerId);
  if (error) throw new Error('Не вдалося змінити тариф');
}

async function adminSetVerified(brokerId, value){
  const sb = await sbReady();
  const { error } = await sb.from('brokers').update({ is_verified: value }).eq('id', brokerId);
  if (error) throw new Error('Не вдалося змінити позначку');
}

async function adminSetActive(brokerId, value){
  const sb = await sbReady();
  const { error } = await sb.from('brokers').update({ is_active: value }).eq('id', brokerId);
  if (error) throw new Error('Не вдалося змінити видимість профілю');
}

async function adminDeleteBroker(brokerId){
  const sb = await sbReady();
  const { error } = await sb.from('brokers').delete().eq('id', brokerId);
  if (error) throw new Error('Не вдалося видалити профіль');
}

/* ================= ЗАПРОШЕННЯ БРОКЕРІВ ================= */

const INVITE_FN = SUPABASE_URL + '/functions/v1/invite-broker';

/**
 * Готує профіль брокера і надсилає йому лист-запрошення.
 * Профіль лишається прихованим, доки брокер не підтвердить дані.
 */
async function inviteBroker(fields){
  const session = await currentSession();
  if (!session) throw new Error('Сесія завершилась — увійдіть знову');

  const res = await fetch(INVITE_FN, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + session.access_token },
    body: JSON.stringify(fields)
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok){
    const map = {
      unauthorized:    'Немає прав. Увійдіть як адміністратор',
      forbidden:       'Цей акаунт не має прав адміністратора',
      bad_email:       'Вкажіть коректний email',
      bad_name:        'Вкажіть назву компанії або ім\'я',
      already_exists:  data.claimed ? 'Такий брокер уже є в каталозі' : 'Запрошення цьому брокеру вже надіслано',
      email_registered:'Цей email уже зареєстрований на платформі',
      invite_failed:   'Лист не надіслався. Перевірте email',
      profile_failed:  'Профіль не створено'
    };
    throw new Error(map[data.error] || 'Не вдалося надіслати запрошення');
  }
  return data;
}

/** Запрошені, які ще не підтвердили профіль. */
async function pendingInvites(){
  const sb = await sbReady();
  const { data } = await sb.from('brokers')
    .select('id, name, email, city, region, invited_at')
    .is('claimed_at', null)
    .order('invited_at', { ascending:false });
  return data || [];
}

/** Скасувати запрошення (профіль ще не підтверджений). */
async function cancelInvite(brokerId){
  const sb = await sbReady();
  const { error } = await sb.from('brokers')
    .delete().eq('id', brokerId).is('claimed_at', null);
  if (error) throw new Error('Не вдалося скасувати запрошення');
}
