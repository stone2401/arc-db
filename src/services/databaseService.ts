import * as vscode from 'vscode';
import { DatabaseConnection, DatabaseType } from '../models/connection';
import { DatabaseServiceFactory } from './DatabaseServiceFactory';
import { Logger } from './Logger';
import { MetadataCache } from './metadataCache';

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
  private metadataCache: MetadataCache;

  private constructor() {
    this.factory = DatabaseServiceFactory.getInstance();
    this.metadataCache = MetadataCache.getInstance();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async connect(connection: DatabaseConnection): Promise<boolean> {
    try {
      // Log the connection attempt
      Logger.logOperation(
        connection.name,
        connection.type,
        'Connecting to database',
        `Host: ${connection.host || 'localhost'}, Database: ${connection.database || 'N/A'}`
      );

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

      // Log successful connection
      Logger.logResult(`Connection successful: ${connection.name}\n`);

      return true;
    } catch (error) {
      console.error('Connection error:', error);
      // Log the error
      Logger.logError('connecting', error);
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

      // Log the disconnection attempt
      Logger.logOperation(conn.name, conn.type, 'Disconnecting from database');

      // Get the appropriate database service
      const service = this.factory.getService(conn.type);

      // Disconnect from the database
      await service.disconnect(conn.connection);

      // 清除该连接的缓存
      this.metadataCache.clearConnectionCache(connectionId);
      
      this.connections.delete(connectionId);

      // Log successful disconnection
      Logger.logResult(`Disconnection successful: ${conn.name}\n`);

      return true;
    } catch (error) {
      console.error('Disconnection error:', error);
      // Log the error
      Logger.logError('disconnecting', error);
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

      // Log the SQL query with connection info
      Logger.logQuery(conn.name, conn.type, sql);

      // Get the appropriate database service
      const service = this.factory.getService(conn.type);

      // Execute the query
      const result = await service.executeQuery(conn.connection, sql);

      // Log the result summary
      Logger.logResult(`${result.rowCount} rows affected in ${result.executionTime}ms\n`);

      return result;
    } catch (error) {
      console.error('Query execution error:', error);
      // Log the error
      Logger.logError('executing query', error);
      throw error;
    }
  }

  public async getDatabaseMetadata(connectionId: string): Promise<DatabaseMetadata> {
    try {
      const conn = this.connections.get(connectionId);
      if (!conn) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      // 检查缓存中是否有数据
      const cachedMetadata = this.metadataCache.getMetadata(connectionId);
      if (cachedMetadata) {
        Logger.logOperation(conn.name, conn.type, 'Using cached database metadata');
        return cachedMetadata;
      }

      // Log the metadata retrieval operation
      Logger.logOperation(conn.name, conn.type, 'Retrieving database metadata');

      // Get the appropriate database service
      const service = this.factory.getService(conn.type);

      // Get the database metadata
      const metadata = await service.getDatabaseMetadata(conn.connection);

      // 将获取到的元数据存入缓存
      this.metadataCache.setMetadata(connectionId, metadata);

      // Log the metadata summary
      Logger.logResult(`Found ${metadata.databases.length} databases`);
      metadata.databases.forEach(db => {
        const tableCount = metadata.tables[db]?.length || 0;
        const viewCount = metadata.views[db]?.length || 0;
        const procCount = metadata.procedures[db]?.length || 0;
        Logger.logResult(`  - ${db}: ${tableCount} tables, ${viewCount} views, ${procCount} procedures`);
      });
      Logger.logResult('');

      return metadata;
    } catch (error) {
      console.error('Metadata retrieval error:', error);
      // Log the error
      Logger.logError('retrieving metadata', error);
      throw error;
    }
  }

  public async getTableStructure(connectionId: string, database: string, table: string): Promise<TableStructure> {
    try {
      const conn = this.connections.get(connectionId);
      if (!conn) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      // 生成缓存键
      const cacheKey = `${connectionId}:${database}:${table}`;
      
      // 检查缓存中是否有数据
      const cachedStructure = this.metadataCache.getTableStructure(cacheKey);
      if (cachedStructure) {
        Logger.logOperation(conn.name, conn.type, `Using cached structure for table ${database}.${table}`);
        return cachedStructure;
      }

      // Log the table structure retrieval operation
      Logger.logOperation(conn.name, conn.type, `Retrieving structure for table ${database}.${table}`);

      // Get the appropriate database service
      const service = this.factory.getService(conn.type);

      // Get the table structure
      const structure = await service.getTableStructure(conn.connection, database, table);

      // 将获取到的表结构存入缓存
      this.metadataCache.setTableStructure(cacheKey, structure);

      // Log the structure summary
      Logger.logResult(`Table ${structure.name} has ${structure.columns.length} columns`);
      Logger.logDetailedResults(structure.columns, col =>
        `${col.name} (${col.type})${col.primaryKey ? ' PRIMARY KEY' : ''}${col.nullable ? '' : ' NOT NULL'}`
      );

      return structure;
    } catch (error) {
      console.error('Table structure retrieval error:', error);
      // Log the error
      Logger.logError('retrieving table structure', error);
      throw error;
    }
  }

  public isConnected(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }

  /**
   * 刷新特定连接的元数据缓存
   * @param connectionId 连接ID
   */
  public async refreshMetadata(connectionId: string): Promise<DatabaseMetadata> {
    try {
      const conn = this.connections.get(connectionId);
      if (!conn) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      // 清除该连接的缓存
      this.metadataCache.clearConnectionCache(connectionId);

      // Log the metadata refresh operation
      Logger.logOperation(conn.name, conn.type, 'Refreshing database metadata');

      // Get the appropriate database service
      const service = this.factory.getService(conn.type);

      // Get the database metadata
      const metadata = await service.getDatabaseMetadata(conn.connection);

      // 将获取到的元数据存入缓存
      this.metadataCache.setMetadata(connectionId, metadata);

      // Log the metadata summary
      Logger.logResult(`Found ${metadata.databases.length} databases`);
      metadata.databases.forEach(db => {
        const tableCount = metadata.tables[db]?.length || 0;
        const viewCount = metadata.views[db]?.length || 0;
        const procCount = metadata.procedures[db]?.length || 0;
        Logger.logResult(`  - ${db}: ${tableCount} tables, ${viewCount} views, ${procCount} procedures`);
      });
      Logger.logResult('');

      return metadata;
    } catch (error) {
      console.error('Metadata refresh error:', error);
      // Log the error
      Logger.logError('refreshing metadata', error);
      throw error;
    }
  }
}
