import * as vscode from 'vscode';
import { ConnectionService } from '../services/connectionService';
import { ConnectionTreeItem } from '../providers/connectionTreeProvider';
import { ConnectionFormProvider } from '../views/connectionFormProvider';
import { DatabaseService } from '../services/databaseService';

/**
 * Registers all connection-related commands
 */
export function registerConnectionCommands(
  context: vscode.ExtensionContext,
  connectionService: ConnectionService,
  connectionFormProvider: ConnectionFormProvider,
  databaseService: DatabaseService
): vscode.Disposable[] {
  const commands = [
    vscode.commands.registerCommand('arc-db.addConnection', () => {
      connectionFormProvider.showConnectionForm();
    }),
    
    vscode.commands.registerCommand('arc-db.refreshConnections', async () => {
      await connectionService.loadConnections();
      vscode.window.showInformationMessage('Connections refreshed.');
    }),
    
    vscode.commands.registerCommand('arc-db.editConnection', (item: ConnectionTreeItem) => {
      if (!item || !item.connection) {
        vscode.window.showErrorMessage('Invalid connection selection.');
        return;
      }
      
      connectionFormProvider.showConnectionForm(item.connection);
    }),
    
    vscode.commands.registerCommand('arc-db.deleteConnection', async (item: ConnectionTreeItem) => {
      if (!item || !item.connection) {
        vscode.window.showErrorMessage('Invalid connection selection.');
        return;
      }
      
      const confirmed = await vscode.window.showWarningMessage(
        `Are you sure you want to delete the connection "${item.connection.name}"?`,
        { modal: true },
        'Delete'
      );
      
      if (confirmed === 'Delete') {
        // Disconnect if connected
        if (databaseService.isConnected(item.connection.id)) {
          await databaseService.disconnect(item.connection.id);
        }
        
        // Delete the connection
        await connectionService.deleteConnection(item.connection.id);
        vscode.window.showInformationMessage(`Connection "${item.connection.name}" deleted.`);
      }
    }),
  ];
  
  return commands;
}
