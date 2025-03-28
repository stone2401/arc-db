import * as vscode from 'vscode';
import { DatabaseConnection, DatabaseType } from '../models/connection';
import { DatabaseService } from '../services/databaseService';

export class ConnectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly connection?: DatabaseConnection,
    public readonly type?: 'connection' | 'database' | 'table' | 'view' | 'procedure',
    public readonly contextValue?: string,
    public readonly databaseName?: string,
    public readonly parent?: ConnectionTreeItem
  ) {
    super(label, collapsibleState);
    this.tooltip = this.label;

    // Set icon based on type
    if (type === 'connection') {
      this.iconPath = new vscode.ThemeIcon('database');
      this.contextValue = 'connection';
    } else if (type === 'database') {
      this.iconPath = new vscode.ThemeIcon('database');
      this.contextValue = 'database';
    } else if (type === 'table') {
      this.iconPath = new vscode.ThemeIcon('list-tree');
      this.contextValue = 'table';
    } else if (type === 'view') {
      this.iconPath = new vscode.ThemeIcon('preview');
      this.contextValue = 'view';
    } else if (type === 'procedure') {
      this.iconPath = new vscode.ThemeIcon('symbol-method');
      this.contextValue = 'procedure';
    }
  }
}

export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ConnectionTreeItem | undefined | null | void> = new vscode.EventEmitter<ConnectionTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ConnectionTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private connections: DatabaseConnection[] = [];
  private databaseService: DatabaseService;

  constructor() {
    this.databaseService = DatabaseService.getInstance();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setConnections(connections: DatabaseConnection[]): void {
    this.connections = connections;
    this.refresh();
  }

  getTreeItem(element: ConnectionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ConnectionTreeItem): Promise<ConnectionTreeItem[]> {
    if (!element) {
      // Root level - show connections
      return this.connections.map(conn => new ConnectionTreeItem(conn.name, vscode.TreeItemCollapsibleState.Collapsed, conn, 'connection'));
    }

    // If connection is not established, try to connect
    if (element.type === 'connection' && element.connection) {
      if (!this.databaseService.isConnected(element.connection.id)) {
        try {
          const connected = await this.databaseService.connect(element.connection);
          if (!connected) {
            return [
              new ConnectionTreeItem('Failed to connect. Click to retry.', vscode.TreeItemCollapsibleState.None, element.connection, undefined, 'connectionError')
            ];
          }
        } catch (error) {
          return [
            new ConnectionTreeItem(`Error: ${error}`, vscode.TreeItemCollapsibleState.None, element.connection, undefined, 'connectionError')
          ];
        }
      }

      try {
        // Get metadata for the connection
        const metadata = await this.databaseService.getDatabaseMetadata(element.connection.id);

        // Return databases
        return metadata.databases.map((db: string) => new ConnectionTreeItem(db, vscode.TreeItemCollapsibleState.Collapsed, element.connection, 'database', 'database', db, element));
      } catch (error) {
        return [
          new ConnectionTreeItem(`Error fetching databases: ${error}`, vscode.TreeItemCollapsibleState.None, element.connection, undefined, 'error')
        ];
      }
    } else if (element.type === 'database' && element.connection && element.databaseName) {
      // Database level - show tables, views, procedures categories
      return [
        new ConnectionTreeItem('Tables', vscode.TreeItemCollapsibleState.Collapsed, element.connection, 'table', 'tableFolder', element.databaseName, element),
        new ConnectionTreeItem('Views', vscode.TreeItemCollapsibleState.Collapsed, element.connection, 'view', 'viewFolder', element.databaseName, element),
        new ConnectionTreeItem('Stored Procedures', vscode.TreeItemCollapsibleState.Collapsed, element.connection, 'procedure', 'procedureFolder', element.databaseName, element)
      ];
    } else if (element.contextValue === 'tableFolder' && element.connection && element.databaseName) {
      // Tables category - show tables
      try {
        const metadata = await this.databaseService.getDatabaseMetadata(element.connection.id);
        const tables = metadata.tables[element.databaseName] || [];

        return tables.map((table: string) => new ConnectionTreeItem(table, vscode.TreeItemCollapsibleState.None, element.connection, 'table', 'table', element.databaseName, element));
      } catch (error) {
        return [
          new ConnectionTreeItem(`Error fetching tables: ${error}`, vscode.TreeItemCollapsibleState.None, element.connection, undefined, 'error')
        ];
      }
    } else if (element.contextValue === 'viewFolder' && element.connection && element.databaseName) {
      // Views category - show views
      try {
        const metadata = await this.databaseService.getDatabaseMetadata(element.connection.id);
        const views = metadata.views[element.databaseName] || [];

        return views.map((view: string) => new ConnectionTreeItem(view, vscode.TreeItemCollapsibleState.None, element.connection, 'view', 'view', element.databaseName, element));
      } catch (error) {
        return [
          new ConnectionTreeItem(`Error fetching views: ${error}`, vscode.TreeItemCollapsibleState.None, element.connection, undefined, 'error')
        ];
      }
    } else if (element.contextValue === 'procedureFolder' && element.connection && element.databaseName) {
      // Procedures category - show procedures
      try {
        const metadata = await this.databaseService.getDatabaseMetadata(element.connection.id);
        const procedures = metadata.procedures[element.databaseName] || [];

        return procedures.map((proc: string) => new ConnectionTreeItem(proc, vscode.TreeItemCollapsibleState.None, element.connection, 'procedure', 'procedure', element.databaseName, element));
      } catch (error) {
        return [
          new ConnectionTreeItem(`Error fetching procedures: ${error}`, vscode.TreeItemCollapsibleState.None, element.connection, undefined, 'error')
        ];
      }
    }

    return [];
  }
}
