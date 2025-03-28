import * as vscode from 'vscode';
import { DatabaseConnection, DatabaseType } from '../models/connection';
import { DatabaseServiceFactory } from './DatabaseServiceFactory';

export interface QueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  executionTime: number;
}

export interface DatabaseMetadata {
  databases: string[];
  tables: { [database: string]: string[] };
  views: { [database: string]: string[] };
  procedures: { [database: string]: string[] };
}

export interface TableStructure {
  name: string;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
    defaultValue: any;
  }[];
}

export class DatabaseService {
  private static instance: DatabaseService;
  private connections: Map<string, { connection: any; type: DatabaseType; name: string }> = new Map();
  private factory: DatabaseServiceFactory;

  private constructor() {
    this.factory = DatabaseServiceFactory.getInstance();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async connect(connection: DatabaseConnection): Promise<boolean> {
    try {
      // Close existing connection if it exists
      if (this.connections.has(connection.id)) {
        await this.disconnect(connection.id);
      }

      // Get the appropriate database service
      const service = this.factory.getService(connection.type);

      // Connect to the database
      const conn = await service.connect(connection);

      // Store the connection
      this.connections.set(connection.id, {
        connection: conn,
        type: connection.type,
        name: connection.name
      });

      return true;
    } catch (error) {
      console.error('Connection error:', error);
      vscode.window.showErrorMessage(`Failed to connect to ${connection.name}: ${error}`);
      return false;
    }
  }

  public async disconnect(connectionId: string): Promise<boolean> {
    try {
      const conn = this.connections.get(connectionId);
      if (!conn) {
        return false;
      }

      // Get the appropriate database service
      const service = this.factory.getService(conn.type);

      // Disconnect from the database
      await service.disconnect(conn.connection);

      this.connections.delete(connectionId);
      return true;
    } catch (error) {
      console.error('Disconnection error:', error);
      return false;
    }
  }

  /**
   * Test a database connection without fully connecting
   * @param connection The connection to test
   * @returns True if connection is successful, false otherwise
   */
  public async testConnection(connection: DatabaseConnection): Promise<boolean> {
    try {
      // Create a temporary connection just for testing
      const tempConnection = { ...connection, id: 'temp-test-connection' };

      // Try to connect
      const connected = await this.connect(tempConnection);

      // If connected, disconnect immediately
      if (connected) {
        await this.disconnect(tempConnection.id);
      }

      return connected;
    } catch (error) {
      console.error(`Error testing connection: ${error}`);
      return false;
    }
  }

  public async executeQuery(connectionId: string, sql: string): Promise<QueryResult> {
    try {
      const conn = this.connections.get(connectionId);
      if (!conn) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      // Get the appropriate database service
      const service = this.factory.getService(conn.type);

      // Execute the query
      return await service.executeQuery(conn.connection, sql);
    } catch (error) {
      console.error('Query execution error:', error);
      throw error;
    }
  }

  public async getDatabaseMetadata(connectionId: string): Promise<DatabaseMetadata> {
    try {
      const conn = this.connections.get(connectionId);
      if (!conn) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      // Get the appropriate database service
      const service = this.factory.getService(conn.type);

      // Get the database metadata
      return await service.getDatabaseMetadata(conn.connection);
    } catch (error) {
      console.error('Metadata retrieval error:', error);
      throw error;
    }
  }

  public async getTableStructure(connectionId: string, database: string, table: string): Promise<TableStructure> {
    try {
      const conn = this.connections.get(connectionId);
      if (!conn) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      // Get the appropriate database service
      const service = this.factory.getService(conn.type);

      // Get the table structure
      return await service.getTableStructure(conn.connection, database, table);
    } catch (error) {
      console.error('Table structure retrieval error:', error);
      throw error;
    }
  }

  public isConnected(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }
}
