import { state, MAX_CELL_LENGTH } from './state.js';
import { formatCellValue } from './typeDetector.js';
import { showCellContent, copyToClipboard, showCopyHint } from './uiHelpers.js';

/**
 * 渲染表格
 */
export function renderTable() {
    // Render table headers
    renderTableHeader();

    // Render table body
    renderTableBody();

    // 更新状态栏信息
    updateStatusBar();

    // 自动调整表格布局
    adjustTableLayout();
}

/**
 * 自动调整表格布局
 */
function adjustTableLayout() {
    const table = document.getElementById('data-table');
    const tableContainer = document.querySelector('.table-container');
    const scrollHint = document.getElementById('scroll-hint');

    if (!table || !tableContainer) return;

    // 获取当前显示的数据行数
    const rowCount = state.filteredData ? state.filteredData.length : 0;
    const visibleRows = Math.min(state.pageSize, rowCount);

    // 当数据行数较多时，确保表格可以水平滚动
    if (visibleRows >= 20 || state.columns.length > 10) {
        table.style.width = 'max-content';
        tableContainer.style.overflowX = 'auto';

        // 检查是否需要显示滚动提示
        if (table.offsetWidth > tableContainer.offsetWidth) {
            scrollHint.classList.add('visible');

            // 3秒后自动隐藏提示
            setTimeout(() => {
                scrollHint.classList.remove('visible');
            }, 3000);

            // 监听滚动事件，滚动时隐藏提示
            tableContainer.addEventListener('scroll', () => {
                scrollHint.classList.remove('visible');
            }, { once: true });
        } else {
            scrollHint.classList.remove('visible');
        }
    } else {
        // 当数据行少时，可以适应容器宽度
        table.style.width = '100%';

        // 调整列宽度平均分布
        if (state.columns.length > 0) {
            const ths = document.querySelectorAll('#table-header th');
            const columnWidth = `${Math.floor(100 / state.columns.length)}%`;
            ths.forEach(th => {
                th.style.width = columnWidth;
            });
        }

        // 隐藏滚动提示
        if (scrollHint) {
            scrollHint.classList.remove('visible');
        }
    }
}

/**
 * 渲染表格头部
 */
function renderTableHeader() {
    const tableHeader = document.getElementById('table-header');

    // 检查表头元素是否存在
    if (!tableHeader) {
        console.error('表头元素未找到');
        return;
    }

    // 创建表头行
    const headerRow = document.createElement('tr');

    state.columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        th.dataset.column = column;
        // 显示列类型信息
        th.title = `${column} (${state.columnTypes[column] || 'unknown'})`;

        // 添加排序指示器
        if (state.sortColumn === column) {
            th.classList.add(state.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }

        headerRow.appendChild(th);
    });

    // 清空并添加表头行
    tableHeader.innerHTML = '';
    tableHeader.appendChild(headerRow);
}

/**
 * 渲染表格内容
 */
function renderTableBody() {
    const tableBody = document.getElementById('table-body');

    // 检查表体元素是否存在
    if (!tableBody) {
        console.error('表体元素未找到');
        return;
    }

    // 清空表体
    tableBody.innerHTML = '';

    // 检查是否有数据
    if (!state.filteredData || state.filteredData.length === 0) {
        renderEmptyTable();
        return;
    }

    // 计算当前页的数据范围
    const startIndex = (state.currentPage - 1) * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, state.filteredData.length);
    const pageData = state.filteredData.slice(startIndex, endIndex);

    // 如果当前页没有数据，显示空表格
    if (pageData.length === 0) {
        renderEmptyTable();
        return;
    }

    // 生成每一行
    pageData.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');

        // 设置行选中状态
        if (state.selectedRows.has(startIndex + rowIndex)) {
            tr.classList.add('selected');
        }

        // 添加行选择处理
        addRowSelectionHandler(tr, startIndex + rowIndex);

        // 为每列创建单元格
        state.columns.forEach(column => {
            renderCell(tr, row, column, rowIndex);
        });

        tableBody.appendChild(tr);
    });
}

/**
 * 渲染空表格提示
 */
function renderEmptyTable() {
    const tableBody = document.getElementById('table-body');

    // 检查表体元素是否存在
    if (!tableBody) {
        console.error('表体元素未找到，无法渲染空表格提示');
        return;
    }

    // 创建空表格行
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');

    // 设置跨列属性（防止state.columns未定义）
    emptyCell.colSpan = (state.columns && state.columns.length) || 1;

    // 设置提示文本
    emptyCell.textContent = state.quickFilter
        ? `没有找到匹配 "${state.quickFilter}" 的数据`
        : '没有数据';

    // 设置样式
    emptyCell.style.textAlign = 'center';
    emptyCell.style.padding = '20px';

    // 添加到DOM
    emptyRow.appendChild(emptyCell);
    tableBody.appendChild(emptyRow);
}

/**
 * 添加行选择事件处理
 * @param {HTMLElement} tr - 表格行元素
 * @param {number} rowIndex - 行索引
 */
function addRowSelectionHandler(tr, rowIndex) {
    tr.addEventListener('click', (e) => {
        // 根据是否按下Ctrl键决定是添加选择还是单选
        if (e.ctrlKey || e.metaKey) {
            if (state.selectedRows.has(rowIndex)) {
                state.selectedRows.delete(rowIndex);
                tr.classList.remove('selected');
            } else {
                state.selectedRows.add(rowIndex);
                tr.classList.add('selected');
            }
        } else {
            // 单选时，清除其他选择
            state.selectedRows.clear();
            document.querySelectorAll('#table-body tr.selected').forEach(selectedRow => {
                selectedRow.classList.remove('selected');
            });

            state.selectedRows.add(rowIndex);
            tr.classList.add('selected');
        }
    });
}

/**
 * 渲染单元格
 * @param {HTMLElement} tr - 表格行元素 
 * @param {Object} row - 行数据
 * @param {string} column - 列名
 * @param {number} rowIndex - 行索引
 */
function renderCell(tr, row, column, rowIndex) {
    const td = document.createElement('td');
    const value = row[column];
    const cellId = `cell-${rowIndex}-${column}`;
    td.id = cellId;

    // 根据列类型设置单元格类
    if (state.columnTypes[column]) {
        td.classList.add(state.columnTypes[column]);
    }

    // 格式化并设置内容
    const formattedValue = formatCellValue(value, column);
    td.innerHTML = formattedValue;

    // 如果内容被截断了，添加截断标记
    if (value !== null && String(value).length > MAX_CELL_LENGTH) {
        td.classList.add('truncated');

        // 双击显示完整内容
        td.addEventListener('dblclick', (e) => {
            e.stopPropagation(); // 防止触发行选择

            // 显示内容预览
            showCellContent(td, value, column);

            // 阻止复制事件触发
            e.preventDefault();
        });

        // 鼠标悬停显示提示
        td.title = '双击查看完整内容';
    } else {
        // 对于短内容，双击复制
        td.addEventListener('dblclick', () => {
            if (value !== null && value !== undefined) {
                copyToClipboard(String(value));
                showCopyHint(td);
            }
        });
    }

    tr.appendChild(td);
}

/**
 * 更新状态栏信息
 */
function updateStatusBar() {
    // 更新行数计数
    const rowCountElement = document.getElementById('row-count');
    if (rowCountElement) {
        rowCountElement.textContent = state.filteredData.length;
    }

    // 更新页码信息
    const currentPageElement = document.getElementById('current-page');
    if (currentPageElement) {
        currentPageElement.textContent = state.currentPage;
    }

    const totalPagesElement = document.getElementById('total-pages');
    if (totalPagesElement) {
        totalPagesElement.textContent = state.totalPages;
    }

    // 更新分页按钮状态
    const prevPageButton = document.getElementById('prev-page');
    if (prevPageButton) {
        prevPageButton.disabled = state.currentPage <= 1;
    }

    const nextPageButton = document.getElementById('next-page');
    if (nextPageButton) {
        nextPageButton.disabled = state.currentPage >= state.totalPages;
    }
} 