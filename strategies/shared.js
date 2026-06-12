/**
 * 策略共享工具 — SMA, RSI, Bollinger, runBacktest
 */

function SMA(prices, period) {
  const result = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += prices[j];
    result.push(sum / period);
  }
  return result;
}

function RSI(prices, period = 14) {
  const result = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period) { result.push(null); continue; }
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = prices[j] - prices[j - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) { result.push(100); continue; }
    result.push(100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function Bollinger(prices, period = 20, multiplier = 2) {
  const middle = SMA(prices, period);
  const upper = [], lower = [];
  for (let i = 0; i < prices.length; i++) {
    if (middle[i] === null) { upper.push(null); lower.push(null); continue; }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (prices[j] - middle[i]) ** 2;
    const std = Math.sqrt(sumSq / period);
    upper.push(middle[i] + multiplier * std);
    lower.push(middle[i] - multiplier * std);
  }
  return { upper, middle, lower };
}

function runBacktest(data, strategy) {
  let state = strategy.init();
  const trades = [];

  for (let i = 0; i < data.length; i++) {
    const day = data[i];
    const result = strategy.next(day, i, state, data);
    if (!result) {
      trades.push({
        date: day.date, close: day.close,
        action: 'hold', usdt: state.usdt, btc: state.btc,
        totalValue: Math.round((state.usdt + state.btc * day.close) * 100) / 100,
        detail: '',
      });
      continue;
    }
    state = result.state;
    trades.push({
      date: day.date,
      close: day.close,
      action: result.action || 'hold',
      usdt: Math.round(state.usdt * 100) / 100,
      btc: Math.round(state.btc * 100000) / 100000,
      totalValue: Math.round((state.usdt + state.btc * day.close) * 100) / 100,
      detail: result.detail || '',
    });
  }

  const lastClose = data[data.length - 1].close;
  const totalValue = state.usdt + state.btc * lastClose;
  const profit = totalValue - 10000;
  const profitPct = (profit / 10000) * 100;

  let peak = -Infinity, maxDD = 0;
  for (const t of trades) {
    if (t.totalValue > peak) peak = t.totalValue;
    const dd = (peak - t.totalValue) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const buyCount = trades.filter(t => t.action === 'BUY' || t.action === 'BUY&SELL').length;
  const sellCount = trades.filter(t => t.action === 'SELL' || t.action === 'BUY&SELL').length;

  return {
    name: strategy.name,
    summary: {
      initialUSDT: 10000,
      finalValue: Math.round(totalValue * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      profitPct: Math.round(profitPct * 100) / 100,
      maxDrawdown: Math.round(maxDD * 100) / 100,
      buyCount, sellCount,
      totalDays: data.length,
      startDate: data[0]?.date,
      endDate: data[data.length - 1]?.date,
      btcStart: data[0]?.close,
      btcEnd: lastClose,
      btcReturn: Math.round(((lastClose - data[0]?.close) / data[0]?.close) * 10000) / 100,
    },
    trades,
  };
}

module.exports = { SMA, RSI, Bollinger, runBacktest };
