#!/usr/bin/env node

/**
 * 每日策略报告
 * ============
 * 1. 更新 BTC 数据
 * 2. 运行所有策略
 * 3. 生成报告并通过 QQ 邮件发送
 *
 * 环境变量:
 *   QQ_MAIL_USER     - QQ 邮箱地址 (xxx@qq.com)
 *   QQ_MAIL_PASS     - QQ 邮箱授权码（非密码）
 *   QQ_MAIL_TO       - 接收报告的邮箱（可多个，逗号分隔）
 *   MAIL_FROM_NAME   - 发件人名称（可选，默认 "BTC 策略日报"）
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ============================================================
// 配置
// ============================================================
const CONFIG = {
  qqUser: process.env.QQ_MAIL_USER || '',
  qqPass: process.env.QQ_MAIL_PASS || '',
  mailTo: (process.env.QQ_MAIL_TO || '').split(',').map(s => s.trim()).filter(Boolean),
  fromName: process.env.MAIL_FROM_NAME || 'BTC 策略日报',
};

// ============================================================
// 加载策略
// ============================================================
const { runBacktest } = require('../strategies/shared');

const strategyDirs = [
  'ripple', 'ma-crossover', 'bollinger', 'dca',
  'bull-bear-dca', 'momentum-breakout', 'rsi',
];

function loadStrategies() {
  const list = [];
  for (const dir of strategyDirs) {
    try {
      const mod = require(path.resolve(__dirname, '../strategies', dir, 'strategy.js'));
      if (mod && mod.strategy) list.push(mod.strategy);
    } catch (e) {
      console.error('⚠️ 加载策略 ' + dir + ' 失败:', e.message);
    }
  }
  return list;
}

// ============================================================
// 获取 BTC 数据
// ============================================================
function loadData() {
  const candidates = [
    path.resolve(__dirname, '../data/btc_daily.json'),
    path.resolve(__dirname, '../btc_daily_3y.json'),
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
  }
  return null;
}

// ============================================================
// 生成 HTML 报告
// ============================================================
function generateHTMLReport(data, results, yesterdayResults) {
  const last = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : null;

  // 今日行情
  let marketHTML = `
    <tr>
      <td>${last.date}</td>
      <td>$${last.close.toLocaleString()}</td>
      <td style="color:${last.changePercent >= 0 ? '#e74c3c' : '#27ae60'}">${last.changePercent >= 0 ? '📈 +' : '📉 '}${last.changePercent?.toFixed(2)}%</td>
      <td>$${last.high.toLocaleString()}</td>
      <td>$${last.low.toLocaleString()}</td>
      <td>${(last.volume / 1000).toFixed(1)}K BTC</td>
    </tr>`;

  // 昨日行情
  let yesterdayHTML = '';
  if (prev) {
    yesterdayHTML = `
    <tr style="color:#999">
      <td>${prev.date}</td>
      <td>$${prev.close.toLocaleString()}</td>
      <td style="color:${prev.changePercent >= 0 ? '#e74c3c' : '#27ae60'}">${prev.changePercent >= 0 ? '📈 +' : '📉 '}${prev.changePercent?.toFixed(2)}%</td>
      <td colspan="3">昨日收盘</td>
    </tr>`;
  }

  // 策略排名
  const sorted = [...results].sort((a, b) => b.summary.profitPct - a.summary.profitPct);
  let strategyRows = '';
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const s = r.summary;
    const lastTrade = r.trades[r.trades.length - 1];
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
    const profitColor = s.profitPct >= 0 ? '#e74c3c' : '#27ae60';
    const profitSign = s.profitPct >= 0 ? '+' : '';
    const lastActionIcon = lastTrade?.action === 'BUY' ? '🟢' : lastTrade?.action === 'SELL' ? '🔴' : lastTrade?.action === 'BUY&SELL' ? '🟡' : '⚪';

    // 找前一天的值
    let yestVal = yesterdayResults?.find(yr => yr.name === r.name);
    let diffHTML = '';
    if (yestVal) {
      const diff = s.finalValue - yestVal.summary.finalValue;
      diffHTML = `<span style="color:${diff >= 0 ? '#e74c3c' : '#27ae60'};font-size:12px">${diff >= 0 ? '▲' : '▼'} $${Math.abs(diff).toFixed(2)}</span>`;
    }

    strategyRows += `
    <tr>
      <td>${medal}</td>
      <td><strong>${r.name}</strong></td>
      <td>$${s.finalValue.toLocaleString()}</td>
      <td style="color:${profitColor};font-weight:bold">${profitSign}${s.profitPct.toFixed(2)}%</td>
      <td>${s.maxDrawdown}%</td>
      <td>${s.buyCount}/${s.sellCount}</td>
      <td>${lastActionIcon} ${lastTrade?.detail?.slice(0, 30) || '无操作'}</td>
      <td>${diffHTML}</td>
    </tr>`;
  }

  // 今日操作建议摘要
  const best = sorted[0];
  const bestTrade = best?.trades[best.trades.length - 1];

  // BTC 整体表现（从数据开始算）
  const btcReturn = data.length > 1
    ? ((last.close - data[0].close) / data[0].close * 100).toFixed(2)
    : 'N/A';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { font-size: 22px; margin: 0 0 4px 0; }
    .subtitle { color: #888; font-size: 13px; margin-bottom: 20px; }
    .summary-box { background: #f0f7ff; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .summary-box .big { font-size: 28px; font-weight: bold; }
    .summary-box .label { font-size: 12px; color: #888; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f8f9fa; text-align: left; padding: 8px 10px; font-size: 12px; color: #666; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
    .section-title { font-size: 16px; font-weight: 600; margin: 20px 0 10px 0; padding-bottom: 6px; border-bottom: 2px solid #f0f0f0; }
    .footer { text-align: center; color: #aaa; font-size: 11px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 BTC 策略日报</h1>
    <div class="subtitle">${last.date} (${new Date().toISOString().slice(0, 10)} 生成) · 数据跨度: ${data[0]?.date} ~ ${last.date}</div>

    <div class="summary-box">
      <table style="margin:0">
        <tr>
          <td style="width:25%;border:none"><span class="label">BTC 收盘价</span><br><span class="big">$${last.close.toLocaleString()}</span></td>
          <td style="width:25%;border:none"><span class="label">今日涨跌</span><br><span class="big" style="color:${last.changePercent >= 0 ? '#e74c3c' : '#27ae60'}">${last.changePercent >= 0 ? '+' : ''}${last.changePercent?.toFixed(2)}%</span></td>
          <td style="width:25%;border:none"><span class="label">BTC 总涨幅</span><br><span class="big">${btcReturn}%</span></td>
          <td style="width:25%;border:none"><span class="label">最优策略</span><br><span class="big" style="font-size:20px">${best?.name || 'N/A'}</span></td>
        </tr>
      </table>
    </div>

    <div class="section-title">📈 市场行情</div>
    <table>
      <tr><th>日期</th><th>收盘价</th><th>涨跌幅</th><th>最高</th><th>最低</th><th>成交量</th></tr>
      ${marketHTML}
      ${yesterdayHTML}
    </table>

    <div class="section-title">📊 策略排名 (3年回测)</div>
    <table>
      <tr><th>#</th><th>策略</th><th>总资产</th><th>收益率</th><th>最大回撤</th><th>买/卖</th><th>昨/今操作</th><th>较前日</th></tr>
      ${strategyRows}
    </table>

    <div class="section-title">💡 今日操作建议</div>
    <table>
      ${sorted.map(r => {
        const lastT = r.trades[r.trades.length - 1];
        const icon = lastT?.action === 'BUY' ? '🟢' : lastT?.action === 'SELL' ? '🔴' : lastT?.action === 'BUY&SELL' ? '🟡' : '⚪';
        return `<tr><td style="width:30%">${r.name}</td><td>${icon} ${lastT?.detail || '无操作'}</td></tr>`;
      }).join('')}
    </table>

    <div class="footer">
      BTC 策略日报 · 由 GitHub Actions 自动生成<br>
      数据源: Binance API · 投资有风险，仅供参考
    </div>
  </div>
</body>
</html>`;
}

// ============================================================
// 发送 QQ 邮件
// ============================================================
function sendQQMail(htmlContent, subject) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.qqUser || !CONFIG.qqPass || CONFIG.mailTo.length === 0) {
      console.log('⚠️ QQ 邮件未配置，跳过发送');
      console.log('   设置环境变量: QQ_MAIL_USER, QQ_MAIL_PASS, QQ_MAIL_TO');
      resolve(false);
      return;
    }

    const mailFrom = CONFIG.qqUser;
    const toList = CONFIG.mailTo.join(', ');

    // 构建邮件内容
    const boundary = '----=_Part_' + Date.now();
    const headers = [
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="' + boundary + '"',
      'To: ' + toList,
      'From: "' + CONFIG.fromName + '" <' + mailFrom + '>',
      'Subject: =?UTF-8?B?' + Buffer.from(subject).toString('base64') + '?=',
    ].join('\r\n');

    const body = [
      '--' + boundary,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('BTC 策略日报已生成，请查看 HTML 版本以获得最佳体验。').toString('base64'),
      '',
      '--' + boundary,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(htmlContent).toString('base64'),
      '',
      '--' + boundary + '--',
    ].join('\r\n');

    const rawMessage = headers + '\r\n\r\n' + body;
    const encodedMessage = Buffer.from(rawMessage, 'utf-8').toString('base64');

    // QQ 邮件 SMTP
    const postData = 'grant_type=client_credentials&client_id=qqmail&client_secret=qqmail';
    // 使用 smtp.qq.com:465 (SSL)
    const smtpReq = [
      'EHLO sender',
      'AUTH LOGIN',
      Buffer.from(CONFIG.qqUser).toString('base64'),
      Buffer.from(CONFIG.qqPass).toString('base64'),
      'MAIL FROM:<' + CONFIG.qqUser + '>',
      'RCPT TO:<' + CONFIG.mailTo[0] + '>',
      'DATA',
      encodedMessage,
      '.',
      'QUIT',
    ].join('\r\n');

    // 使用 nodemailer 风格的简单 SMTP
    // 由于不能直接用 nodemailer，用 https request 到 QQ 邮箱 API 或 SMTP
    console.log('📧 正在发送邮件到: ' + CONFIG.mailTo.join(', '));
    console.log('   (实际项目中推荐使用 nodemailer 或 sendmail)');

    // 保存到本地文件
    const reportPath = path.resolve(__dirname, '../daily_report.html');
    fs.writeFileSync(reportPath, htmlContent, 'utf-8');
    console.log('📁 报告已保存: ' + reportPath);

    // 用 QQ 邮箱 SMTP 的简单实现
    // 注意: 需要 nodemailer 或类似库，这里用 Net 模块实现
    const net = require('net');
    const client = new net.Socket();
    const smtpServer = 'smtp.qq.com';
    const smtpPort = 465;

    // 使用 SSL 连接
    const tls = require('tls');
    const tlsSocket = tls.connect(smtpPort, smtpServer, { rejectUnauthorized: false }, () => {
      let step = 0;
      let buffer = '';
      let lastLine = '';

      function write(data) {
        console.log('SMTP >>>', data.slice(0, 60));
        tlsSocket.write(data + '\r\n');
      }

      // SMTP 状态机
      function handleLine(line) {
        console.log('SMTP <<<', line.slice(0, 60));
        const code = parseInt(line);

        if (code === 220 && step === 0) {
          // 服务器就绪
          write('EHLO btc-report'); step = 1;
        } else if (code === 250 && step === 1) {
          // EHLO 成功
          write('AUTH LOGIN'); step = 2;
        } else if (code === 334 && step === 2) {
          // 输入用户名
          write(Buffer.from(CONFIG.qqUser).toString('base64')); step = 3;
        } else if (code === 334 && step === 3) {
          // 输入密码
          write(Buffer.from(CONFIG.qqPass).toString('base64')); step = 4;
        } else if (code === 235 && step === 4) {
          // 认证成功
          write('MAIL FROM:<' + CONFIG.qqUser + '>'); step = 5;
        } else if (code === 250 && step === 5) {
          // MAIL FROM 成功
          write('RCPT TO:<' + CONFIG.mailTo[0] + '>'); step = 6;
        } else if (code === 250 && step === 6) {
          // RCPT TO 成功
          write('DATA'); step = 7;
        } else if (code === 354 && step === 7) {
          // 开始发送数据
          write(headers);
          write('');
          write(body);
          write('.');
          step = 8;
        } else if (code === 250 && step === 8) {
          // 发送完成
          write('QUIT'); step = 9;
        } else if (code === 221 && step === 9) {
          // 退出
          console.log('✅ 邮件发送完成!');
          resolve(true);
        }
      }

      tlsSocket.on('data', (data) => {
        buffer += data.toString();
        // 可能一次收到多行
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || ''; // 保留不完整的最后一行
        for (const line of lines) {
          if (line.trim()) handleLine(line.trim());
        }
      });

      tlsSocket.on('close', () => {
        // 连接关闭
      });
      tlsSocket.on('error', (err) => {
        console.log('⚠️ SMTP 连接错误: ' + err.message);
        console.log('📁 报告已保存到本地: daily_report.html');
        resolve(false);
      });
      // 超时保护
      setTimeout(() => {
        if (step < 9) {
          console.log('⚠️ SMTP 超时, 报告已保存到本地');
          resolve(false);
        }
      }, 15000);
    });

    tlsSocket.on('error', (err) => {
      console.log('⚠️ SMTP 连接失败 (网络限制), 报告已保存到本地: daily_report.html');
      resolve(false);
    });
  });
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  console.log('🤖 BTC 策略日报生成器');
  console.log('='.repeat(50));

  // 1. 加载数据
  const raw = loadData();
  if (!raw) {
    console.error('❌ 未找到数据，请先运行: node scripts/fetch_data.js');
    process.exit(1);
  }
  const data = raw.data;
  console.log('📊 数据: ' + raw.startDate + ' ~ ' + raw.endDate + ' (' + data.length + ' 天)');

  // 2. 加载策略
  const strategies = loadStrategies();
  console.log('🧠 策略: ' + strategies.length + ' 个');

  // 3. 运行回测
  console.log('🔄 运行回测...');
  const results = strategies.map(s => runBacktest(data, s));

  // 4. 昨日结果（用于对比）
  let yesterdayResults = null;
  try {
    const yestPath = path.resolve(__dirname, '../.yesterday_results.json');
    if (fs.existsSync(yestPath)) {
      yesterdayResults = JSON.parse(fs.readFileSync(yestPath, 'utf-8'));
    }
    // 保存今日结果供明日对比
    fs.writeFileSync(yestPath, JSON.stringify(results.map(r => ({ name: r.name, summary: r.summary }))), 'utf-8');
  } catch (e) {}

  // 5. 生成报告
  const lastDate = data[data.length - 1].date;
  const html = generateHTMLReport(data, results, yesterdayResults);
  const reportPath = path.resolve(__dirname, '../daily_report.html');
  fs.writeFileSync(reportPath, html, 'utf-8');
  console.log('📁 报告已生成: ' + reportPath);

  // 6. 发送邮件
  const subject = 'BTC 策略日报 - ' + lastDate + ' (BTC $' + data[data.length - 1].close.toLocaleString() + ')';
  await sendQQMail(html, subject);

  // 7. 输出控制台摘要
  console.log('\n📊 策略排名:');
  const sorted = [...results].sort((a, b) => b.summary.profitPct - a.summary.profitPct);
  sorted.forEach((r, i) => {
    const s = r.summary;
    console.log('  ' + (i + 1) + '. ' + r.name + ': $' + s.finalValue + ' (' + (s.profitPct >= 0 ? '+' : '') + s.profitPct + '%)');
  });

  console.log('\n✅ 完成!');
}

main().catch(err => {
  console.error('❌ 错误:', err);
  process.exit(1);
});
