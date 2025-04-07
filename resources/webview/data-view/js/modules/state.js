/**
 * 全局状态对象
 */
export let state = {
    columns: [],
    data: [],
    tableName: '',
    connectionName: '',
    databaseName: '',
    currentPage: 1,
    totalPages: 1,
    pageSize: 100,
    sortColumn: null,  // 单列排序（向后兼容）
    sortDirection: 'asc',
    sortColumns: [],   // 多列排序 [{column: 'col1', direction: 'asc'}, {column: 'col2', direction: 'desc'}]
    filters: [], // 存储多个筛选条件
    activeFilters: [], // 当前激活的筛选条件
    quickFilter: '',
    filteredData: [],
    selectedRows: new Set(),
    columnTypes: {}, // 存储列类型信息
    lastCopyTime: 0,
    expandedCells: new Set() // 记录展开的单元格
};

/**
 * 常量定义
 */
export const MAX_CELL_LENGTH = 100; // 单元格内容显示的最大长度

/**
 * 获取VSCode API
 * @returns {Object} VSCode API
 */
export function getVsCodeApi() {
    if (!window.vscodeApi) {
        window.vscodeApi = acquireVsCodeApi();
    }
    return window.vscodeApi;
}

/**
 * 初始化状态
 * @param {Object} data - 初始数据
 */
export function initializeState(data) {
    // 如果有传入数据，使用传入的数据初始化
    if (data) {
        // 更新状态
        state.columns = data.columns || [];
        state.data = data.data || [];
        state.filteredData = [...state.data]; // 初始时过滤数据与原始数据相同
        state.tableName = data.tableName || '';
        state.connectionName = data.connectionName || '';
        state.databaseName = data.databaseName || '';
        state.currentPage = data.currentPage || 1;
        state.totalPages = Math.ceil(state.data.length / state.pageSize) || 1;
    }

    // 如果没有传入数据，尝试从window.__initialData获取
    else if (window.__initialData) {
        let initialData;

        // 如果__initialData是字符串（未被正确解析的JSON），尝试解析
        if (typeof window.__initialData === 'string') {
            try {
                initialData = JSON.parse(window.__initialData);
            } catch (error) {
                console.error('解析初始数据失败:', error);
                initialData = { columns: [], data: [] };
            }
        } else {
            // 已经是对象
            initialData = window.__initialData;
        }

        state.columns = initialData.columns || [];
        state.data = initialData.data || [];
        state.filteredData = [...state.data];
        state.tableName = initialData.tableName || '';
        state.connectionName = initialData.connectionName || '';
        state.databaseName = initialData.databaseName || '';
        state.currentPage = initialData.currentPage || 1;
        state.totalPages = Math.ceil(state.data.length / state.pageSize) || 1;
    }
}

// 存储原始数据
let tableData = {};

/**
 * 获取原始数据
 * @returns {Object} 原始表格数据
 */
export function getTableData() {
    return tableData;
} 