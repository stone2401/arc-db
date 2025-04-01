import * as vscode from 'vscode';
import { ConnectionService } from '../services/connectionService';
import { ConnectionTreeItem } from '../providers/connectionTreeProvider';
import { DatabaseService } from '../services/databaseService';
import { QueryResultsProvider } from '../providers/queryResultsProvider';
import { DatabaseConnection } from '../models/connection';

/**
 * Registers all query-related commands
 */
export function registerQueryCommands(
  connectionService: ConnectionService,
  databaseService: DatabaseService,
  queryResultsProvider: QueryResultsProvider
): vscode.Disposable[] {
  const commands = [
    vscode.commands.registerCommand('arc-db.executeQuery', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
      }
      
      const sql = editor.document.getText(editor.selection.isEmpty 
        ? undefined 
        : editor.selection);
        
      if (!sql.trim()) {
        vscode.window.showErrorMessage('No SQL query to execute.');
        return;
      }
      
      // Get connection to use
      const connections = connectionService.getConnections();
      if (connections.length === 0) {
        vscode.window.showErrorMessage('No database connections available. Add a connection first.');
        return;
      }
      
      // If there's more than one connection, ask the user which one to use
      let selectedConnection: DatabaseConnection;
      
      if (connections.length === 1) {
        selectedConnection = connections[0];
      } else {
        const connectionItems = connections.map(conn => ({
          label: conn.name,
          connection: conn
        }));
        
        const selected = await vscode.window.showQuickPick(connectionItems, {
          placeHolder: 'Select a connection to execute the query'
        });
        
        if (!selected) {
          return;
        }
        
        selectedConnection = selected.connection;
      }
      
      try {
        // Ensure the connection is established
        if (!databaseService.isConnected(selectedConnection.id)) {
          const connected = await databaseService.connect(selectedConnection);
          if (!connected) {
            vscode.window.showErrorMessage(`Failed to connect to ${selectedConnection.name}.`);
            return;
          }
        }
        
        // Execute the query
        const result = await databaseService.executeQuery(selectedConnection.id, sql);
        
        // Show the results
        queryResultsProvider.showResults(
          sql,
          result.rows,
          selectedConnection.name,
          result.executionTime
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Query execution failed: ${error}`);
      }
    }),
    
    vscode.commands.registerCommand('arc-db.newQuery', async (item: ConnectionTreeItem) => {
      if (!item || !item.connection) {
        vscode.window.showErrorMessage('Invalid connection selection.');
        return;
      }
      
      // Create a new untitled SQL document
      const document = await vscode.workspace.openTextDocument({
        language: 'sql',
        content: `-- New Query on ${item.connection.name}\n-- ${new Date().toLocaleString()}\n\n`
      });
      
      // Show the document in the editor
      await vscode.window.showTextDocument(document);
      
      // Add a comment with connection info
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        editor.edit(editBuilder => {
          editBuilder.insert(new vscode.Position(3, 0), 
            `-- Connection: ${item.connection?.name}\n-- Database: ${item.connection?.database || 'N/A'}\n\n`);
        });
      }
      
      vscode.window.showInformationMessage(`New query created for ${item.connection.name}`);
    }),
  ];
  
  return commands;
}
