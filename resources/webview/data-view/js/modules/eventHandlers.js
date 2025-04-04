import { state, getVsCodeApi } from './state.js';
import { renderTable } from './tableRenderer.js';
import { detectColumnTypes } from './typeDetector.js';
import { copyToClipboard } from './uiHelpers.js';
import {
    applyQuickFilter,
    changeSort,
    changePage,
    changePageSize,
    addColumnFilter,
    applyAllFilters,
    clearAllFilters,
    renderFilterList
} from './dataOperations.js';

/**
 * 设置所有事件监听器
 */
export function setupEventListeners() {
    // 按钮事件
    setupButtonEvents();

    // 表格事件
    setupTableEvents();

    // 筛选事件
    setupFilterEvents();

    // 键盘事件
    setupKeyboardEvents();

    // VSCode消息事件
    setupVSCodeMessageEvents();
}

/**
 * 设置按钮相关事件监听
 */
function setupButtonEvents() {
    // Refresh button
    document.getElementById('refresh').addEventListener('click', () => {
        getVsCodeApi().postMessage({ command: 'refresh' });
    });

    // Execute query button
    document.getElementById('execute-query').addEventListener('click', () => {
        const query = prompt('输入SQL查询:', `SELECT * FROM "${state.tableName}" LIMIT 100`);
        if (query) {
            getVsCodeApi().postMessage({
                command: 'executeQuery',
                query: query
            });
        }
    });

    // Export button
    document.getElementById('export').addEventListener('click', () => {
        const format = prompt('导出格式 (csv, json, sql):', 'csv');
        if (format) {
            getVsCodeApi().postMessage({
                command: 'export',
                format: format,
                selectedOnly: state.selectedRows.size > 0
            });
        }
    });

    // Pagination buttons
    document.getElementById('prev-page').addEventListener('click', () => {
        if (state.currentPage > 1) {
            changePage(state.currentPage - 1);
        }
    });

    document.getElementById('next-page').addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
            changePage(state.currentPage + 1);
        }
    });

    // Page size change
    document.getElementById('page-size').addEventListener('change', (event) => {
        changePageSize(parseInt(event.target.value));
    });
}

/**
 * 设置表格相关事件监听
 */
function setupTableEvents() {
    // Table header click for sorting
    document.getElementById('table-header').addEventListener('click', (event) => {
        if (event.target.tagName === 'TH') {
            const column = event.target.dataset.column;
            console.log(`表头点击: 列=${column}`);

            if (column) {
                changeSort(column);
            }
        }
    });

    // 点击空白区域隐藏工具提示
    document.addEventListener('click', (e) => {
        // 如果点击的不是单元格，隐藏内容预览
        if (!e.target.closest('td') && !e.target.closest('#content-tooltip')) {
            document.getElementById('content-tooltip').style.display = 'none';
        }
    });
}

/**
 * 设置筛选相关事件监听
 */
function setupFilterEvents() {
    // 添加筛选条件按钮
    document.getElementById('add-filter').addEventListener('click', () => {
        const column = document.getElementById('filter-column').value;
        const operator = document.getElementById('filter-operator').value;
        const value = document.getElementById('filter-value').value;

        if (!column) {
            alert('请选择一个列进行筛选');
            return;
        }

        // 对于IS NULL和IS NOT NULL操作符，不需要值
        if ((operator === 'IS NULL' || operator === 'IS NOT NULL') || value) {
            addColumnFilter({ column, operator, value });
        } else {
            alert('请输入筛选值');
        }
    });

    // 应用所有筛选条件
    document.getElementById('apply-filters').addEventListener('click', () => {
        applyAllFilters();
    });

    // 清除按钮
    document.getElementById('clear-filter').addEventListener('click', () => {
        clearAllFilters();
    });

    // 快速搜索
    document.getElementById('quick-search').addEventListener('input', (event) => {
        applyQuickFilter(event.target.value);
    });

    // 操作符变更事件 - 当选择IS NULL或IS NOT NULL时禁用值输入框
    document.getElementById('filter-operator').addEventListener('change', (event) => {
        const valueInput = document.getElementById('filter-value');
        const operatorValue = event.target.value;

        if (operatorValue === 'IS NULL' || operatorValue === 'IS NOT NULL') {
            valueInput.disabled = true;
            valueInput.value = '';
            valueInput.placeholder = '无需输入值';
        } else if (operatorValue === 'IN' || operatorValue === 'NOT IN') {
            valueInput.disabled = false;
            valueInput.placeholder = '多个值以逗号分隔，例如: 值1,值2,值3';
        } else {
            valueInput.disabled = false;
            valueInput.placeholder = '输入筛选值';
        }
    });
}

/**
 * 设置键盘事件监听
 */
function setupKeyboardEvents() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+C 复制选中行
        if ((e.ctrlKey || e.metaKey) && e.key === 'c' && state.selectedRows.size > 0) {
            handleCopySelectedRows(e);
        }

        // Esc键隐藏所有工具提示
        if (e.key === 'Escape') {
            document.getElementById('content-tooltip').style.display = 'none';
        }
    });
}

/**
 * 处理复制选中行数据
 * @param {KeyboardEvent} e - 键盘事件对象
 */
function handleCopySelectedRows(e) {
    e.preventDefault();
    const selectedData = Array.from(state.selectedRows)
        .map(idx => state.filteredData[idx])
        .filter(Boolean);

    if (selectedData.length > 0) {
        const headers = state.columns.join('\t');
        const rows = selectedData.map(row =>
            state.columns.map(col => row[col] === null ? 'NULL' : row[col]).join('\t')
        );
        const clipboardText = [headers, ...rows].join('\n');
        copyToClipboard(clipboardText);

        // 显示临时提示
        showCopyRowsHint(selectedData.length);
    }
}

/**
 * 显示复制行数据的提示
 * @param {number} count - 复制的行数
 */
function showCopyRowsHint(count) {
    const tableContainer = document.querySelector('.table-container');
    const tempHint = document.createElement('div');
    tempHint.textContent = `已复制 ${count} 行数据`;
    tempHint.className = 'copy-hint visible';
    tempHint.style.top = '20px';
    tempHint.style.left = '50%';
    tempHint.style.transform = 'translateX(-50%)';
    tableContainer.appendChild(tempHint);

    setTimeout(() => {
        tempHint.remove();
    }, 1500);
}

/**
 * 设置VSCode消息事件监听
 */
function setupVSCodeMessageEvents() {
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'updateData':
                handleDataUpdate(message);
                break;
        }
    });
}

/**
 * 处理数据更新消息
 * @param {Object} message - 消息对象
 */
function handleDataUpdate(message) {
    // Update the state with new data
    if (message.data && message.data.data) {
        state.data = message.data.data;
        state.filteredData = [...state.data];
        state.totalPages = Math.ceil(state.data.length / state.pageSize) || 1;
        state.currentPage = 1;
        state.selectedRows.clear();

        // 重新推断列类型
        detectColumnTypes();

        renderTable();
    }
}

/**
 * 设置用户界面事件处理程序
 */
export function setupUIEventHandlers() {
    // 使用已定义的函数来替代缺少的setupSortingEvents
    setupTableEvents();

    // 使用已定义的函数来替代缺少的setupPaginationEvents和setupRefreshEvent
    setupButtonEvents();

    // 筛选事件已定义
    setupFilterEvents();

    // 表格滚动事件已定义
    setupTableScrollEvents();

    // 键盘事件
    setupKeyboardEvents();
}

/**
 * 设置表格容器滚动事件
 */
function setupTableScrollEvents() {
    const tableContainer = document.querySelector('.table-container');

    if (!tableContainer) return;

    // 添加滚动事件
    tableContainer.addEventListener('scroll', () => {
        // 检查是否需要显示或隐藏水平滚动指示器
        const table = document.getElementById('data-table');
        const scrollHint = document.getElementById('scroll-hint');

        if (table && scrollHint) {
            // 检测是否滚动到了最右侧
            const isScrolledToRight = Math.abs(
                (tableContainer.scrollWidth - tableContainer.clientWidth - tableContainer.scrollLeft)
            ) < 5;

            // 检测是否滚动到了最左侧
            const isScrolledToLeft = tableContainer.scrollLeft < 5;

            // 如果在两侧边缘且有需要滚动的情况，短暂显示滚动提示
            if ((isScrolledToLeft || isScrolledToRight) &&
                tableContainer.scrollWidth > tableContainer.clientWidth) {
                scrollHint.classList.add('visible');

                // 一段时间后隐藏提示
                setTimeout(() => {
                    scrollHint.classList.remove('visible');
                }, 1500);
            }
        }
    });
} 