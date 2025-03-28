import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseConnection, ConnectionGroup, ConnectionsConfiguration, DatabaseType } from '../models/connection';

export class ConnectionService {
  private static instance: ConnectionService;
  private _connections: DatabaseConnection[] = [];
  private _groups: ConnectionGroup[] = [];
  private _storageUri?: vscode.Uri;
  private _onDidChangeConnections = new vscode.EventEmitter<void>();

  public readonly onDidChangeConnections = this._onDidChangeConnections.event;

  private constructor(context: vscode.ExtensionContext) {
    this._storageUri = context.globalStorageUri;
    this.loadConnections();
  }

  public static getInstance(context?: vscode.ExtensionContext): ConnectionService {
    if (!ConnectionService.instance && context) {
      ConnectionService.instance = new ConnectionService(context);
    }
    return ConnectionService.instance;
  }

  public async loadConnections(): Promise<void> {
    try {
      if (!this._storageUri) {
        return;
      }

      const configPath = path.join(this._storageUri.fsPath, 'connections.json');
      
      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
      
      try {
        const data = await fs.promises.readFile(configPath, 'utf-8');
        const config: ConnectionsConfiguration = JSON.parse(data);
        this._connections = config.connections || [];
        this._groups = config.groups || [];
      } catch (error) {
        // File doesn't exist or is invalid, use defaults
        this._connections = [];
        this._groups = [];
      }
      
      this._onDidChangeConnections.fire();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load connections: ${error}`);
    }
  }

  public async saveConnections(): Promise<void> {
    try {
      if (!this._storageUri) {
        return;
      }

      const configPath = path.join(this._storageUri.fsPath, 'connections.json');
      const config: ConnectionsConfiguration = {
        connections: this._connections,
        groups: this._groups
      };

      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
      
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      this._onDidChangeConnections.fire();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save connections: ${error}`);
    }
  }

  public getConnections(): DatabaseConnection[] {
    return [...this._connections];
  }

  public getGroups(): ConnectionGroup[] {
    return [...this._groups];
  }

  public getConnectionById(id: string): DatabaseConnection | undefined {
    return this._connections.find(conn => conn.id === id);
  }

  public async addConnection(connection: Omit<DatabaseConnection, 'id'>): Promise<DatabaseConnection> {
    const newConnection: DatabaseConnection = {
      ...connection,
      id: uuidv4()
    };
    
    this._connections.push(newConnection);
    await this.saveConnections();
    return newConnection;
  }

  public async updateConnection(id: string, connection: Partial<DatabaseConnection>): Promise<DatabaseConnection | undefined> {
    const index = this._connections.findIndex(conn => conn.id === id);
    if (index === -1) {
      return undefined;
    }

    this._connections[index] = {
      ...this._connections[index],
      ...connection
    };

    await this.saveConnections();
    return this._connections[index];
  }

  public async deleteConnection(id: string): Promise<boolean> {
    const index = this._connections.findIndex(conn => conn.id === id);
    if (index === -1) {
      return false;
    }

    this._connections.splice(index, 1);
    await this.saveConnections();
    return true;
  }

  public async addGroup(name: string, parentGroupId?: string): Promise<ConnectionGroup> {
    const newGroup: ConnectionGroup = {
      id: uuidv4(),
      name,
      connections: []
    };

    if (parentGroupId) {
      const addToGroup = (groups: ConnectionGroup[]): boolean => {
        for (const group of groups) {
          if (group.id === parentGroupId) {
            group.subgroups = group.subgroups || [];
            group.subgroups.push(newGroup);
            return true;
          }
          
          if (group.subgroups && addToGroup(group.subgroups)) {
            return true;
          }
        }
        return false;
      };

      if (!addToGroup(this._groups)) {
        this._groups.push(newGroup);
      }
    } else {
      this._groups.push(newGroup);
    }

    await this.saveConnections();
    return newGroup;
  }

  public async deleteGroup(id: string): Promise<boolean> {
    const removeGroup = (groups: ConnectionGroup[]): boolean => {
      const index = groups.findIndex(g => g.id === id);
      if (index !== -1) {
        groups.splice(index, 1);
        return true;
      }

      for (const group of groups) {
        if (group.subgroups && removeGroup(group.subgroups)) {
          return true;
        }
      }
      
      return false;
    };

    if (removeGroup(this._groups)) {
      await this.saveConnections();
      return true;
    }
    
    return false;
  }
}
