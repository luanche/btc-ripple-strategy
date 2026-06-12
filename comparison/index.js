#!/usr/bin/env node

/**
 * 📊 BTC 多策略对比入口
 *
 * 运行: node comparison/index.js
 * 输出: 控制台表格 + comparison/result.json
 */

const { runBacktest } = require('../strategies/shared');
const fs = require('fs');
const path = require('path');

// 加载数据
const dataPath = path.resolve(__dirname, '../data/btc_daily.json');
const oldPath = path.resolve(__dirname, '../btc_daily_3y.json');
let raw;
if (fs.existsSync(dataPath)) raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
else if (fs.existsSync(oldPath)) raw = JSON.parse(fs.readFileSync(oldPath, 'utf-8'));
else { console.error('❌ 未找到数据文件'); process.exit(1); }

const data = raw.data;

// 加载策略
const strategyDirs = [
  { dir: 'ripple', hodl: false },
  { dir: 'ma-crossover', hodl: false },
  { dir: 'bollinger', hodl: false },
  { dir: 'dca', hodl: false },
  { dir: 'bull-bear-dca', hodl: false },
  { dir: 'momentum-breakout', hodl: false },
  { dir: 'rsi', hodl: false },
];

const strategies = [];
for (const { dir } of strategyDirs) {
  try {
    const mod = require(path.resolve(__dirname, '../strategies', dir, 'strategy.js'));
    if (mod && mod.strategy) strategies.push(mod.strategy);
  } catch (e) {
    console.error('⚠️ 加载 ' + dir + ' 失败:', e.message);
  }
}

// 持有不动
strategies.push({
  name: '🏦 持有不动',
  init: () => ({ usdt: 10000, btc: 0 }),
  next: (day, idx, state) => {
    if (idx === 0) { state.btc = state.usdt / day.close; state.usdt = 0; }
    return { state: { ...state }, action: idx === 0 ? 'BUY' : 'hold', detail: '' };
  },
});

function runAndPrint(label, dataSlice, btcNote) {
  const results = strategies.map(s => runBacktest(dataSlice, s));
  results.sort((a, b) => b.summary.profitPct - a.summary.profitPct);

  console.log('\n📊 ' + label);
  console.log('   ' + btcNote);
  console.log('='.repeat(95));
  console.log('  ' + '排名'.padEnd(4) + '策略'.padEnd(16) + '最终资产'.padEnd(14) + '收益%'.padEnd(10) + '年化%'.padEnd(8) + '回撤%'.padEnd(8) + '交易');
  console.log('='.repeat(95));
  results.forEach((r, i) => {
    const s = r.summary;
    const yrs = dataSlice.length / 365;
    const ann = ((1 + s.profitPct / 100) ** (1 / yrs) - 1) * 100;
    console.log('  ' + (i + 1).toString().padEnd(4) + r.name.slice(0, 14).padEnd(16) +
      ('$' + s.finalValue).padEnd(14) + (s.profitPct >= 0 ? '+' : '') + s.profitPct.toFixed(1) + '%'.padEnd(8) +
      (ann >= 0 ? '+' : '') + ann.toFixed(1) + '%'.padEnd(7) + s.maxDrawdown + '%'.padEnd(7) +
      s.buyCount + '/' + s.sellCount);
  });
  return results;
}

// 3 年
const r3 = runAndPrint('3 年对比', data, 'BTC +' + ((data[data.length - 1].close - data[0].close) / data[0].close * 100).toFixed(2) + '%');

// 1 年
const y1 = data.slice(-365);
const btc1 = ((y1[y1.length - 1].close - y1[0].close) / y1[0].close * 100).toFixed(2);
runAndPrint('最近 1 年熊市对比', y1, 'BTC ' + (btc1 >= 0 ? '+' : '') + btc1 + '%');

// 保存结果
fs.writeFileSync(path.resolve(__dirname, 'result.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  dataRange: data[0]?.date + ' ~ ' + data[data.length - 1]?.date,
  results: r3.map(r => ({
    name: r.name,
    summary: r.summary,
  })),
}, null, 2), 'utf-8');
console.log('\n📁 结果已保存: comparison/result.json');
