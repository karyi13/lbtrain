/**
 * 连板股票模拟交易训练系统 - 核心逻辑
 */

// ==================== 全局状态管理 ====================
const AppState = {
    // 当前交易日
    currentDate: null,
    availableDates: [],

    // 用户账户状态
    account: {
        initialFund: 100000,      // 初始资金
        available: 100000,        // 可用资金
        positions: {},            // 持仓 {code: {quantity, cost, buyDate}}
        frozen: 0,                // 冻结资金
    },

    // 交易记录
    trades: [],

    // 条件单
    conditionOrders: [],

    // 待执行的明日操作
    pendingActions: [],

    // 当前选中的股票
    selectedStock: null,

    // K线图实例
    klineChart: null,

    // K线图缩放状态
    klineZoom: null,

    // 是否处于模拟的"明天"
    isNextDay: false,
};

// ==================== 常量配置 ====================
const CONFIG = {
    // 交易费率
    FEES: {
        STAMP_TAX: 0.001,      // 印花税 (卖出时收取)
        COMMISSION: 0.0003,    // 佣金 (双向收取, 最低5元)
        MIN_COMMISSION: 5,     // 最低佣金
    },

    // 涨跌停幅度
    LIMIT_UP: 0.10,           // 普通股票涨停
    LIMIT_DOWN: 0.10,         // 普通股票跌停

    // ST股票涨跌停
    ST_LIMIT: 0.05,

    // 交易单位
    TRADING_UNIT: 100,
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    try {
        // 等待数据加载
        await waitForData();

        // 初始化日期选择器
        initDateSelector();

        // 渲染连板列表
        renderLadderList();

        // 初始化K线图
        initKlineChart();

        // 初始化事件监听
        initEventListeners();

        // 初始化标签页
        initTabs();

        // 加载保存的数据
        loadSavedData();

        // 更新账户信息
        updateAccountInfo();
        renderMyPositions();

        console.log('模拟交易系统初始化完成');
    } catch (error) {
        console.error('初始化失败:', error);
        showToast('系统初始化失败: ' + error.message, 'error');
    }
}

// 等待数据加载
function waitForData() {
    return new Promise((resolve, reject) => {
        const checkData = () => {
            if (window.LADDER_DATA && window.KLINE_DATA_GLOBAL) {
                resolve();
            } else {
                setTimeout(checkData, 100);
            }
        };
        // 超时检测
        setTimeout(() => reject(new Error('数据加载超时')), 10000);
        checkData();
    });
}

// ==================== 日期管理 ====================
function initDateSelector() {
    const dates = Object.keys(window.LADDER_DATA).sort();
    AppState.availableDates = dates;
    AppState.currentDate = dates[dates.length - 1]; // 默认最后一天

    const select = document.getElementById('currentDate');
    dates.forEach(date => {
        const option = document.createElement('option');
        option.value = date;
        option.textContent = formatDate(date);
        select.appendChild(option);
    });

    select.value = AppState.currentDate;

    // 日期切换事件
    select.addEventListener('change', (e) => {
        switchDate(e.target.value);
    });

    // 上一日/下一日按钮
    document.getElementById('prevDay').addEventListener('click', () => {
        const idx = AppState.availableDates.indexOf(AppState.currentDate);
        if (idx > 0) {
            switchDate(AppState.availableDates[idx - 1]);
        }
    });

    document.getElementById('nextDay').addEventListener('click', () => {
        const idx = AppState.availableDates.indexOf(AppState.currentDate);
        if (idx < AppState.availableDates.length - 1) {
            switchDate(AppState.availableDates[idx + 1]);
        }
    });
}

function switchDate(newDate) {
    // 执行待执行的条件单和操作
    executePendingOrders(newDate);

    AppState.currentDate = newDate;
    document.getElementById('currentDate').value = newDate;

    // 渲染连板列表
    renderLadderList();

    // 如果有选中股票，更新K线图和交易面板
    if (AppState.selectedStock) {
        updateStockPanel(AppState.selectedStock);
    }

    // 更新持仓信息
    updatePositionsInfo();

    // 更新明日操作预览
    renderNextDayActions();

    // 更新右侧持仓列表
    renderMyPositions();

    saveData();
}

function formatDate(dateStr) {
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    return `${year}-${month}-${day}`;
}

// ==================== 连板列表渲染 ====================
function renderLadderList() {
    const container = document.getElementById('ladderList');
    const filter = parseInt(document.getElementById('limitDaysFilter').value) || 0;
    const dateData = window.LADDER_DATA[AppState.currentDate];

    if (!dateData) {
        container.innerHTML = '<p class="empty-tip">暂无连板数据</p>';
        return;
    }

    // 合并所有连板天数的数据
    const allStocks = [];
    Object.keys(dateData).forEach(key => {
        const stocksByDays = dateData[key] || [];
        allStocks.push(...stocksByDays);
    });

    // 根据连板天数过滤
    let filteredStocks = filter === 0
        ? allStocks
        : allStocks.filter(s => {
            if (filter === 5) return s.limitUpDays >= 5;
            return s.limitUpDays === filter;
        });

    // 按连板天数降序排序（最高连板在上）
    filteredStocks.sort((a, b) => b.limitUpDays - a.limitUpDays);

    if (filteredStocks.length === 0) {
        container.innerHTML = '<p class="empty-tip">暂无符合条件的股票</p>';
        return;
    }

    container.innerHTML = filteredStocks.map((stock, idx) => {
        const limitClass = stock.limitUpDays >= 5 ? 'limit-up-5' :
            stock.limitUpDays >= 3 ? 'limit-up-4' :
            stock.limitUpDays >= 2 ? 'limit-up-3' : 'limit-up-2';

        const selected = AppState.selectedStock?.code === stock.code ? 'selected' : '';

        return `
            <div class="ladder-item ${limitClass} ${selected}"
                 data-code="${stock.code}"
                 data-stock='${JSON.stringify(stock).replace(/'/g, "&#39;")}'>
                <div class="stock-main">
                    <span class="stock-code">${stock.code.split('.')[0]}</span>
                    <span class="limit-days ${stock.limitUpDays >= 5 ? 'several' : ''}">
                        ${stock.limitUpDays}连板
                    </span>
                </div>
                <div class="stock-price-info">
                    <span class="stock-name">${stock.name}</span>
                    <span class="price">¥${stock.price.toFixed(2)}</span>
                </div>
                <div class="concepts">${(stock.conceptThemes || []).slice(0, 3).join(' | ')}</div>
            </div>
        `;
    }).join('');
}

// 选择股票
function selectStock(code) {
    console.log('selectStock called with code:', code);
    const stockData = getStockData(code);
    console.log('stockData:', stockData ? 'found' : 'not found');
    if (!stockData) {
        showToast('股票数据不存在', 'error');
        return;
    }

    AppState.selectedStock = stockData;

    // 更新UI选中状态
    document.querySelectorAll('.ladder-item').forEach(item => {
        item.classList.remove('selected');
    });
    document.querySelector(`.ladder-item[data-code="${code}"]`)?.classList.add('selected');

    // 更新K线图和交易面板
    updateStockPanel(stockData);
}

function getStockData(code) {
    // 从连板数据获取
    const dateData = window.LADDER_DATA[AppState.currentDate];
    if (dateData) {
        for (const level in dateData) {
            const stock = dateData[level].find(s => s.code === code);
            if (stock) return stock;
        }
    }
    return null;
}

// ==================== K线图 ====================
function initKlineChart() {
    const chartDom = document.getElementById('klineChart');
    // 设置明确的样式
    chartDom.style.width = '100%';
    chartDom.style.height = '100%';

    AppState.klineChart = echarts.init(chartDom);

    // 初始空状态用 setOption 设置，而不是 innerHTML
    AppState.klineChart.setOption({
        title: {
            text: '请从左侧选择一只股票查看K线',
            left: 'center',
            top: 'center',
            textStyle: { color: '#999', fontSize: 14 }
        },
        grid: { hidden: true },
        xAxis: { hidden: true },
        yAxis: { hidden: true }
    });

    // 窗口大小变化时自适应
    window.addEventListener('resize', () => {
        AppState.klineChart?.resize();
    });
}

// 计算K线图缩放起始位置
function calculateZoomStart(totalCount, defaultCount) {
    // 如果有保存的缩放状态且在有效范围内，使用保存的值
    if (AppState.klineZoom && AppState.klineZoom.startValue !== undefined) {
        const savedStart = AppState.klineZoom.startValue;
        const savedEnd = AppState.klineZoom.endValue;
        const savedCount = savedEnd - savedStart;

        // 如果保存的范围在当前数据范围内，使用保存的值
        if (savedStart >= 0 && savedEnd < totalCount) {
            return savedStart;
        }
    }
    // 默认显示最后 defaultCount 根K线
    return Math.max(0, totalCount - defaultCount);
}

function updateKlineChart(code) {
    console.log('updateKlineChart called with code:', code);
    console.log('ECharts available:', typeof echarts !== 'undefined');
    console.log('KLINE_DATA_GLOBAL keys:', Object.keys(window.KLINE_DATA_GLOBAL || {}).slice(0, 5));

    const klineData = window.KLINE_DATA_GLOBAL[code];
    console.log('klineData for', code, ':', klineData ? 'found' : 'not found');

    if (!klineData) {
        return;
    }

    const dates = klineData.dates;
    const values = klineData.values;
    console.log('dates count:', dates?.length, 'values count:', values?.length);

    // 将当前日期转换为与K线数据相同的格式（YYYY-MM-DD）
    const currentDateFormatted = AppState.currentDate.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
    console.log('currentDate:', AppState.currentDate, '-> formatted:', currentDateFormatted);

    // 过滤当前日期及之前的数据
    let currentDateIdx = -1;
    for (let i = 0; i < dates.length; i++) {
        if (dates[i] <= currentDateFormatted) {
            currentDateIdx = i;
        } else {
            break;
        }
    }
    console.log('currentDateIdx:', currentDateIdx);

    const validDates = currentDateIdx >= 0 ? dates.slice(0, currentDateIdx + 1) : dates;
    const validValues = currentDateIdx >= 0 ? values.slice(0, currentDateIdx + 1) : values;
    console.log('validDates count:', validDates?.length);

    if (validDates.length === 0) {
        showToast('没有可用日期数据', 'error');
        return;
    }

    // 计算K线数据
    const klineDataFormatted = validValues.map(v => ({
        open: v[0],
        close: v[1],
        low: v[2],
        high: v[3],
    }));

    // ECharts candlestick格式: [open, close, low, high]
    const candlestickData = validValues.map(v => [v[0], v[1], v[2], v[3]]);
    console.log('candlestickData sample:', candlestickData.slice(0, 3));

    const option = {
        tooltip: {
            trigger: 'item',
            axisPointer: { type: 'cross' },
            formatter: function(params) {
                if (!params || !params.data) {
                    return '';
                }
                const data = params.data;

                // 检查数据格式：[dateIndex, open, close, low, high]
                let dateIndex, open, close, low, high;

                if (Array.isArray(data) && data.length >= 5) {
                    // ECharts candlestick with dataIndex
                    dateIndex = data[0];
                    open = data[1];
                    close = data[2];
                    low = data[3];
                    high = data[4];
                } else if (Array.isArray(data) && data.length === 4) {
                    // 标准 [open, close, low, high] 格式
                    open = data[0];
                    close = data[1];
                    low = data[2];
                    high = data[3];
                    dateIndex = params.dataIndex;
                } else {
                    return '数据格式错误';
                }

                // 获取上一根K线的收盘价（第一根K线或prevClose为0时，相对于自己）
                let prevClose = 0;
                if (dateIndex > 0 && validValues[dateIndex - 1]) {
                    prevClose = validValues[dateIndex - 1][1];
                }
                if (!prevClose || prevClose === 0) {
                    prevClose = close;
                }

                // 计算相对于上一根K线收盘价的涨跌幅
                const formatChange = (price) => {
                    if (prevClose === 0) {
                        return '<span style="color:#999">(--%)</span>';
                    }
                    const change = ((price - prevClose) / prevClose * 100).toFixed(2);
                    const color = change >= 0 ? '#ff0000' : '#00aa00';
                    return `<span style="color: ${color}">(${change >= 0 ? '+' : ''}${change}%)</span>`;
                };

                return `
                    <div style="padding: 5px;">
                        <div>${params.name}</div>
                        <div>开盘: ${open.toFixed(2)} ${formatChange(open)}</div>
                        <div>收盘: ${close.toFixed(2)} ${formatChange(close)}</div>
                        <div>最高: ${high.toFixed(2)} ${formatChange(high)}</div>
                        <div>最低: ${low.toFixed(2)} ${formatChange(low)}</div>
                    </div>
                `;
            }
        },
        grid: {
            left: '10%',
            right: '10%',
            top: '10%',
            bottom: '15%'
        },
        xAxis: {
            type: 'category',
            data: validDates,
            boundaryGap: false,
            axisLine: { onZero: false }
        },
        yAxis: {
            scale: true,
            splitArea: { show: true }
        },
        dataZoom: [
            {
                type: 'inside',
                startValue: calculateZoomStart(validDates.length, 30),
                endValue: validDates.length - 1,
                xAxisIndex: 0
            },
            {
                type: 'slider',
                bottom: 10,
                startValue: calculateZoomStart(validDates.length, 30),
                endValue: validDates.length - 1,
                xAxisIndex: 0
            }
        ],
        series: [{
            type: 'candlestick',
            data: candlestickData,
            itemStyle: {
                color: '#ff0000',      // 阳线（上涨）红色
                color0: '#00aa00',     // 阴线（下跌）绿色
                borderColor: '#ff0000',
                borderColor0: '#00aa00'
            }
        }]
    };

    console.log('Setting chart option with', candlestickData.length, 'data points');
    AppState.klineChart.setOption(option);  // 正常更新，不使用 notMerge

    // 监听缩放事件，保存用户调整的状态
    AppState.klineChart.off('datazoom');  // 移除旧事件
    AppState.klineChart.on('datazoom', function(params) {
        const option = AppState.klineChart.getOption();
        const zoom = option.dataZoom[0];
        if (zoom.startValue !== undefined && zoom.endValue !== undefined) {
            AppState.klineZoom = {
                startValue: zoom.startValue,
                endValue: zoom.endValue
            };
        }
    });
}

// ==================== 交易面板更新 ====================
function updateStockPanel(stock) {
    const klineData = window.KLINE_DATA_GLOBAL[stock.code];

    // 更新股票信息
    document.getElementById('stockName').textContent = `${stock.name} (${stock.code})`;
    document.getElementById('stockCode').textContent = stock.code;
    document.getElementById('currentPrice').textContent = `¥${stock.price.toFixed(2)}`;
    document.getElementById('limitUpDays').textContent = `${stock.limitUpDays}连板`;

    // 更新涨停价
    const isST = stock.name.includes('ST');
    const limitRate = isST ? CONFIG.ST_LIMIT : CONFIG.LIMIT_UP;
    const limitUpPrice = Math.round(stock.price * (1 + limitRate) * 100) / 100;
    document.getElementById('limitUpPrice').value = limitUpPrice;

    // 更新次日开盘信息
    const nextDayOpenChange = stock.nextDayOpenChangePct || 0;
    const nextDayOpenPrice = stock.price * (1 + nextDayOpenChange / 100);
    const openChangeEl = document.getElementById('nextDayOpenChange');
    openChangeEl.textContent = `${nextDayOpenChange >= 0 ? '+' : ''}${nextDayOpenChange.toFixed(2)}%`;
    openChangeEl.className = nextDayOpenChange >= 0 ? 'positive' : 'negative';
    document.getElementById('nextDayOpenPrice').textContent = `¥${nextDayOpenPrice.toFixed(2)}`;

    // 更新买入价格默认值为收盘价
    document.getElementById('buyPrice').value = stock.price.toFixed(2);

    // 更新条件单默认价格
    document.getElementById('limitUpPrice').value = limitUpPrice.toFixed(2);

    // 更新加仓价格默认值为开盘价
    document.getElementById('addPrice').value = nextDayOpenPrice.toFixed(2);

    // 更新持仓信息
    updatePositionInfo(stock.code);

    // 更新K线图
    updateKlineChart(stock.code);

    // 更新次日操作预览
    renderNextDayActions();
}

function updatePositionInfo(code) {
    const position = AppState.account.positions[code];
    const stock = getStockData(code) || { price: 0 };
    const currentPrice = stock.price;

    const quantityEl = document.getElementById('holdQuantity');
    const costEl = document.getElementById('holdCost');
    const profitEl = document.getElementById('holdProfit');
    const sellTip = document.getElementById('sellTip');

    if (position) {
        quantityEl.textContent = position.quantity;
        costEl.textContent = position.cost.toFixed(2);

        const profit = (currentPrice - position.cost) * position.quantity;
        profitEl.textContent = `${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`;
        profitEl.className = profit >= 0 ? 'profit' : 'loss';

        // 检查是否可卖出（T+1）
        const buyDateIdx = AppState.availableDates.indexOf(position.buyDate);
        const currentDateIdx = AppState.availableDates.indexOf(AppState.currentDate);
        const canSell = currentDateIdx > buyDateIdx;

        if (canSell) {
            sellTip.textContent = '';
            document.getElementById('sellPrice').value = currentPrice.toFixed(2);
            document.getElementById('sellQuantity').value = position.quantity;
        } else {
            const daysWait = buyDateIdx + 1 - currentDateIdx;
            sellTip.textContent = `T+1交易，还需等待${daysWait}个交易日`;
            sellTip.className = 'tip warning';
        }

        document.getElementById('sellSection').style.display = 'block';
    } else {
        document.getElementById('sellSection').style.display = 'none';
    }
}

function updatePositionsInfo() {
    Object.keys(AppState.account.positions).forEach(code => {
        updatePositionInfo(code);
    });
}

// ==================== 股票搜索 ====================

// 股票搜索功能
function searchStock() {
    const keyword = document.getElementById('stockSearch').value.trim().toUpperCase();
    if (!keyword) {
        document.getElementById('searchResults').innerHTML = '<p class="empty-tip">请输入股票代码或名称</p>';
        return;
    }

    const results = [];
    const klineData = window.KLINE_DATA_GLOBAL || {};

    // 搜索K线数据中的股票
    for (const [code, data] of Object.entries(klineData)) {
        const codeMatch = code.toUpperCase().includes(keyword);
        const nameMatch = data.name && data.name.toUpperCase().includes(keyword);

        if (codeMatch || nameMatch) {
            // 获取当前价格
            const values = data.values || [];
            const currentPrice = values.length > 0 ? values[values.length - 1][1] : 0;

            results.push({
                code: code,
                name: data.name || '未知',
                price: currentPrice
            });
        }
    }

    renderSearchResults(results);
}

// 渲染搜索结果
function renderSearchResults(results) {
    const container = document.getElementById('searchResults');

    if (results.length === 0) {
        container.innerHTML = '<p class="empty-tip">未找到相关股票</p>';
        return;
    }

    // 限制显示数量
    const displayResults = results.slice(0, 20);

    container.innerHTML = displayResults.map(stock => `
        <div class="search-result-item" onclick="selectStockByCode('${stock.code}')">
            <div class="item-header">
                <span class="code">${stock.code}</span>
                <span class="price">¥${stock.price.toFixed(2)}</span>
            </div>
            <div class="name">${stock.name}</div>
        </div>
    `).join('');
}

// 根据代码选择股票
function selectStockByCode(code) {
    const klineData = window.KLINE_DATA_GLOBAL[code];
    if (!klineData) {
        showToast('股票数据不存在', 'error');
        return;
    }

    // 创建一个虚拟的股票对象用于显示
    const stock = {
        code: code,
        name: klineData.name || '未知',
        price: klineData.values?.length > 0 ? klineData.values[klineData.values.length - 1][1] : 0,
        limitUpDays: 0,
        conceptThemes: [],
        nextDayOpenChangePct: 0
    };

    AppState.selectedStock = stock;

    // 清空搜索结果
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('stockSearch').value = '';

    // 更新K线图和交易面板
    updateStockPanel(stock);

    showToast(`已选择: ${stock.name}`, 'success');
}

// ==================== 我的持仓列表 ====================

// 渲染我的持仓列表
function renderMyPositions() {
    const container = document.getElementById('myPositionsList');
    const positions = AppState.account.positions;

    if (Object.keys(positions).length === 0) {
        container.innerHTML = '<p class="empty-tip">暂无持仓</p>';
        return;
    }

    const positionItems = Object.entries(positions).map(([code, pos]) => {
        const klineData = window.KLINE_DATA_GLOBAL[code];
        const stockName = klineData?.name || '未知';
        const currentPrice = klineData?.values?.length > 0
            ? klineData.values[klineData.values.length - 1][1]
            : pos.cost;

        const profit = (currentPrice - pos.cost) * pos.quantity;
        const profitRate = ((currentPrice - pos.cost) / pos.cost * 100);
        const profitClass = profit >= 0 ? 'profit' : 'loss';

        return `
            <div class="my-position-item">
                <div class="item-header">
                    <span class="code">${code}</span>
                    <span class="quantity">${pos.quantity}股</span>
                </div>
                <div class="price-info">
                    <span>成本: ¥${pos.cost.toFixed(2)}</span>
                    <span class="${profitClass}">${profit >= 0 ? '+' : ''}${profit.toFixed(2)} (${profitRate.toFixed(1)}%)</span>
                </div>
                <button class="btn-view" onclick="viewPositionChart('${code}')">查看K线</button>
            </div>
        `;
    }).join('');

    container.innerHTML = positionItems;
}

// 查看持仓股票的K线图
function viewPositionChart(code) {
    const klineData = window.KLINE_DATA_GLOBAL[code];
    if (!klineData) {
        showToast('K线数据不存在', 'error');
        return;
    }

    const stock = {
        code: code,
        name: klineData.name || '未知',
        price: klineData.values?.length > 0 ? klineData.values[klineData.values.length - 1][1] : 0,
        limitUpDays: 0,
        conceptThemes: [],
        nextDayOpenChangePct: 0
    };

    AppState.selectedStock = stock;
    updateStockPanel(stock);

    // 滚动到K线图位置
    document.querySelector('.chart-panel').scrollIntoView({ behavior: 'smooth' });
}

// ==================== 交易逻辑 ====================

// 计算涨停价
function calculateLimitUpPrice(price, isST = false) {
    const rate = isST ? CONFIG.ST_LIMIT : CONFIG.LIMIT_UP;
    return Math.round(price * (1 + rate) * 100) / 100;
}

// 计算交易费用
function calculateFees(amount, isSell = false) {
    let commission = Math.abs(amount) * CONFIG.FEES.COMMISSION;
    commission = Math.max(commission, CONFIG.FEES.MIN_COMMISSION);

    let stampTax = 0;
    if (isSell) {
        stampTax = Math.abs(amount) * CONFIG.FEES.STAMP_TAX;
    }

    return {
        commission: commission,
        stampTax: stampTax,
        total: commission + stampTax
    };
}

// 底仓买入
function buyStock() {
    const code = AppState.selectedStock?.code;
    if (!code) {
        showToast('请先选择股票', 'warning');
        return;
    }

    const price = parseFloat(document.getElementById('buyPrice').value);
    const quantity = parseInt(document.getElementById('buyQuantity').value);

    if (!price || price <= 0) {
        showToast('请输入有效的买入价格', 'warning');
        return;
    }

    if (!quantity || quantity % CONFIG.TRADING_UNIT !== 0) {
        showToast(`买入股数必须是${CONFIG.TRADING_UNIT}的整数倍`, 'warning');
        return;
    }

    const amount = price * quantity;
    const available = AppState.account.available + AppState.account.frozen;

    if (amount > available) {
        showToast('可用资金不足', 'warning');
        return;
    }

    // 创建待执行的买入操作
    const currentIdx = AppState.availableDates.indexOf(AppState.currentDate);
    const nextDate = AppState.availableDates[currentIdx + 1];

    if (!nextDate) {
        showToast('已是最后一个交易日', 'warning');
        return;
    }

    const tradeRecord = {
        id: generateId(),
        date: nextDate,  // 实际执行日期
        orderDate: AppState.currentDate,  // 下单日期
        code: code,
        name: AppState.selectedStock.name,
        type: 'BUY',
        price: price,
        quantity: quantity,
        amount: amount,
        fees: calculateFees(amount).total,
        status: 'PENDING'
    };

    AppState.trades.push(tradeRecord);

    // 冻结资金
    AppState.account.frozen += amount;

    showToast(`买入委托已提交，将于${formatDate(nextDate)}执行`, 'success');
    saveData();
    renderTradeRecords();
}

// 设置条件单（涨停买入）
function setConditionOrder() {
    const code = AppState.selectedStock?.code;
    if (!code) {
        showToast('请先选择股票', 'warning');
        return;
    }

    const price = parseFloat(document.getElementById('limitUpPrice').value);
    const quantity = parseInt(document.getElementById('conditionQuantity').value);

    if (!price || price <= 0) {
        showToast('请输入有效的涨停价格', 'warning');
        return;
    }

    if (!quantity || quantity % CONFIG.TRADING_UNIT !== 0) {
        showToast(`买入股数必须是${CONFIG.TRADING_UNIT}的整数倍`, 'warning');
        return;
    }

    const amount = price * quantity;
    const available = AppState.account.available + AppState.account.frozen;

    if (amount > available) {
        showToast('可用资金不足', 'warning');
        return;
    }

    const currentIdx = AppState.availableDates.indexOf(AppState.currentDate);
    const nextDate = AppState.availableDates[currentIdx + 1];

    if (!nextDate) {
        showToast('已是最后一个交易日', 'warning');
        return;
    }

    const order = {
        id: generateId(),
        date: nextDate,
        orderDate: AppState.currentDate,
        code: code,
        name: AppState.selectedStock.name,
        type: 'CONDITION_BUY',
        triggerPrice: price,
        quantity: quantity,
        amount: amount,
        status: 'PENDING'
    };

    AppState.conditionOrders.push(order);

    // 冻结资金
    AppState.account.frozen += amount;

    showToast(`条件单已设置，将于${formatDate(nextDate)}监控执行`, 'success');
    saveData();
    renderConditionOrders();
    renderNextDayActions();
}

// 开盘加仓
function addPosition() {
    const code = AppState.selectedStock?.code;
    if (!code) {
        showToast('请先选择股票', 'warning');
        return;
    }

    const price = parseFloat(document.getElementById('addPrice').value);
    const quantity = parseInt(document.getElementById('addQuantity').value);

    if (!price || price <= 0) {
        showToast('请输入有效的加仓价格', 'warning');
        return;
    }

    if (!quantity || quantity % CONFIG.TRADING_UNIT !== 0) {
        showToast(`加仓股数必须是${CONFIG.TRADING_UNIT}的整数倍`, 'warning');
        return;
    }

    const amount = price * quantity;
    const available = AppState.account.available + AppState.account.frozen;

    if (amount > available) {
        showToast('可用资金不足', 'warning');
        return;
    }

    const currentIdx = AppState.availableDates.indexOf(AppState.currentDate);
    const nextDate = AppState.availableDates[currentIdx + 1];

    if (!nextDate) {
        showToast('已是最后一个交易日', 'warning');
        return;
    }

    const tradeRecord = {
        id: generateId(),
        date: nextDate,
        orderDate: AppState.currentDate,
        code: code,
        name: AppState.selectedStock.name,
        type: 'ADD',
        price: price,
        quantity: quantity,
        amount: amount,
        fees: calculateFees(amount).total,
        status: 'PENDING'
    };

    AppState.trades.push(tradeRecord);
    AppState.account.frozen += amount;

    showToast(`加仓委托已提交，将于${formatDate(nextDate)}执行`, 'success');
    saveData();
    renderTradeRecords();
    renderNextDayActions();
}

// 卖出持仓
function sellStock() {
    const code = AppState.selectedStock?.code;
    if (!code) {
        showToast('请先选择股票', 'warning');
        return;
    }

    const position = AppState.account.positions[code];
    if (!position) {
        showToast('没有该股票持仓', 'warning');
        return;
    }

    const price = parseFloat(document.getElementById('sellPrice').value);
    const quantity = parseInt(document.getElementById('sellQuantity').value);

    if (!price || price <= 0) {
        showToast('请输入有效的卖出价格', 'warning');
        return;
    }

    if (!quantity || quantity <= 0 || quantity > position.quantity) {
        showToast('卖出股数不能超过持仓', 'warning');
        return;
    }

    // 检查是否可卖出（T+1）
    const buyDateIdx = AppState.availableDates.indexOf(position.buyDate);
    const currentDateIdx = AppState.availableDates.indexOf(AppState.currentDate);

    if (currentDateIdx <= buyDateIdx) {
        showToast('T+1交易制度，今日买入不可卖出', 'warning');
        return;
    }

    const amount = price * quantity;
    const fees = calculateFees(amount, true);
    const netAmount = amount - fees.total;

    const tradeRecord = {
        id: generateId(),
        date: AppState.currentDate,
        orderDate: AppState.currentDate,
        code: code,
        name: AppState.selectedStock.name,
        type: 'SELL',
        price: price,
        quantity: quantity,
        amount: amount,
        fees: fees.total,
        netAmount: netAmount,
        positionCost: position.cost * quantity,
        status: 'COMPLETED'
    };

    AppState.trades.push(tradeRecord);

    // 更新持仓
    position.quantity -= quantity;
    if (position.quantity <= 0) {
        delete AppState.account.positions[code];
    } else {
        // 重新计算成本价
        position.cost = (position.cost * (position.quantity + quantity) - price * quantity) / position.quantity;
    }

    // 更新资金
    AppState.account.available += netAmount;

    showToast(`卖出成功，净得 ${netAmount.toFixed(2)} 元`, 'success');
    saveData();
    renderTradeRecords();
    updateAccountInfo();
    updatePositionInfo(code);
}

// 执行待执行的订单
function executePendingOrders(executeDate) {
    // 执行待完成的交易记录
    AppState.trades.forEach(trade => {
        if (trade.status === 'PENDING' && trade.date === executeDate) {
            executeTrade(trade);
        }
    });

    // 执行条件单
    AppState.conditionOrders.forEach(order => {
        if (order.status === 'PENDING' && order.date === executeDate) {
            executeConditionOrder(order);
        }
    });
}

function executeTrade(trade) {
    const klineData = window.KLINE_DATA_GLOBAL[trade.code];
    if (!klineData) {
        trade.status = 'FAILED';
        return;
    }

    // 获取执行日的开盘价（作为实际成交价）
    const dateIdx = klineData.dates.findIndex(d => d === trade.date.replace(/-/g, ''));
    if (dateIdx < 0) {
        trade.status = 'FAILED';
        return;
    }

    const dayData = klineData.values[dateIdx];
    const actualPrice = dayData[1]; // 开盘价作为实际成交价

    if (trade.type === 'BUY' || trade.type === 'ADD') {
        // 买入成交
        trade.actualPrice = actualPrice;
        trade.actualAmount = actualPrice * trade.quantity;
        trade.fees = calculateFees(trade.actualAmount).total;
        trade.status = 'COMPLETED';

        // 解冻资金
        AppState.account.frozen -= trade.amount;

        // 更新可用资金
        AppState.account.available -= (trade.actualAmount + trade.fees);

        // 更新持仓
        const position = AppState.account.positions[trade.code];
        if (position) {
            const totalCost = position.cost * position.quantity + trade.actualAmount;
            const totalQuantity = position.quantity + trade.quantity;
            position.cost = totalCost / totalQuantity;
            position.quantity = totalQuantity;
        } else {
            AppState.account.positions[trade.code] = {
                quantity: trade.quantity,
                cost: actualPrice,
                buyDate: trade.date
            };
        }

        showToast(`${trade.name} 买入成交：${trade.quantity}股 @ ¥${actualPrice.toFixed(2)}`, 'success');

    } else if (trade.type === 'SELL') {
        // 卖出成交
        trade.actualPrice = actualPrice;
        trade.actualAmount = actualPrice * trade.quantity;
        trade.fees = calculateFees(trade.actualAmount, true).total;
        trade.netAmount = trade.actualAmount - trade.fees;
        trade.status = 'COMPLETED';

        // 更新资金
        AppState.account.available += trade.netAmount;

        // 更新持仓
        const position = AppState.account.positions[trade.code];
        if (position) {
            position.quantity -= trade.quantity;
            if (position.quantity <= 0) {
                delete AppState.account.positions[trade.code];
            }
        }

        showToast(`${trade.name} 卖出成交：${trade.quantity}股 @ ¥${actualPrice.toFixed(2)}`, 'success');
    }

    updateAccountInfo();
    renderMyPositions();
}

function executeConditionOrder(order) {
    const klineData = window.KLINE_DATA_GLOBAL[order.code];
    if (!klineData) {
        order.status = 'FAILED';
        return;
    }

    const dateIdx = klineData.dates.findIndex(d => d === order.date.replace(/-/g, ''));
    if (dateIdx < 0) {
        order.status = 'FAILED';
        return;
    }

    const dayData = klineData.values[dateIdx];
    const high = dayData[3]; // 当日最高价

    // 检查是否涨停触发
    if (high >= order.triggerPrice) {
        // 以涨停价成交
        const actualPrice = order.triggerPrice;

        order.actualPrice = actualPrice;
        order.actualAmount = actualPrice * order.quantity;
        order.fees = calculateFees(order.actualAmount).total;
        order.status = 'EXECUTED';

        // 解冻资金
        AppState.account.frozen -= order.amount;

        // 更新可用资金
        AppState.account.available -= (order.actualAmount + order.fees);

        // 更新持仓
        AppState.account.positions[order.code] = {
            quantity: order.quantity,
            cost: actualPrice,
            buyDate: order.date
        };

        showToast(`条件单触发：${order.name} 以涨停价 ¥${actualPrice.toFixed(2)} 买入 ${order.quantity}股`, 'success');
    } else {
        order.status = 'EXPIRED';
        // 解冻资金
        AppState.account.frozen -= order.amount;
        AppState.account.available += order.amount;
        showToast(`条件单过期：${order.name} 未触及涨停价`, 'warning');
    }

    updateAccountInfo();
    renderMyPositions();
}

// 取消条件单
function cancelConditionOrder(orderId) {
    const order = AppState.conditionOrders.find(o => o.id === orderId);
    if (order && order.status === 'PENDING') {
        order.status = 'CANCELLED';
        // 解冻资金
        AppState.account.frozen -= order.amount;
        AppState.account.available += order.amount;
        showToast('条件单已取消', 'success');
        saveData();
        renderConditionOrders();
        renderNextDayActions();
        updateAccountInfo();
    }
}

// ==================== 账户信息更新 ====================
function updateAccountInfo() {
    // 计算持仓市值
    let positionValue = 0;
    Object.keys(AppState.account.positions).forEach(code => {
        const position = AppState.account.positions[code];
        const stock = getStockData(code);
        const currentPrice = stock ? stock.price : position.cost;
        positionValue += position.quantity * currentPrice;
    });

    const totalAsset = AppState.account.available + positionValue;
    const totalReturn = ((totalAsset - AppState.account.initialFund) / AppState.account.initialFund * 100);

    document.getElementById('availableFund').textContent = formatNumber(AppState.account.available);
    document.getElementById('positionValue').textContent = formatNumber(positionValue);
    document.getElementById('totalAsset').textContent = formatNumber(totalAsset);

    const returnEl = document.getElementById('totalReturn');
    returnEl.textContent = `${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`;
    returnEl.style.color = totalReturn >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
}

// ==================== 渲染函数 ====================
function renderConditionOrders() {
    const container = document.getElementById('conditionOrdersList');
    const pendingOrders = AppState.conditionOrders.filter(o => o.status === 'PENDING');

    if (pendingOrders.length === 0) {
        container.innerHTML = '<p class="empty-tip">暂无条件单</p>';
        return;
    }

    container.innerHTML = pendingOrders.map(order => `
        <div class="condition-order-item">
            <div>
                <span class="code">${order.code.split('.')[0]}</span>
                <span class="status pending">待执行</span>
            </div>
            <div style="margin-top: 5px;">
                触发价: <span class="price">¥${order.triggerPrice.toFixed(2)}</span>
                数量: <span class="quantity">${order.quantity}股</span>
            </div>
            <div style="font-size: 11px; color: #999;">
                执行日: ${formatDate(order.date)}
            </div>
            <button class="btn-cancel" onclick="cancelConditionOrder('${order.id}')">取消</button>
        </div>
    `).join('');
}

function renderNextDayActions() {
    const container = document.getElementById('nextDayActions');

    // 合并待执行的交易和条件单
    const pendingTrades = AppState.trades.filter(t => t.status === 'PENDING' && t.date === getNextDate());
    const pendingOrders = AppState.conditionOrders.filter(o => o.status === 'PENDING' && o.date === getNextDate());

    const allActions = [
        ...pendingTrades.map(t => ({
            type: t.type === 'BUY' ? '底仓买入' : '加仓',
            code: t.code,
            name: t.name,
            price: t.price,
            quantity: t.quantity
        })),
        ...pendingOrders.map(o => ({
            type: '条件单',
            code: o.code,
            name: o.name,
            price: o.triggerPrice,
            quantity: o.quantity
        }))
    ];

    if (allActions.length === 0) {
        container.innerHTML = '<p class="empty-tip">暂无待执行操作</p>';
        return;
    }

    container.innerHTML = allActions.map(action => `
        <div class="next-day-action-item">
            <div class="type">${action.type}</div>
            <div>${action.code.split('.')[0]} - ${action.name}</div>
            <div>价格: ¥${action.price.toFixed(2)} | 数量: ${action.quantity}股</div>
        </div>
    `).join('');
}

function renderTradeRecords() {
    const tbody = document.getElementById('recordsBody');

    if (AppState.trades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-tip">暂无交易记录</td></tr>';
        return;
    }

    const sortedTrades = [...AppState.trades].sort((a, b) => {
        return (b.date + b.orderDate).localeCompare(a.date + a.orderDate);
    });

    tbody.innerHTML = sortedTrades.map(trade => {
        const date = trade.status === 'PENDING' ? trade.date : trade.date;
        return `
            <tr>
                <td>${formatDate(date)}</td>
                <td>${trade.code.split('.')[0]}</td>
                <td>${trade.name}</td>
                <td class="${trade.type === 'BUY' || trade.type === 'ADD' ? '' : 'profit'}">
                    ${trade.type === 'BUY' ? '买入' : trade.type === 'ADD' ? '加仓' : '卖出'}
                </td>
                <td>¥${trade.price.toFixed(2)}</td>
                <td>${trade.quantity}</td>
                <td>¥${formatNumber(trade.amount)}</td>
                <td>¥${trade.fees?.toFixed(2) || '0.00'}</td>
                <td>${getStatusText(trade.status)}</td>
            </tr>
        `;
    }).join('');

    // 更新统计数据
    updateSummaryStats();
}

function renderPositions() {
    const tbody = document.getElementById('positionsBody');
    const positions = Object.entries(AppState.account.positions);

    if (positions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-tip">暂无持仓</td></tr>';
        return;
    }

    tbody.innerHTML = positions.map(([code, pos]) => {
        const stock = getStockData(code) || { price: pos.cost, name: '未知' };
        const klineData = window.KLINE_DATA_GLOBAL[code];
        const currentPrice = klineData ? stock.price : pos.cost;

        const profit = (currentPrice - pos.cost) * pos.quantity;
        const profitRate = ((currentPrice - pos.cost) / pos.cost * 100);

        // 检查是否可卖出
        const buyDateIdx = AppState.availableDates.indexOf(pos.buyDate);
        const currentDateIdx = AppState.availableDates.indexOf(AppState.currentDate);
        const canSell = currentDateIdx > buyDateIdx;

        return `
            <tr>
                <td>${code.split('.')[0]}</td>
                <td>${stock.name}</td>
                <td>${pos.quantity}</td>
                <td>¥${pos.cost.toFixed(2)}</td>
                <td>¥${currentPrice.toFixed(2)}</td>
                <td class="${profit >= 0 ? 'profit' : 'loss'}">${profit >= 0 ? '+' : ''}${profit.toFixed(2)}</td>
                <td class="${profitRate >= 0 ? 'profit' : 'loss'}">${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%</td>
                <td>${formatDate(pos.buyDate)}</td>
                <td>${canSell ? '是' : '否'}</td>
                <td>
                    ${canSell ? `<button class="btn btn-small btn-sell" onclick="quickSell('${code}')">卖出</button>` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

function quickSell(code) {
    selectStock(code);
    // 切换到交易面板的卖出区域
    document.querySelector('.tab-btn[data-tab="positions"]').click();
    // 填充卖出数量
    const position = AppState.account.positions[code];
    document.getElementById('sellQuantity').value = position.quantity;
}

function updateSummaryStats() {
    const completedTrades = AppState.trades.filter(t => t.status === 'COMPLETED');
    const sells = completedTrades.filter(t => t.type === 'SELL');
    const buys = completedTrades.filter(t => t.type === 'BUY' || t.type === 'ADD');

    // 计算胜率
    let profitCount = 0;
    let lossCount = 0;
    let totalProfit = 0;
    let totalFees = 0;

    sells.forEach(sell => {
        // 找到对应的买入记录
        const buy = buys.find(b => b.code === sell.code && b.status === 'COMPLETED');
        if (buy) {
            const buyCost = buy.price * buy.quantity;
            const sellRevenue = sell.netAmount;
            const profit = sellRevenue - buyCost;

            if (profit > 0) profitCount++;
            else if (profit < 0) lossCount++;

            totalProfit += profit;
        }
        totalFees += sell.fees || 0;
    });

    const totalTrades = profitCount + lossCount;
    const winRate = totalTrades > 0 ? (profitCount / totalTrades * 100) : 0;

    document.getElementById('totalTrades').textContent = totalTrades;
    document.getElementById('profitTrades').textContent = profitCount;
    document.getElementById('lossTrades').textContent = lossCount;
    document.getElementById('winRate').textContent = `${winRate.toFixed(1)}%`;

    const profitEl = document.getElementById('totalProfitLoss');
    profitEl.textContent = `${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}`;
    profitEl.className = totalProfit >= 0 ? 'profit' : 'loss';

    document.getElementById('totalFees').textContent = `${totalFees.toFixed(2)} 元`;
}

function getStatusText(status) {
    const statusMap = {
        'PENDING': '<span style="color: #fbbc04;">待执行</span>',
        'COMPLETED': '<span style="color: #34a853;">已完成</span>',
        'FAILED': '<span style="color: #ea4335;">失败</span>',
        'EXECUTED': '<span style="color: #34a853;">已触发</span>',
        'EXPIRED': '<span style="color: #999;">已过期</span>',
        'CANCELLED': '<span style="color: #999;">已取消</span>'
    };
    return statusMap[status] || status;
}

function getNextDate() {
    const currentIdx = AppState.availableDates.indexOf(AppState.currentDate);
    if (currentIdx < AppState.availableDates.length - 1) {
        return AppState.availableDates[currentIdx + 1];
    }
    return null;
}

// ==================== 数据持久化 ====================
function saveData() {
    const saveState = {
        account: AppState.account,
        trades: AppState.trades,
        conditionOrders: AppState.conditionOrders,
        currentDate: AppState.currentDate
    };
    localStorage.setItem('tradingSimulatorData', JSON.stringify(saveState));
}

function loadSavedData() {
    const saved = localStorage.getItem('tradingSimulatorData');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            AppState.account = data.account || AppState.account;
            AppState.trades = data.trades || [];
            AppState.conditionOrders = data.conditionOrders || [];

            // 如果保存的日期不在当前数据中，跳转到最后一天
            if (!AppState.availableDates.includes(data.currentDate)) {
                AppState.currentDate = AppState.availableDates[AppState.availableDates.length - 1];
            } else {
                AppState.currentDate = data.currentDate;
            }

            document.getElementById('currentDate').value = AppState.currentDate;
        } catch (e) {
            console.error('加载保存数据失败:', e);
        }
    }
}

function resetData() {
    if (confirm('确定要重置所有数据吗？这将清除所有交易记录和持仓。')) {
        localStorage.removeItem('tradingSimulatorData');
        location.reload();
    }
}

// ==================== 工具函数 ====================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatNumber(num) {
    return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// ==================== 事件监听初始化 ====================
function initEventListeners() {
    // 连板列表点击事件（委托）
    document.getElementById('ladderList').addEventListener('click', (e) => {
        const item = e.target.closest('.ladder-item');
        if (item) {
            const code = item.dataset.code;
            console.log('Clicked on stock:', code);
            selectStock(code);
        }
    });

    // 股票搜索
    document.getElementById('btnSearch').addEventListener('click', searchStock);
    document.getElementById('stockSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchStock();
    });

    // 买入按钮
    document.getElementById('btnBuy').addEventListener('click', () => {
        showConfirmModal('确认买入', () => buyStock());
    });

    // 条件单按钮
    document.getElementById('btnConditionOrder').addEventListener('click', () => {
        showConfirmModal('确认设置条件单', () => setConditionOrder());
    });

    // 加仓按钮
    document.getElementById('btnAddPosition').addEventListener('click', () => {
        showConfirmModal('确认加仓', () => addPosition());
    });

    // 卖出按钮
    document.getElementById('btnSell').addEventListener('click', () => {
        showConfirmModal('确认卖出', () => sellStock());
    });

    // 连板天数过滤
    document.getElementById('limitDaysFilter').addEventListener('change', renderLadderList);

    // 计算买入金额
    document.getElementById('buyPrice').addEventListener('input', calculateBuyAmount);
    document.getElementById('buyQuantity').addEventListener('input', calculateBuyAmount);

    // K线图缩放控制
    document.getElementById('zoomIn').addEventListener('click', () => {
        AppState.klineChart?.dispatchAction({ type: 'zoom', zoomSize: 20 });
    });
    document.getElementById('zoomOut').addEventListener('click', () => {
        AppState.klineChart?.dispatchAction({ type: 'zoom', zoomSize: -20 });
    });
    document.getElementById('resetChart').addEventListener('click', () => {
        AppState.klineChart?.dispatchAction({ type: 'restore' });
    });

    // K线周期切换
    document.getElementById('chartPeriod').addEventListener('change', (e) => {
        if (AppState.selectedStock) {
            updateKlineChart(AppState.selectedStock.code);
        }
    });
}

function calculateBuyAmount() {
    const price = parseFloat(document.getElementById('buyPrice').value) || 0;
    const quantity = parseInt(document.getElementById('buyQuantity').value) || 0;
    const amount = price * quantity;
    document.getElementById('buyAmount').textContent = `${formatNumber(amount)} 元`;
}

// 确认对话框
function showConfirmModal(message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('modalTitle').textContent = '确认交易';
    document.getElementById('modalMessage').textContent = message;

    document.getElementById('modalConfirm').onclick = () => {
        modal.classList.remove('show');
        onConfirm();
    };

    document.getElementById('modalCancel').onclick = () => {
        modal.classList.remove('show');
    };

    modal.classList.add('show');
}

// ==================== 标签页初始化 ====================
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // 切换按钮状态
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 切换内容
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === tabId + 'Tab') {
                    content.classList.add('active');
                }
            });

            // 如果是持仓标签，刷新持仓显示
            if (tabId === 'positions') {
                renderPositions();
            }
        });
    });

    // 初始渲染持仓
    renderPositions();
    renderTradeRecords();
    renderConditionOrders();
}