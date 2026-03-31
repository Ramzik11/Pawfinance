// PawFinance - Main App Logic
import { firebaseConfig } from './firebase-config.js';

// Firebase SDK (loaded via CDN in HTML)
let db, auth, currentUser;

const CURRENCY_SYMBOLS = { KZT: '₸', RUB: '₽', USD: '$', EUR: '€' };

const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Еда', icon: '🍖', color: '#FF6B6B' },
  { id: 'transport', name: 'Транспорт', icon: '🚗', color: '#4ECDC4' },
  { id: 'housing', name: 'Жильё', icon: '🏠', color: '#45B7D1' },
  { id: 'health', name: 'Здоровье', icon: '💊', color: '#96CEB4' },
  { id: 'fun', name: 'Развлечения', icon: '🎮', color: '#FFEAA7' },
  { id: 'clothes', name: 'Одежда', icon: '👗', color: '#DDA0DD' },
  { id: 'debt', name: 'Долг', icon: '💸', color: '#FF4757', isDebt: true },
  { id: 'savings', name: 'Накопления', icon: '🐾', color: '#2ed573' },
];

// App state
let state = {
  user: null,
  transactions: [],
  categories: [...DEFAULT_CATEGORIES],
  goals: [],
  settings: {
    currency: 'KZT',
    dailyLimit: 0,
    limitSetDate: null,
  },
  currentPage: 'dashboard',
  historyFilter: 'month', // day, week, month
};

// ===================== FIREBASE INIT =====================
export function initFirebase() {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      state.user = user;
      await loadUserData();
      showApp();
    } else {
      currentUser = null;
      showLoginPage();
    }
  });
}

// ===================== AUTH =====================
export async function loginWithPin(email, pin) {
  const password = `PAW_${pin}_FINANCE`;
  try {
    await auth.signInWithEmailAndPassword(email, password);
    return { success: true };
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      // Register new user
      try {
        await auth.createUserWithEmailAndPassword(email, password);
        return { success: true, isNew: true };
      } catch (e2) {
        return { success: false, error: e2.message };
      }
    }
    return { success: false, error: 'Неверный PIN' };
  }
}

export async function logout() {
  await auth.signOut();
}

// ===================== DATA LOAD/SAVE =====================
async function loadUserData() {
  if (!currentUser) return;
  const uid = currentUser.uid;

  try {
    // Load settings
    const settingsDoc = await db.collection('users').doc(uid).collection('data').doc('settings').get();
    if (settingsDoc.exists) {
      state.settings = { ...state.settings, ...settingsDoc.data() };
    }

    // Load categories
    const catsDoc = await db.collection('users').doc(uid).collection('data').doc('categories').get();
    if (catsDoc.exists && catsDoc.data().list) {
      state.categories = catsDoc.data().list;
    }

    // Load transactions
    const txSnap = await db.collection('users').doc(uid).collection('transactions').orderBy('date', 'desc').get();
    state.transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Load goals
    const goalsSnap = await db.collection('users').doc(uid).collection('goals').get();
    state.goals = goalsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Check if daily limit needs reset
    checkDailyLimitReset();
  } catch (e) {
    console.error('Load error:', e);
  }
}

function checkDailyLimitReset() {
  const today = new Date().toDateString();
  if (state.settings.limitSetDate !== today) {
    // New day - limit can be changed
    state.settings.limitSetDate = null;
  }
}

async function saveSettings() {
  if (!currentUser) return;
  await db.collection('users').doc(currentUser.uid).collection('data').doc('settings').set(state.settings);
}

async function saveCategories() {
  if (!currentUser) return;
  await db.collection('users').doc(currentUser.uid).collection('data').doc('categories').set({ list: state.categories });
}

export async function addTransaction(tx) {
  if (!currentUser) return;
  const newTx = {
    ...tx,
    date: new Date().toISOString(),
    userId: currentUser.uid,
  };
  const ref = await db.collection('users').doc(currentUser.uid).collection('transactions').add(newTx);
  state.transactions.unshift({ id: ref.id, ...newTx });

  // Check limit
  checkDailyLimit();
  renderAll();
}

export async function deleteTransaction(id) {
  if (!currentUser) return;
  await db.collection('users').doc(currentUser.uid).collection('transactions').doc(id).delete();
  state.transactions = state.transactions.filter(t => t.id !== id);
  renderAll();
}

export async function addGoal(goal) {
  if (!currentUser) return;
  const ref = await db.collection('users').doc(currentUser.uid).collection('goals').add(goal);
  state.goals.push({ id: ref.id, ...goal });
  renderGoals();
}

export async function updateGoal(id, data) {
  if (!currentUser) return;
  await db.collection('users').doc(currentUser.uid).collection('goals').doc(id).update(data);
  const idx = state.goals.findIndex(g => g.id === id);
  if (idx !== -1) state.goals[idx] = { ...state.goals[idx], ...data };
  renderGoals();
}

export async function deleteGoal(id) {
  if (!currentUser) return;
  await db.collection('users').doc(currentUser.uid).collection('goals').doc(id).delete();
  state.goals = state.goals.filter(g => g.id !== id);
  renderGoals();
}

export async function addCategory(cat) {
  state.categories.push(cat);
  await saveCategories();
  renderCategorySelect();
}

export async function setDailyLimit(amount) {
  const today = new Date().toDateString();
  if (state.settings.limitSetDate === today) {
    return { success: false, error: 'Лимит уже установлен на сегодня' };
  }
  state.settings.dailyLimit = amount;
  state.settings.limitSetDate = today;
  await saveSettings();
  checkDailyLimit();
  return { success: true };
}

export async function setCurrency(currency) {
  state.settings.currency = currency;
  await saveSettings();
  renderAll();
}

// ===================== CALCULATIONS =====================
function getTodayTransactions() {
  const today = new Date().toDateString();
  return state.transactions.filter(t => new Date(t.date).toDateString() === today);
}

function getFilteredTransactions(filter = state.historyFilter) {
  const now = new Date();
  return state.transactions.filter(t => {
    const d = new Date(t.date);
    if (filter === 'day') return d.toDateString() === now.toDateString();
    if (filter === 'week') {
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      return d >= weekAgo;
    }
    if (filter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return true;
  });
}

function getTotals(txList) {
  const income = txList.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txList.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expense, balance: income - expense };
}

function getTodayExpenses() {
  return getTodayTransactions().filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
}

function getHealthPercent() {
  const { income, expense } = getTotals(getFilteredTransactions('month'));
  if (income === 0) return expense > 0 ? 0 : 100;
  const ratio = expense / income;
  return Math.max(0, Math.min(100, Math.round((1 - ratio) * 100)));
}

function checkDailyLimit() {
  if (!state.settings.dailyLimit) return;
  const todayExp = getTodayExpenses();
  const exceeded = todayExp > state.settings.dailyLimit;
  const alertEl = document.getElementById('limitAlert');
  if (alertEl) alertEl.style.display = exceeded ? 'flex' : 'none';

  // Auto-add debt transaction if exceeded
  if (exceeded) {
    const excess = todayExp - state.settings.dailyLimit;
    document.getElementById('excessAmount').textContent = formatAmount(excess);
  }
}

function formatAmount(amount) {
  return `${Math.abs(amount).toLocaleString('ru-RU')} ${CURRENCY_SYMBOLS[state.settings.currency]}`;
}

function getCategoryById(id) {
  return state.categories.find(c => c.id === id) || { name: 'Прочее', icon: '📦', color: '#888' };
}

function getTransactionsByCategory(catId) {
  return state.transactions.filter(t => t.categoryId === catId);
}

// ===================== RENDER =====================
export function renderAll() {
  renderDashboard();
  renderHistory();
  renderCategories();
  renderGoals();
}

function renderDashboard() {
  const filtered = getFilteredTransactions('month');
  const { income, expense, balance } = getTotals(filtered);
  const health = getHealthPercent();
  const sym = CURRENCY_SYMBOLS[state.settings.currency];
  const todayExp = getTodayExpenses();
  const limit = state.settings.dailyLimit;

  // Balance
  const balEl = document.getElementById('balance');
  if (balEl) balEl.textContent = formatAmount(balance);

  // Income/Expense
  const incEl = document.getElementById('totalIncome');
  const expEl = document.getElementById('totalExpense');
  if (incEl) {
    const pct = income + expense > 0 ? Math.round(income / (income + expense) * 100) : 0;
    incEl.innerHTML = `<span class="amount">${formatAmount(income)}</span><span class="pct">${pct}%</span>`;
  }
  if (expEl) {
    const pct = income + expense > 0 ? Math.round(expense / (income + expense) * 100) : 0;
    expEl.innerHTML = `<span class="amount">${formatAmount(expense)}</span><span class="pct">${pct}%</span>`;
  }

  // Health bar (hearts)
  const heartsEl = document.getElementById('healthBar');
  if (heartsEl) {
    const hearts = Math.round(health / 20); // 0-5 hearts
    heartsEl.innerHTML = Array.from({ length: 5 }, (_, i) =>
      `<span class="heart ${i < hearts ? 'full' : 'empty'}">${i < hearts ? '❤️' : '🖤'}</span>`
    ).join('') + `<span class="health-pct">${health}%</span>`;
  }

  // Daily limit
  const limitEl = document.getElementById('dailyLimitInfo');
  if (limitEl && limit > 0) {
    const pct = Math.min(100, Math.round(todayExp / limit * 100));
    limitEl.innerHTML = `
      <div class="limit-bar-wrap">
        <div class="limit-bar" style="width:${pct}%; background: ${pct >= 100 ? '#ff4757' : pct > 70 ? '#ffa502' : '#2ed573'}"></div>
      </div>
      <span>${formatAmount(todayExp)} / ${formatAmount(limit)} сегодня</span>
    `;
  }

  // Chart
  renderChart();
  checkDailyLimit();
}

function renderChart() {
  const canvas = document.getElementById('expenseChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const filtered = getFilteredTransactions('month').filter(t => t.type === 'expense');
  const byCategory = {};
  filtered.forEach(t => {
    byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + t.amount;
  });

  const cats = Object.keys(byCategory);
  if (cats.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff40';
    ctx.font = '16px Nunito';
    ctx.textAlign = 'center';
    ctx.fillText('Нет расходов за месяц 🐾', canvas.width / 2, canvas.height / 2);
    return;
  }

  if (window._pawChart) window._pawChart.destroy();

  window._pawChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: cats.map(id => getCategoryById(id).name),
      datasets: [{
        data: cats.map(id => byCategory[id]),
        backgroundColor: cats.map(id => getCategoryById(id).color || '#888'),
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#fff', font: { family: 'Nunito', size: 12 } } }
      }
    }
  });
}

function renderHistory() {
  const container = document.getElementById('historyList');
  if (!container) return;

  const filtered = getFilteredTransactions();
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">🐾 Нет транзакций за этот период</div>';
    return;
  }

  // Group by date
  const groups = {};
  filtered.forEach(t => {
    const key = new Date(t.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  container.innerHTML = Object.entries(groups).map(([date, txs]) => `
    <div class="history-group">
      <div class="history-date">📅 ${date}</div>
      ${txs.map(t => {
        const cat = getCategoryById(t.categoryId);
        return `
          <div class="tx-item ${t.type}" data-id="${t.id}">
            <div class="tx-icon">${cat.icon}</div>
            <div class="tx-info">
              <div class="tx-name">${t.description || cat.name}</div>
              <div class="tx-cat">${cat.name}</div>
            </div>
            <div class="tx-amount ${t.type}">
              ${t.type === 'income' ? '+' : '-'}${formatAmount(t.amount)}
            </div>
            <button class="tx-delete" onclick="window.pawApp.deleteTransaction('${t.id}')">×</button>
          </div>
        `;
      }).join('')}
    </div>
  `).join('');
}

function renderCategories() {
  const container = document.getElementById('categoriesList');
  if (!container) return;

  container.innerHTML = state.categories.map(cat => {
    const txs = getTransactionsByCategory(cat.id);
    const total = txs.reduce((s, t) => t.type === 'expense' ? s - t.amount : s + t.amount, 0);
    return `
      <div class="cat-card" onclick="window.pawApp.showCategoryDetail('${cat.id}')">
        <div class="cat-icon" style="background:${cat.color}20; border: 2px solid ${cat.color}">${cat.icon}</div>
        <div class="cat-info">
          <div class="cat-name">${cat.name}</div>
          <div class="cat-count">${txs.length} транзакций</div>
        </div>
        <div class="cat-total ${total >= 0 ? 'positive' : 'negative'}">${total >= 0 ? '+' : ''}${formatAmount(Math.abs(total))}</div>
      </div>
    `;
  }).join('');
}

function renderGoals() {
  const container = document.getElementById('goalsList');
  if (!container) return;

  if (state.goals.length === 0) {
    container.innerHTML = '<div class="empty-state">🐾 Добавьте свою первую цель!</div>';
    return;
  }

  container.innerHTML = state.goals.map(goal => {
    const pct = Math.min(100, Math.round((goal.saved || 0) / goal.target * 100));
    return `
      <div class="goal-card">
        <div class="goal-icon">${goal.icon || '🎯'}</div>
        <div class="goal-info">
          <div class="goal-name">${goal.name}</div>
          <div class="goal-progress-wrap">
            <div class="goal-progress-bar">
              <div class="goal-progress-fill" style="width:${pct}%"></div>
            </div>
            <span class="goal-pct">${pct}%</span>
          </div>
          <div class="goal-amounts">${formatAmount(goal.saved || 0)} / ${formatAmount(goal.target)}</div>
        </div>
        <div class="goal-actions">
          <button onclick="window.pawApp.addToGoal('${goal.id}')">+</button>
          <button onclick="window.pawApp.deleteGoal('${goal.id}')">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

export function renderCategorySelect() {
  const selects = document.querySelectorAll('.category-select');
  selects.forEach(sel => {
    const val = sel.value;
    sel.innerHTML = state.categories.map(c =>
      `<option value="${c.id}">${c.icon} ${c.name}</option>`
    ).join('');
    sel.value = val;
  });
}

// ===================== PAGE SHOW/HIDE =====================
function showLoginPage() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appPage').style.display = 'none';
}

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display = 'flex';
  renderAll();
}

export function showPage(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const el = document.getElementById(`page-${page}`);
  if (el) el.style.display = 'block';

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  if (page === 'dashboard') renderDashboard();
  if (page === 'history') renderHistory();
  if (page === 'categories') renderCategories();
  if (page === 'goals') renderGoals();
}

export function setHistoryFilter(filter) {
  state.historyFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-filter="${filter}"]`)?.classList.add('active');
  renderHistory();
}

export function showCategoryDetail(catId) {
  const cat = getCategoryById(catId);
  const txs = getTransactionsByCategory(catId);
  const modal = document.getElementById('categoryModal');
  const content = document.getElementById('categoryModalContent');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="modal-header">
      <span class="modal-icon" style="background:${cat.color}20">${cat.icon}</span>
      <h2>${cat.name}</h2>
    </div>
    <div class="modal-stats">
      <span>${txs.length} транзакций</span>
      <span>Итого: ${formatAmount(txs.reduce((s,t) => t.type==='expense'?s-t.amount:s+t.amount, 0))}</span>
    </div>
    <div class="modal-txlist">
      ${txs.length === 0 ? '<div class="empty-state">Нет транзакций</div>' :
        txs.map(t => `
          <div class="tx-item ${t.type}">
            <div class="tx-info">
              <div class="tx-name">${t.description || cat.name}</div>
              <div class="tx-cat">${new Date(t.date).toLocaleDateString('ru-RU')}</div>
            </div>
            <div class="tx-amount ${t.type}">${t.type==='income'?'+':'-'}${formatAmount(t.amount)}</div>
          </div>
        `).join('')
      }
    </div>
  `;
  modal.style.display = 'flex';
}

export function addToGoal(goalId) {
  const amount = parseFloat(prompt('Сколько добавить к цели?'));
  if (!amount || isNaN(amount)) return;
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  updateGoal(goalId, { saved: (goal.saved || 0) + amount });
}

export { state, getTotals, getFilteredTransactions, formatAmount, getCategoryById };
