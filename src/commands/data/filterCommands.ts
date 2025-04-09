import * as vscode from 'vscode';
import { DatabaseService } from '../../services/databaseService';
import { DataViewProvider } from '../../providers/dataViewProvider';
import { TableFilter } from './interfaces';
import { getCurrentTableView, updateCurrentTableView } from './state';
import { buildTableQuery } from './queryBuilder';

/**
 * Registers commands for filtering and sorting table data
 */
export function registerFilterCommands(
  databaseService: DatabaseService,
  dataViewProvider: DataViewProvider
): vscode.Disposable[] {
  return [
    // Sort table data command
    vscode.commands.registerCommand('arc-db.sortTableData', async (columnOrRequest: string | { sortColumns?: Array<{ column: string, direction?: 'asc' | 'desc' }>, sortColumn?: string, sortDirection?: 'asc' | 'desc', filters?: TableFilter[] }, direction?: 'asc' | 'desc', filters?: TableFilter[]) => {
      const currentView = getCurrentTableView();
      if (!currentView) {
        vscode.window.showErrorMessage('No active table view to sort.');
        return;
      }

      try {
        const updates: Partial<typeof currentView> = {};

        // 检查请求类型，支持新的对象格式
        if (typeof columnOrRequest === 'object') {
          // 对象形式的请求
          const request = columnOrRequest;

          // 处理多列排序
          if (request.sortColumns && request.sortColumns.length > 0) {
            updates.sortColumns = request.sortColumns;
            updates.sortColumn = undefined; // 清除单列排序
          }
          // 处理单列排序
          else if (request.sortColumn) {
            updates.sortColumn = request.sortColumn;
            updates.sortDirection = request.sortDirection || 'asc';
            updates.sortColumns = []; // 清除多列排序
          }

          // 如果请求中包含筛选条件
          if (request.filters) {
            updates.filters = request.filters;
          }
        }
        // 兼容旧的API
        else {
          // 单列排序
          updates.sortColumn = columnOrRequest;
          updates.sortDirection = direction || 'asc';
          updates.sortColumns = []; // 清除多列排序

          // 如果同时提供了筛选条件，一起更新
          if (filters) {
            updates.filters = filters;
          }
        }

        updateCurrentTableView(updates);

        // Ensure the connection is established
        if (!databaseService.isConnected(currentView.connectionId)) {
          vscode.window.showErrorMessage('Database connection lost. Please reconnect.');
          return;
        }

        // 获取表结构以获取列信息
        const structure = await databaseService.getTableStructure(
          currentView.connectionId,
          currentView.databaseName,
          currentView.tableName
        );

        // 从结构中提取列名
        const columns = structure.columns.map(col => col.name);

        // Execute query with updated sorting
        const sql = buildTableQuery(currentView);
        const result = await databaseService.executeQuery(currentView.connectionId, sql);

        // Update the data view with columns information
        dataViewProvider.updateTableData(
          result.rows,
          currentView.connectionName,
          currentView.databaseName,
          currentView.tableName,
          columns  // 传递列信息
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to sort table data: ${error}`);
      }
    }),

    // Filter table data command
    vscode.commands.registerCommand('arc-db.filterTableData', async (filters: TableFilter[], sortColumn?: string, sortDirection?: 'asc' | 'desc', sortColumns?: Array<{ column: string, direction?: 'asc' | 'desc' }>) => {
      const currentView = getCurrentTableView();
      if (!currentView) {
        vscode.window.showErrorMessage('No active table view to filter.');
        return;
      }

      try {
        const updates: Partial<typeof currentView> = {
          // 更新过滤条件
          filters,
          // 应用筛选后重置为第一页
          page: 1
        };

        // 更新排序信息
        if (sortColumns && sortColumns.length > 0) {
          // 多列排序优先
          updates.sortColumns = sortColumns;
          updates.sortColumn = undefined; // 清除单列排序
        } else if (sortColumn) {
          // 单列排序
          updates.sortColumn = sortColumn;
          updates.sortDirection = sortDirection || 'asc';
          updates.sortColumns = []; // 清除多列排序
        }

        updateCurrentTableView(updates);

        // Ensure the connection is established
        if (!databaseService.isConnected(currentView.connectionId)) {
          vscode.window.showErrorMessage('Database connection lost. Please reconnect.');
          return;
        }

        // 获取表结构以获取列信息
        const structure = await databaseService.getTableStructure(
          currentView.connectionId,
          currentView.databaseName,
          currentView.tableName
        );

        // 从结构中提取列名
        const columns = structure.columns.map(col => col.name);

        // Execute query with updated filters
        const sql = buildTableQuery(currentView);
        const result = await databaseService.executeQuery(currentView.connectionId, sql);

        // Update the data view with columns information
        dataViewProvider.updateTableData(
          result.rows,
          currentView.connectionName,
          currentView.databaseName,
          currentView.tableName,
          columns  // 传递列信息
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to filter table data: ${error}`);
      }
    }),

    // Clear filters command
    vscode.commands.registerCommand('arc-db.clearFilters', async () => {
      const currentView = getCurrentTableView();
      if (!currentView) {
        vscode.window.showErrorMessage('No active table view to clear filters.');
        return;
      }

      try {
        // Clear filters and reset to first page
        updateCurrentTableView({
          filters: undefined,
          page: 1
        });

        // Ensure the connection is established
        if (!databaseService.isConnected(currentView.connectionId)) {
          vscode.window.showErrorMessage('Database connection lost. Please reconnect.');
          return;
        }

        // 获取表结构以获取列信息
        const structure = await databaseService.getTableStructure(
          currentView.connectionId,
          currentView.databaseName,
          currentView.tableName
        );

        // 从结构中提取列名
        const columns = structure.columns.map(col => col.name);

        // Execute query with no filters
        const sql = buildTableQuery(currentView);
        const result = await databaseService.executeQuery(currentView.connectionId, sql);

        // Update the data view with columns information
        dataViewProvider.updateTableData(
          result.rows,
          currentView.connectionName,
          currentView.databaseName,
          currentView.tableName,
          columns  // 传递列信息
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to clear filters: ${error}`);
      }
    })
  ];
}
