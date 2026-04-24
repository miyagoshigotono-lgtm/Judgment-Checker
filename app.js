'use strict';

// ===== STATE =====
const state = {
  bedTime: '',
  wakeTime: '',
  sleepMinutes: 0,

  // reaction
  reactionTimes: [],
  reactionIndex: 0,
  reactionTotal: 10,
  reactionWaiting: false,
  reactionTimer: null,

  // calc
  calcQuestions: [],
  calcIndex: 0,
  calcTotal: 5,
  calcResults: [],
  calcStartTime: 0,
  calcTimerInterval: null,
  calcTimeLimitMs: 20000, // 20秒/問

  // scores
  reactionScore: 0,
  calcScore: 0,
  totalScore: 0,
};

// ===== STORAGE =====
const STORAGE_KEY = 'judgment_checker_logs';

function loadLogs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveLog(entry) {
  const logs = loadLogs();
  logs.unshift(entry); // 新しいものを先頭に
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, 90))); // 最大90件
}

// ===== NAVIGATION =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ===== SLEEP TIME =====
function calcSleepMinutes(bed, wake) {
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let bedTotal = bh * 60 + bm;
  let wakeTotal = wh * 60 + wm;
  if (wakeTotal <= bedTotal) wakeTotal += 24 * 60;
  return wakeTotal - bedTotal;
}

function formatSleep(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

function updateSleepPreview() {
  const bed = document.getElementById('bedTime').value;
  const wake = document.getElementById('wakeTime').value;
  const preview = document.getElementById('sleepPreview');
  const startBtn = document.getElementById('startBtn');

  if (bed && wake) {
    const mins = calcSleepMinutes(bed, wake);
    if (mins >= 60 && mins <= 1080) {
      preview.innerHTML = `睡眠時間 <span>${formatSleep(mins)}</span>`;
      startBtn.disabled = false;
      state.bedTime = bed;
      state.wakeTime = wake;
      state.sleepMinutes = mins;
      return;
    }
  }
  preview.textContent = '就寝・起床時刻を入力';
  startBtn.disabled = true;
}

// ===== REACTION TEST =====
function startReactionTest() {
  state.reactionTimes = [];
  state.reactionIndex = 0;
  state.reactionWaiting = false;

  updateProgress(0.1);
  showScreen('screen-reaction');
  updateReactionUI();
  scheduleReaction();
}

function updateReactionUI() {
  document.getElementById('reactionCount').textContent =
    `${state.reactionIndex} / ${state.reactionTotal}`;
  const avg = state.reactionTimes.length > 0
    ? Math.round(state.reactionTimes.reduce((a,b)=>a+b,0) / state.reactionTimes.length)
    : null;
  document.getElementById('reactionAvg').textContent =
    avg ? `平均 ${avg}ms` : '';
}

function scheduleReaction() {
  const btn = document.getElementById('targetBtn');
  const status = document.getElementById('reactionStatus');
  const resultEl = document.getElementById('reactionResult');

  btn.className = 'target-btn waiting';
  status.textContent = '待機中...';
  resultEl.textContent = '';
  resultEl.className = 'reaction-result';
  state.reactionWaiting = false;

  const delay = 1500 + Math.random() * 3000;
  state.reactionTimer = setTimeout(() => {
    btn.className = 'target-btn ready';
    status.textContent = 'タップ！';
    state.reactionWaiting = true;
    state._reactionStart = Date.now();
  }, delay);
}

function onTargetTap() {
  if (state.reactionIndex >= state.reactionTotal) return;

  const btn = document.getElementById('targetBtn');
  const resultEl = document.getElementById('reactionResult');

  if (!state.reactionWaiting) {
    // フライング
    clearTimeout(state.reactionTimer);
    btn.className = 'target-btn too-early';
    resultEl.textContent = 'フライング';
    resultEl.className = 'reaction-result too-early';
    state.reactionTimes.push(600); // ペナルティ
    state.reactionIndex++;
    updateReactionUI();

    if (state.reactionIndex >= state.reactionTotal) {
      setTimeout(finishReaction, 600);
    } else {
      setTimeout(scheduleReaction, 1000);
    }
    return;
  }

  const rt = Date.now() - state._reactionStart;
  state.reactionTimes.push(rt);
  state.reactionIndex++;
  state.reactionWaiting = false;

  btn.className = 'target-btn waiting';
  resultEl.textContent = `${rt}ms`;
  updateReactionUI();

  const prog = 0.1 + (state.reactionIndex / state.reactionTotal) * 0.4;
  updateProgress(prog);

  if (state.reactionIndex >= state.reactionTotal) {
    setTimeout(finishReaction, 600);
  } else {
    setTimeout(scheduleReaction, 600);
  }
}

function finishReaction() {
  clearTimeout(state.reactionTimer);
  startCalcTest();
}

// ===== SCORE: REACTION =====
// 反応時間に基づくスコア計算（60点満点）
// 平均200ms以下=60点、300ms=45点、400ms=30点、500ms以上=0点ベース
// フライング（600ms扱い）は大きくペナルティ
function calcReactionScore(times) {
  const avg = times.reduce((a, b) => a + b, 0) / times.length;

  // 遅い回（500ms以上）の回数
  const lapseCount = times.filter(t => t >= 500).length;

  // 基礎スコア: 平均反応時間ベース
  let base;
  if (avg <= 200) base = 60;
  else if (avg <= 500) base = 60 - ((avg - 200) / 300) * 60;
  else base = 0;

  // ラプスペナルティ（1回あたり6点減）
  const penalty = lapseCount * 6;

  return Math.max(0, Math.round(base - penalty));
}

// ===== CALC TEST =====
function generateQuestions(n) {
  const qs = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor(Math.random() * 90) + 10; // 10〜99
    const b = Math.floor(Math.random() * 9) + 2;   // 2〜10
    qs.push({ a, b, answer: a * b });
  }
  return qs;
}

function startCalcTest() {
  state.calcQuestions = generateQuestions(state.calcTotal);
  state.calcIndex = 0;
  state.calcResults = [];

  updateProgress(0.55);
  showScreen('screen-calc');
  showCalcQuestion();
}

function showCalcQuestion() {
  const q = state.calcQuestions[state.calcIndex];
  const countEl = document.getElementById('calcCount');
  const questionEl = document.getElementById('calcQuestion');
  const inputEl = document.getElementById('calcInput');
  const feedbackEl = document.getElementById('calcFeedback');
  const timerFill = document.getElementById('calcTimerFill');
  const nextBtn = document.getElementById('calcNextBtn');

  countEl.textContent = `${state.calcIndex + 1} / ${state.calcTotal}`;
  questionEl.innerHTML = `${q.a} <span class="op">×</span> ${q.b}`;
  inputEl.value = '';
  inputEl.className = 'calc-input';
  feedbackEl.textContent = '';
  feedbackEl.className = 'calc-feedback';
  nextBtn.textContent = state.calcIndex < state.calcTotal - 1 ? '次へ →' : '結果へ →';

  const prog = 0.55 + ((state.calcIndex) / state.calcTotal) * 0.35;
  updateProgress(prog);

  // タイマー
  clearInterval(state.calcTimerInterval);
  timerFill.style.width = '100%';
  timerFill.className = 'calc-timer-fill';
  state.calcStartTime = Date.now();

  state.calcTimerInterval = setInterval(() => {
    const elapsed = Date.now() - state.calcStartTime;
    const remain = Math.max(0, 1 - elapsed / state.calcTimeLimitMs);
    timerFill.style.width = (remain * 100) + '%';
    if (remain < 0.3) timerFill.className = 'calc-timer-fill hurry';
    if (remain <= 0) {
      clearInterval(state.calcTimerInterval);
      onCalcTimeout();
    }
  }, 50);

  setTimeout(() => inputEl.focus(), 100);
}

function onCalcTimeout() {
  const q = state.calcQuestions[state.calcIndex];
  const inputEl = document.getElementById('calcInput');
  const feedbackEl = document.getElementById('calcFeedback');

  inputEl.className = 'calc-input wrong';
  feedbackEl.textContent = `時間切れ → 正解: ${q.answer}`;
  feedbackEl.className = 'calc-feedback wrong';

  state.calcResults.push({
    correct: false,
    timeTaken: state.calcTimeLimitMs,
    timedOut: true,
  });

  setTimeout(() => nextCalcQuestion(), 1200);
}

function submitCalc() {
  clearInterval(state.calcTimerInterval);
  const q = state.calcQuestions[state.calcIndex];
  const inputEl = document.getElementById('calcInput');
  const feedbackEl = document.getElementById('calcFeedback');
  const val = parseInt(inputEl.value, 10);
  const timeTaken = Date.now() - state.calcStartTime;

  if (isNaN(val)) return;

  const correct = val === q.answer;
  inputEl.className = 'calc-input ' + (correct ? 'correct' : 'wrong');
  feedbackEl.textContent = correct
    ? `正解！ ${timeTaken < 5000 ? '速い！' : ''}`
    : `不正解 → 正解: ${q.answer}`;
  feedbackEl.className = 'calc-feedback ' + (correct ? 'correct' : 'wrong');

  state.calcResults.push({ correct, timeTaken, timedOut: false });

  setTimeout(() => nextCalcQuestion(), 600);
}

function nextCalcQuestion() {
  state.calcIndex++;
  if (state.calcIndex >= state.calcTotal) {
    finishCalc();
  } else {
    showCalcQuestion();
  }
}

// ===== SCORE: CALC =====
// 計算スコア（40点満点）
// 正解 + 速さのボーナス
function calcCalcScore(results) {
  let score = 0;
  results.forEach(r => {
    if (!r.correct) return;
    // 正解基礎点: 6点
    // 速さボーナス: 5秒以内=+2、10秒以内=+1
    let pts = 6;
    if (r.timeTaken <= 5000) pts += 2;
    else if (r.timeTaken <= 10000) pts += 1;
    score += pts;
  });
  return Math.min(40, score);
}

function finishCalc() {
  clearInterval(state.calcTimerInterval);

  state.reactionScore = calcReactionScore(state.reactionTimes);
  state.calcScore = calcCalcScore(state.calcResults);
  state.totalScore = state.reactionScore + state.calcScore;

  updateProgress(1.0);
  showResultScreen();
}

// ===== RESULT =====
function getGrade(score) {
  if (score >= 90) return { label: 'EXCELLENT', color: '#00ff88' };
  if (score >= 75) return { label: 'GOOD', color: '#00cc88' };
  if (score >= 55) return { label: 'NORMAL', color: '#88aaff' };
  if (score >= 35) return { label: 'TIRED', color: '#ffaa00' };
  return { label: 'EXHAUSTED', color: '#ff6b35' };
}

function showResultScreen() {
  const grade = getGrade(state.totalScore);

  document.getElementById('resultScore').textContent = state.totalScore;
  document.getElementById('resultScore').style.color = grade.color;

  const gradeEl = document.getElementById('resultGrade');
  gradeEl.textContent = grade.label;
  gradeEl.style.color = grade.color;

  const avgRt = Math.round(state.reactionTimes.reduce((a,b)=>a+b,0) / state.reactionTimes.length);
  const lapses = state.reactionTimes.filter(t => t >= 500).length;
  const correctCount = state.calcResults.filter(r => r.correct).length;

  document.getElementById('bdReactionScore').textContent = `${state.reactionScore} / 60`;
  document.getElementById('bdCalcScore').textContent = `${state.calcScore} / 40`;
  document.getElementById('bdAvgRt').textContent = `${avgRt}ms`;
  document.getElementById('bdLapses').textContent = `${lapses}回`;
  document.getElementById('bdCalcCorrect').textContent = `${correctCount} / ${state.calcTotal}`;
  document.getElementById('resultSleepTime').textContent = formatSleep(state.sleepMinutes);

  // ログ保存
  const now = new Date();
  const entry = {
    date: now.toLocaleDateString('ja-JP', { month:'2-digit', day:'2-digit', weekday:'short' }),
    dateISO: now.toISOString(),
    bedTime: state.bedTime,
    wakeTime: state.wakeTime,
    sleepMinutes: state.sleepMinutes,
    reactionScore: state.reactionScore,
    calcScore: state.calcScore,
    totalScore: state.totalScore,
    avgRt,
    lapses,
    correctCount,
  };
  saveLog(entry);

  showScreen('screen-result');
}

// ===== LOG SCREEN =====
function showLogScreen() {
  const logs = loadLogs();
  const listEl = document.getElementById('logList');
  listEl.innerHTML = '';

  if (logs.length === 0) {
    listEl.innerHTML = '<div class="log-empty">記録なし</div>';
    renderChart([]);
    showScreen('screen-log');
    return;
  }

  logs.forEach(log => {
    const item = document.createElement('div');
    item.className = 'log-item';
    const grade = getGrade(log.totalScore);
    item.innerHTML = `
      <div class="log-date">${log.date}</div>
      <div class="log-sleep">睡眠 <b>${formatSleep(log.sleepMinutes)}</b></div>
      <div class="log-sub">反応 ${log.reactionScore}pt ／ 計算 ${log.calcScore}pt</div>
      <div class="log-score-big" style="color:${grade.color}">${log.totalScore}</div>
    `;
    listEl.appendChild(item);
  });

  renderChart(logs.slice(0, 14).reverse());
  showScreen('screen-log');
}

function renderChart(logs) {
  const canvas = document.getElementById('scoreChart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth;
  const H = 120;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (logs.length < 2) {
    ctx.fillStyle = '#8888aa';
    ctx.font = '12px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('2件以上の記録でグラフ表示', W/2, H/2);
    return;
  }

  const pad = { t: 10, b: 24, l: 32, r: 12 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;

  // グリッド
  [25, 50, 75, 100].forEach(v => {
    const y = pad.t + chartH - (v / 100) * chartH;
    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + chartW, y);
    ctx.stroke();
    ctx.fillStyle = '#8888aa';
    ctx.font = `9px Space Mono, monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(v, pad.l - 4, y + 3);
  });

  const pts = logs.map((log, i) => ({
    x: pad.l + (i / (logs.length - 1)) * chartW,
    y: pad.t + chartH - (log.totalScore / 100) * chartH,
    score: log.totalScore,
    date: log.date,
  }));

  // 塗りつぶし
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pad.t + chartH);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length-1].x, pad.t + chartH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + chartH);
  grad.addColorStop(0, 'rgba(0,255,136,0.25)');
  grad.addColorStop(1, 'rgba(0,255,136,0.02)');
  ctx.fillStyle = grad;
  ctx.fill();

  // ライン
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 点
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88';
    ctx.fill();
  });

  // 日付ラベル（最初と最後）
  ctx.fillStyle = '#8888aa';
  ctx.font = '9px Space Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(pts[0].date, pts[0].x, H - 4);
  ctx.textAlign = 'right';
  ctx.fillText(pts[pts.length-1].date, pts[pts.length-1].x, H - 4);
}

// ===== PROGRESS =====
function updateProgress(ratio) {
  const bars = document.querySelectorAll('.progress-fill');
  bars.forEach(b => b.style.width = (ratio * 100) + '%');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // 時刻入力
  document.getElementById('bedTime').addEventListener('change', updateSleepPreview);
  document.getElementById('wakeTime').addEventListener('change', updateSleepPreview);

  // スタートボタン
  document.getElementById('startBtn').addEventListener('click', () => {
    startReactionTest();
  });

  // 反応テスト
  document.getElementById('targetBtn').addEventListener('click', onTargetTap);
  document.getElementById('targetBtn').addEventListener('touchstart', e => {
    e.preventDefault();
    onTargetTap();
  }, { passive: false });

  // 計算テスト
  document.getElementById('calcNextBtn').addEventListener('click', submitCalc);
  document.getElementById('calcInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitCalc();
  });

  // ログ画面
  document.getElementById('btnShowLog').addEventListener('click', showLogScreen);
  document.getElementById('btnShowLogResult').addEventListener('click', showLogScreen);
  document.getElementById('btnBack').addEventListener('click', () => showScreen('screen-home'));
  document.getElementById('btnRetry').addEventListener('click', () => {
    state.reactionTimes = [];
    state.reactionIndex = 0;
    state.calcResults = [];
    state.calcIndex = 0;
    updateProgress(0);
    showScreen('screen-home');
  });

  // PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/Judgment-Checker/sw.js');
  }

  showScreen('screen-home');
});
