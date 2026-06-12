#!/usr/bin/env node

/**
 * 🌊 涟漪策略 — 自适应牛熊版
 * ==========================
 *
 * 核心理念：
 * - 用 MA60 判断市场状态
 * - 牛市中激进买入（越跌越买 + 追涨）
 * - 熊市中保守买入（不追涨 + 减量 50%）
 * - 无 MA60 数据时默认牛市模式
 */

const path = require('path');
const fs = require('fs');
const shared = require('../shared');

// ============================================================
// 默认配置
// ============================================================
const DEFAULT_CONFIG = {
  initialUSDT: 10000,
  // 牛市参数（价格 > MA60，或无 MA60 数据时默认）
  bull: {
    baseBuyUSDT: 30,
    buyMultiplierPerDownDay: 3,
    maxBuyUSDT: 1000,
    upBuyAmt: 5,
    sellPctPerUpDay: 0.005,
    maxSellPctPerDay: 0.05,
  },
  // 熊市参数（价格 < MA60）
  bear: {
    baseBuyUSDT: 15,          // 买入减半
    buyMultiplierPerDownDay: 2,  // 倍数降低
    maxBuyUSDT: 300,
    upBuyAmt: 0,              // 不追涨
    sellPctPerUpDay: 0.01,    // 卖多一点
    maxSellPctPerDay: 0.10,
  },
  trendPeriod: 60,  // 用 MA60 判断趋势（更快响应）
};

// ============================================================
// 策略定义
// ============================================================
const strategyDef = {
  name: '🌊 涟漪策略',

  init: () => ({
    usdt: 10000,
    btc: 0,
    downStreak: 0,
    upStreak: 0,
    yesterdayDown: false,
  }),

  next: (day, idx, state, data) => {
    const { close, changePercent } = day;
    if (idx === 0 || changePercent === null || changePercent === undefined) return null;

    // 判断牛熊：用 MA60
    let inBull = true; // 默认牛市
    if (idx >= DEFAULT_CONFIG.trendPeriod) {
      const prices = data.slice(0, idx + 1).map(d => d.close);
      const ma60 = shared.SMA(prices, DEFAULT_CONFIG.trendPeriod);
      const curMA = ma60[ma60.length - 1];
      if (curMA !== null) {
        inBull = close > curMA;
      }
    }

    const params = inBull ? DEFAULT_CONFIG.bull : DEFAULT_CONFIG.bear;
    let ns = { ...state };
    let action = 'hold';
    let detail = inBull ? '🐂' : '🐻';

    const isDown = changePercent < 0;

    if (isDown) {
      // ⬇️ 下跌日
      ns.downStreak = state.downStreak + 1;
      ns.upStreak = 0;

      // 计算买入金额
      let buyAmt = params.baseBuyUSDT * (1 + (ns.downStreak - 1) * params.buyMultiplierPerDownDay);
      buyAmt = Math.min(buyAmt, params.maxBuyUSDT, ns.usdt);

      if (buyAmt > 1) {
        ns.usdt -= buyAmt;
        ns.btc += buyAmt / close;
        action = 'BUY';
        detail += ` 买入 $${buyAmt.toFixed(2)} (连跌${ns.downStreak}天)`;
      } else {
        detail += ` USDT 不足`;
      }
      ns.yesterdayDown = true;

    } else {
      // ⬆️ 上涨日
      ns.upStreak = state.upStreak + 1;
      ns.downStreak = 0;

      // 追涨买入（仅牛市）
      if (inBull && ns.usdt >= params.upBuyAmt && params.upBuyAmt > 0) {
        ns.usdt -= params.upBuyAmt;
        ns.btc += params.upBuyAmt / close;
        action = 'BUY';
        detail += ` 追涨 $${params.upBuyAmt.toFixed(2)}`;
      }

      // 止盈卖出
      if (ns.btc > 0) {
        let sellPct = Math.min(params.sellPctPerUpDay * ns.upStreak, params.maxSellPctPerDay);
        if (sellPct > 0) {
          const btcToSell = ns.btc * sellPct;
          const sellAmt = btcToSell * close;
          ns.btc -= btcToSell;
          ns.usdt += sellAmt;
          action = action === 'BUY' ? 'BUY&SELL' : 'SELL';
          detail += ` 卖出 ${(sellPct * 100).toFixed(1)}% ≈ $${sellAmt.toFixed(2)}`;
        }
      }
      ns.yesterdayDown = false;
    }

    return { state: ns, action, detail };
  },
};

// ============================================================
// CLI
// ============================================================
function main() {
  const isLive = process.argv.includes('--live');
  const dataPath = findDataFile();
  if (!dataPath) {
    console.error('❌ 请先运行 scripts/fetch_data.js');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const data = raw.data;

  if (isLive) {
    const last = data[data.length - 1];
    // 判断今日牛熊
    let inBull = true;
    if (data.length >= DEFAULT_CONFIG.trendPeriod) {
      const prices = data.map(d => d.close);
      const ma60 = shared.SMA(prices, DEFAULT_CONFIG.trendPeriod);
      const curMA = ma60[ma60.length - 1];
      if (curMA !== null) inBull = last.close > curMA;
    }
    // 模拟操作
    const sim = strategyDef.init();
    for (let i = 0; i < data.length - 1; i++) {
      const r = strategyDef.next(data[i], i, sim, data);
      if (r) Object.assign(sim, r.state);
    }
    const result = strategyDef.next(last, data.length - 1, sim, data);
    const ns = result ? result.state : sim;

    console.log('\n🌊 涟漪策略 — 今日操作建议');
    console.log('='.repeat(45));
    console.log('  日期:     ' + last.date);
    console.log('  收盘价:   $' + last.close);
    console.log('  涨跌幅:   ' + (last.changePercent >= 0 ? '+' : '') + last.changePercent?.toFixed(2) + '%');
    console.log('  市场:     ' + (inBull ? '🐂 牛市' : '🐻 熊市'));
    console.log('  建议操作: ' + (result?.action === 'BUY' ? '🟢 买入' : result?.action === 'SELL' ? '🔴 卖出' : result?.action === 'BUY&SELL' ? '🟡 买入+卖出' : '⚪ 持有'));
    console.log('  详情:     ' + (result?.detail || '无操作'));
    console.log('  当前 USDT: $' + ns.usdt.toFixed(2));
    console.log('  当前 BTC:  ' + ns.btc.toFixed(6) + ' BTC');
    console.log();
  } else {
    const result = shared.runBacktest(data, strategyDef);
    const s = result.summary;
    console.log('\n🌊 涟漪策略 (Ripple Strategy)');
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
    console.log();

    const outPath = path.resolve(__dirname, 'backtest_result.json');
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log('📁 结果已保存: backtest_result.json');

    // 近 5 笔
    console.log('\n📋 最近 5 笔交易:');
    const recent = result.trades.slice(-5);
    for (const t of recent) {
      const icon = t.action === 'BUY' ? '🟢' : t.action === 'SELL' ? '🔴' : t.action === 'BUY&SELL' ? '🟡' : '⚪';
      console.log('   ' + icon + ' [' + t.date + '] ' + (t.detail || '').slice(0, 40).padEnd(42) + ' | $' + t.totalValue);
    }
    console.log();
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

module.exports = { strategy: strategyDef, config: DEFAULT_CONFIG };

if (require.main === module) main();
