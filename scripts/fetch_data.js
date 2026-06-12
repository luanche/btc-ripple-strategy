#!/usr/bin/env node

/**
 * 从 Binance API 拉取 BTC/USDT 日线数据
 * 增量更新：如果已有数据文件，只补最新数据
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.resolve(__dirname, '../data/btc_daily.json');
const SYMBOL = 'BTCUSDT';
const INTERVAL = '1d';
const LIMIT = 100;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Parse error: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

async function fetchKlines(startTime, endTime) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=${INTERVAL}&startTime=${startTime}&endTime=${endTime}&limit=${LIMIT}`;
  return httpGet(url);
}

function klineToRecord(k) {
  return {
    date: new Date(k[0]).toISOString().slice(0, 10),
    timestamp: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    quoteVolume: parseFloat(k[7]),
  };
}

function calcChanges(data) {
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      data[i].change = null;
      data[i].changePercent = null;
    } else {
      const prevClose = data[i - 1].close;
      data[i].change = Math.round((data[i].close - prevClose) * 100) / 100;
      data[i].changePercent = Math.round(((data[i].close - prevClose) / prevClose) * 10000) / 100;
    }
  }
}

async function main() {
  console.log('📥 正在获取 BTC/USDT 数据...');

  // 读取已有数据
  let existing = [];
  if (fs.existsSync(DATA_FILE)) {
    existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')).data || [];
    console.log('  已有数据: ' + (existing[0]?.date || '?') + ' ~ ' + (existing[existing.length - 1]?.date || '?') + ' (' + existing.length + ' 条)');
  }

  const now = Date.now();

  // 获取最近数据
  let startTime;
  if (existing.length > 0) {
    // 从最后一条数据的下一天开始获取
    startTime = existing[existing.length - 1].timestamp + 86400000;
  } else {
    // 获取最近 3 年
    startTime = now - 3 * 365 * 86400000;
  }

  const klines = await fetchKlines(startTime, now);
  if (!Array.isArray(klines) || klines.length === 0) {
    console.log('  没有新数据');
    // 保存已有数据（补充 change 字段）
    calcChanges(existing);
    const output = {
      symbol: SYMBOL,
      interval: INTERVAL,
      base: 'BTC', quote: 'USDT',
      fetchedAt: new Date().toISOString(),
      data: existing,
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2), 'utf-8');
    console.log('✅ 数据已更新: ' + DATA_FILE);
    return;
  }

  console.log('  新获取: ' + klines.length + ' 条');

  // 去重（可能包含最后一天）
  const existingDates = new Set(existing.map(d => d.date));
  const newRecords = klines.map(klineToRecord).filter(r => !existingDates.has(r.date));

  if (newRecords.length === 0) {
    console.log('  无新数据（已存在）');
  } else {
    console.log('  新增: ' + newRecords[0].date + ' ~ ' + newRecords[newRecords.length - 1].date + ' (' + newRecords.length + ' 条)');
    existing = existing.concat(newRecords);
  }

  calcChanges(existing);

  const output = {
    symbol: SYMBOL,
    interval: INTERVAL,
    base: 'BTC', quote: 'USDT',
    fetchedAt: new Date().toISOString(),
    totalDays: existing.length,
    startDate: existing[0]?.date,
    endDate: existing[existing.length - 1]?.date,
    data: existing,
  };

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log('✅ 数据已保存: ' + DATA_FILE);
  console.log('   范围: ' + output.startDate + ' ~ ' + output.endDate + ' (' + output.totalDays + ' 天)');
  console.log('   最新: $' + (existing[existing.length - 1]?.close || '?'));
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
