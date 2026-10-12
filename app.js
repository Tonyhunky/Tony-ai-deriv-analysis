
// TONY DERIV AI ANALYSIS - Analysis Only, No Trading
// Uses official Deriv public WebSocket endpoint (no auth required for tick data)

const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3?app_id=1089';
const SYMBOL = 'R_100';
const MAX_HISTORY = 1000;

let ws = null;
let tickHistory = [];
let signalHistory = [];
let currentWindow = 100;
let reconnectAttempts = 0;
let isConnected = false;

const el = {
  connStatus: document.getElementById('connection-status'),
  tickCount: document.getElementById('tick-count'),
  livePrice: document.getElementById('live-price'),
  liveDigit: document.getElementById('live-digit'),
  digitGrid: document.getElementById('digit-grid'),
  signalText: document.querySelector('.signal-text'),
  signalReason: document.getElementById('signal-reason'),
  signalHistory: document.getElementById('signal-history')
};

function getLastDigit(quote) {
  const str = quote.toString();
  return parseInt(str[str.length - 1], 10);
}

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(DERIV_WS_URL);

  ws.onopen = () => {
    console.log('Connected to Deriv public stream');
    isConnected = true;
    reconnectAttempts = 0;
    el.connStatus.textContent = '● CONNECTED';
    el.connStatus.className = 'status connected';

    ws.send(JSON.stringify({
      ticks: SYMBOL,
      subscribe: 1
    }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.msg_type === 'tick' && data.tick) {
      handleTick(data.tick);
    }

    if (data.error) {
      console.error('Deriv API error:', data.error.message);
    }
  };

  ws.onclose = () => {
    console.log('Disconnected from Deriv');
    isConnected = false;
    el.connStatus.textContent = '● DISCONNECTED';
    el.connStatus.className = 'status disconnected';

    if (reconnectAttempts < 10) {
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      console.log(`Reconnecting in ${delay}ms...`);
      setTimeout(connect, delay);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function handleTick(tick) {
  const quote = parseFloat(tick.quote);
  const digit = getLastDigit(quote);

  tickHistory.push(digit);
  if (tickHistory.length > MAX_HISTORY) {
    tickHistory.shift();
  }

  el.livePrice.textContent = quote.toFixed(2);
  el.liveDigit.textContent = digit;
  el.tickCount.textContent = `Ticks: ${tickHistory.length}`;

  updateDigitAnalysis();
  generateSignal();
}

function updateDigitAnalysis() {
  const windowData = tickHistory.slice(-currentWindow);
  const counts = new Array(10).fill(0);
  windowData.forEach(d => counts[d]++);

  const total = windowData.length || 1;
  const percentages = counts.map(c => (c / total) * 100);

  const maxPct = Math.max(...percentages);

  el.digitGrid.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const cell = document.createElement('div');
    cell.className = 'digit-cell';
    if (percentages[i] === maxPct && percentages[i] > 0) {
      cell.classList.add('highlight');
    }
    cell.innerHTML = `
      <span class="digit-num">${i}</span>
      <span class="digit-count">${counts[i]}x</span>
      <span class="digit-pct">${percentages[i].toFixed(1)}%</span>
    `;
    el.digitGrid.appendChild(cell);
  }
}

function generateSignal() {
  const windowData = tickHistory.slice(-currentWindow);

  if (windowData.length < 50) {
    el.signalText.textContent = 'NO SIGNAL';
    el.signalText.className = 'signal-text no-signal';
    el.signalReason.textContent = `Insufficient data: ${windowData.length}/50 ticks minimum.`;
    return;
  }

  const counts = new Array(10).fill(0);
  windowData.forEach(d => counts[d]++);

  const total = windowData.length;
  const percentages = counts.map(c => (c / total) * 100);

  let maxDigit = 0;
  let maxPct = percentages[0];

  for (let i = 1; i < 10; i++) {
    if (percentages[i] > maxPct) {
      maxPct = percentages[i];
      maxDigit = i;
    }
  }

  const expectedPct = 10;
  const deviation = maxPct - expectedPct;

  if (deviation < 3) {
    el.signalText.textContent = 'NO SIGNAL';
    el.signalText.className = 'signal-text no-signal';
    el.signalReason.textContent = `Digit ${maxDigit} at ${maxPct.toFixed(1)}% — deviation (${deviation.toFixed(1)}%) below 3% threshold. Not statistically significant.`;
    return;
  }

  const isMatch = maxPct > expectedPct;
  const signalType = isMatch ? 'MATCH' : 'DIFFERS';
  const suggestedDigit = maxDigit;

  el.signalText.textContent = `${signalType} — DIGIT ${suggestedDigit}`;
  el.signalText.className = `signal-text ${isMatch ? 'match-signal' : 'differs-signal'}`;

  el.signalReason.textContent = `Digit ${suggestedDigit} appeared ${maxPct.toFixed(1)}% in last ${total} ticks (expected 10%). Deviation: ${deviation.toFixed(1)}%.`;

  if (tickHistory.length % 10 === 0) {
    addSignalToHistory({
      type: signalType,
      digit: suggestedDigit,
      percentage: maxPct,
      sampleSize: total,
      timestamp: new Date().toLocaleTimeString()
    });
  }
}

function addSignalToHistory(signal) {
  signalHistory.unshift(signal);
  if (signalHistory.length > 20) {
    signalHistory.pop();
  }

  if (signalHistory.length === 1) {
    el.signalHistory.innerHTML = '';
  }

  const item = document.createElement('div');
  item.className = 'signal-item';
  item.innerHTML = `
    <div class="sig-header">
      <span class="sig-type ${signal.type.toLowerCase()}">${signal.type} DIGIT ${signal.digit}</span>
      <span class="sig-time">${signal.timestamp}</span>
    </div>
    <div class="sig-detail">
      ${signal.percentage.toFixed(1)}% frequency in ${signal.sampleSize} ticks
    </div>
  `;

  el.signalHistory.insertBefore(item, el.signalHistory.firstChild);
}

document.querySelectorAll('.window-selector button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.window-selector button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentWindow = parseInt(btn.dataset.window, 10);
    updateDigitAnalysis();
    generateSignal();
  });
});

connect();
