import * as vscode from 'vscode';
import { ConnectionService } from '../services/connectionService';
import { ConnectionTreeItem, ConnectionTreeProvider } from '../providers/connectionTreeProvider';
import { ConnectionFormProvider } from '../views/connectionFormProvider';
import { DatabaseService } from '../services/databaseService';
import { globalConnectionTreeProvider } from '../initialization/extensionInitializer';

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
      vscode.window.showInformationMessage('连接已刷新。');
    }),
    
    vscode.commands.registerCommand('arc-db.editConnection', (item: ConnectionTreeItem) => {
      if (!item || !item.connection) {
        vscode.window.showErrorMessage('无效的连接选择。');
        return;
      }
      
      connectionFormProvider.showConnectionForm(item.connection);
    }),
    
    vscode.commands.registerCommand('arc-db.deleteConnection', async (item: ConnectionTreeItem) => {
      if (!item || !item.connection) {
        vscode.window.showErrorMessage('无效的连接选择。');
        return;
      }
      
      const confirmed = await vscode.window.showWarningMessage(
        `确定要删除连接 "${item.connection.name}" 吗？`,
        { modal: true },
        '删除'
      );
      
      if (confirmed === '删除') {
        // Disconnect if connected
        if (databaseService.isConnected(item.connection.id)) {
          await databaseService.disconnect(item.connection.id);
        }
        
        // Delete the connection
        await connectionService.deleteConnection(item.connection.id);
        vscode.window.showInformationMessage(`连接 "${item.connection.name}" 已删除。`);
      }
    }),
    
    // 添加刷新数据库结构的命令
    vscode.commands.registerCommand('arc-db.refreshDatabaseStructure', async (item: ConnectionTreeItem) => {
      if (!item || !item.connection) {
        vscode.window.showErrorMessage('无效的连接选择。');
        return;
      }
      
      // 此时我们已经确认item.connection不为undefined
      const connection = item.connection;
      
      try {
        // 显示加载状态
        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `正在刷新 "${connection.name}" 的数据库结构...`,
          cancellable: false
        }, async (progress) => {
          // 刷新连接的元数据缓存
          await databaseService.refreshMetadata(connection.id);
          
          // 刷新树视图
          if (globalConnectionTreeProvider) {
            globalConnectionTreeProvider.refresh();
          }
          
          return Promise.resolve();
        });
        
        vscode.window.showInformationMessage(`连接 "${connection.name}" 的数据库结构已刷新。`);
      } catch (error) {
        console.error('刷新数据库结构时出错:', error);
        vscode.window.showErrorMessage(`刷新数据库结构失败: ${error}`);
      }
    }),
  ];
  
  return commands;
}
