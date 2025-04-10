import * as vscode from 'vscode';
import { ConnectionTreeItem } from '../../providers/connectionTreeProvider';
import { DatabaseService } from '../../services/databaseService';
import { DataViewProvider } from '../../providers/dataViewProvider';
import { TableFilter } from './interfaces';
import { getCurrentTableView, setCurrentTableView, updateCurrentTableView } from './state';
import { buildTableQuery } from './queryBuilder';

/**
 * Registers commands for viewing and refreshing table data
 */
export function registerViewCommands(
  databaseService: DatabaseService,
  dataViewProvider: DataViewProvider
): vscode.Disposable[] {
  return [
    // View table command
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
        setCurrentTableView({
          connectionId: item.connection.id,
          databaseName: item.databaseName,
          tableName: item.label,
          connectionName: item.connection.name,
          page: 1,
          pageSize: 100
        });

        // Build query with pagination
        const currentView = getCurrentTableView();
        if (!currentView) {
          throw new Error('Failed to set current table view');
        }
        
        const sql = buildTableQuery(currentView);
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

    // Refresh table data command
    vscode.commands.registerCommand('arc-db.refreshTableData', async (page?: number, pageSize?: number, sortColumn?: string, sortDirection?: 'asc' | 'desc', filters?: TableFilter[]) => {
      const currentView = getCurrentTableView();
      if (!currentView) {
        vscode.window.showErrorMessage('No active table view to refresh.');
        return;
      }

      try {
        // Update current view state if parameters provided
        const updates: Partial<typeof currentView> = {};
        if (page !== undefined) updates.page = page;
        if (pageSize !== undefined) updates.pageSize = pageSize;
        if (sortColumn !== undefined) updates.sortColumn = sortColumn;
        if (sortDirection !== undefined) updates.sortDirection = sortDirection;
        if (filters !== undefined) updates.filters = filters;
        
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

        // Execute query with current pagination and sorting
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
        vscode.window.showErrorMessage(`Failed to refresh table data: ${error}`);
      }
    }),

    // Execute custom query command
    vscode.commands.registerCommand('arc-db.executeCustomQuery', async (query: string) => {
      const currentView = getCurrentTableView();
      if (!currentView) {
        vscode.window.showErrorMessage('No active connection to execute query.');
        return;
      }

      try {
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

        // Execute custom query
        const result = await databaseService.executeQuery(currentView.connectionId, query);

        // Update the data view with columns information
        dataViewProvider.updateTableData(
          result.rows,
          currentView.connectionName,
          currentView.databaseName,
          currentView.tableName,
          columns  // 传递列信息
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to execute query: ${error}`);
      }
    })
  ];
}
