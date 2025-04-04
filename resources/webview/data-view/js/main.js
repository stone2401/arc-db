// Initialize with data from VS Code
const vscode = acquireVsCodeApi();
// 变量名从initialData改为tableData，避免与index.html中的冲突
let tableData = {};

// Store state in webview
let state = {
    columns: [],
    data: [],
    tableName: '',
    connectionName: '',
    databaseName: '',
    currentPage: 1,
    totalPages: 1,
    pageSize: 100,
    sortColumn: null,
    sortDirection: 'asc',
    filters: []
};

// 初始化状态，在window.onload时调用
function initializeState(data) {
    // 将传入的数据保存到tableData中
    tableData = data;
    console.log('tableData', tableData);

    // 更新状态
    state.columns = tableData.columns || [];
    state.data = tableData.data || [];
    state.tableName = tableData.tableName || '';
    state.connectionName = tableData.connectionName || '';
    state.databaseName = tableData.databaseName || '';
    state.currentPage = tableData.currentPage || 1;
    state.totalPages = tableData.totalPages || 1;
}

// Initialize filter column dropdown
function initializeFilterColumns() {
    const filterColumn = document.getElementById('filter-column');
    filterColumn.innerHTML = '<option value="">Select column</option>';

    state.columns.forEach(column => {
        const option = document.createElement('option');
        option.value = column;
        option.textContent = column;
        filterColumn.appendChild(option);
    });
}

// Function to render the table
function renderTable() {
    // Render table headers
    const headerRow = document.createElement('tr');

    state.columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        th.dataset.column = column;

        // Add sort indicator if this column is sorted
        if (state.sortColumn === column) {
            th.classList.add(state.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }

        headerRow.appendChild(th);
    });

    // Clear and append the header row
    const tableHeader = document.getElementById('table-header');
    tableHeader.innerHTML = '';
    tableHeader.appendChild(headerRow);

    // Render table rows
    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = '';

    state.data.forEach(row => {
        const tr = document.createElement('tr');

        state.columns.forEach(column => {
            const td = document.createElement('td');
            const value = row[column];

            if (value === null) {
                td.innerHTML = '<span class="null-value">NULL</span>';
            } else {
                td.textContent = value.toString();
            }

            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });

    // Update row count and pagination
    document.getElementById('row-count').textContent = tableData.rowCount;
    document.getElementById('current-page').textContent = state.currentPage;
    document.getElementById('total-pages').textContent = state.totalPages;
}

// Set up event listeners
function setupEventListeners() {
    // Refresh button
    document.getElementById('refresh').addEventListener('click', () => {
        vscode.postMessage({ command: 'refresh' });
    });

    // Execute query button
    document.getElementById('execute-query').addEventListener('click', () => {
        const query = prompt('Enter SQL query:', `SELECT * FROM "${state.tableName}" LIMIT 100`);
        if (query) {
            vscode.postMessage({
                command: 'executeQuery',
                query: query
            });
        }
    });

    // Export button
    document.getElementById('export').addEventListener('click', () => {
        const format = prompt('Export format (csv, json, sql):', 'csv');
        if (format) {
            vscode.postMessage({
                command: 'export',
                format: format,
                selectedOnly: false
            });
        }
    });

    // Filter buttons
    document.getElementById('apply-filter').addEventListener('click', () => {
        const column = document.getElementById('filter-column').value;
        const operator = document.getElementById('filter-operator').value;
        const value = document.getElementById('filter-value').value;

        if (column) {
            const filters = [{
                column,
                operator,
                value
            }];

            vscode.postMessage({
                command: 'filter',
                filters: filters
            });
        }
    });

    document.getElementById('clear-filter').addEventListener('click', () => {
        document.getElementById('filter-column').selectedIndex = 0;
        document.getElementById('filter-operator').selectedIndex = 0;
        document.getElementById('filter-value').value = '';

        vscode.postMessage({
            command: 'clearFilters'
        });
    });

    // Pagination buttons
    document.getElementById('prev-page').addEventListener('click', () => {
        if (state.currentPage > 1) {
            vscode.postMessage({
                command: 'navigate',
                page: state.currentPage - 1,
                pageSize: state.pageSize
            });
        }
    });

    document.getElementById('next-page').addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
            vscode.postMessage({
                command: 'navigate',
                page: state.currentPage + 1,
                pageSize: state.pageSize
            });
        }
    });

    // Page size change
    document.getElementById('page-size').addEventListener('change', (event) => {
        state.pageSize = parseInt(event.target.value);
        vscode.postMessage({
            command: 'navigate',
            page: 1,
            pageSize: state.pageSize
        });
    });

    // Table header click for sorting
    document.getElementById('table-header').addEventListener('click', (event) => {
        if (event.target.tagName === 'TH') {
            const column = event.target.dataset.column;

            // Toggle sort direction if clicking the same column
            if (state.sortColumn === column) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortColumn = column;
                state.sortDirection = 'asc';
            }

            vscode.postMessage({
                command: 'sort',
                column: state.sortColumn,
                direction: state.sortDirection
            });
        }
    });

    // Handle messages from VS Code
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'updateData':
                // Update the state with new data
                Object.assign(state, message.data);
                renderTable();
                break;
        }
    });
}

// 提供给HTML页面初始化的方法
function initializeDataView(data) {
    try {
        console.log('初始化数据视图', data);
        initializeState(data);
        initializeFilterColumns();
        renderTable();
        setupEventListeners();
    } catch (error) {
        console.error('初始化数据视图出错:', error);
    }
} 