// auth.js — реєстрація, вхід, захист кабінету

async function registerBroker({ name, city, region, experience, about, services, phone, telegram, email, password }) {
  const sb = await sbReady();
  const { data: authData, error: authError } = await sb.auth.signUp({
    email, password, options: { data: { name } }
  });
  if (authError) throw new Error(authError.message);

  const { data: broker, error: brokerError } = await sb
    .from('brokers')
    .insert({ user_id: authData.user.id, name, city, region, experience: Number(experience) || 0, about, phone, telegram, email, plan: 'free' })
    .select().single();
  if (brokerError) throw new Error(brokerError.message);

  if (services?.length) {
    await sb.from('broker_services').insert(
      services.map(s => ({ broker_id: broker.id, name: s.name, price_from: Number(s.priceFrom) || null }))
    );
  }
  return broker;
}

async function loginBroker(email, password) {
  const sb = await sbReady();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

async function logoutBroker() {
  const sb = await sbReady();
  await sb.auth.signOut();
  location.href = '/index.html';
}

async function getCurrentUser() {
  const sb = await sbReady();
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function getCurrentBroker() {
  const sb = await sbReady();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('brokers').select('*, broker_services(*)').eq('user_id', user.id).single();
  return data;
}

async function requireAuth(redirect = '/index.html') {
  const sb = await sbReady();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { location.href = redirect; return null; }
  return user;
}

// Підключення до форми реєстрації на index.html
async function submitRegistration() {
  const btn = document.getElementById('registerBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Реєстрація...'; }
  try {
    const services = [];
    document.querySelectorAll('.service-checkbox:checked').forEach(cb => {
      services.push({ name: cb.value, priceFrom: document.getElementById('priceFrom')?.value || 0 });
    });
    await registerBroker({
      name: document.getElementById('regName')?.value?.trim(),
      city: document.getElementById('regCity')?.value?.trim(),
      region: document.getElementById('regRegion')?.value,
      experience: document.getElementById('regExp')?.value,
      about: document.getElementById('regAbout')?.value?.trim(),
      services,
      phone: document.getElementById('regPhone')?.value?.trim(),
      telegram: document.getElementById('regTelegram')?.value?.trim(),
      email: document.getElementById('regEmail')?.value?.trim(),
      password: document.getElementById('regPassword')?.value,
    });
    showToast('✅ Реєстрація успішна! Перевірте email.', 'success');
    setTimeout(() => location.href = '/cabinet/dashboard.html', 2000);
  } catch (err) {
    showToast('❌ ' + err.message, 'danger');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Зареєструватись безкоштовно'; }
  }
}

async function submitLogin() {
  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;
  if (!email || !password) return showToast('❌ Введіть email і пароль', 'danger');
  try {
    await loginBroker(email, password);
    location.href = '/cabinet/dashboard.html';
  } catch (err) {
    showToast('❌ ' + err.message, 'danger');
  }
}
