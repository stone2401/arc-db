// Initialize communication with VSCode
const vscode = acquireVsCodeApi();

// Initial data from VSCode
const initialData = TEMPLATE_INITIAL_DATA || {
    columns: [],
    data: [],
    tableName: '',
    connectionName: '',
    databaseName: '',
    rowCount: 0,
    primaryKey: null
};

// Store state in webview
let state = {
    columns: initialData.columns || [],
    data: initialData.data || [],
    tableName: initialData.tableName || '',
    connectionName: initialData.connectionName || '',
    databaseName: initialData.databaseName || '',
    currentPage: 1,
    totalPages: Math.ceil((initialData.rowCount || 0) / 100),
    pageSize: 100,
    sortColumn: null,
    sortDirection: 'asc',
    filters: [],
    selectedRows: new Set(),
    editingCell: null,
    primaryKey: initialData.primaryKey || null,
    totalRowCount: initialData.rowCount || 0,
    customQuery: null
};

// Cache DOM elements
const elements = {
    tableHeader: document.getElementById('table-header'),
    tableBody: document.getElementById('table-body'),
    rowCount: document.getElementById('row-count'),
    selectedCount: document.getElementById('selected-count'),
    currentPage: document.getElementById('current-page'),
    totalPages: document.getElementById('total-pages'),
    pageSize: document.getElementById('page-size'),
    contextMenu: document.getElementById('context-menu'),
    queryEditorContainer: document.getElementById('query-editor-container'),
    queryEditor: document.getElementById('query-editor'),
    filterBody: document.getElementById('filter-body'),
    rowEditorModal: document.getElementById('row-editor-modal'),
    rowEditorBody: document.getElementById('row-editor-body'),
    modalTitle: document.getElementById('modal-title')
};

// Initialize the UI
function initializeUI() {
    // Set initial values
    elements.currentPage.textContent = state.currentPage;
    elements.totalPages.textContent = state.totalPages;
    elements.pageSize.value = state.pageSize.toString();
    
    // Render the table
    renderTable();
    
    // Initialize filter columns
    updateFilterColumns();
    
    // Set up event listeners
    setupEventListeners();
}

// Render the table with current state
function renderTable() {
    // Render table headers
    renderTableHeaders();
    
    // Render table rows
    renderTableRows();
    
    // Update row count display
    elements.rowCount.textContent = state.totalRowCount.toString();
    elements.selectedCount.textContent = state.selectedRows.size.toString();
}

// Render table headers
function renderTableHeaders() {
    const headerRow = document.createElement('tr');
    
    // Add selection column
    const selectAllHeader = document.createElement('th');
    selectAllHeader.style.width = '30px';
    selectAllHeader.innerHTML = '<input type="checkbox" id="select-all">';
    headerRow.appendChild(selectAllHeader);
    
    // Add data columns
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
    elements.tableHeader.innerHTML = '';
    elements.tableHeader.appendChild(headerRow);
    
    // Add select all event listener
    document.getElementById('select-all').addEventListener('change', handleSelectAll);
}

// Render table rows
function renderTableRows() {
    elements.tableBody.innerHTML = '';
    
    state.data.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        tr.dataset.rowIndex = rowIndex.toString();
        
        // Check if this row is selected
        if (state.selectedRows.has(getPrimaryKeyValue(row))) {
            tr.classList.add('selected');
        }
        
        // Add checkbox cell
        const checkboxCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state.selectedRows.has(getPrimaryKeyValue(row));
        checkbox.dataset.rowIndex = rowIndex.toString();
        checkboxCell.appendChild(checkbox);
        tr.appendChild(checkboxCell);
        
        // Add data cells
        state.columns.forEach(column => {
            const td = document.createElement('td');
            td.dataset.column = column;
            td.dataset.rowIndex = rowIndex.toString();
            
            const value = row[column];
            if (value === null) {
                td.innerHTML = '<span class="null-value">NULL</span>';
            } else {
                td.textContent = value.toString();
            }
            
            tr.appendChild(td);
        });
        
        elements.tableBody.appendChild(tr);
    });
    
    // Add row selection event listeners
    elements.tableBody.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', handleRowSelection);
    });
}

// Get primary key value for a row
function getPrimaryKeyValue(row) {
    if (!state.primaryKey) {
        // If no primary key, use the entire row as a string
        return JSON.stringify(row);
    }
    
    if (Array.isArray(state.primaryKey)) {
        // Composite key
        return state.primaryKey.map(key => row[key]).join('|');
    }
    
    // Single column primary key
    return row[state.primaryKey];
}

// Handle row selection
function handleRowSelection(event) {
    const checkbox = event.target;
    const rowIndex = parseInt(checkbox.dataset.rowIndex);
    const row = state.data[rowIndex];
    const primaryKeyValue = getPrimaryKeyValue(row);
    
    if (checkbox.checked) {
        state.selectedRows.add(primaryKeyValue);
    } else {
        state.selectedRows.delete(primaryKeyValue);
    }
    
    // Update the row's selected class
    const tr = checkbox.closest('tr');
    if (checkbox.checked) {
        tr.classList.add('selected');
    } else {
        tr.classList.remove('selected');
    }
    
    // Update selected count
    elements.selectedCount.textContent = state.selectedRows.size.toString();
}

// Handle select all checkbox
function handleSelectAll(event) {
    const selectAll = event.target.checked;
    
    // Update all checkboxes
    elements.tableBody.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = selectAll;
    });
    
    // Update selected rows set
    if (selectAll) {
        state.data.forEach(row => {
            state.selectedRows.add(getPrimaryKeyValue(row));
        });
        
        // Add selected class to all rows
        elements.tableBody.querySelectorAll('tr').forEach(tr => {
            tr.classList.add('selected');
        });
    } else {
        state.selectedRows.clear();
        
        // Remove selected class from all rows
        elements.tableBody.querySelectorAll('tr').forEach(tr => {
            tr.classList.remove('selected');
        });
    }
    
    // Update selected count
    elements.selectedCount.textContent = state.selectedRows.size.toString();
}

// Set up all event listeners
function setupEventListeners() {
    // Refresh button
    document.getElementById('refresh').addEventListener('click', () => {
        refreshData();
    });
    
    // Execute query button
    document.getElementById('execute-query').addEventListener('click', () => {
        toggleQueryEditor();
    });
    
    // Run query button
    document.getElementById('run-query').addEventListener('click', () => {
        executeCustomQuery();
    });
    
    // Close query editor button
    document.getElementById('close-query-editor').addEventListener('click', () => {
        toggleQueryEditor();
    });
    
    // Export buttons
    document.getElementById('export-csv').addEventListener('click', () => {
        exportData('csv');
    });
    
    document.getElementById('export-json').addEventListener('click', () => {
        exportData('json');
    });
    
    document.getElementById('export-sql').addEventListener('click', () => {
        exportData('sql');
    });
    
    // Pagination buttons
    document.getElementById('first-page').addEventListener('click', () => {
        navigateToPage(1);
    });
    
    document.getElementById('prev-page').addEventListener('click', () => {
        if (state.currentPage > 1) {
            navigateToPage(state.currentPage - 1);
        }
    });
    
    document.getElementById('next-page').addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
            navigateToPage(state.currentPage + 1);
        }
    });
    
    document.getElementById('last-page').addEventListener('click', () => {
        navigateToPage(state.totalPages);
    });
    
    // Page size change
    document.getElementById('page-size').addEventListener('change', (event) => {
        state.pageSize = parseInt(event.target.value);
        navigateToPage(1); // Reset to first page with new page size
    });
    
    // Table header click for sorting
    elements.tableHeader.addEventListener('click', (event) => {
        if (event.target.tagName === 'TH' && event.target.dataset.column) {
            handleSort(event.target.dataset.column);
        }
    });
    
    // Table cell double-click for inline editing
    elements.tableBody.addEventListener('dblclick', (event) => {
        if (event.target.tagName === 'TD' && event.target.dataset.column) {
            handleCellEdit(event.target);
        }
    });
    
    // Table row right-click for context menu
    elements.tableBody.addEventListener('contextmenu', (event) => {
        if (event.target.closest('tr')) {
            showContextMenu(event);
            event.preventDefault();
        }
    });
    
    // Hide context menu on click outside
    document.addEventListener('click', () => {
        elements.contextMenu.style.display = 'none';
    });
    
    // Context menu actions
    document.getElementById('context-edit').addEventListener('click', () => {
        editSelectedRow();
    });
    
    document.getElementById('context-duplicate').addEventListener('click', () => {
        duplicateSelectedRow();
    });
    
    document.getElementById('context-delete').addEventListener('click', () => {
        deleteSelectedRows();
    });
    
    document.getElementById('context-copy').addEventListener('click', () => {
        copySelectedCell();
    });
    
    document.getElementById('context-copy-row').addEventListener('click', () => {
        copySelectedRow();
    });
    
    // Filter actions
    document.getElementById('add-filter').addEventListener('click', () => {
        addFilterRow();
    });
    
    document.getElementById('apply-filters').addEventListener('click', () => {
        applyFilters();
    });
    
    document.getElementById('clear-filters').addEventListener('click', () => {
        clearFilters();
    });
    
    document.getElementById('toggle-filters').addEventListener('click', () => {
        toggleFilters();
    });
    
    // Modal actions
    document.getElementById('close-modal').addEventListener('click', () => {
        closeModal();
    });
    
    document.getElementById('save-row').addEventListener('click', () => {
        saveRowEdit();
    });
    
    document.getElementById('cancel-edit').addEventListener('click', () => {
        closeModal();
    });
    
    // Handle messages from VS Code
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'updateData':
                handleDataUpdate(message.data);
                break;
            case 'showError':
                showError(message.message);
                break;
            case 'showSuccess':
                showSuccess(message.message);
                break;
        }
    });
    
    // Handle keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        // Escape to close modals and menus
        if (event.key === 'Escape') {
            elements.contextMenu.style.display = 'none';
            closeModal();
            if (state.editingCell) {
                cancelCellEdit();
            }
        }
        
        // Ctrl+F to focus on filter
        if (event.key === 'f' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            if (elements.filterBody.style.display !== 'none') {
                const firstFilterInput = elements.filterBody.querySelector('.filter-value');
                if (firstFilterInput) {
                    firstFilterInput.focus();
                } else {
                    addFilterRow();
                }
            } else {
                toggleFilters();
                setTimeout(() => {
                    addFilterRow();
                }, 100);
            }
        }
    });
}

// Handle sorting
function handleSort(column) {
    if (state.sortColumn === column) {
        // Toggle direction if same column
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = column;
        state.sortDirection = 'asc';
    }
    
    // Request sorted data from VSCode
    vscode.postMessage({
        command: 'sort',
        column: state.sortColumn,
        direction: state.sortDirection
    });
    
    // Update sort indicators
    renderTableHeaders();
}

// Navigate to specific page
function navigateToPage(page) {
    state.currentPage = page;
    elements.currentPage.textContent = page.toString();
    
    // Request data for this page from VSCode
    vscode.postMessage({
        command: 'navigate',
        page: page,
        pageSize: state.pageSize
    });
    
    // Show loading indicator
    showLoading();
}

// Refresh data
function refreshData() {
    vscode.postMessage({
        command: 'refresh',
        page: state.currentPage,
        pageSize: state.pageSize,
        sortColumn: state.sortColumn,
        sortDirection: state.sortDirection,
        filters: state.filters
    });
    
    // Show loading indicator
    showLoading();
}

// Toggle query editor visibility
function toggleQueryEditor() {
    elements.queryEditorContainer.classList.toggle('visible');
    
    if (elements.queryEditorContainer.classList.contains('visible')) {
        // Set default query if empty
        if (!elements.queryEditor.textContent) {
            elements.queryEditor.textContent = `SELECT * FROM "${state.tableName}" LIMIT 100`;
        }
        
        // Focus the editor
        setTimeout(() => {
            elements.queryEditor.focus();
        }, 100);
    }
}

// Execute custom query
function executeCustomQuery() {
    const query = elements.queryEditor.textContent.trim();
    
    if (!query) {
        showError('Query cannot be empty');
        return;
    }
    
    state.customQuery = query;
    
    vscode.postMessage({
        command: 'executeQuery',
        query: query
    });
    
    // Show loading indicator
    showLoading();
}

// Export data
function exportData(format) {
    vscode.postMessage({
        command: 'export',
        format: format,
        selectedOnly: state.selectedRows.size > 0
    });
}

// Show context menu
function showContextMenu(event) {
    const x = event.clientX;
    const y = event.clientY;
    
    // Position the menu
    elements.contextMenu.style.display = 'block';
    elements.contextMenu.style.left = `${x}px`;
    elements.contextMenu.style.top = `${y}px`;
    
    // Get the clicked row
    const row = event.target.closest('tr');
    const rowIndex = parseInt(row.dataset.rowIndex);
    
    // Store the selected row and cell for context actions
    state.contextRowIndex = rowIndex;
    state.contextCellElement = event.target.tagName === 'TD' ? event.target : null;
}

// Edit selected row
function editSelectedRow() {
    if (state.contextRowIndex === undefined) return;
    
    const row = state.data[state.contextRowIndex];
    openRowEditor(row, state.contextRowIndex);
}

// Duplicate selected row
function duplicateSelectedRow() {
    if (state.contextRowIndex === undefined) return;
    
    const row = state.data[state.contextRowIndex];
    const newRow = {...row};
    
    // Clear primary key for new row
    if (state.primaryKey) {
        if (Array.isArray(state.primaryKey)) {
            state.primaryKey.forEach(key => {
                newRow[key] = null;
            });
        } else {
            newRow[state.primaryKey] = null;
        }
    }
    
    openRowEditor(newRow, null, true);
}

// Delete selected rows
function deleteSelectedRows() {
    const selectedCount = state.selectedRows.size;
    
    if (selectedCount === 0 && state.contextRowIndex !== undefined) {
        // Delete the right-clicked row if no rows are selected
        const row = state.data[state.contextRowIndex];
        const primaryKeyValue = getPrimaryKeyValue(row);
        
        if (confirm(`Are you sure you want to delete this row?`)) {
            vscode.postMessage({
                command: 'deleteRows',
                rows: [primaryKeyValue]
            });
        }
    } else if (selectedCount > 0) {
        // Delete all selected rows
        if (confirm(`Are you sure you want to delete ${selectedCount} selected row(s)?`)) {
            vscode.postMessage({
                command: 'deleteRows',
                rows: Array.from(state.selectedRows)
            });
        }
    }
}

// Copy selected cell content
function copySelectedCell() {
    if (!state.contextCellElement) return;
    
    const text = state.contextCellElement.textContent;
    copyToClipboard(text);
}

// Copy selected row as JSON
function copySelectedRow() {
    if (state.contextRowIndex === undefined) return;
    
    const row = state.data[state.contextRowIndex];
    const text = JSON.stringify(row, null, 2);
    copyToClipboard(text);
}

// Copy text to clipboard
function copyToClipboard(text) {
    vscode.postMessage({
        command: 'copyToClipboard',
        text: text
    });
}

// Open row editor modal
function openRowEditor(row, rowIndex, isDuplicate = false) {
    elements.rowEditorBody.innerHTML = '';
    
    // Set modal title
    if (isDuplicate) {
        elements.modalTitle.textContent = 'Duplicate Row';
    } else if (rowIndex === null) {
        elements.modalTitle.textContent = 'Add New Row';
    } else {
        elements.modalTitle.textContent = 'Edit Row';
    }
    
    // Create form fields for each column
    state.columns.forEach(column => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.textContent = column;
        label.htmlFor = `field-${column}`;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `field-${column}`;
        input.name = column;
        input.value = row[column] !== null ? row[column] : '';
        
        // Mark primary key fields
        if (state.primaryKey === column || 
            (Array.isArray(state.primaryKey) && state.primaryKey.includes(column))) {
            label.innerHTML += ' <span style="color:var(--vscode-notificationsInfoIcon-foreground);">(Primary Key)</span>';
        }
        
        formGroup.appendChild(label);
        formGroup.appendChild(input);
        elements.rowEditorBody.appendChild(formGroup);
    });
    
    // Store the row index for saving
    elements.rowEditorModal.dataset.rowIndex = rowIndex !== null ? rowIndex.toString() : '';
    elements.rowEditorModal.dataset.isDuplicate = isDuplicate.toString();
    
    // Show the modal
    elements.rowEditorModal.classList.add('visible');
}

// Save row edit
function saveRowEdit() {
    const rowIndex = elements.rowEditorModal.dataset.rowIndex;
    const isDuplicate = elements.rowEditorModal.dataset.isDuplicate === 'true';
    
    // Collect form data
    const updatedRow = {};
    state.columns.forEach(column => {
        const input = document.getElementById(`field-${column}`);
        updatedRow[column] = input.value === '' ? null : input.value;
    });
    
    // Send update to VSCode
    if (rowIndex === '') {
        // Insert new row
        vscode.postMessage({
            command: 'insertRow',
            row: updatedRow
        });
    } else {
        // Update existing row
        const originalRow = state.data[parseInt(rowIndex)];
        vscode.postMessage({
            command: 'updateRow',
            originalRow: originalRow,
            updatedRow: updatedRow
        });
    }
    
    // Close the modal
    closeModal();
}

// Close the modal
function closeModal() {
    elements.rowEditorModal.classList.remove('visible');
}

// Handle cell edit
function handleCellEdit(cell) {
    const rowIndex = parseInt(cell.dataset.rowIndex);
    const column = cell.dataset.column;
    const row = state.data[rowIndex];
    const value = row[column];
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value !== null ? value : '';
    
    // Position the input
    const cellRect = cell.getBoundingClientRect();
    const cellEditorDiv = document.createElement('div');
    cellEditorDiv.className = 'cell-editor';
    cellEditorDiv.style.left = `${cellRect.left}px`;
    cellEditorDiv.style.top = `${cellRect.top}px`;
    cellEditorDiv.style.width = `${cellRect.width}px`;
    cellEditorDiv.style.height = `${cellRect.height}px`;
    
    cellEditorDiv.appendChild(input);
    document.body.appendChild(cellEditorDiv);
    
    // Store editing state
    state.editingCell = {
        cell,
        rowIndex,
        column,
        editor: cellEditorDiv
    };
    
    // Focus the input
    input.focus();
    input.select();
    
    // Handle input events
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            saveCellEdit();
        } else if (event.key === 'Escape') {
            cancelCellEdit();
        }
    });
    
    input.addEventListener('blur', () => {
        saveCellEdit();
    });
}

// Save cell edit
function saveCellEdit() {
    if (!state.editingCell) return;
    
    const { cell, rowIndex, column, editor } = state.editingCell;
    const input = editor.querySelector('input');
    const newValue = input.value === '' ? null : input.value;
    
    // Update the cell visually
    if (newValue === null) {
        cell.innerHTML = '<span class="null-value">NULL</span>';
    } else {
        cell.textContent = newValue;
    }
    
    // Update the data
    const originalRow = state.data[rowIndex];
    const updatedRow = {...originalRow};
    updatedRow[column] = newValue;
    
    // Send update to VSCode
    vscode.postMessage({
        command: 'updateCell',
        rowIndex: rowIndex,
        column: column,
        originalValue: originalRow[column],
        newValue: newValue,
        originalRow: originalRow,
        updatedRow: updatedRow
    });
    
    // Clean up
    editor.remove();
    state.editingCell = null;
}

// Cancel cell edit
function cancelCellEdit() {
    if (!state.editingCell) return;
    
    state.editingCell.editor.remove();
    state.editingCell = null;
}

// Update filter columns dropdown
function updateFilterColumns() {
    const template = document.getElementById('filter-template');
    const columnSelect = template.querySelector('.filter-column');
    
    // Clear existing options
    columnSelect.innerHTML = '';
    
    // Add options for each column
    state.columns.forEach(column => {
        const option = document.createElement('option');
        option.value = column;
        option.textContent = column;
        columnSelect.appendChild(option);
    });
}

// Add a new filter row
function addFilterRow() {
    const template = document.getElementById('filter-template');
    const newRow = template.cloneNode(true);
    newRow.id = '';
    
    // Add remove button event listener
    newRow.querySelector('.remove-filter').addEventListener('click', (event) => {
        event.target.closest('.filter-row').remove();
    });
    
    // Insert before the add button
    document.getElementById('add-filter').before(newRow);
}

// Apply filters
function applyFilters() {
    const filterRows = elements.filterBody.querySelectorAll('.filter-row:not(#filter-template)');
    const filters = [];
    
    filterRows.forEach(row => {
        const column = row.querySelector('.filter-column').value;
        const operator = row.querySelector('.filter-operator').value;
        const value = row.querySelector('.filter-value').value;
        
        if (column && operator) {
            filters.push({
                column,
                operator,
                value
            });
        }
    });
    
    state.filters = filters;
    
    // Request filtered data
    vscode.postMessage({
        command: 'filter',
        filters: filters
    });
    
    // Show loading indicator
    showLoading();
}

// Clear all filters
function clearFilters() {
    // Remove all filter rows except the template
    const filterRows = elements.filterBody.querySelectorAll('.filter-row:not(#filter-template)');
    filterRows.forEach(row => row.remove());
    
    state.filters = [];
    
    // Request unfiltered data
    vscode.postMessage({
        command: 'clearFilters'
    });
    
    // Show loading indicator
    showLoading();
}

// Toggle filters visibility
function toggleFilters() {
    const filterBody = document.getElementById('filter-body');
    const toggleButton = document.getElementById('toggle-filters');
    
    if (filterBody.style.display === 'none') {
        filterBody.style.display = 'block';
        toggleButton.querySelector('.icon').style.transform = 'rotate(180deg)';
    } else {
        filterBody.style.display = 'none';
        toggleButton.querySelector('.icon').style.transform = 'rotate(0deg)';
    }
}

// Handle data update from VSCode
function handleDataUpdate(data) {
    // Update state with new data
    state = {
        ...state,
        ...data
    };
    
    // Update UI
    elements.currentPage.textContent = state.currentPage.toString();
    elements.totalPages.textContent = state.totalPages.toString();
    elements.rowCount.textContent = state.totalRowCount.toString();
    
    // Re-render the table
    renderTable();
    
    // Hide loading indicator
    hideLoading();
}

// Show loading indicator
function showLoading() {
    // Check if loading overlay already exists
    if (document.querySelector('.loading-overlay')) return;
    
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    
    loadingOverlay.appendChild(spinner);
    elements.tableContainer.appendChild(loadingOverlay);
}

// Hide loading indicator
function hideLoading() {
    const loadingOverlay = document.querySelector('.loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.remove();
    }
}

// Show error message
function showError(message) {
    vscode.postMessage({
        command: 'showError',
        message: message
    });
}

// Show success message
function showSuccess(message) {
    vscode.postMessage({
        command: 'showSuccess',
        message: message
    });
}

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Cache the table container element
    elements.tableContainer = document.querySelector('.table-container');
    
    // Initialize UI
    initializeUI();
    
    console.log('Data view initialized with state:', state);
});
