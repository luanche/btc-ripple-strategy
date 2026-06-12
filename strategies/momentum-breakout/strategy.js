#!/usr/bin/env node

/**
 * 🚀 动量突破
 * 突破20日高点买入, 跌破20日低点清仓
 */

const path = require('path');
const fs = require('fs');
const { SMA, RSI, Bollinger, runBacktest } = require('../shared');

const strategyDef = {
  name: '🚀 动量突破',
  init: () => ({ usdt: 10000, btc: 0, inPosition: false }),
  next: (day, idx, state, data) => {
    const { close, changePercent, high, low } = day;
    if (idx === 0 || changePercent === null || changePercent === undefined) return null;
    
    if (idx < 20) return null;
    const sl = data.slice(idx - 19, idx + 1);
    const h20 = Math.max(...sl.map(d => d.high));
    const l20 = Math.min(...sl.map(d => d.low));
    let ns = { ...state }, act = 'hold', det = 'H20='+h20.toFixed(0)+' L20='+l20.toFixed(0);
    if (!state.inPosition && close > h20 && ns.usdt > 1) {
      const buy = ns.usdt * 0.5;
      ns.usdt -= buy; ns.btc += buy / close; ns.inPosition = true;
      act = 'BUY'; det = '突破20日高! 半仓 $'+buy.toFixed(2);
    } else if (state.inPosition && close < l20 && ns.btc > 0.001) {
      ns.usdt += ns.btc * close; ns.btc = 0; ns.inPosition = false;
      act = 'SELL'; det = '跌破20日低! 清仓 @ '+close.toFixed(0);
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
    console.log('\n🚀 动量突破 — 今日操作建议');
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
    console.log('\n🚀 动量突破');
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
