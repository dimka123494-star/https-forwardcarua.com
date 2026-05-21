// =============================================
// db.js — всі функції для роботи з Supabase
// Один файл замість 4 окремих
// =============================================

// ---------- КАТАЛОГ ----------

async function loadBrokers({ region = '', service = '', search = '', sort = 'rating', filters = new Set() } = {}) {
  const sb = await sbReady();
  let query = sb
    .from('brokers')
    .select('id, name, city, region, plan, rating_avg, rating_count, experience, is_online, is_verified, broker_services(name, price_from)')
    .eq('is_active', true);

  if (region) query = query.eq('region', region);
  if (filters.has('online')) query = query.eq('is_online', true);
  if (filters.has('verified')) query = query.eq('is_verified', true);
  if (filters.has('top')) query = query.in('plan', ['pro', 'premium']);

  const { data, error } = await query;
  if (error) { console.error('loadBrokers:', error); return []; }

  let list = data || [];
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(b => b.name?.toLowerCase().includes(q) || b.city?.toLowerCase().includes(q) || b.broker_services?.some(s => s.name?.toLowerCase().includes(q)));
  }
  if (service) list = list.filter(b => b.broker_services?.some(s => s.name === service));
  if (filters.has('usa')) list = list.filter(b => b.broker_services?.some(s => s.name === 'Авто зі США'));

  const planOrder = { premium: 0, pro: 1, standard: 2, free: 3 };
  list.sort((a, b) => {
    const pd = (planOrder[a.plan] || 3) - (planOrder[b.plan] || 3);
    if (pd !== 0) return pd;
    if (sort === 'reviews') return (b.rating_count || 0) - (a.rating_count || 0);
    if (sort === 'exp') return (b.experience || 0) - (a.experience || 0);
    return (b.rating_avg || 0) - (a.rating_avg || 0);
  });
  return list;
}

async function loadBrokerById(id) {
  const sb = await sbReady();
  const { data } = await sb.from('brokers').select('*, broker_services(*)').eq('id', id).single();
  return data;
}

// ---------- ВІДГУКИ ----------

async function loadReviews(brokerId, { filter = 'all', sort = 'newest' } = {}) {
  const sb = await sbReady();
  let query = sb.from('reviews').select('*, review_replies(*)').eq('broker_id', brokerId).eq('status', 'published');
  if (filter !== 'all') query = query.eq('rating', Number(filter));
  query = sort === 'helpful' ? query.order('helpful_count', { ascending: false }) : query.order('created_at', { ascending: false });
  const { data, error } = await query;
  if (error) { console.error('loadReviews:', error); return []; }
  return data || [];
}

async function submitReview({ brokerId, authorName, rating, service, body }) {
  const sb = await sbReady();
  if (!authorName || !rating || !service || !body) throw new Error('Заповніть всі поля');
  if (body.length < 20) throw new Error('Текст відгуку мінімум 20 символів');
  const { error } = await sb.from('reviews').insert({ broker_id: brokerId, author_name: authorName, rating: Number(rating), service, body, status: 'pending' });
  if (error) throw new Error(error.message);
}

async function markHelpful(reviewId) {
  const sb = await sbReady();
  const key = 'hlp_' + reviewId;
  if (localStorage.getItem(key)) throw new Error('Вже позначено');
  const { data: rv } = await sb.from('reviews').select('helpful_count').eq('id', reviewId).single();
  const newCount = (rv?.helpful_count || 0) + 1;
  const { error } = await sb.from('reviews').update({ helpful_count: newCount }).eq('id', reviewId);
  if (error) throw new Error(error.message);
  localStorage.setItem(key, '1');
  return newCount;
}

async function replyToReview(reviewId, brokerId, body) {
  const sb = await sbReady();
  if (!body || body.length < 10) throw new Error('Мінімум 10 символів');
  const { error } = await sb.from('review_replies').upsert({ review_id: reviewId, broker_id: brokerId, body }, { onConflict: 'review_id' });
  if (error) throw new Error(error.message);
}

async function loadRatingSummary(brokerId) {
  const sb = await sbReady();
  const { data } = await sb.from('reviews').select('rating').eq('broker_id', brokerId).eq('status', 'published');
  const reviews = data || [];
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => counts[r.rating]++);
  const total = reviews.length;
  const avg = total ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  return { counts, total, avg };
}

// ---------- ЗАЯВКИ ----------

async function saveRequest(data) {
  const sb = await sbReady();
  const { error } = await sb.from('requests').insert({
    broker_id: data.broker === 'any' ? null : data.broker,
    service: data.svc,
    car_make: data.details?.make || null,
    car_model: data.details?.model || null,
    car_year: data.details?.year || null,
    car_country: data.details?.country || null,
    comment: data.details?.comment || null,
    urgency: data.urgency || null,
    client_name: data.contact.name,
    client_phone: data.contact.phone,
    client_telegram: data.contact.tg || null,
    client_email: data.contact.email || null,
    status: 'new'
  });
  if (error) throw new Error(error.message);
}

async function loadBrokerRequests(brokerId, status = null) {
  const sb = await sbReady();
  let query = sb.from('requests').select('*').eq('broker_id', brokerId).order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) { console.error('loadBrokerRequests:', error); return []; }
  return data || [];
}

async function updateRequestStatus(requestId, status) {
  const sb = await sbReady();
  await sb.from('requests').update({ status }).eq('id', requestId);
}

// ---------- КАБІНЕТ ----------

async function loadDashboard() {
  const user = await requireAuth();
  if (!user) return null;
  const sb = await sbReady();

  const { data: broker } = await sb.from('brokers').select('*, broker_services(*)').eq('user_id', user.id).single();
  if (!broker) { location.href = '/index.html'; return null; }

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const [{ count: reqMonth }, { count: reqNew }, { data: recentReqs }] = await Promise.all([
    sb.from('requests').select('*', { count: 'exact', head: true }).eq('broker_id', broker.id).gte('created_at', monthStart.toISOString()),
    sb.from('requests').select('*', { count: 'exact', head: true }).eq('broker_id', broker.id).eq('status', 'new'),
    sb.from('requests').select('*').eq('broker_id', broker.id).order('created_at', { ascending: false }).limit(5)
  ]);

  return { broker, stats: { views: broker.views_count || 0, reqMonth: reqMonth || 0, reqNew: reqNew || 0, rating: broker.rating_avg || 0, ratingCount: broker.rating_count || 0 }, recentRequests: recentReqs || [] };
}

async function updateBrokerProfile(updates) {
  const sb = await sbReady();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('brokers').update(updates).eq('user_id', user.id);
  if (error) throw new Error(error.message);
}

// ---------- ПЛАТЕЖІ ----------

async function savePayment({ brokerId, plan, amount, period, orderId, transactionId }) {
  const sb = await sbReady();
  await sb.from('payments').insert({ broker_id: brokerId, plan, amount, period, status: 'success', wayforpay_order_id: orderId, wayforpay_transaction_id: transactionId });
  const expires = new Date();
  expires.setMonth(expires.getMonth() + (period === 'yearly' ? 12 : 1));
  await sb.from('brokers').update({ plan, plan_expires_at: expires.toISOString() }).eq('id', brokerId);
}

async function loadPaymentHistory(brokerId) {
  const sb = await sbReady();
  const { data } = await sb.from('payments').select('*').eq('broker_id', brokerId).order('created_at', { ascending: false }).limit(10);
  return data || [];
}

// ---------- АДМІН ----------

async function loadAllReviews() {
  const sb = await sbReady();
  const { data } = await sb.from('reviews').select('*, brokers(name)').order('created_at', { ascending: false });
  return data || [];
}

async function moderateReview(reviewId, status, reason = '') {
  const sb = await sbReady();
  const { error } = await sb.from('reviews').update({ status, rejection_reason: reason || null }).eq('id', reviewId);
  if (error) throw new Error(error.message);
}
