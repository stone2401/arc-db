import { state, getVsCodeApi, initializeState } from './state.js';
import { setupEventListeners, setupUIEventHandlers } from './eventHandlers.js';
import { renderTable } from './tableRenderer.js';
import { detectColumnTypes } from './typeDetector.js';

/**
 * 初始化应用
 * 1. 初始化状态
 * 2. 设置事件监听器
 * 3. 发送初始化消息到VSCode扩展
 */
export function initializeApplication() {
    try {
        // 初始化全局状态
        initializeState();

        // 设置所有事件监听器
        setupEventListeners();

        // 向VSCode发送准备就绪消息
        sendReadyMessage();

        // 检查DOMContentLoaded事件是否已触发
        if (document.readyState === 'loading') {
            console.log('等待DOM加载完成...');
            document.addEventListener('DOMContentLoaded', onDomContentLoaded);
        } else {
            console.log('DOM已加载完成，直接初始化UI');
            // DOM已加载完成，立即调用
            onDomContentLoaded();
        }
    } catch (error) {
        console.error('应用初始化失败:', error);
    }
}

/**
 * 发送准备就绪消息到VSCode扩展
 */
function sendReadyMessage() {
    const vscode = getVsCodeApi();
    vscode.postMessage({
        command: 'ready'
    });
}

/**
 * DOM内容加载完成后的处理函数
 */
function onDomContentLoaded() {
    console.log('DOM内容已加载完成');

    // 检查URL参数
    const urlParams = new URLSearchParams(window.location.search);
    const tableName = urlParams.get('table');

    // 如果URL中有表名信息，显示表名于标题
    if (tableName) {
        state.tableName = tableName;

        // 设置表名元素，先检查元素是否存在
        const tableNameElement = document.getElementById('table-name');
        if (tableNameElement) {
            tableNameElement.textContent = tableName;
        }

        // 设置页面标题
        document.title = `Table: ${tableName}`;
    }

    // 如果状态中已有表名，也需要更新UI
    else if (state.tableName) {
        const tableNameElement = document.getElementById('table-name');
        if (tableNameElement) {
            tableNameElement.textContent = state.tableName;
        }

        document.title = `Table: ${state.tableName}`;
    }

    // 确保内容提示工具始终隐藏，直到需要显示时
    const contentTooltip = document.getElementById('content-tooltip');
    if (contentTooltip) {
        contentTooltip.style.display = 'none';
    }

    // 初始化UI元素
    initializeUIElements();

    // 修改逻辑：如果有数据或者有列定义，都处理初始数据
    if ((state.data && state.data.length > 0) || (state.columns && state.columns.length > 0)) {
        processInitialData();
    } else {
        console.warn('没有初始数据或列定义可处理');
    }
}

/**
 * 初始化UI元素
 */
function initializeUIElements() {
    // 初始化分页选择器
    initializePageSizeSelector();

    // 设置UI事件处理程序
    setupUIEventHandlers();

    // 注意：HTML已经包含固定的表格结构，不需要重新创建
    // 只需验证元素是否存在，而不是重写它们

    // 设置状态栏初始状态 - 只更新内容，不重写整个结构
    const rowCount = document.getElementById('row-count');
    if (rowCount) {
        rowCount.textContent = state.data.length || 0;
    }

    const currentPage = document.getElementById('current-page');
    if (currentPage) {
        currentPage.textContent = state.currentPage;
    }

    const totalPages = document.getElementById('total-pages');
    if (totalPages) {
        totalPages.textContent = state.totalPages;
    }

    // 设置分页按钮状态
    const prevPageBtn = document.getElementById('prev-page');
    if (prevPageBtn) {
        prevPageBtn.disabled = state.currentPage <= 1;
    }

    const nextPageBtn = document.getElementById('next-page');
    if (nextPageBtn) {
        nextPageBtn.disabled = state.currentPage >= state.totalPages;
    }
}

/**
 * 初始化分页大小选择器
 */
function initializePageSizeSelector() {
    const pageSizeSelect = document.getElementById('page-size');

    // 确保元素存在
    if (!pageSizeSelect) {
        console.warn('未找到分页大小选择器元素');
        return;
    }

    // 清空现有选项
    pageSizeSelect.innerHTML = '';

    // 添加页面大小选项
    [10, 20, 50, 100, 200, 500].forEach(size => {
        const option = document.createElement('option');
        option.value = size;
        option.textContent = `${size} 行/页`;

        if (size === state.pageSize) {
            option.selected = true;
        }

        pageSizeSelect.appendChild(option);
    });
}

/**
 * 处理初始数据
 */
function processInitialData() {
    // 推断列类型
    detectColumnTypes();

    // 设置列筛选下拉框
    updateFilterColumns();

    // 渲染表格 - 即使没有数据也会渲染表头
    renderTable();
}

/**
 * 更新筛选列下拉框
 */
function updateFilterColumns() {
    const filterColumnSelect = document.getElementById('filter-column');

    // 确保元素存在
    if (!filterColumnSelect) {
        console.warn('未找到筛选列选择器元素');
        return;
    }

    // 清空现有选项
    filterColumnSelect.innerHTML = '';

    // 添加默认选项
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '选择列';
    filterColumnSelect.appendChild(defaultOption);

    // 添加列选项
    state.columns.forEach(column => {
        const option = document.createElement('option');
        option.value = column;
        option.textContent = column;
        filterColumnSelect.appendChild(option);
    });
} 