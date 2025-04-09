import * as vscode from 'vscode';
import * as fs from 'fs';
import { DatabaseService } from '../../services/databaseService';
import { ExportTableViewState } from './interfaces';
import { getCurrentTableView } from './state';
import { buildExportQuery } from './queryBuilder';

/**
 * Registers commands for exporting table data
 */
export function registerExportCommands(
  databaseService: DatabaseService
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('arc-db.exportData', async (format: string, selectedOnly: boolean) => {
      const currentView = getCurrentTableView();
      if (!currentView) {
        vscode.window.showErrorMessage('No active table to export.');
        return;
      }

      try {
        // Ensure the connection is established
        if (!databaseService.isConnected(currentView.connectionId)) {
          vscode.window.showErrorMessage('Database connection lost. Please reconnect.');
          return;
        }

        // Ask for file path
        const defaultPath = `${currentView.tableName}_export.${format.toLowerCase() === 'sql' ? 'sql' : format.toLowerCase()}`;
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
        if (selectedOnly && currentView) {
          // Use current query with all filters but without pagination
          const exportState: ExportTableViewState = {
            connectionId: currentView.connectionId,
            databaseName: currentView.databaseName,
            tableName: currentView.tableName,
            connectionName: currentView.connectionName,
            sortColumn: currentView.sortColumn,
            sortDirection: currentView.sortDirection,
            filters: currentView.filters,
            sortColumns: currentView.sortColumns
          };
          sql = buildExportQuery(exportState);
        } else if (currentView) {
          // Get all data without filters
          sql = `SELECT * FROM ${currentView.tableName}`;
        } else {
          throw new Error('No active table view');
        }

        const result = await databaseService.executeQuery(currentView.connectionId, sql);

        // Get the table structure for column information
        const structure = await databaseService.getTableStructure(
          currentView.connectionId,
          currentView.databaseName,
          currentView.tableName
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

            return `INSERT INTO ${currentView?.tableName} (${columns}) VALUES (${values});`;
          });

          // Write to file
          fs.writeFileSync(uri.fsPath, insertStatements.join('\n'));
        }

        vscode.window.showInformationMessage(
          `Table "${currentView.tableName}" exported as ${format} to ${uri.fsPath}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to export data: ${error}`);
      }
    })
  ];
}
