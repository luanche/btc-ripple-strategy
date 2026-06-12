/**
 * 生成所有策略脚本（涟漪 V2 已手动创建，跳过）
 */
const fs = require('fs');
const path = require('path');
const base = path.resolve(__dirname, '../strategies');

// 策略定义: dir, name, emoji, desc, init, logic
const strategies = [
  // ---- ma-crossover ----
  { dir: 'ma-crossover', name: '双均线交叉', emoji: '📈', desc: 'MA20 上穿 MA60 全仓买入, 下穿清仓',
    init: '() => ({ usdt: 10000, btc: 0, inPosition: false })',
    genNext: (E) => `
    if (idx < 60) return null;
    const p = data.slice(0, idx + 1).map(d => d.close);
    const ma20 = SMA(p, 20), ma60 = SMA(p, 60);
    const c20 = ma20[ma20.length-1], c60 = ma60[ma60.length-1];
    const p20 = ma20.length > 1 ? ma20[ma20.length-2] : null;
    const p60 = ma60.length > 1 ? ma60[ma60.length-2] : null;
    if (!c20 || !c60 || !p20 || !p60) return null;
    let ns = { ...state }, act = 'hold', det = 'MA20='+c20.toFixed(0)+' MA60='+c60.toFixed(0);
    if (!state.inPosition && p20 <= p60 && c20 > c60 && ns.usdt > 1) {
      ns.btc += ns.usdt / close; ns.usdt = 0; ns.inPosition = true;
      act = 'BUY'; det = '金叉! 全仓买入 @ '+close.toFixed(0);
    } else if (state.inPosition && p20 >= p60 && c20 < c60 && ns.btc > 0.0001) {
      ns.usdt += ns.btc * close; ns.btc = 0; ns.inPosition = false;
      act = 'SELL'; det = '死叉! 清仓 @ '+close.toFixed(0);
    } else det += state.inPosition ? ' 持仓中' : ' 空仓';
    return { state: ns, action: act, detail: det };`,
  },
  // ---- bollinger ----
  { dir: 'bollinger', name: '布林带回归', emoji: '📉', desc: '触及下轨买入, 触及上轨卖出 (20,2)',
    init: '() => ({ usdt: 10000, btc: 0, lastBuyPrice: 0 })',
    genNext: (E) => `
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
    return { state: ns, action: act, detail: det };`,
  },
  // ---- dca ----
  { dir: 'dca', name: '定期定投 DCA', emoji: '💰', desc: '每周一买入 $100 BTC, 从不卖出',
    init: '() => ({ usdt: 10000, btc: 0, weekCount: 0 })',
    genNext: (E) => `
    if (idx === 0) return null;
    const prevDate = data[idx-1].date, curDate = day.date;
    const pw = new Date(prevDate).getDay(), cw = new Date(curDate).getDay();
    let ns = { ...state }, act = 'hold', det = '';
    if (cw === 1 && ns.usdt >= 100) {
      ns.usdt -= 100; ns.btc += 100 / close; ns.weekCount++;
      act = 'BUY'; det = '第'+ns.weekCount+'周定投 $100 @ '+close.toFixed(0);
    }
    return { state: ns, action: act, detail: det };`,
  },
  // ---- bull-bear-dca ----
  { dir: 'bull-bear-dca', name: '牛持熊投', emoji: '🐂🐻', desc: 'MA200 之上持币, 之下每日定投 $50',
    init: '() => ({ usdt: 10000, btc: 0, inBull: true })',
    genNext: (E) => `
    if (idx < 200) return null;
    const p = data.slice(0, idx + 1).map(d => d.close);
    const ma200 = SMA(p, 200);
    const curMA = ma200[ma200.length-1];
    if (curMA === null) return null;
    let ns = { ...state }, act = 'hold', det = 'MA200='+curMA.toFixed(0);
    const inBullNow = close > curMA;
    if (!state.inBull && inBullNow && ns.usdt > 1) {
      ns.btc += ns.usdt / close; ns.usdt = 0; ns.inBull = true;
      act = 'BUY'; det = '转牛! 全仓买入 @ '+close.toFixed(0);
    } else if (state.inBull && !inBullNow && ns.btc > 0.001) {
      ns.usdt += ns.btc * close; ns.btc = 0; ns.inBull = false;
      act = 'SELL'; det = '转熊! 清仓 @ '+close.toFixed(0);
    } else if (!inBullNow && ns.usdt >= 50) {
      ns.usdt -= 50; ns.btc += 50 / close;
      act = 'BUY'; det = '熊市定投 $50 @ '+close.toFixed(0);
    } else det += inBullNow ? ' 牛市持有中' : ' 熊市USDT剩余$'+ns.usdt.toFixed(0);
    ns.inBull = inBullNow;
    return { state: ns, action: act, detail: det };`,
  },
  // ---- momentum-breakout ----
  { dir: 'momentum-breakout', name: '动量突破', emoji: '🚀', desc: '突破20日高点买入, 跌破20日低点清仓',
    init: '() => ({ usdt: 10000, btc: 0, inPosition: false })',
    genNext: (E) => `
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
    return { state: ns, action: act, detail: det };`,
  },
  // ---- rsi ----
  { dir: 'rsi', name: 'RSI 超买超卖', emoji: '📊', desc: 'RSI(14) < 30 买入, > 70 卖出',
    init: '() => ({ usdt: 10000, btc: 0, inPosition: false })',
    genNext: (E) => `
    if (idx < 14) return null;
    const p = data.slice(0, idx + 1).map(d => d.close);
    const rsi = RSI(p, 14);
    const cur = rsi[rsi.length-1];
    if (cur === null) return null;
    let ns = { ...state }, act = 'hold', det = 'RSI='+cur.toFixed(1);
    if (!state.inPosition && cur < 30 && ns.usdt > 1) {
      ns.btc += ns.usdt / close; ns.usdt = 0; ns.inPosition = true;
      act = 'BUY'; det = 'RSI='+cur.toFixed(1)+' < 30 超卖! 全仓';
    } else if (state.inPosition && cur > 70 && ns.btc > 0.001) {
      ns.usdt += ns.btc * close; ns.btc = 0; ns.inPosition = false;
      act = 'SELL'; det = 'RSI='+cur.toFixed(1)+' > 70 超买! 清仓';
    } else det += state.inPosition ? ' 持仓' : ' 空仓';
    return { state: ns, action: act, detail: det };`,
  },
];

// ============================================================
// 模板
// ============================================================
function genStrategyJS(s) {
  const nextFn = s.genNext('E');
  return `#!/usr/bin/env node

/**
 * ${s.emoji} ${s.name}
 * ${s.desc}
 */

const path = require('path');
const fs = require('fs');
const { SMA, RSI, Bollinger, runBacktest } = require('../shared');

const strategyDef = {
  name: '${s.emoji} ${s.name}',
  init: ${s.init},
  next: (day, idx, state, data) => {
    const { close, changePercent, high, low } = day;
    if (idx === 0 || changePercent === null || changePercent === undefined) return null;
    ${nextFn}
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
    console.log('\\n${s.emoji} ${s.name} — 今日操作建议');
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
    console.log('\\n${s.emoji} ${s.name}');
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
    console.log('\\n📁 结果已保存: backtest_result.json');
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
`;
}

function genREADME(s) {
  return `# ${s.emoji} ${s.name}

> ${s.desc}

## 运行

\`\`\`bash
# 回测3年数据
node strategy.js

# 今日操作建议
node strategy.js --live
\`\`\`
`;
}

// ============================================================
// 写入
// ============================================================
for (const s of strategies) {
  const dir = path.join(base, s.dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'strategy.js'), genStrategyJS(s), 'utf-8');
  fs.writeFileSync(path.join(dir, 'README.md'), genREADME(s), 'utf-8');
  console.log('✅ ' + dir);
}
console.log('\n🎉 全部策略已生成!');
