import * as vscode from 'vscode';
import * as fs from 'fs';
import { ConnectionTreeItem } from '../providers/connectionTreeProvider';
import { DatabaseService } from '../services/databaseService';
import { DataViewProvider } from '../providers/dataViewProvider';

// Store current table view state
interface TableViewState {
  connectionId: string;
  databaseName: string;
  tableName: string;
  connectionName: string;
  page: number;
  pageSize: number;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: TableFilter[];
  sortColumns?: { column: string; direction?: 'asc' | 'desc' }[];
}

// 用于导出时的无分页状态
interface ExportTableViewState extends Omit<TableViewState, 'page' | 'pageSize'> {
  page?: number;
  pageSize?: number;
}

// Filter definition
interface TableFilter {
  column: string;
  operator: string;
  value: string;
}

// Current active table view
let currentTableView: TableViewState | undefined;

/**
 * Registers all data-related commands for viewing and exporting table data
 */
export function registerDataCommands(
  databaseService: DatabaseService,
  dataViewProvider: DataViewProvider
): vscode.Disposable[] {
  const commands = [
    vscode.commands.registerCommand('arc-db.viewTable', async (item: ConnectionTreeItem) => {
      if (!item || !item.connection || !item.databaseName) {
        vscode.window.showErrorMessage('Invalid table selection.');
        return;
      }

      try {
        // Ensure the connection is established
        if (!databaseService.isConnected(item.connection.id)) {
          const connected = await databaseService.connect(item.connection);
          if (!connected) {
            vscode.window.showErrorMessage(`Failed to connect to ${item.connection.name}.`);
            return;
          }
        }

        // Get table structure first to get column names
        const structure = await databaseService.getTableStructure(
          item.connection.id,
          item.databaseName,
          item.label
        );

        // Find primary key columns
        const primaryKey = structure.columns
          .filter(col => col.primaryKey)
          .map(col => col.name);

        // Save current table view state
        currentTableView = {
          connectionId: item.connection.id,
          databaseName: item.databaseName,
          tableName: item.label,
          connectionName: item.connection.name,
          page: 1,
          pageSize: 100
        };

        // Build query with pagination
        const sql = buildTableQuery(currentTableView);
        const result = await databaseService.executeQuery(item.connection.id, sql);

        // Show the data in a new editor tab
        dataViewProvider.showTableData(
          item.label,
          structure.columns.map(col => col.name),
          result.rows,
          item.connection.name,
          item.databaseName,
          primaryKey.length > 0 ? primaryKey : null
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to view table data: ${error}`);
      }
    }),

    vscode.commands.registerCommand('arc-db.refreshTableData', async (page?: number, pageSize?: number, sortColumn?: string, sortDirection?: 'asc' | 'desc', filters?: TableFilter[]) => {
      if (!currentTableView) {
        vscode.window.showErrorMessage('No active table view to refresh.');
        return;
      }

      try {
        // Update current view state if parameters provided
        if (page !== undefined) currentTableView.page = page;
        if (pageSize !== undefined) currentTableView.pageSize = pageSize;
        if (sortColumn !== undefined) currentTableView.sortColumn = sortColumn;
        if (sortDirection !== undefined) currentTableView.sortDirection = sortDirection;
        if (filters !== undefined) currentTableView.filters = filters;

        // Ensure the connection is established
        if (!databaseService.isConnected(currentTableView.connectionId)) {
          vscode.window.showErrorMessage('Database connection lost. Please reconnect.');
          return;
        }

        // Execute query with current pagination and sorting
        const sql = buildTableQuery(currentTableView);
        const result = await databaseService.executeQuery(currentTableView.connectionId, sql);

        // Update the data view
        dataViewProvider.updateTableData(result.rows);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to refresh table data: ${error}`);
      }
    }),

    vscode.commands.registerCommand('arc-db.navigateTableData', async (page: number, pageSize: number) => {
      if (!currentTableView) {
        vscode.window.showErrorMessage('No active table view to navigate.');
        return;
      }

      try {
        // Update page in current view state
        currentTableView.page = page;
        if (pageSize) {
          currentTableView.pageSize = pageSize;
        }

        // Ensure the connection is established
        if (!databaseService.isConnected(currentTableView.connectionId)) {
          vscode.window.showErrorMessage('Database connection lost. Please reconnect.');
          return;
        }

        // Execute query with updated pagination
        const sql = buildTableQuery(currentTableView);
        const result = await databaseService.executeQuery(currentTableView.connectionId, sql);

        // Update the data view
        dataViewProvider.updateTableData(result.rows);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to navigate table data: ${error}`);
      }
    }),

    vscode.commands.registerCommand('arc-db.sortTableData', async (columnOrRequest: string | { sortColumns?: Array<{ column: string, direction?: 'asc' | 'desc' }>, sortColumn?: string, sortDirection?: 'asc' | 'desc', filters?: TableFilter[] }, direction?: 'asc' | 'desc', filters?: TableFilter[]) => {
      if (!currentTableView) {
        vscode.window.showErrorMessage('No active table view to sort.');
        return;
      }

      try {
        console.log('接收到排序请求:', JSON.stringify({ columnOrRequest, direction, filters }));

        // 检查请求类型，支持新的对象格式
        if (typeof columnOrRequest === 'object') {
          // 对象形式的请求
          const request = columnOrRequest;
          console.log('处理对象形式的排序请求:', JSON.stringify(request));

          // 处理多列排序
          if (request.sortColumns && request.sortColumns.length > 0) {
            console.log('应用多列排序:', JSON.stringify(request.sortColumns));
            currentTableView.sortColumns = request.sortColumns;
            currentTableView.sortColumn = undefined; // 清除单列排序
          }
          // 处理单列排序
          else if (request.sortColumn) {
            console.log('应用单列排序:', request.sortColumn, request.sortDirection);
            currentTableView.sortColumn = request.sortColumn;
            currentTableView.sortDirection = request.sortDirection || 'asc';
            currentTableView.sortColumns = []; // 清除多列排序
          }

          // 如果请求中包含筛选条件
          if (request.filters) {
            currentTableView.filters = request.filters;
          }
        }
        // 兼容旧的API
        else {
          // 单列排序
          console.log('应用传统单列排序:', columnOrRequest, direction);
          currentTableView.sortColumn = columnOrRequest;
          currentTableView.sortDirection = direction || 'asc';
          currentTableView.sortColumns = []; // 清除多列排序

          // 如果同时提供了筛选条件，一起更新
          if (filters) {
            currentTableView.filters = filters;
          }
        }

        // 显示当前排序状态
        console.log('排序设置已更新, 当前状态:',
          JSON.stringify({
            sortColumn: currentTableView.sortColumn,
            sortDirection: currentTableView.sortDirection,
            sortColumns: currentTableView.sortColumns
          })
        );

        // Ensure the connection is established
        if (!databaseService.isConnected(currentTableView.connectionId)) {
          vscode.window.showErrorMessage('Database connection lost. Please reconnect.');
          return;
        }

        // Execute query with updated sorting
        const sql = buildTableQuery(currentTableView);
        console.log('执行SQL查询:', sql);
        const result = await databaseService.executeQuery(currentTableView.connectionId, sql);

        // Update the data view
        dataViewProvider.updateTableData(result.rows);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to sort table data: ${error}`);
        console.error('排序出错:', error);
      }
    }),

    vscode.commands.registerCommand('arc-db.filterTableData', async (filters: TableFilter[], sortColumn?: string, sortDirection?: 'asc' | 'desc', sortColumns?: Array<{ column: string, direction?: 'asc' | 'desc' }>) => {
      if (!currentTableView) {
        vscode.window.showErrorMessage('No active table view to filter.');
        return;
      }

      try {
        // 更新过滤条件
        currentTableView.filters = filters;

        // 更新排序信息
        if (sortColumns && sortColumns.length > 0) {
          // 多列排序优先
          currentTableView.sortColumns = sortColumns;
          currentTableView.sortColumn = undefined; // 清除单列排序
        } else if (sortColumn) {
          // 单列排序
          currentTableView.sortColumn = sortColumn;
          currentTableView.sortDirection = sortDirection || 'asc';
          currentTableView.sortColumns = []; // 清除多列排序
        }

        // Reset to first page when applying filters
        currentTableView.page = 1;

        // Ensure the connection is established
        if (!databaseService.isConnected(currentTableView.connectionId)) {
          vscode.window.showErrorMessage('Database connection lost. Please reconnect.');
          return;
        }

        // Execute query with updated filters
        const sql = buildTableQuery(currentTableView);
        const result = await databaseService.executeQuery(currentTableView.connectionId, sql);

        // Update the data view
        dataViewProvider.updateTableData(result.rows);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to filter table data: ${error}`);
      }
    }),

    vscode.commands.registerCommand('arc-db.clearFilters', async () => {
      if (!currentTableView) {
        vscode.window.showErrorMessage('No active table view to clear filters.');
        return;
      }

      try {
        // Clear filters in current view state
        currentTableView.filters = undefined;
        // Reset to first page when clearing filters
        currentTableView.page = 1;

        // Ensure the connection is established
        if (!databaseService.isConnected(currentTableView.connectionId)) {
          vscode.window.showErrorMessage('Database connection lost. Please reconnect.');
          return;
        }

        // Execute query without filters
        const sql = buildTableQuery(currentTableView);
        const result = await databaseService.executeQuery(currentTableView.connectionId, sql);

        // Update the data view
        dataViewProvider.updateTableData(result.rows);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to clear filters: ${error}`);
      }
    }),

    vscode.commands.registerCommand('arc-db.executeCustomQuery', async (query: string) => {
      if (!currentTableView) {
        vscode.window.showErrorMessage('No active table view to execute custom query.');
        return;
      }

      try {
        // Ensure the connection is established
        if (!databaseService.isConnected(currentTableView.connectionId)) {
          vscode.window.showErrorMessage('Database connection lost. Please reconnect.');
          return;
        }

        // Execute the custom query
        const result = await databaseService.executeQuery(currentTableView.connectionId, query);

        // Update the data view with the query results
        dataViewProvider.updateTableData(result.rows);

        vscode.window.showInformationMessage(`Query executed successfully. ${result.rows.length} rows returned.`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to execute query: ${error}`);
      }
    }),

    vscode.commands.registerCommand('arc-db.exportData', async (format: string, selectedOnly: boolean) => {
      if (!currentTableView) {
        vscode.window.showErrorMessage('No active table to export.');
        return;
      }

      try {
        // Ensure the connection is established
        if (!databaseService.isConnected(currentTableView.connectionId)) {
          vscode.window.showErrorMessage('Database connection lost. Please reconnect.');
          return;
        }

        // Ask for file path
        const defaultPath = `${currentTableView.tableName}_export.${format.toLowerCase() === 'sql' ? 'sql' : format.toLowerCase()}`;
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(defaultPath),
          filters: {
            'All Files': ['*']
          }
        });

        if (!uri) {
          return;
        }

        // Get table data - use current query with filters but without pagination
        let sql;
        if (selectedOnly && currentTableView) {
          // Use current query with all filters but without pagination
          const exportState: ExportTableViewState = {
            connectionId: currentTableView.connectionId,
            databaseName: currentTableView.databaseName,
            tableName: currentTableView.tableName,
            connectionName: currentTableView.connectionName,
            sortColumn: currentTableView.sortColumn,
            sortDirection: currentTableView.sortDirection,
            filters: currentTableView.filters
          };
          sql = buildExportQuery(exportState);
        } else if (currentTableView) {
          // Get all data without filters
          sql = `SELECT * FROM ${currentTableView.tableName}`;
        } else {
          throw new Error('No active table view');
        }

        const result = await databaseService.executeQuery(currentTableView.connectionId, sql);

        // Get the table structure for column information
        const structure = await databaseService.getTableStructure(
          currentTableView.connectionId,
          currentTableView.databaseName,
          currentTableView.tableName
        );

        // Export the data based on the selected format
        if (format.toLowerCase() === 'csv') {
          // Create CSV content
          const header = structure.columns.map(col => col.name).join(',');
          const rows = result.rows.map(row =>
            structure.columns.map(col => {
              const value = row[col.name];
              if (value === null) return '';
              if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
              return value;
            }).join(',')
          );
          const csvContent = [header, ...rows].join('\n');

          // Write to file
          fs.writeFileSync(uri.fsPath, csvContent);
        } else if (format.toLowerCase() === 'json') {
          // Write JSON data
          fs.writeFileSync(uri.fsPath, JSON.stringify(result.rows, null, 2));
        } else if (format.toLowerCase() === 'sql') {
          // Create SQL insert statements
          const insertStatements = result.rows.map(row => {
            const columns = structure.columns.map(col => col.name).join(', ');
            const values = structure.columns.map(col => {
              const value = row[col.name];
              if (value === null) {
                return 'NULL';
              } else if (typeof value === 'string') {
                return `'${value.replace(/'/g, "''")}'`;
              } else if (typeof value === 'object' && value instanceof Date) {
                return `'${value.toISOString()}'`;
              } else {
                return value;
              }
            }).join(', ');

            return `INSERT INTO ${currentTableView?.tableName} (${columns}) VALUES (${values});`;
          });

          // Write to file
          fs.writeFileSync(uri.fsPath, insertStatements.join('\n'));
        }

        vscode.window.showInformationMessage(
          `Table "${currentTableView.tableName}" exported as ${format} to ${uri.fsPath}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to export data: ${error}`);
      }
    })
  ];

  return commands;
}

/**
 * Builds a SQL query for table data with pagination and sorting
 */
function buildTableQuery(state: TableViewState): string {
  let sql = `SELECT * FROM ${state.tableName}`;

  // Add WHERE clause for filters
  if (state.filters && state.filters.length > 0) {
    const whereConditions = state.filters.map(filter => {
      // Handle special operators
      if (filter.operator === 'IS NULL') {
        return `${filter.column} IS NULL`;
      } else if (filter.operator === 'IS NOT NULL') {
        return `${filter.column} IS NOT NULL`;
      } else if (filter.operator === 'LIKE') {
        return `${filter.column} LIKE '%${filter.value}%'`;
      } else if (filter.operator === 'IN') {
        // 将逗号分隔的值转换为IN子句
        const values = filter.value.split(',')
          .map(val => val.trim())
          .filter(val => val)
          .map(val => `'${val.replace(/'/g, "''")}'`)
          .join(', ');
        return `${filter.column} IN (${values})`;
      } else if (filter.operator === 'NOT IN') {
        // 将逗号分隔的值转换为NOT IN子句
        const values = filter.value.split(',')
          .map(val => val.trim())
          .filter(val => val)
          .map(val => `'${val.replace(/'/g, "''")}'`)
          .join(', ');
        return `${filter.column} NOT IN (${values})`;
      } else {
        return `${filter.column} ${filter.operator} '${filter.value}'`;
      }
    });

    sql += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  // Add sorting if specified
  if (state.sortColumn) {
    sql += ` ORDER BY ${state.sortColumn} ${state.sortDirection || 'ASC'}`;
  } else if (state.sortColumns && state.sortColumns.length > 0) {
    // 支持多字段排序
    const sortClauses = state.sortColumns.map(sort =>
      `${sort.column} ${sort.direction || 'ASC'}`
    );
    sql += ` ORDER BY ${sortClauses.join(', ')}`;
  }

  // Add pagination
  const offset = (state.page - 1) * state.pageSize;
  sql += ` LIMIT ${state.pageSize} OFFSET ${offset}`;

  return sql;
}

/**
 * Builds a SQL query for exporting table data (without pagination)
 */
function buildExportQuery(state: ExportTableViewState): string {
  let sql = `SELECT * FROM ${state.tableName}`;

  // Add WHERE clause for filters
  if (state.filters && state.filters.length > 0) {
    const whereConditions = state.filters.map(filter => {
      // Handle special operators
      if (filter.operator === 'IS NULL') {
        return `${filter.column} IS NULL`;
      } else if (filter.operator === 'IS NOT NULL') {
        return `${filter.column} IS NOT NULL`;
      } else if (filter.operator === 'LIKE') {
        return `${filter.column} LIKE '%${filter.value}%'`;
      } else if (filter.operator === 'IN') {
        // 将逗号分隔的值转换为IN子句
        const values = filter.value.split(',')
          .map(val => val.trim())
          .filter(val => val)
          .map(val => `'${val.replace(/'/g, "''")}'`)
          .join(', ');
        return `${filter.column} IN (${values})`;
      } else if (filter.operator === 'NOT IN') {
        // 将逗号分隔的值转换为NOT IN子句
        const values = filter.value.split(',')
          .map(val => val.trim())
          .filter(val => val)
          .map(val => `'${val.replace(/'/g, "''")}'`)
          .join(', ');
        return `${filter.column} NOT IN (${values})`;
      } else {
        return `${filter.column} ${filter.operator} '${filter.value}'`;
      }
    });

    sql += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  // Add sorting if specified
  if (state.sortColumn) {
    sql += ` ORDER BY ${state.sortColumn} ${state.sortDirection || 'ASC'}`;
  } else if (state.sortColumns && state.sortColumns.length > 0) {
    // 支持多字段排序
    const sortClauses = state.sortColumns.map(sort =>
      `${sort.column} ${sort.direction || 'ASC'}`
    );
    sql += ` ORDER BY ${sortClauses.join(', ')}`;
  }

  return sql;
}
