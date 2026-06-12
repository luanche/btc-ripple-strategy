# 🤖 BTC 量化策略回测系统

> 基于 Binance 公开数据的 BTC/USDT 多策略回测与自动化日报系统。
> 每天自动拉取最新数据，运行 7 种策略，通过 QQ 邮件发送分析报告。

---

## 📦 项目结构

```
btc-algo/
├── .github/workflows/daily_report.yml   # GitHub Action 自动日报
├── data/
│   └── btc_daily.json                    # BTC 日线数据（自动更新）
├── scripts/
│   ├── fetch_data.js                     # 从 Binance 拉取数据
│   ├── daily_report.js                   # 生成日报并发送邮件
│   └── generate_strategies.js            # 策略生成器
├── strategies/
│   ├── shared.js                         # 共享工具（SMA, RSI, 布林带, 回测引擎）
│   ├── ripple/                        # 🌊 涟漪策略（主推）
│   ├── ma-crossover/                     # 📈 双均线交叉
│   ├── bollinger/                        # 📉 布林带回归
│   ├── dca/                              # 💰 定期定投 DCA
│   ├── bull-bear-dca/                    # 🐂🐻 牛持熊投
│   ├── momentum-breakout/                # 🚀 动量突破
│   └── rsi/                              # 📊 RSI 超买超卖
├── comparison/
│   └── index.js                          # 多策略对比入口
├── package.json
├── .gitignore
└── README.md
```

---

## 🎯 策略一览

### 🥇 主推: 🌊 涟漪策略 (Ripple Strategy)

**核心理念**：趋势自适应 + 越跌越买

| 场景 | 行为 | 参数 |
|------|------|------|
| 🐂 **牛市** (价格 > MA60) | 越跌越买（金额随连跌天数×3 递增）+ 每日追涨 $5 + 每日卖出 0.5% | 买入 $30/次起，上限 $1,000 |
| 🐻 **熊市** (价格 < MA60) | 小额买入（金额×2 递增）+ 不追涨 + 每日卖出 1% | 买入 $15/次起，上限 $300 |

**3 年回测表现**：+57.41% 收益 / 19.89% 最大回撤

### 📊 全部策略 3 年对比

| 排名 | 策略 | 总资产 | 收益率 | 年化 | 最大回撤 | 交易 |
|-----|------|-------|-------|------|---------|------|
| 1 | 🏦 **持有不动** | $24,491 | **+144.91%** | 34.7% | 51.16% | 1/0 |
| 2 | 📈 **双均线交叉** | $19,072 | +90.72% | 24.0% | 36.55% | 11/11 |
| 3 | 🌊 **涟漪策略** | $15,741 | **+57.41%** | 16.3% | **19.89%** | 594/533 |
| 4 | 💰 **定期定投 DCA** | $12,397 | +23.97% | 7.4% | 51.16% | 100/0 |
| 5 | 📉 **布林带回归** | $12,389 | +23.89% | 7.4% | **14.53%** | 55/74 |
| 6 | 🚀 **动量突破** | $10,000 | +0.0% | 0.0% | 0% | 0/0 |
| 7 | 🐂🐻 **牛持熊投** | $9,880 | -1.2% | -0.4% | 39.88% | 334/14 |
| 8 | 📊 **RSI 超买超卖** | $9,806 | -1.94% | -0.6% | 44.64% | 13/12 |

### 📊 最近 1 年熊市表现 (BTC -40.18%)

| 排名 | 策略 | 总资产 | 收益率 | 最大回撤 |
|-----|------|-------|-------|---------|
| 1 | 📉 **布林带回归** | $10,196 | **+1.96%** ✅ | **1.7%** |
| 2 | 🌊 **涟漪策略** | $9,931 | -0.69% | **1.28%** |
| 3 | 🐂🐻 **牛持熊投** | $8,773 | -12.3% | 19.85% |
| 4 | 💰 **定期定投 DCA** | $8,487 | -15.1% | 17.97% |
| 5 | 📈 **双均线交叉** | $7,859 | -21.4% | 27.94% |
| 6 | 🏦 **持有不动** | $5,982 | **-40.2%** | 51.16% |

### 策略选择建议

| 你的目标 | 推荐策略 | 理由 |
|---------|---------|------|
| 🚀 追求高收益，能承受大回撤 | **持有不动** | 长期看 BTC 涨幅最大 |
| 🎯 收益与风险平衡（推荐） | **🌊 涟漪策略** | 牛熊自适应，回撤仅 19% |
| 🛡️ 极度厌恶亏损，求稳 | **布林带回归** | 熊市唯一赚钱，回撤仅 14% |
| 🤖 不想频繁操作 | **双均线交叉** | 3 年仅交易 11 次 |
| 😴 完全不管，佛系投资 | **定期定投 DCA** | 每周自动买，简单无脑 |

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- npm

### 安装

```bash
git clone <repo-url> btc-algo
cd btc-algo
npm install   # 无依赖，仅创建 node_modules 占位
```

### 获取数据

```bash
# 拉取最近 3 年 BTC/USDT 日线数据（从 Binance 公开 API）
node scripts/fetch_data.js
```

### 运行策略

```bash
# 运行单个策略回测
node strategies/ripple/strategy.js

# 查看今日操作建议
node strategies/ripple/strategy.js --live

# 运行其他策略
node strategies/ma-crossover/strategy.js
node strategies/bollinger/strategy.js

# 多策略对比
node comparison/index.js
```

### 每日自动化

```bash
# 更新数据 + 运行所有策略 + 生成日报
node scripts/daily_report.js
```

---

## 📧 QQ 邮件配置

日报系统支持通过 **QQ 邮箱** 发送报告。需要在 GitHub Secrets 中配置以下环境变量：

### GitHub Secrets 配置

| Secret | 说明 | 示例 |
|--------|------|------|
| `QQ_MAIL_USER` | QQ 邮箱地址 | `123456@qq.com` |
| `QQ_MAIL_PASS` | QQ 邮箱授权码 | `xxxxxxxxxxxx` |
| `QQ_MAIL_TO` | 接收邮箱（可多个，逗号分隔） | `abc@qq.com,def@gmail.com` |
| `MAIL_FROM_NAME` | 发件人名称（可选） | `BTC 策略日报` |

### 获取 QQ 邮箱授权码

1. 登录 QQ 邮箱 → 设置 → 账户
2. 找到 **POP3/IMAP/SMTP 服务**
3. 开启 **SMTP 服务**，生成授权码
4. 将授权码填入 `QQ_MAIL_PASS`

### 本地测试

```bash
export QQ_MAIL_USER="your@qq.com"
export QQ_MAIL_PASS="your-auth-code"
export QQ_MAIL_TO="receiver@example.com"
export MAIL_FROM_NAME="BTC 策略日报"

node scripts/daily_report.js
```

> ⚠️ 本地网络可能限制 SMTP 端口（465/587），如果发送失败，报告会自动保存到 `daily_report.html`

---

## ⚙️ GitHub Action 自动日报

项目已配置 GitHub Action，每天 **北京时间 10:00** 自动运行：

1. 🔄 从 Binance 拉取最新 BTC 数据
2. 🧠 运行全部 7 种策略
3. 📧 生成 HTML 报告并通过 QQ 邮件发送
4. 💾 自动提交数据更新到仓库

### 手动触发

在 GitHub 仓库 → Actions → **📊 BTC 策略日报** → `Run workflow`

---

## 🧪 添加自定义策略

1. 在 `strategies/` 下创建文件夹，如 `my-strategy`
2. 创建 `strategy.js`，导出 `{ strategy }` 对象：

```javascript
const { runBacktest } = require('../shared');

const strategy = {
  name: '我的策略',
  init: () => ({ usdt: 10000, btc: 0 }),
  next: (day, idx, state, data) => {
    // day: { date, close, open, high, low, changePercent }
    // state: { usdt, btc, ...你的自定义字段 }
    // 返回 { state: 新状态, action: 'BUY'|'SELL'|'hold', detail: '说明' }
    return { state, action: 'hold', detail: '' };
  },
};

module.exports = { strategy };
```

3. 运行测试：

```bash
node strategies/my-strategy/strategy.js
```

4. 添加到 `comparison/index.js` 或 `scripts/daily_report.js` 的策略列表中

---

## 📊 数据说明

- **数据源**: Binance 公开 API (`GET /api/v3/klines?symbol=BTCUSDT&interval=1d`)
- **时间跨度**: 最近 3 年日线数据
- **字段**: `date`, `open`, `high`, `low`, `close`, `volume`, `quoteVolume`, `change`, `changePercent`

---

## ⚠️ 风险提示

> **投资有风险，所有策略仅供参考。**
> 历史回测不代表未来收益，加密货币市场波动极大。
> 本项目的策略均基于简单规则，未考虑交易手续费、滑点等实际因素。

---

## 📄 License

MIT
