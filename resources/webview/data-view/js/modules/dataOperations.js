import { state, getVsCodeApi } from './state.js';
import { renderTable } from './tableRenderer.js';

/**
 * 应用快速筛选
 * @param {string} filterText - 筛选文本
 */
export function applyQuickFilter(filterText) {
    if (!filterText) {
        state.filteredData = [...state.data];
        state.quickFilter = '';
    } else {
        const lowerFilter = filterText.toLowerCase();
        state.filteredData = state.data.filter(row => {
            // 检查每一行的所有字段
            return state.columns.some(column => {
                const value = row[column];
                if (value === null || value === undefined) return false;
                return String(value).toLowerCase().includes(lowerFilter);
            });
        });
        state.quickFilter = filterText;
    }

    // 更新当前页和总页数
    state.currentPage = 1;
    state.totalPages = Math.ceil(state.filteredData.length / state.pageSize) || 1;

    // 重新渲染表格
    renderTable();
}

/**
 * 本地排序数据
 * @param {string} column - 排序列
 * @param {string} direction - 排序方向('asc'或'desc')
 */
export function sortDataLocally(column, direction) {
    state.filteredData.sort((a, b) => {
        let valueA = a[column];
        let valueB = b[column];

        // 处理空值
        if (valueA === null) return direction === 'asc' ? -1 : 1;
        if (valueB === null) return direction === 'asc' ? 1 : -1;

        // 根据列类型排序
        const columnType = state.columnTypes[column];

        if (columnType === 'integer' || columnType === 'float' || columnType === 'number') {
            valueA = Number(valueA);
            valueB = Number(valueB);
            if (isNaN(valueA)) valueA = 0;
            if (isNaN(valueB)) valueB = 0;
        } else if (columnType === 'date' || columnType === 'datetime') {
            valueA = new Date(valueA).getTime();
            valueB = new Date(valueB).getTime();
            if (isNaN(valueA)) valueA = 0;
            if (isNaN(valueB)) valueB = 0;
        } else {
            valueA = String(valueA).toLowerCase();
            valueB = String(valueB).toLowerCase();
        }

        // 比较值
        if (valueA < valueB) return direction === 'asc' ? -1 : 1;
        if (valueA > valueB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

/**
 * 更改排序
 * @param {string} column - 排序列
 */
export function changeSort(column) {
    // 检测是否按住了Shift键（多列排序）
    const isMultiSort = window.event && (window.event.shiftKey || window.event.ctrlKey);

    console.log(`执行changeSort: 列=${column}, 多列排序=${isMultiSort}`);
    console.log(`当前排序状态: 列=${state.sortColumn}, 方向=${state.sortDirection}`);

    // 防止重复触发
    if (window.lastSortTime && Date.now() - window.lastSortTime < 300) {
        console.log('排序操作过于频繁，忽略此次请求');
        return;
    }
    window.lastSortTime = Date.now();

    let needServerUpdate = true;

    if (isMultiSort) {
        // 多列排序模式
        const existingIndex = state.sortColumns.findIndex(sort => sort.column === column);

        if (existingIndex >= 0) {
            // 已有此列，切换方向
            const currentDirection = state.sortColumns[existingIndex].direction;
            console.log(`多列排序: 切换列 ${column} 的方向，从 ${currentDirection} 到 ${currentDirection === 'asc' ? 'desc' : 'asc'}`);
            state.sortColumns[existingIndex].direction = currentDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // 添加新的排序列
            console.log(`多列排序: 添加新列 ${column} 为升序`);
            state.sortColumns.push({
                column: column,
                direction: 'asc'
            });
        }

        // 更新兼容性字段 - 确保单列排序被重置
        state.sortColumn = null;
        state.sortDirection = null;
    } else {
        // 单列排序模式（传统）
        // 清除多列排序
        state.sortColumns = [];

        // 切换排序方向
        if (state.sortColumn === column) {
            // 这里是切换排序方向的核心逻辑
            const newDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            console.log(`单列排序: 相同列 ${column}，切换方向从 ${state.sortDirection} 到 ${newDirection}`);
            state.sortDirection = newDirection;
        } else {
            // 点击新列时，默认使用升序
            console.log(`单列排序: 新列 ${column}，设置为默认升序`);
            state.sortColumn = column;
            state.sortDirection = 'asc';
        }
    }

    console.log(`排序后状态: 列=${state.sortColumn}, 方向=${state.sortDirection}, 多列=${JSON.stringify(state.sortColumns)}`);

    // 对于本地数据，执行本地排序并重新渲染
    sortDataByCurrentSettings();
    renderTable();

    if (needServerUpdate) {
        // 同时向服务端发送排序请求
        if (state.sortColumns && state.sortColumns.length > 0) {
            // 多列排序 - 改用sort命令而非filterTableData
            console.log(`使用sort命令发送多列排序请求: ${JSON.stringify(state.sortColumns)}`);
            getVsCodeApi().postMessage({
                command: 'sort',
                sortColumns: state.sortColumns,  // 使用sortColumns作为参数名
                filters: state.activeFilters || []
            });
        } else if (state.sortColumn) {
            // 单列排序
            console.log(`发送单列排序请求: 列=${state.sortColumn}, 方向=${state.sortDirection}`);
            getVsCodeApi().postMessage({
                command: 'sort',
                column: state.sortColumn,
                direction: state.sortDirection,
                filters: state.activeFilters
            });
        }
    }
}

/**
 * 根据当前排序设置进行排序
 */
function sortDataByCurrentSettings() {
    if (state.sortColumns.length > 0) {
        // 多列排序
        state.filteredData.sort((a, b) => {
            // 按照每个排序条件逐个比较
            for (const sort of state.sortColumns) {
                const result = compareCells(a, b, sort.column, sort.direction);
                if (result !== 0) {
                    return result;
                }
            }
            return 0; // 所有条件相等
        });
    } else if (state.sortColumn) {
        // 单列排序
        sortDataLocally(state.sortColumn, state.sortDirection);
    }
}

/**
 * 比较两个单元格值
 */
function compareCells(rowA, rowB, column, direction) {
    let valueA = rowA[column];
    let valueB = rowB[column];

    // 处理空值
    if (valueA === null) return direction === 'asc' ? -1 : 1;
    if (valueB === null) return direction === 'asc' ? 1 : -1;

    // 根据列类型排序
    const columnType = state.columnTypes[column];

    if (columnType === 'integer' || columnType === 'float' || columnType === 'number') {
        valueA = Number(valueA);
        valueB = Number(valueB);
        if (isNaN(valueA)) valueA = 0;
        if (isNaN(valueB)) valueB = 0;
    } else if (columnType === 'date' || columnType === 'datetime') {
        valueA = new Date(valueA).getTime();
        valueB = new Date(valueB).getTime();
        if (isNaN(valueA)) valueA = 0;
        if (isNaN(valueB)) valueB = 0;
    } else {
        valueA = String(valueA).toLowerCase();
        valueB = String(valueB).toLowerCase();
    }

    // 比较值
    if (valueA < valueB) return direction === 'asc' ? -1 : 1;
    if (valueA > valueB) return direction === 'asc' ? 1 : -1;
    return 0;
}

/**
 * 切换页面
 * @param {number} newPage - 新页码
 */
export function changePage(newPage) {
    if (newPage > 0 && newPage <= state.totalPages) {
        state.currentPage = newPage;
        renderTable();
    }
}

/**
 * 更改每页显示记录数
 * @param {number} pageSize - 每页记录数
 */
export function changePageSize(pageSize) {
    state.pageSize = pageSize;
    state.totalPages = Math.ceil(state.filteredData.length / state.pageSize) || 1;

    // 如果当前页超过了总页数，重置为第一页
    if (state.currentPage > state.totalPages) {
        state.currentPage = 1;
    }

    renderTable();
}

/**
 * 应用列筛选
 * @param {Object} filterConfig - 筛选配置
 */
export function applyColumnFilter(filterConfig) {
    if (!filterConfig.column) return;

    // 添加到筛选列表
    state.filters.push(filterConfig);

    // 发送消息到VSCode
    getVsCodeApi().postMessage({
        command: 'filter',
        filters: state.filters
    });
}

/**
 * 添加列筛选条件
 * @param {Object} filterConfig - 筛选配置
 */
export function addColumnFilter(filterConfig) {
    if (!filterConfig.column) return;

    // 添加到临时筛选列表
    state.filters.push(filterConfig);

    // 更新筛选条件显示
    renderFilterList();

    // 清空输入框，准备添加下一个条件
    document.getElementById('filter-column').selectedIndex = 0;
    document.getElementById('filter-operator').selectedIndex = 0;
    document.getElementById('filter-value').value = '';
}

/**
 * 应用所有筛选条件
 */
export function applyAllFilters() {
    // 将临时筛选条件应用为活动筛选条件
    state.activeFilters = [...state.filters];

    // 构建排序信息，同时发送到服务端
    let sortInfo = {};

    if (state.sortColumns && state.sortColumns.length > 0) {
        // 多列排序
        sortInfo.sortColumns = state.sortColumns;
    } else if (state.sortColumn) {
        // 单列排序
        sortInfo.sortColumn = state.sortColumn;
        sortInfo.sortDirection = state.sortDirection;
    }

    // 发送消息到VSCode
    getVsCodeApi().postMessage({
        command: 'filter',
        filters: state.activeFilters,
        ...sortInfo  // 添加排序信息
    });
}

/**
 * 删除单个筛选条件
 * @param {number} index - 要删除的筛选条件索引
 */
export function removeFilter(index) {
    state.filters.splice(index, 1);
    renderFilterList();
}

/**
 * 渲染筛选条件列表
 */
export function renderFilterList() {
    const filterList = document.getElementById('filter-list');
    filterList.innerHTML = '';

    state.filters.forEach((filter, index) => {
        const filterItem = document.createElement('div');
        filterItem.className = 'filter-item';

        let filterText = '';
        if (filter.operator === 'IS NULL') {
            filterText = `${filter.column} 为空`;
        } else if (filter.operator === 'IS NOT NULL') {
            filterText = `${filter.column} 不为空`;
        } else if (filter.operator === 'LIKE') {
            filterText = `${filter.column} 包含 '${filter.value}'`;
        } else if (filter.operator === 'IN') {
            filterText = `${filter.column} 属于 [${filter.value}]`;
        } else if (filter.operator === 'NOT IN') {
            filterText = `${filter.column} 不属于 [${filter.value}]`;
        } else {
            filterText = `${filter.column} ${filter.operator} '${filter.value}'`;
        }

        filterItem.innerHTML = `
            <span class="filter-text">${filterText}</span>
            <button class="remove-filter" data-index="${index}" title="删除此筛选条件">×</button>
        `;

        filterList.appendChild(filterItem);
    });

    // 添加删除按钮的事件监听
    document.querySelectorAll('.remove-filter').forEach(button => {
        button.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            removeFilter(index);
        });
    });
}

/**
 * 清除所有筛选
 */
export function clearAllFilters() {
    // 清除筛选列表
    state.filters = [];
    state.activeFilters = [];

    // 清除UI元素
    document.getElementById('filter-column').selectedIndex = 0;
    document.getElementById('filter-operator').selectedIndex = 0;
    document.getElementById('filter-value').value = '';
    document.getElementById('quick-search').value = '';

    // 清除筛选条件显示
    renderFilterList();

    // 清除快速筛选
    applyQuickFilter('');

    // 发送消息到VSCode
    getVsCodeApi().postMessage({
        command: 'clearFilters'
    });
} 