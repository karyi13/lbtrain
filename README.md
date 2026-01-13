## 项目概述

这是一款A股连板股票模拟交易分析和训练系统，提供K线图表和涨停/跌停阶梯可视化功能。

## 常用命令

### 安装依赖
```bash
pip install -r requirements.txt
```

### 运行主程序
```bash
# 执行完整流程：获取数据 → 分析数据 → 生成阶梯数据 → 生成K线数据
python main.py full

# 单独获取数据（增量更新）
python main.py fetch

# 单独获取数据（完全刷新）
python main.py fetch --full-refresh

# 指定日期范围获取数据
python main.py fetch --start-date 20240101 --end-date 20240131

# 分析数据
python main.py analyze

# 生成阶梯数据（用于前端显示）
python main.py ladder

# 生成K线数据（用于前端显示）
python main.py kline
```

### 前端部署
```bash
# 使用 deploy.sh 部署到 Vercel
bash deploy.sh
```

### 运行CLI模块
```bash
python cli.py
```

## 技术栈

### 后端
- **Python**: 主要语言
- **pandas/numpy**: 数据处理
- **pytdx**: 通达信数据源（主要）
- **akshare**: 东方财富数据源（备用）
- **pyarrow**: Parquet文件格式存储

### 前端
- **HTML/CSS**: 页面结构
- **JavaScript**: 业务逻辑
- **ECharts 5.4.3**: K线图表可视化

## 架构设计

### 目录结构
```
lbmoni/
├── depend/              # 依赖注入和服务层
│   ├── config.py        # 全局配置
│   ├── di_container.py  # 依赖注入容器
│   ├── services.py      # 数据服务（fetcher、validator、storage）
│   ├── interfaces.py    # 服务接口定义
│   ├── monitoring.py    # 监控指标
│   └── backup_manager.py # 备份管理
├── function/            # 功能模块
│   ├── stock_concepts.py     # 股票概念获取
│   ├── generate_kline_data.py # K线数据生成
│   ├── update_html.py         # HTML更新
│   └── update_project.py      # 项目更新
├── utils/               # 工具类
│   └── logging_utils.py  # 结构化日志
├── data/                # 数据文件
│   ├── stock_daily_latest.parquet   # 主数据文件
│   ├── limit_up_ladder.parquet      # 阶梯数据
│   ├── ladder_data.js              # 前端阶梯数据
│   └── kline_data.js               # 前端K线数据
├── css/style.css        # 样式
├── index.html           # 主页面
├── js/app.js            # 前端逻辑
├── main.py              # 主入口
├── cli.py               # CLI模块
└── requirements.txt     # 依赖列表
```

### 依赖注入模式

项目使用依赖注入容器 (`depend/di_container.py`) 管理服务：

```python
from depend.di_container import container

# 获取服务实例
data_fetcher = container.get('data_fetcher')
data_validator = container.get('data_validator')
data_storage = container.get('data_storage')
```

### 数据获取策略

使用复合数据源模式（见 `depend/services.py`）：
1. **PyTDX** - 通达信数据源（优先，速度快）
2. **AkShare** - 东方财富数据源（备用，作为fallback）

### 数据处理流程

1. **fetch** (`DataFetcher.run()`):
   - 获取股票列表
   - 并发获取日线数据（使用 ThreadPoolExecutor）
   - 支持增量更新（仅获取新交易日数据）
   - 数据验证后保存为 Parquet 格式

2. **analyze** (`Analyzer.process()`):
   - 识别涨停股票（根据板块计算涨跌幅限制）
   - 计算连续涨停天数
   - 计算次日开盘涨跌幅
   - 识别涨停板类型（一字板、T字板、换手板）
   - 拉取股票概念
   - 计算晋级率

3. **generate**:
   - `generate_kline_data()`: 生成前端K线图表数据 (JS格式)
   - `generate_ladder_data_for_html()`: 生成前端阶梯数据 (JS格式)

### 涨跌停计算规则（见 main.py 的 `calculate_limit_price` 方法）

- **ST股票**: 5% 涨跌幅
- **创业板/科创板（30/68开头）**: 20% 涨跌幅
- **主板股票**: 10% 涨跌幅

涨停价计算公式：
```
limit = int(prev_close * multiplier * 100 + 0.49999) / 100.0
```

### 前端状态管理（js/app.js）

`AppState` 对象管理系统状态：
- `currentDate`: 当前交易日
- `account`: 账户信息（资金、持仓、冻结）
- `trades`: 交易记录
- `conditionOrders`: 条件单
- `pendingActions`: 待执行的明日操作
- `selectedStock`: 当前选中的股票

## 配置说明

主要配置在 `depend/config.py` 中：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `DEFAULT_START_DATE` | '20241220' | 默认开始日期 |
| `MAX_WORKERS` | 20 | 数据获取并发数 |
| `CONCEPT_FETCH_WORKERS` | 10 | 概念获取并发数 |
| `MAX_RETRIES` | 3 | 最大重试次数 |
| `REQUEST_TIMEOUT` | 10 | 请求超时时间（秒） |
| `PYTDX_SERVERS` | 3个服务器 | 通达信服务器列表 |

## 注意事项

1. **数据格式**: 日期使用 `YYYYMMDD` 格式（如 20240101）
2. **增量更新**: 默认开启增量模式，只获取新交易日数据。使用 `--full-refresh` 进行全量刷新
3. **周末处理**: `get_default_end_date()` 会自动跳过周末，在15:00前使用昨天日期，15:00后使用今天日期
4. **线程安全**: 数据获取使用线程池，PyTDX 连接使用 thread-local storage 管理
5. **数据验证**: 获取的数据会经过 `validate_stock_data()` 验证
6. **备份机制**: 保存数据失败时会尝试保存到备份文件

## 前端与后端数据交互

前端通过加载两个 JS 文件获取数据：
- `data/kline_data.js`: 包含 `window.KLINE_DATA_GLOBAL`，格式为 `{symbol: {name, dates, values, volumes}}`
- `data/ladder_data.js`: 包含 `window.LADDER_DATA`，格式为 `{dateStr: {boardLevel: [{code, name, price, limitUpDays, conceptThemes, nextDayOpenChangePct}]}}`
