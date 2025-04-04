import * as vscode from 'vscode';
import { ConnectionService } from '../services/connectionService';
import { ConnectionTreeProvider } from '../providers/connectionTreeProvider';
import { DataViewProvider } from '../providers/dataViewProvider';
import { QueryResultsProvider } from '../providers/queryResultsProvider';
import { ConnectionFormProvider } from '../views/connectionFormProvider';
import { DatabaseService } from '../services/databaseService';
import { DatabaseType } from '../models/connection';

// 导出全局变量，以便在其他地方访问
export let globalConnectionTreeProvider: ConnectionTreeProvider;

/**
 * Initializes all extension components
 */
export function initializeExtensionComponents(context: vscode.ExtensionContext) {
  // Initialize services
  const connectionService = ConnectionService.getInstance(context);
  const databaseService = DatabaseService.getInstance();
  
  // Initialize providers
  const connectionTreeProvider = new ConnectionTreeProvider();
  globalConnectionTreeProvider = connectionTreeProvider; // 保存为全局变量
  
  const dataViewProvider = DataViewProvider.getInstance(context);
  const queryResultsProvider = QueryResultsProvider.getInstance();
  const connectionFormProvider = ConnectionFormProvider.getInstance(context);
  
  // Initialize tree view
  const treeView = vscode.window.createTreeView('arcDbConnectionsView', {
    treeDataProvider: connectionTreeProvider,
    showCollapseAll: true
  });
  
  // Update tree view when connections change
  connectionService.onDidChangeConnections(() => {
    connectionTreeProvider.setConnections(connectionService.getConnections());
  });
  
  // Add tree view to subscriptions
  context.subscriptions.push(treeView);
  
  // Load connections
  connectionService.loadConnections().then(() => {
    connectionTreeProvider.setConnections(connectionService.getConnections());
    
    // If no connections exist, add a sample connection
    if (connectionService.getConnections().length === 0) {
      // For demo purposes, let's add a sample connection
      connectionService.addConnection({
        name: 'Sample SQLite Connection',
        type: DatabaseType.SQLite,
        database: 'sample.db'
      });
    }
  });
  
  return {
    connectionService,
    databaseService,
    connectionTreeProvider,
    dataViewProvider,
    queryResultsProvider,
    connectionFormProvider,
    treeView
  };
}
