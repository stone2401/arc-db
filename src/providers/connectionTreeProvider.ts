import * as vscode from 'vscode';
import { DatabaseConnection } from '../models/connection';
import { DatabaseService } from '../services/databaseService';

// Node types for better type safety
export type TreeItemType = 'connection' | 'database' | 'tableFolder' | 'viewFolder' | 'procedureFolder' | 'table' | 'view' | 'procedure';

export class ConnectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly connection?: DatabaseConnection,
    public readonly type?: TreeItemType,
    public readonly contextValue?: string,
    public readonly databaseName?: string,
    public readonly parent?: ConnectionTreeItem,
    public readonly numberOfChildren?: number
  ) {
    super(label, collapsibleState);
    this.tooltip = this.label;
    this.contextValue = contextValue || type;

    // Set icon based on type
    this.setIconAndDescription();
  }

  private setIconAndDescription(): void {
    switch (this.type) {
      case 'connection':
        this.iconPath = new vscode.ThemeIcon('database');
        break;
      case 'database':
        this.iconPath = new vscode.ThemeIcon('database');
        break;
      case 'tableFolder':
        this.iconPath = new vscode.ThemeIcon('folder-library');
        this.description = this.numberOfChildren !== undefined ? `(${this.numberOfChildren})` : '';
        break;
      case 'viewFolder':
        this.iconPath = new vscode.ThemeIcon('folder-opened');
        this.description = this.numberOfChildren !== undefined ? `(${this.numberOfChildren})` : '';
        break;
      case 'procedureFolder':
        this.iconPath = new vscode.ThemeIcon('folder-active');
        this.description = this.numberOfChildren !== undefined ? `(${this.numberOfChildren})` : '';
        break;
      case 'table':
        this.iconPath = new vscode.ThemeIcon('list-tree');
        break;
      case 'view':
        this.iconPath = new vscode.ThemeIcon('preview');
        break;
      case 'procedure':
        this.iconPath = new vscode.ThemeIcon('symbol-method');
        break;
      default:
        this.iconPath = new vscode.ThemeIcon('question');
    }
  }
}

// Node handler interface for processing different node types
interface NodeHandler {
  canHandle(element: ConnectionTreeItem | undefined): boolean;
  getChildren(element: ConnectionTreeItem | undefined): Promise<ConnectionTreeItem[]>;
}

export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ConnectionTreeItem | undefined | null | void> = new vscode.EventEmitter<ConnectionTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ConnectionTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private connections: DatabaseConnection[] = [];
  private databaseService: DatabaseService;
  private nodeHandlers: NodeHandler[] = [];

  constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.initializeNodeHandlers();
  }

  private initializeNodeHandlers(): void {
    // Register handlers in order of priority
    this.nodeHandlers = [
      new RootNodeHandler(this.connections),
      new ConnectionNodeHandler(this.databaseService),
      new DatabaseNodeHandler(this.databaseService),
      new FolderNodeHandler(this.databaseService),
      // Default handler is last
      new DefaultNodeHandler()
    ];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setConnections(connections: DatabaseConnection[]): void {
    this.connections = connections;
    // Update the connections in the root handler
    const rootHandler = this.nodeHandlers.find(h => h instanceof RootNodeHandler) as RootNodeHandler;
    if (rootHandler) {
      rootHandler.updateConnections(connections);
    }
    this.refresh();
  }

  getTreeItem(element: ConnectionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ConnectionTreeItem): Promise<ConnectionTreeItem[]> {
    // Find the first handler that can handle this element
    for (const handler of this.nodeHandlers) {
      if (handler.canHandle(element)) {
        try {
          return await handler.getChildren(element);
        } catch (error) {
          return this.handleError(error, element);
        }
      }
    }
    return [];
  }

  private handleError(error: any, element?: ConnectionTreeItem): ConnectionTreeItem[] {
    const errorMessage = `Error: ${error}`;
    const contextValue = element?.type === 'connection' ? 'connectionError' : 'error';

    return [
      new ConnectionTreeItem(
        errorMessage,
        vscode.TreeItemCollapsibleState.None,
        element?.connection,
        undefined,
        contextValue
      )
    ];
  }
}

// Handles the root level (no element)
class RootNodeHandler implements NodeHandler {
  private connections: DatabaseConnection[];

  constructor(connections: DatabaseConnection[]) {
    this.connections = connections;
  }

  updateConnections(connections: DatabaseConnection[]): void {
    this.connections = connections;
  }

  canHandle(element: ConnectionTreeItem | undefined): boolean {
    return element === undefined;
  }

  async getChildren(): Promise<ConnectionTreeItem[]> {
    return this.connections.map(conn =>
      new ConnectionTreeItem(
        conn.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        conn,
        'connection'
      )
    );
  }
}

// Handles connection nodes
class ConnectionNodeHandler implements NodeHandler {
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  canHandle(element: ConnectionTreeItem | undefined): boolean {
    return element?.type === 'connection';
  }

  async getChildren(element: ConnectionTreeItem): Promise<ConnectionTreeItem[]> {
    if (!element.connection) {
      return [];
    }

    // Ensure connection is established
    if (!this.databaseService.isConnected(element.connection.id)) {
      try {
        const connected = await this.databaseService.connect(element.connection);
        if (!connected) {
          return [
            new ConnectionTreeItem(
              'Failed to connect. Click to retry.',
              vscode.TreeItemCollapsibleState.None,
              element.connection,
              undefined,
              'connectionError'
            )
          ];
        }
      } catch (error) {
        throw error; // Let the main provider handle the error
      }
    }

    // Get databases
    const metadata = await this.databaseService.getDatabaseMetadata(element.connection.id);
    return metadata.databases.map((db: string) =>
      new ConnectionTreeItem(
        db,
        vscode.TreeItemCollapsibleState.Collapsed,
        element.connection,
        'database',
        'database',
        db,
        element
      )
    );
  }
}

// Handles database nodes
class DatabaseNodeHandler implements NodeHandler {
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  canHandle(element: ConnectionTreeItem | undefined): boolean {
    return element?.type === 'database';
  }

  async getChildren(element: ConnectionTreeItem): Promise<ConnectionTreeItem[]> {
    if (!element.connection || !element.databaseName) {
      return [];
    }

    const metadata = await this.databaseService.getDatabaseMetadata(element.connection.id);
    const treeItems: ConnectionTreeItem[] = [];

    // Add tables folder if there are tables
    if (metadata.tables[element.databaseName]?.length > 0) {
      treeItems.push(
        new ConnectionTreeItem(
          'Tables',
          vscode.TreeItemCollapsibleState.Collapsed,
          element.connection,
          'tableFolder',
          'tableFolder',
          element.databaseName,
          element,
          metadata.tables[element.databaseName].length
        )
      );
    }

    // Add views folder if there are views
    if (metadata.views[element.databaseName]?.length > 0) {
      treeItems.push(
        new ConnectionTreeItem(
          'Views',
          vscode.TreeItemCollapsibleState.Collapsed,
          element.connection,
          'viewFolder',
          'viewFolder',
          element.databaseName,
          element,
          metadata.views[element.databaseName].length
        )
      );
    }

    // Add procedures folder if there are procedures
    if (metadata.procedures[element.databaseName]?.length > 0) {
      treeItems.push(
        new ConnectionTreeItem(
          'Stored Procedures',
          vscode.TreeItemCollapsibleState.Collapsed,
          element.connection,
          'procedureFolder',
          'procedureFolder',
          element.databaseName,
          element,
          metadata.procedures[element.databaseName].length
        )
      );
    }

    return treeItems;
  }
}

// Handles folder nodes (tables, views, procedures)
class FolderNodeHandler implements NodeHandler {
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  canHandle(element: ConnectionTreeItem | undefined): boolean {
    return element?.contextValue === 'tableFolder' ||
      element?.contextValue === 'viewFolder' ||
      element?.contextValue === 'procedureFolder';
  }

  async getChildren(element: ConnectionTreeItem): Promise<ConnectionTreeItem[]> {
    if (!element.connection || !element.databaseName) {
      return [];
    }

    const metadata = await this.databaseService.getDatabaseMetadata(element.connection.id);

    switch (element.contextValue) {
      case 'tableFolder':
        return this.getTableItems(metadata.tables[element.databaseName] || [], element);
      case 'viewFolder':
        return this.getViewItems(metadata.views[element.databaseName] || [], element);
      case 'procedureFolder':
        return this.getProcedureItems(metadata.procedures[element.databaseName] || [], element);
      default:
        return [];
    }
  }

  private getTableItems(tables: string[], parent: ConnectionTreeItem): ConnectionTreeItem[] {
    return tables.map(table =>
      new ConnectionTreeItem(
        table,
        vscode.TreeItemCollapsibleState.None,
        parent.connection,
        'table',
        'table',
        parent.databaseName,
        parent
      )
    );
  }

  private getViewItems(views: string[], parent: ConnectionTreeItem): ConnectionTreeItem[] {
    return views.map(view =>
      new ConnectionTreeItem(
        view,
        vscode.TreeItemCollapsibleState.None,
        parent.connection,
        'view',
        'view',
        parent.databaseName,
        parent
      )
    );
  }

  private getProcedureItems(procedures: string[], parent: ConnectionTreeItem): ConnectionTreeItem[] {
    return procedures.map(proc =>
      new ConnectionTreeItem(
        proc,
        vscode.TreeItemCollapsibleState.None,
        parent.connection,
        'procedure',
        'procedure',
        parent.databaseName,
        parent
      )
    );
  }
}

// Default handler for any unhandled node types
class DefaultNodeHandler implements NodeHandler {
  canHandle(): boolean {
    return true; // Fallback handler
  }

  async getChildren(): Promise<ConnectionTreeItem[]> {
    return []; // Return empty array for unhandled node types
  }
}
