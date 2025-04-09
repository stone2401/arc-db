import * as vscode from 'vscode';
import { DatabaseService } from '../../services/databaseService';
import { DataViewProvider } from '../../providers/dataViewProvider';
import { getCurrentTableView, updateCurrentTableView } from './state';
import { buildTableQuery } from './queryBuilder';

/**
 * Registers commands for navigating table data (pagination)
 */
export function registerNavigationCommands(
  databaseService: DatabaseService,
  dataViewProvider: DataViewProvider
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('arc-db.navigateTableData', async (page: number, pageSize: number) => {
      const currentView = getCurrentTableView();
      if (!currentView) {
        vscode.window.showErrorMessage('No active table view to navigate.');
        return;
      }

      try {
        // Update page in current view state
        const updates: Partial<typeof currentView> = { page };
        if (pageSize) {
          updates.pageSize = pageSize;
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

        // Execute query with updated pagination
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
        vscode.window.showErrorMessage(`Failed to navigate table data: ${error}`);
      }
    })
  ];
}
