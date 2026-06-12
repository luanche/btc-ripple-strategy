#!/usr/bin/env node

/**
 * 📉 布林带回归
 * 触及下轨买入, 触及上轨卖出 (20,2)
 */

const path = require('path');
const fs = require('fs');
const { SMA, RSI, Bollinger, runBacktest } = require('../shared');

const strategyDef = {
  name: '📉 布林带回归',
  init: () => ({ usdt: 10000, btc: 0, lastBuyPrice: 0 }),
  next: (day, idx, state, data) => {
    const { close, changePercent, high, low } = day;
    if (idx === 0 || changePercent === null || changePercent === undefined) return null;
    
    if (idx < 20) return null;
    const p = data.slice(0, idx + 1).map(d => d.close);
    const bb = Bollinger(p, 20, 2);
    const upper = bb.upper[bb.upper.length-1], lower = bb.lower[bb.lower.length-1], mid = bb.middle[bb.middle.length-1];
    if (!upper || !lower || !mid) return null;
    let ns = { ...state }, act = 'hold', det = '上='+upper.toFixed(0)+' 中='+mid.toFixed(0)+' 下='+lower.toFixed(0);
    if (close <= lower && ns.usdt > 50) {
      const amt = Math.min(ns.usdt * 0.2, ns.usdt);
      ns.usdt -= amt; ns.btc += amt / close; ns.lastBuyPrice = close;
      act = 'BUY'; det = '触及下轨! 买入 $'+amt.toFixed(2)+' @ '+close.toFixed(0);
    } else if (close >= upper && ns.btc > 0.001) {
      const sb = ns.btc * 0.3, sa = sb * close;
      ns.btc -= sb; ns.usdt += sa;
      act = 'SELL'; det = '触及上轨! 卖出30% ≈ $'+sa.toFixed(2);
    } else if (ns.lastBuyPrice > 0 && close > mid && ns.btc > 0.001) {
      const pp = (close - ns.lastBuyPrice) / ns.lastBuyPrice * 100;
      if (pp > 3) {
        const sb = ns.btc * 0.3, sa = sb * close;
        ns.btc -= sb; ns.usdt += sa; ns.lastBuyPrice = 0;
        act = 'SELL'; det = '回到中轨 +'+pp.toFixed(1)+'%, 卖30% ≈ $'+sa.toFixed(2);
      }
    }
    return { state: ns, action: act, detail: det };
  },
};

module.exports = { strategy: strategyDef };

if (require.main === module) {
  const isLive = process.argv.includes('--live');
  const dataPath = findDataFile();
  if (!dataPath) { console.error('❌ 请先运行 scripts/fetch_data.js'); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const data = raw.data;

  if (isLive) {
    const last = data[data.length - 1];
    const simState = strategyDef.init();
    for (let i = 0; i < data.length - 1; i++) {
      const r = strategyDef.next(data[i], i, simState, data);
      if (r) Object.assign(simState, r.state);
    }
    const result = strategyDef.next(last, data.length - 1, simState, data);
    const ns = result ? result.state : simState;
    console.log('\n📉 布林带回归 — 今日操作建议');
    console.log('='.repeat(42));
    console.log('  日期:     ' + last.date);
    console.log('  收盘价:   $' + last.close);
    console.log('  涨跌幅:   ' + (last.changePercent >= 0 ? '+' : '') + (last.changePercent?.toFixed(2) || '0') + '%');
    console.log('  建议操作: ' + (result?.action === 'BUY' ? '🟢 买入' : result?.action === 'SELL' ? '🔴 卖出' : '⚪ 持有'));
    console.log('  详情:     ' + (result?.detail || '无操作'));
    console.log('  当前 USDT: $' + ns.usdt.toFixed(2));
    console.log('  当前 BTC:  ' + ns.btc.toFixed(6) + ' BTC');
    console.log();
  } else {
    const result = runBacktest(data, strategyDef);
    const s = result.summary;
    console.log('\n📉 布林带回归');
    console.log('='.repeat(60));
    console.log('  数据: ' + s.startDate + ' ~ ' + s.endDate + ' (' + s.totalDays + ' 天)');
    console.log('  BTC: $' + s.btcStart + ' → $' + s.btcEnd + ' (' + (s.btcReturn >= 0 ? '+' : '') + s.btcReturn + '%)');
    console.log();
    console.log('📊 回测结果:');
    console.log('  初始资金:     $' + s.initialUSDT.toLocaleString());
    console.log('  最终总资产:   $' + s.finalValue.toLocaleString());
    console.log('  总盈亏:       ' + (s.profit >= 0 ? '+' : '') + '$' + s.profit.toLocaleString() + ' (' + (s.profitPct >= 0 ? '+' : '') + s.profitPct + '%)');
    console.log('  最大回撤:     ' + s.maxDrawdown + '%');
    console.log('  交易次数:     ' + s.buyCount + ' 次买入 / ' + s.sellCount + ' 次卖出');
    const out = path.resolve(__dirname, 'backtest_result.json');
    fs.writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8');
    console.log('\n📁 结果已保存: backtest_result.json');
  }
}

function findDataFile() {
  const dir = __dirname;
  const c = [
    path.resolve(dir, '../../data/btc_daily.json'),
    path.resolve(dir, '../../btc_daily_3y.json'),
    '/root/projects/btc-algo/btc_daily_3y.json',
  ];
  for (const f of c) { if (fs.existsSync(f)) return f; }
  return null;
}
