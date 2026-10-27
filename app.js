/* ==========================================================================
   FITFORGE — APPLICATION ENGINE & LOGIC
   Preserves 100% of Existing APIs, Data Sync & Modern Interactivity
   ========================================================================== */

const $ = id => document.getElementById(id);
let authMode = 'login', authStep = 'form', currentUser = null;

// Core Views & Navigation
let currentMainView = 'landing'; // 'landing' or 'app'

function showView(view) {
  currentMainView = view;
  const landing = $('landingView');
  const app = $('appView');
  
  if (view === 'landing') {
    if (landing) landing.classList.add('active');
    if (app) app.classList.remove('active');
    document.querySelectorAll('.nav-link-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === 'home');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    if (landing) landing.classList.remove('active');
    if (app) app.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function go(page) {
  showView('app');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = $('page-' + page);
  if (target) target.classList.add('active');
  
  document.querySelectorAll('.nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  document.querySelectorAll('.nav-link-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === page);
  });
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (page === 'nutrition') renderFoods();
  if (page === 'progress') renderWeights();
  if (page === 'workouts') renderWorkouts();
  if (page === 'premiumtools') renderBodyEntries();
}

// --------------------------------------------------------------------------
// AUTHENTICATION & PROFILE
// --------------------------------------------------------------------------
function openAuth() {
  if (currentUser) {
    if (confirm(tr('Sign out of FitForge?', 'تسجيل الخروج من FitForge؟'))) {
      localStorage.removeItem('fitforge-token');
      currentUser = null;
      clearAccountLocalData();
      updateAccountUI();
      openAuth();
    }
    return;
  }
  $('authModal').style.display = 'grid';
  resetAuth('login');
}

function closeAuth() { $('authModal').style.display = 'none'; }

function resetAuth(mode = 'login') {
  authMode = mode;
  authStep = 'form';
  $('authSubmit').type = 'submit';
  $('authSubmit').onclick = null;
  $('authForm').reset();
  $('authEmail').readOnly = false;
  $('authCode').required = false;
  $('authPassword').required = mode === 'login';
  $('authConfirmPassword').required = false;
  $('authError').textContent = '';
  $('authNameField').style.display = mode === 'register' ? 'block' : 'none';
  $('authEmailField').style.display = 'block';
  $('authCodeField').style.display = 'none';
  $('authPasswordField').style.display = mode === 'login' ? 'block' : 'none';
  $('authConfirmField').style.display = 'none';
  $('authForgot').style.display = mode === 'login' ? 'block' : 'none';
  $('authResend').style.display = 'none';
  $('authSwitch').style.display = 'block';
  $('authBack').style.display = 'none';
  $('authSubmit').disabled = false;
  $('authSubmit').textContent = mode === 'login' ? tr('Sign in', 'تسجيل الدخول') : tr('Send verification code', 'إرسال رمز التحقق');
  $('authTitle').textContent = mode === 'login' ? tr('Welcome back', 'أهلاً بك مجدداً') : tr('Create your account', 'إنشاء حساب جديد');
  $('authSubtitle').textContent = mode === 'login' ? tr('Sign in with your email and password.', 'سجّل دخولك بالبريد الإلكتروني وكلمة المرور.') : tr('Enter your name and email to receive a verification code.', 'اكتب اسمك وبريدك الإلكتروني لاستلام كود التحقق.');
  $('authSwitch').textContent = mode === 'login' ? tr('New to FitForge? Create an account', 'جديد في FitForge؟ أنشئ حساباً') : tr('Already have an account? Sign in', 'لديك حساب بالفعل؟ سجّل دخولك');
}

function toggleAuthMode() { resetAuth(authMode === 'login' ? 'register' : 'login'); }
function backToAuth() { resetAuth('login'); }

function updateAccountUI() {
  if (currentUser) {
    $('welcomeName').textContent = 'Hi, ' + currentUser.name + '!';
    $('userAvatar').textContent = (currentUser.name || 'F').trim().charAt(0).toUpperCase();
    if ($('userAvatarHeader')) $('userAvatarHeader').textContent = (currentUser.name || 'F').trim().charAt(0).toUpperCase();
    if ($('welcomeNameHeader')) $('welcomeNameHeader').textContent = currentUser.name;
    $('authModal').style.display = 'none';
  } else {
    const txt = state.lang === 'ar' ? 'تسجيل الدخول' : 'Sign in';
    $('welcomeName').textContent = txt;
    $('userAvatar').textContent = 'F';
    if ($('userAvatarHeader')) $('userAvatarHeader').textContent = 'F';
    if ($('welcomeNameHeader')) $('welcomeNameHeader').textContent = txt;
  }
}

async function authRequest(path, payload) {
  const r = await fetch('/api/auth/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Something went wrong.');
  return d;
}

function authError(message) { $('authError').textContent = message; }

$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  authError('');
  $('authSubmit').disabled = true;
  const email = $('authEmail').value.trim().toLowerCase();
  
  try {
    if (authMode === 'login') {
      const d = await authRequest('login', { email, password: $('authPassword').value });
      localStorage.setItem('fitforge-token', d.token);
      currentUser = d.user;
      await syncAccountDataOnLogin();
      updateAccountUI();
      toast(tr('Welcome back, ', 'أهلاً بك مجدداً، ') + currentUser.name + '!');
      return;
    }
    if (authMode === 'register' && authStep === 'form') {
      await authRequest('register/start', { name: $('authName').value.trim(), email });
      authStep = 'code';
      $('authNameField').style.display = 'none';
      $('authEmail').readOnly = true;
      $('authCodeField').style.display = 'block';
      $('authPasswordField').style.display = 'none';
      $('authConfirmField').style.display = 'none';
      $('authForgot').style.display = 'none';
      $('authResend').style.display = 'block';
      $('authSwitch').style.display = 'none';
      $('authSubmit').textContent = tr('Verify code', 'تأكيد الرمز');
      $('authTitle').textContent = tr('Check your inbox', 'راجع بريدك الإلكتروني');
      $('authSubtitle').textContent = tr('Enter the 6-digit code sent to your email.', 'أدخل الرمز المكون من 6 أرقام المرسل لبريدك.');
      $('authCode').required = true;
      $('authCode').focus();
      authError(tr('Verification code sent. Check your inbox and spam folder.', 'تم إرسال كود التحقق. راجع البريد الوارد أو غير الهام.'));
      return;
    }
    if (authMode === 'register' && authStep === 'code') {
      await authRequest('register/check-code', { email, code: $('authCode').value.trim() });
      authStep = 'password';
      $('authCodeField').style.display = 'none';
      $('authPasswordField').style.display = 'block';
      $('authConfirmField').style.display = 'block';
      $('authResend').style.display = 'none';
      $('authSubmit').textContent = tr('Create account', 'إنشاء الحساب');
      $('authTitle').textContent = tr('Create your password', 'أنشئ كلمة المرور');
      $('authSubtitle').textContent = tr('Choose a password of at least 8 characters.', 'اختر كلمة مرور من 8 خانات على الأقل.');
      $('authPassword').required = true;
      $('authConfirmPassword').required = true;
      $('authPassword').value = '';
      $('authConfirmPassword').value = '';
      $('authPassword').focus();
      return;
    }
    if (authMode === 'register' && authStep === 'password') {
      if ($('authPassword').value.length < 8) throw new Error('Password must be at least 8 characters.');
      if ($('authPassword').value !== $('authConfirmPassword').value) throw new Error('Passwords do not match. Please enter the same password twice.');
      await authRequest('register/verify', {
        email,
        code: $('authCode').value.trim(),
        password: $('authPassword').value,
        confirmPassword: $('authConfirmPassword').value
      });
      resetAuth('login');
      $('authEmail').value = email;
      authError(tr('Account created successfully! Now sign in.', 'تم إنشاء الحساب بنجاح! سجّل دخولك الآن.'));
      toast(tr('Account created — now sign in!', 'تم إنشاء الحساب — سجّل دخولك الآن!'));
      return;
    }
    if (authMode === 'forgot' && authStep === 'verify') {
      if ($('authPassword').value !== $('authConfirmPassword').value) throw new Error('Passwords do not match.');
      await authRequest('forgot/reset', {
        email,
        code: $('authCode').value.trim(),
        password: $('authPassword').value,
        confirmPassword: $('authConfirmPassword').value
      });
      resetAuth('login');
      $('authEmail').value = email;
      authError(tr('Password changed successfully. Sign in now.', 'تم تغيير كلمة المرور بنجاح. سجّل دخولك الآن.'));
      return;
    }
  } catch (err) {
    authError(err.message);
  } finally {
    $('authSubmit').disabled = false;
  }
});

async function resendVerificationCode() {
  authError('');
  $('authResend').disabled = true;
  try {
    const name = $('authName').value.trim();
    const email = $('authEmail').value.trim().toLowerCase();
    await authRequest('register/resend', { name, email });
    authError(tr('A new code has been sent.', 'تم إرسال رمز جديد.'));
  } catch (err) {
    authError(err.message);
  } finally {
    $('authResend').disabled = false;
  }
}

async function startForgotPassword() {
  authMode = 'forgot';
  authStep = 'email';
  $('authSubmit').type = 'button';
  $('authError').textContent = '';
  $('authNameField').style.display = 'none';
  $('authCodeField').style.display = 'none';
  $('authPasswordField').style.display = 'none';
  $('authConfirmField').style.display = 'none';
  $('authForgot').style.display = 'none';
  $('authSwitch').style.display = 'none';
  $('authBack').style.display = 'block';
  $('authEmailField').style.display = 'block';
  $('authEmail').required = true;
  $('authTitle').textContent = tr('Reset password', 'استعادة كلمة المرور');
  $('authSubtitle').textContent = tr('Enter your account email to receive a reset code.', 'اكتب بريدك الإلكتروني لاستلام كود الاستعادة.');
  $('authSubmit').textContent = tr('Send reset code', 'إرسال كود الاستعادة');
  $('authSubmit').onclick = async () => {
    authError('');
    $('authSubmit').disabled = true;
    try {
      const email = $('authEmail').value.trim().toLowerCase();
      await authRequest('forgot/start', { email });
      authStep = 'verify';
      $('authSubmit').type = 'submit';
      $('authCodeField').style.display = 'block';
      $('authPasswordField').style.display = 'block';
      $('authConfirmField').style.display = 'block';
      $('authPassword').required = true;
      $('authConfirmPassword').required = true;
      $('authCode').required = true;
      $('authPassword').value = '';
      $('authConfirmPassword').value = '';
      $('authSubmit').textContent = tr('Reset password', 'تغيير كلمة المرور');
      $('authSubmit').onclick = null;
    } catch (err) {
      authError(err.message);
    } finally {
      $('authSubmit').disabled = false;
    }
  };
}

// --------------------------------------------------------------------------
// DATA PERSISTENCE & ACCOUNT SYNC
// --------------------------------------------------------------------------
const ACCOUNT_DATA_KEYS = ['fitforge-v1', 'fitforge-custom-foods', 'fitforge-custom-week', 'fitforge-body-entries'];
let accountSyncTimer = null, accountSyncBusy = false, accountSyncAgain = false, loadingAccountData = false;

function collectAccountData() {
  const data = {};
  for (const key of ACCOUNT_DATA_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      try { data[key] = JSON.parse(value); } catch {}
    }
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && /^fitforge-week-plan:[^\\/]{1,254}$/.test(key)) {
      try { data[key] = JSON.parse(localStorage.getItem(key)); } catch {}
    }
  }
  return data;
}

function applyAccountData(data) {
  loadingAccountData = true;
  try {
    for (const key of ACCOUNT_DATA_KEYS) localStorage.removeItem(key);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && /^fitforge-week-plan:[^\\/]{1,254}$/.test(key)) localStorage.removeItem(key);
    }
    for (const [key, value] of Object.entries(data || {})) {
      if (ACCOUNT_DATA_KEYS.includes(key) || /^fitforge-week-plan:[^\\/]{1,254}$/.test(key)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    }
    const saved = JSON.parse(localStorage.getItem('fitforge-v1') || '{}');
    state = { ...defaultState, ...saved, profile: { ...defaultState.profile, ...(saved.profile || {}) } };
    state.foods = Array.isArray(state.foods) ? state.foods : [];
    state.weights = Array.isArray(state.weights) ? state.weights : [];
    state.workouts = Array.isArray(state.workouts) ? state.workouts : [];
    initLanguage();
    renderAll();
  } finally {
    loadingAccountData = false;
  }
}

async function saveAccountDataNow() {
  if (!currentUser || loadingAccountData) return;
  const token = localStorage.getItem('fitforge-token');
  if (!token) return;
  if (accountSyncBusy) {
    accountSyncAgain = true;
    return;
  }
  accountSyncBusy = true;
  try {
    await fetch('/api/account/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ data: collectAccountData() })
    });
  } catch (err) {
    console.error('FitForge account sync failed:', err);
  } finally {
    accountSyncBusy = false;
    if (accountSyncAgain) {
      accountSyncAgain = false;
      scheduleAccountSync();
    }
  }
}

function scheduleAccountSync() {
  if (!currentUser || loadingAccountData) return;
  clearTimeout(accountSyncTimer);
  accountSyncTimer = setTimeout(saveAccountDataNow, 600);
}

function saveAccountLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  scheduleAccountSync();
}

async function syncAccountDataOnLogin() {
  const token = localStorage.getItem('fitforge-token');
  if (!token || !currentUser) return;
  try {
    const r = await fetch('/api/account/data', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    if (r.ok && d.data && Object.keys(d.data).length) {
      applyAccountData(d.data);
      toast(tr('Your saved FitForge data has been synced.', 'تمت مزامنة بياناتك المحفوظة بنجاح.'));
    } else {
      await saveAccountDataNow();
      renderAll();
    }
  } catch (err) {
    console.error('FitForge account data load failed:', err);
  }
}

function clearAccountLocalData() {
  clearTimeout(accountSyncTimer);
  for (const key of ACCOUNT_DATA_KEYS) localStorage.removeItem(key);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && /^fitforge-week-plan:[^\\/]{1,254}$/.test(key)) localStorage.removeItem(key);
  }
  state = { ...defaultState, profile: { ...defaultState.profile }, foods: [], weights: [], workouts: [] };
  renderAll();
}

// --------------------------------------------------------------------------
// DEFAULT APP STATE & FOOD DATABASE
// --------------------------------------------------------------------------
const defaultState = {
  lang: 'en',
  profile: { age: 22, sex: 'male', height: 175, weight: 68, activity: 1.55, goal: 'bulk', target: 72, calories: 2400, protein: 150, carbs: 280, fats: 75 },
  foods: [],
  weights: [],
  workouts: []
};

let state;
try {
  state = { ...defaultState, ...JSON.parse(localStorage.getItem('fitforge-v1') || '{}') };
  state.profile = { ...defaultState.profile, ...(state.profile || {}) };
  state.foods = state.foods || [];
  state.weights = state.weights || [];
  state.workouts = state.workouts || [];
} catch (e) {
  state = structuredClone(defaultState);
}

const foods = [
  { id: 'egg', en: 'Whole egg, cooked', ar: 'بيضة كاملة مطهية', kcal: 155, p: 13, c: 1.1, f: 11.0 },
  { id: 'eggwhite', en: 'Egg white', ar: 'بياض البيض', kcal: 52, p: 10.9, c: 0.7, f: 0.2 },
  { id: 'chicken', en: 'Chicken breast, cooked', ar: 'صدر فراخ مطهي', kcal: 165, p: 31, c: 0, f: 3.6 },
  { id: 'rice', en: 'White rice, cooked', ar: 'رز أبيض مطهي', kcal: 130, p: 2.7, c: 28.2, f: 0.3 },
  { id: 'koshari', en: 'Koshari, average', ar: 'كشري مصري', kcal: 160, p: 5, c: 27, f: 3.2 },
  { id: 'ful', en: 'Fava beans, cooked', ar: 'فول مدمس', kcal: 110, p: 7.6, c: 19.7, f: 0.4 },
  { id: 'baladibread', en: 'Baladi bread', ar: 'عيش بلدي مصري', kcal: 270, p: 9, c: 55, f: 2 },
  { id: 'taameya', en: 'Taameya / falafel, fried', ar: 'طعمية مقلية', kcal: 333, p: 13, c: 32, f: 18 },
  { id: 'potato', en: 'French fries', ar: 'بطاطس محمرة', kcal: 312, p: 3.4, c: 41, f: 15 },
  { id: 'potatoboiled', en: 'Potato, boiled', ar: 'بطاطس مسلوقة', kcal: 87, p: 1.9, c: 20.1, f: 0.1 },
  { id: 'banana', en: 'Banana', ar: 'موز', kcal: 89, p: 1.1, c: 22.8, f: 0.3 },
  { id: 'apple', en: 'Apple', ar: 'تفاح', kcal: 52, p: 0.3, c: 13.8, f: 0.2 },
  { id: 'yogurt', en: 'Plain yogurt', ar: 'زبادي سادة', kcal: 61, p: 3.5, c: 4.7, f: 3.3 },
  { id: 'milk', en: 'Whole milk', ar: 'لبن كامل الدسم', kcal: 61, p: 3.2, c: 4.8, f: 3.3 },
  { id: 'oats', en: 'Oats, dry', ar: 'شوفان جاف', kcal: 389, p: 16.9, c: 66.3, f: 6.9 },
  { id: 'tuna', en: 'Tuna in water, drained', ar: 'تونة مصفاة', kcal: 116, p: 25.5, c: 0, f: 0.8 },
  { id: 'beef', en: 'Beef, lean cooked', ar: 'لحم بقري قليل الدهن', kcal: 217, p: 26, c: 0, f: 12 },
  { id: 'lentils', en: 'Lentils, cooked', ar: 'عدس مطهي', kcal: 116, p: 9, c: 20, f: 0.4 },
  { id: 'pasta', en: 'Pasta, cooked', ar: 'مكرونة مسلوقة', kcal: 158, p: 5.8, c: 30.9, f: 0.9 },
  { id: 'peanutbutter', en: 'Peanut butter', ar: 'زبدة فول سوداني', kcal: 588, p: 25, c: 20, f: 50 },
  { id: 'molokhia', en: 'Molokhia cooked', ar: 'ملوخية مطهية', kcal: 55, p: 4, c: 7, f: 1 },
  { id: 'shawarma', en: 'Chicken shawarma', ar: 'شاورما فراخ', kcal: 215, p: 20, c: 8, f: 11 }
];

function persist() {
  localStorage.setItem('fitforge-v1', JSON.stringify(state));
  scheduleAccountSync();
  renderAll();
}

function tr(en, ar) { return state.lang === 'ar' ? ar : en; }
function fmt(n) { return Math.round(n).toLocaleString(state.lang === 'ar' ? 'ar-EG' : 'en-US'); }

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2600);
}

function today() { return new Date().toISOString().slice(0, 10); }

function daily() {
  return state.foods.filter(f => f.date === today()).reduce((a, f) => ({
    kcal: a.kcal + f.kcal,
    p: a.p + f.p,
    c: a.c + f.c,
    f: a.f + f.f
  }), { kcal: 0, p: 0, c: 0, f: 0 });
}

// --------------------------------------------------------------------------
// DASHBOARD RENDERING & CONCENTRIC ACTIVITY RINGS
// --------------------------------------------------------------------------
function renderDashboard() {
  let d = daily(), p = state.profile, remain = p.calories - d.kcal;
  if ($('heroCalories')) $('heroCalories').textContent = fmt(p.calories);
  if ($('eaten')) $('eaten').textContent = fmt(d.kcal);
  if ($('remaining')) $('remaining').textContent = remain >= 0 ? fmt(remain) + ' ' + tr('left', 'متبقية') : fmt(-remain) + ' ' + tr('over target', 'زيادة عن الهدف');
  
  const calPercent = Math.min(100, Math.round(d.kcal / Math.max(1, p.calories) * 100));
  if ($('calPct')) $('calPct').textContent = calPercent + '%';
  if ($('calBar')) $('calBar').style.width = calPercent + '%';
  
  const proPercent = Math.min(100, Math.round(d.p / Math.max(1, p.protein) * 100));
  if ($('protein')) $('protein').textContent = fmt(d.p);
  if ($('proteinGoal')) $('proteinGoal').textContent = fmt(p.protein);
  if ($('proteinBar')) $('proteinBar').style.width = proPercent + '%';
  if ($('proteinPct')) $('proteinPct').textContent = proPercent + '%';
  
  const currentW = (state.weights.length ? state.weights[state.weights.length - 1].weight : p.weight);
  if ($('currentWeight')) $('currentWeight').textContent = currentW.toFixed(1);
  if ($('weightChange')) $('weightChange').textContent = state.weights.length > 1 ? (state.weights.at(-1).weight - state.weights[0].weight > 0 ? '+' : '') + (state.weights.at(-1).weight - state.weights[0].weight).toFixed(1) + ' kg' : '—';
  if ($('workoutCount')) $('workoutCount').textContent = state.workouts.length;

  [['mProteinBar', d.p, p.protein], ['mCarbBar', d.c, p.carbs], ['mFatBar', d.f, p.fats]].forEach(([id, v, g]) => {
    if ($(id)) $(id).style.width = Math.min(100, v / Math.max(1, g) * 100) + '%';
  });
  if ($('mProtein')) $('mProtein').textContent = fmt(d.p) + ' / ' + fmt(p.protein) + 'g';
  if ($('mCarbs')) $('mCarbs').textContent = fmt(d.c) + ' / ' + fmt(p.carbs) + 'g';
  if ($('mFats')) $('mFats').textContent = fmt(d.f) + ' / ' + fmt(p.fats) + 'g';

  // Update Concentric Rings (Pulse inspired)
  const ringCal = $('ringProgressCal');
  const ringPro = $('ringProgressPro');
  if (ringCal) {
    const circumference = 2 * Math.PI * 70; // radius 70
    const offset = circumference - (calPercent / 100) * circumference;
    ringCal.style.strokeDashoffset = offset;
  }
  if (ringPro) {
    const circumference = 2 * Math.PI * 52; // radius 52
    const offset = circumference - (proPercent / 100) * circumference;
    ringPro.style.strokeDashoffset = offset;
  }
  const scoreVal = Math.min(1000, Math.round((calPercent * 0.5 + proPercent * 0.5) * 10));
  if ($('ringTotalScore')) $('ringTotalScore').textContent = scoreVal;
}

// --------------------------------------------------------------------------
// NUTRITION & FOOD LOGS
// --------------------------------------------------------------------------
function renderFoods() {
  const q = ($('foodSearch')?.value || '').trim().toLowerCase();
  const grams = Math.max(1, Number($('foodGrams')?.value) || 100);
  const custom = JSON.parse(localStorage.getItem('fitforge-custom-foods') || '[]');
  const all = [...foods, ...custom];
  const matches = all.filter(f => (f.en + ' ' + f.ar).toLowerCase().includes(q)).slice(0, 18);
  
  if ($('foodList')) {
    $('foodList').innerHTML = matches.map(f => {
      let k = Math.round(f.kcal * grams / 100), p = (f.p * grams / 100), c = (f.c * grams / 100), fat = (f.f * grams / 100);
      return `<div class="fooditem">
        <div style="flex:1;min-width:0">
          <strong>${state.lang === 'ar' ? f.ar : f.en}</strong>
          <small>${grams} g · P ${p.toFixed(1)}g · C ${c.toFixed(1)}g · F ${fat.toFixed(1)}g</small>
        </div>
        <div style="text-align:right">
          <div class="kcal">${k} kcal</div>
          <button class="btn sm" style="margin-top:4px" onclick="addFoodGrams('${f.id}',${grams})">${tr('Add +', 'إضافة +')}</button>
        </div>
      </div>`;
    }).join('') || `<div class="empty">${tr('No match. Try another food name.', 'لم يتم العثور على نتائج. ابحث باسم آخر.')}</div>`;
  }

  const todayFoods = state.foods.filter(f => f.date === today());
  if ($('foodLog')) {
    $('foodLog').innerHTML = todayFoods.map(f => `<div class="rowitem">
      <div>
        <strong>${state.lang === 'ar' ? f.ar : f.en}</strong>
        <small>${f.grams ? f.grams + ' g · ' : ''}${f.kcal} kcal · P ${f.p}g · C ${f.c}g · F ${f.f}g · ${f.time || ''}</small>
      </div>
      <button onclick="removeFood('${f.uid}')">${tr('Remove', 'حذف')}</button>
    </div>`).join('') || `<div class="empty">${tr('Your day is clear. Add your first food above.', 'لا توجد وجبات مسجلة اليوم.')}</div>`;
  }

  const d = daily();
  if ($('dayKcal')) $('dayKcal').textContent = fmt(d.kcal) + ' kcal';
  if ($('dayProtein')) $('dayProtein').textContent = fmt(d.p) + ' g';
  if ($('dayCarbs')) $('dayCarbs').textContent = fmt(d.c) + ' g';
  if ($('dayFat')) $('dayFat').textContent = fmt(d.f) + ' g';
}

function addFoodGrams(id, grams) {
  const custom = JSON.parse(localStorage.getItem('fitforge-custom-foods') || '[]');
  const f = [...foods, ...custom].find(x => x.id === id);
  if (!f) return;
  const m = grams / 100;
  state.foods.push({
    id: f.id,
    en: f.en,
    ar: f.ar,
    grams,
    kcal: Math.round(f.kcal * m),
    p: Math.round(f.p * m * 10) / 10,
    c: Math.round(f.c * m * 10) / 10,
    f: Math.round(f.f * m * 10) / 10,
    uid: Date.now().toString() + Math.random(),
    date: today(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  persist();
  toast(tr('Added to today', 'تمت الإضافة لوجبات اليوم'));
}

function removeFood(uid) {
  state.foods = state.foods.filter(f => f.uid !== uid);
  persist();
}

function clearFoods() {
  state.foods = state.foods.filter(f => f.date !== today());
  persist();
  toast(tr('Today’s food log cleared', 'تم مسح وجبات اليوم'));
}

function addCustomFood() {
  const name = $('customFoodName')?.value.trim(),
    kcal = Number($('customKcal')?.value),
    p = Number($('customP')?.value) || 0,
    c = Number($('customC')?.value) || 0,
    f = Number($('customF')?.value) || 0;
  if (!name || !Number.isFinite(kcal) || kcal < 0) {
    toast(tr('Enter food name and calories', 'اكتب اسم الأكلة والسعرات'));
    return;
  }
  const arr = JSON.parse(localStorage.getItem('fitforge-custom-foods') || '[]');
  arr.push({ id: 'custom-' + Date.now(), en: name, ar: name, kcal, p, c, f });
  saveAccountLocal('fitforge-custom-foods', arr);
  if ($('customFoodName')) $('customFoodName').value = '';
  if ($('foodSearch')) $('foodSearch').value = name;
  renderFoods();
  toast(tr('Custom food added', 'تمت إضافة الأكلة لقاعدتك'));
}

// --------------------------------------------------------------------------
// AI FOOD VISION SCANNER
// --------------------------------------------------------------------------
async function analyzeMeal() {
  const file = $('mealImage')?.files[0];
  if (!file) { toast(tr('Choose a food photo first', 'اختر صورة الأكل أولاً')); return; }
  
  const btn = $('analyzeBtn'), out = $('scanResult');
  btn.disabled = true;
  btn.style.opacity = '.65';
  btn.textContent = tr('Analyzing photo with AI…', 'جاري تحليل الصورة بالذكاء الاصطناعي…');
  out.innerHTML = `<div class="result"><div class="resultnum">…</div>${tr('AI is identifying ingredients and estimating portions.', 'الذكاء الاصطناعي يتعرف على الأكل ويقدّر الكميات.')}</div>`;

  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/analyze-food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, language: state.lang })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Analysis failed');
    const items = Array.isArray(data.items) ? data.items : [];
    
    if (data.is_food === false || !items.length) {
      out.innerHTML = `<div class="result"><strong style="color:var(--coral)">${tr('No food detected', 'لم يتم التعرف على طعام في الصورة')}</strong><p style="margin-top:6px">${String(data.notes || 'Please upload a clear food photo.').replace(/[<>&]/g, '')}</p></div>`;
      window.lastAiMeal = null;
      return;
    }

    const sum = items.reduce((a, x) => ({
      calories: a.calories + Number(x.calories || 0),
      protein: a.protein + Number(x.protein_g || 0),
      carbs: a.carbs + Number(x.carbs_g || 0),
      fat: a.fat + Number(x.fat_g || 0)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    window.lastAiMeal = { name: data.meal_name || tr('Photo meal', 'وجبة من الصورة'), items, sum };

    const itemsHtml = items.map((x, i) => `<div class="rowitem" style="align-items:center;gap:12px">
      <div style="flex:1;min-width:0">
        <strong>${esc(x.name)}</strong>
        <small>${tr('Per 100g', 'لكل 100 جرام')}: ${Math.round(x.calories_per_100g || 0)} kcal · P ${Math.round(x.protein_per_100g || 0)}g · C ${Math.round(x.carbs_per_100g || 0)}g · F ${Math.round(x.fat_per_100g || 0)}g</small>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px">
          ${tr('Weight (g)', 'الوزن (جرام)')}
          <input type="number" min="1" max="5000" value="${Math.max(1, Math.round(x.portion_g || 100))}" style="width:84px;padding:5px 8px;border-radius:6px;background:var(--bg-input);color:#fff;border:1px solid var(--border-card)" oninput="updateAiPortion(${i},this.value)">
        </label>
      </div>
      <strong style="color:var(--coral-bright);white-space:nowrap" id="aiItemCalories${i}">${Math.round(x.calories || 0)} kcal</strong>
    </div>`).join('');

    out.innerHTML = `<div class="result">
      <div class="eyebrow">${tr('AI BIOMETRIC ESTIMATE', 'تقدير الذكاء الاصطناعي')}</div>
      <div class="resultnum" id="aiTotalCalories">${Math.round(sum.calories)} kcal</div>
      <div id="aiTotalMacros" style="color:var(--text-muted);font-size:13px;margin-bottom:12px">${tr('Protein', 'بروتين')}: ${Math.round(sum.protein)}g · ${tr('Carbs', 'كارب')}: ${Math.round(sum.carbs)}g · ${tr('Fat', 'دهون')}: ${Math.round(sum.fat)}g</div>
      <div class="listrows">${itemsHtml}</div>
      <p class="note">${esc(data.notes || '')}</p>
      <div class="form-actions">
        <button class="btn" onclick="addAiMealToLog()">${tr('Add to food log', 'إضافة إلى سجل الوجبات')}</button>
      </div>
    </div>`;
  } catch (e) {
    out.innerHTML = `<div class="result"><strong style="color:var(--rose)">${tr('Analysis failed', 'تعذر تحليل الصورة')}</strong><p style="margin-top:6px">${String(e.message || '').replace(/[<>&]/g, '')}</p></div>`;
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.textContent = tr('Analyze with AI ↗', 'حلّل بالذكاء الاصطناعي ↗');
  }
}

function updateAiPortion(index, value) {
  const meal = window.lastAiMeal;
  if (!meal || !meal.items[index]) return;
  const grams = Math.max(1, Math.min(5000, Number(value) || 1)), x = meal.items[index], scale = grams / 100;
  x.portion_g = grams;
  x.calories = Math.round((Number(x.calories_per_100g) || 0) * scale);
  x.protein_g = Math.round((Number(x.protein_per_100g) || 0) * scale * 10) / 10;
  x.carbs_g = Math.round((Number(x.carbs_per_100g) || 0) * scale * 10) / 10;
  x.fat_g = Math.round((Number(x.fat_per_100g) || 0) * scale * 10) / 10;
  meal.sum = meal.items.reduce((a, y) => ({
    calories: a.calories + y.calories,
    protein: a.protein + y.protein_g,
    carbs: a.carbs + y.carbs_g,
    fat: a.fat + y.fat_g
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  
  const cal = document.getElementById('aiItemCalories' + index);
  if (cal) cal.textContent = x.calories + ' kcal';
  const total = document.getElementById('aiTotalCalories');
  if (total) total.textContent = Math.round(meal.sum.calories) + ' kcal';
  const macros = document.getElementById('aiTotalMacros');
  if (macros) macros.textContent = tr('Protein', 'بروتين') + ': ' + Math.round(meal.sum.protein) + 'g · ' + tr('Carbs', 'كارب') + ': ' + Math.round(meal.sum.carbs) + 'g · ' + tr('Fat', 'دهون') + ': ' + Math.round(meal.sum.fat) + 'g';
}

function addAiMealToLog() {
  const meal = window.lastAiMeal;
  if (!meal) return;
  const uid = Date.now().toString(), t = meal.sum;
  state.foods.push({
    id: 'ai-' + uid,
    uid,
    date: today(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    en: meal.name,
    ar: meal.name,
    kcal: Math.round(t.calories),
    p: Math.round(t.protein),
    c: Math.round(t.carbs),
    f: Math.round(t.fat),
    grams: meal.items.reduce((a, b) => a + (b.portion_g || 0), 0)
  });
  persist();
  toast(tr('AI estimate added to food log', 'تمت إضافة الوجبة بنجاح'));
}

// --------------------------------------------------------------------------
// WEIGHT TRACKER & PROGRESS
// --------------------------------------------------------------------------
function addWeight() {
  let w = Number($('weightInput')?.value), date = $('weightDate')?.value || today();
  if (!(w > 0 && w < 500)) { toast(tr('Enter a valid weight', 'اكتب وزناً صحيحاً')); return; }
  state.weights.push({ weight: w, date, uid: Date.now() });
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
  persist();
  toast(tr('Weight saved', 'تم حفظ الوزن'));
}

function deleteWeight(uid) {
  state.weights = state.weights.filter(w => w.uid !== uid);
  persist();
}

function renderWeights() {
  let arr = state.weights;
  if ($('weightChart')) {
    $('weightChart').innerHTML = arr.length ? arr.slice(-8).map(w => {
      let min = Math.min(...arr.map(x => x.weight)), max = Math.max(...arr.map(x => x.weight)),
        height = max === min ? 65 : 20 + (w.weight - min) / (max - min) * 70;
      return `<div class="barwrap"><strong style="font-size:11px">${w.weight}</strong><div class="bar" style="height:${height}%"></div><small>${w.date.slice(5)}</small></div>`;
    }).join('') : `<div class="empty" style="width:100%">${tr('Log your first weight to see chart.', 'سجّل أول وزن لترى الرسم البياني.')}</div>`;
  }

  if ($('weightLog')) {
    $('weightLog').innerHTML = arr.slice().reverse().slice(0, 8).map(w => `<div class="rowitem">
      <div><strong>${w.weight.toFixed(1)} kg</strong><small>${w.date}</small></div>
      <button onclick="deleteWeight(${w.uid})">${tr('Remove', 'حذف')}</button>
    </div>`).join('') || '';
  }

  if ($('weightRecent')) {
    $('weightRecent').innerHTML = arr.slice().reverse().slice(0, 3).map(w => `<div class="rowitem">
      <div><strong>${w.weight.toFixed(1)} kg</strong><small>${w.date}</small></div>
      <span style="color:var(--coral-bright);font-weight:800">✓</span>
    </div>`).join('') || `<div class="empty">${tr('No check-ins yet', 'لا توجد تسجيلات حتى الآن')}</div>`;
  }

  if ($('goalSummary')) $('goalSummary').textContent = tr(({ bulk: 'Bulking', loss: 'Weight loss', cut: 'Cutting', maintain: 'Maintain weight' })[state.profile.goal], ({ bulk: 'تضخيم', loss: 'تخسيس', cut: 'تنشيف', maintain: 'تثبيت الوزن' })[state.profile.goal]);
  if ($('goalSub')) $('goalSub').textContent = tr('Target ', 'الهدف ') + state.profile.target + ' kg';
}

// --------------------------------------------------------------------------
// WORKOUT EXPERIENCES & EXERCISES
// --------------------------------------------------------------------------
const exerciseData = [
  { en: 'Push-up', ar: 'ضغط صدر', muscle: 'Chest · Triceps', home: true, equip: ['bodyweight', 'bands', 'dumbbells', 'all'], sets: '3 × 12–15', query: 'proper push up tutorial' },
  { en: 'Dumbbell Bench Press', ar: 'بنش برس دمبل', muscle: 'Chest · Triceps', home: true, equip: ['dumbbells', 'all'], sets: '4 × 8–12', query: 'dumbbell bench press tutorial' },
  { en: 'Lat Pulldown', ar: 'سحب ظهر عالي', muscle: 'Back · Lats', home: false, equip: ['machines', 'all'], sets: '4 × 10–12', query: 'lat pulldown proper form' },
  { en: 'Barbell Squat', ar: 'سكوات بار', muscle: 'Quads · Glutes', home: false, equip: ['all'], sets: '4 × 8–10', query: 'barbell squat proper form tutorial' },
  { en: 'Goblet Squat', ar: 'سكوات دمبل أمامي', muscle: 'Quads · Glutes', home: true, equip: ['dumbbells', 'all'], sets: '3 × 10–12', query: 'goblet squat tutorial' },
  { en: 'Romanian Deadlift', ar: 'رفعة ميتة رومانية', muscle: 'Hamstrings · Glutes', home: true, equip: ['dumbbells', 'all'], sets: '3 × 8–12', query: 'dumbbell romanian deadlift' },
  { en: 'Dumbbell Shoulder Press', ar: 'ضغط كتف دمبل', muscle: 'Shoulders · Triceps', home: true, equip: ['dumbbells', 'all'], sets: '3 × 8–12', query: 'dumbbell shoulder press proper form' },
  { en: 'Lateral Raise', ar: 'رفرفة جانبي للأكتاف', muscle: 'Side Delts', home: true, equip: ['dumbbells', 'all'], sets: '4 × 12–15', query: 'dumbbell lateral raise tutorial' },
  { en: 'Biceps Curl', ar: 'بايسبس كيرل دمبل', muscle: 'Biceps', home: true, equip: ['dumbbells', 'all'], sets: '3 × 10–12', query: 'dumbbell biceps curl tutorial' },
  { en: 'Triceps Rope Pushdown', ar: 'ترايسبس حبل كيبل', muscle: 'Triceps', home: false, equip: ['machines', 'all'], sets: '3 × 12–15', query: 'tricep rope pushdown form' },
  { en: 'Plank Hold', ar: 'بلانك للبطن والكور', muscle: 'Core · Abs', home: true, equip: ['bodyweight', 'all'], sets: '3 × 45 sec', query: 'plank proper form tutorial' }
];

function renderExerciseLibrary() {
  const el = $('exerciseLibrary');
  if (!el) return;
  const q = ($('exerciseSearch')?.value || '').toLowerCase();
  const list = exerciseData.filter(e => (e.en + ' ' + e.ar + ' ' + e.muscle).toLowerCase().includes(q));
  
  el.innerHTML = list.map(e => `<article class="exercise-card">
    <span class="pill">${e.muscle}</span>
    <h3>${state.lang === 'ar' ? e.ar : e.en}</h3>
    <p>${e.sets} · ${tr('Strict form, controlled tempo', 'أداء محكوم وتكنيك دقيق')}</p>
    <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(e.query)}" target="_blank" rel="noopener">
      ▶ ${tr('Watch Video Guide on YouTube', 'شاهد شرح الأداء على يوتيوب')} ↗
    </a>
  </article>`).join('') || `<div class="empty">${tr('No exercises match your search.', 'لا توجد تمارين مطابقة.')}</div>`;
}

function generateWorkoutPlan() {
  const days = Number($('planDays')?.value || 3);
  const out = $('generatedPlan');
  if (!out) return;
  
  let html = `<div class="card">
    <div class="eyebrow">${tr('YOUR GENERATED ATHLETIC ROUTINE', 'جدولك التدريبي المخصص')}</div>
    <h2>${days} ${tr('Training Days Per Week', 'أيام تدريب أسبوعياً')}</h2>
    <p class="muted">${tr('Targeted hypertrophy with progressive overload structure.', 'نظام مصمم لبناء العضلات وزيادة القوة التدريجية.')}</p>`;

  for (let d = 1; d <= days; d++) {
    const dayLabel = d === 1 ? 'Push (Chest, Shoulders, Triceps)' : d === 2 ? 'Pull (Back, Biceps, Rear Delts)' : 'Legs (Quads, Hamstrings, Calves)';
    html += `<div class="plan-day">
      <h3>Day ${d} · ${dayLabel}</h3>
      <ul>
        ${exerciseData.slice((d - 1) * 3, (d - 1) * 3 + 4).map(e => `<li><strong>${state.lang === 'ar' ? e.ar : e.en}</strong> — ${e.sets} · <a style="color:var(--coral-bright)" target="_blank" href="https://www.youtube.com/results?search_query=${encodeURIComponent(e.query)}">▶ YouTube</a></li>`).join('')}
      </ul>
    </div>`;
  }
  html += `</div>`;
  out.innerHTML = html;
  toast(tr('Plan generated!', 'تم إنشاء الخطة!'));
}

function addWorkout() {
  let name = $('workoutName')?.value.trim() || 'Workout Session', duration = Number($('workoutDuration')?.value) || 45;
  let date = $('workoutDate')?.value || today();
  state.workouts.push({ name, duration, date, uid: Date.now() });
  persist();
  renderWorkouts();
  renderDashboard();
  toast(tr('Workout logged!', 'تم تسجيل التمرين!'));
}

function renderWorkouts() {
  if ($('totalWorkouts')) $('totalWorkouts').textContent = state.workouts.length;
  if ($('totalMinutes')) $('totalMinutes').textContent = state.workouts.reduce((a, w) => a + w.duration, 0);
  if ($('workoutLog')) {
    $('workoutLog').innerHTML = state.workouts.slice().reverse().map(w => `<div class="rowitem">
      <div>
        <strong>${w.name}</strong>
        <small>${w.duration} min · ${w.date}</small>
      </div>
      <button onclick="deleteWorkout(${w.uid})">${tr('Remove', 'حذف')}</button>
    </div>`).join('') || `<div class="empty">${tr('No workouts logged yet.', 'لم يتم تسجيل تمارين حتى الآن.')}</div>`;
  }
  renderExerciseLibrary();
}

function deleteWorkout(uid) {
  state.workouts = state.workouts.filter(w => w.uid !== uid);
  persist();
}

function clearWorkouts() {
  state.workouts = [];
  persist();
  toast(tr('Workout history cleared', 'تم مسح سجل التمارين'));
}

// --------------------------------------------------------------------------
// PROFILE & METABOLIC CALCULATION
// --------------------------------------------------------------------------
function saveProfile() {
  let age = Number($('age').value),
    height = Number($('height').value),
    weight = Number($('startWeight').value),
    activity = Number($('activity').value),
    goal = $('goal').value,
    target = Number($('targetWeight').value),
    sex = $('sex').value;
    
  let bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161),
    maintenance = bmr * activity,
    calories = Math.round(maintenance + (goal === 'bulk' ? 250 : (goal === 'loss' || goal === 'cut') ? -350 : 0));
  let protein = Math.round(weight * 2.0), fats = Math.round(weight * 0.9), carbs = Math.max(0, Math.round((calories - protein * 4 - fats * 9) / 4));
  
  state.profile = { age, sex, height, weight, activity, goal, target, calories, protein, carbs, fats };
  persist();
  renderProfile();
  toast(tr('Profile & macros recalculated!', 'تم تحديث البيانات والأهداف!'));
}

function renderProfile() {
  let p = state.profile;
  if ($('age')) $('age').value = p.age;
  if ($('height')) $('height').value = p.height;
  if ($('startWeight')) $('startWeight').value = p.weight;
  if ($('activity')) $('activity').value = p.activity;
  if ($('goal')) $('goal').value = p.goal;
  if ($('targetWeight')) $('targetWeight').value = p.target;
  if ($('planCalories')) $('planCalories').textContent = fmt(p.calories) + ' kcal';
  if ($('planProtein')) $('planProtein').textContent = p.protein + ' g';
  if ($('planCarbs')) $('planCarbs').textContent = p.carbs + ' g';
  if ($('planFats')) $('planFats').textContent = p.fats + ' g';
}

// --------------------------------------------------------------------------
// SMART TOOLS: BUDGET MEAL PLANNER & BODY TRACKER
// --------------------------------------------------------------------------
async function generateBudgetPlan() {
  const budget = Math.max(50, Math.min(50000, Number($('mealBudget')?.value) || 500));
  const goal = $('mealGoal')?.value || 'maintain', avoid = $('mealAvoid')?.value.trim() || '';
  const out = $('budgetPlanResult');
  if (!out) return;
  
  out.innerHTML = `<div class="result">
    <strong>${tr('Building your 7-day budget meal plan with Gemini AI…', 'الذكاء الاصطناعي يقوم بحساب وجبات الأسبوع بالميزانية المحددة…')}</strong>
    <p class="note">${tr('Optimizing protein density with Egyptian market benchmark prices.', 'تحسين كميات البروتين بالأسعار المناسبة للسوق المصري.')}</p>
  </div>`;

  try {
    const res = await fetch('/api/generate-budget-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budget, goal, avoid, language: state.lang, profile: state.profile })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate plan');
    
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let daysHtml = (data.days || []).map(day => `
      <div class="plan-day" style="margin:12px 0">
        <h3>${esc(day.day)} · ${day.calories} kcal · P ${day.protein}g · ${day.estimated_cost} EGP</h3>
        <div style="display:grid;gap:8px;margin-top:10px">
          ${(day.meals || []).map(m => `
            <div class="meal-card" style="margin:4px 0">
              <div>
                <strong style="color:var(--coral-bright)">${esc(m.name)}</strong>
                <div style="font-size:12.5px;color:#cbd5e1;margin-top:2px">${esc(m.foods)}</div>
              </div>
              <div class="meal-macros">
                <strong>${m.calories} kcal</strong>
                <small>P ${m.protein}g · ${m.estimated_cost} EGP</small>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    out.innerHTML = `<div class="result">
      <div class="eyebrow">${tr('AI-GENERATED 7-DAY MEAL PLAN', 'خطة أسبوعية مولّدة بالذكاء الاصطناعي')}</div>
      <div class="resultnum">${budget} EGP <small style="font-size:14px;color:var(--text-muted)">/ ${tr('week', 'أسبوع')}</small></div>
      <p style="margin:6px 0;color:#cbd5e1">${esc(data.summary || '')}</p>
      ${daysHtml}
    </div>`;
  } catch (err) {
    out.innerHTML = `<div class="result"><strong style="color:var(--rose)">${tr('Error generating meal plan', 'تعذر إنشاء الخطة')}</strong><p style="margin-top:6px">${String(err.message || '').replace(/[&<>]/g, '')}</p></div>`;
  }
}

function bodyEntries() {
  try { return JSON.parse(localStorage.getItem('fitforge-body-entries') || '[]'); } catch { return []; }
}

function saveBodyEntry() {
  const entry = {
    date: $('bodyDate')?.value || today(),
    weight: Number($('bodyWeight')?.value) || null,
    waist: Number($('bodyWaist')?.value) || null,
    chest: Number($('bodyChest')?.value) || null
  };
  const list = bodyEntries();
  list.push(entry);
  saveAccountLocal('fitforge-body-entries', list);
  renderBodyEntries();
  toast(tr('Measurement saved!', 'تم حفظ القياس!'));
}

function renderBodyEntries() {
  const el = $('bodyHistory');
  if (!el) return;
  const list = bodyEntries().slice().reverse();
  el.innerHTML = list.map((x, i) => `<div class="rowitem">
    <div>
      <strong>${x.date} · ${x.weight ? x.weight + ' kg' : 'Measurement'}</strong>
      <small>${x.waist ? 'Waist: ' + x.waist + ' cm' : ''} ${x.chest ? '· Chest: ' + x.chest + ' cm' : ''}</small>
    </div>
    <button onclick="deleteBodyEntry(${list.length - 1 - i})">${tr('Remove', 'حذف')}</button>
  </div>`).join('') || `<div class="empty">${tr('No measurements saved yet.', 'لا توجد قياسات محفوظة.')}</div>`;
}

function deleteBodyEntry(index) {
  const a = bodyEntries();
  a.splice(index, 1);
  saveAccountLocal('fitforge-body-entries', a);
  renderBodyEntries();
}

// --------------------------------------------------------------------------
// LANGUAGE & GLOBAL INITIALIZATION
// --------------------------------------------------------------------------
function initLanguage() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  const lBtn = $('langBtn');
  if (lBtn) {
    lBtn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> <span>${state.lang === 'en' ? 'عربي' : 'English'}</span>`;
  }
  document.querySelectorAll('[data-en]').forEach(el => {
    const val = el.dataset[state.lang];
    if (val !== undefined) {
      if (el.tagName === 'OPTION') el.textContent = val;
      else el.innerHTML = val;
    }
  });
}

function toggleLanguage() {
  state.lang = state.lang === 'en' ? 'ar' : 'en';
  initLanguage();
  persist();
}

function renderAll() {
  renderDashboard();
  renderFoods();
  renderWeights();
  renderWorkouts();
  renderProfile();
  renderBodyEntries();
}

// --------------------------------------------------------------------------
// KINETIC CANVAS & INTERACTIVE LIGHTING
// --------------------------------------------------------------------------


// Attach event listeners
document.addEventListener('DOMContentLoaded', () => {
  $('langBtn')?.addEventListener('click', toggleLanguage);
  $('foodSearch')?.addEventListener('input', renderFoods);
  $('foodGrams')?.addEventListener('input', renderFoods);
  $('exerciseSearch')?.addEventListener('input', renderExerciseLibrary);
  
  if ($('weightDate')) $('weightDate').value = today();
  if ($('workoutDate')) $('workoutDate').value = today();
  if ($('bodyDate')) $('bodyDate').value = today();

  initLanguage();
  renderAll();

  // Check auth token
  const token = localStorage.getItem('fitforge-token');
  if (token) {
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(d => {
        if (d.user) {
          currentUser = d.user;
          syncAccountDataOnLogin();
          updateAccountUI();
        } else {
          localStorage.removeItem('fitforge-token');
        }
      }).catch(() => {});
  }
});
