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
    // 切换排序方向
    if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = column;
        state.sortDirection = 'asc';
    }

    // 本地排序
    sortDataLocally(column, state.sortDirection);

    // 重新渲染
    renderTable();
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
 * 清除所有筛选
 */
export function clearAllFilters() {
    // 清除筛选列表
    state.filters = [];

    // 清除UI元素
    document.getElementById('filter-column').selectedIndex = 0;
    document.getElementById('filter-operator').selectedIndex = 0;
    document.getElementById('filter-value').value = '';
    document.getElementById('quick-search').value = '';

    // 清除快速筛选
    applyQuickFilter('');

    // 发送消息到VSCode
    getVsCodeApi().postMessage({
        command: 'clearFilters'
    });
} 