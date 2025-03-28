import * as vscode from 'vscode';
import * as mysql from 'mysql2/promise';
import * as pg from 'pg';
import * as mssql from 'mssql';
import * as sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { DatabaseConnection, DatabaseType } from '../models/connection';

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
  private connections: Map<string, any> = new Map();

  private constructor() { }

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

      let conn: any;

      switch (connection.type) {
        case DatabaseType.MySQL:
          conn = await mysql.createConnection({
            host: connection.host || 'localhost',
            port: connection.port || 3306,
            user: connection.username,
            password: connection.password,
            database: connection.database,
            connectTimeout: 10000 // Add timeout for connection attempts
          });
          // Test the connection with a simple query
          await conn.query('SELECT 1');
          break;

        case DatabaseType.PostgreSQL:
          conn = new pg.Pool({
            host: connection.host || 'localhost',
            port: connection.port || 5432,
            user: connection.username,
            password: connection.password,
            database: connection.database,
            connectionTimeoutMillis: 10000 // Add timeout for connection attempts
          });
          // Test the connection with a simple query
          await conn.query('SELECT 1');
          break;

        case DatabaseType.MSSQL:
          conn = await mssql.connect({
            server: connection.host || 'localhost',
            port: connection.port || 1433,
            user: connection.username,
            password: connection.password,
            database: connection.database,
            options: {
              trustServerCertificate: true
            },
            connectionTimeout: 10000 // Add timeout for connection attempts
          });
          // Test the connection with a simple query
          await conn.request().query('SELECT 1');
          break;

        case DatabaseType.SQLite:
          if (!connection.filename) {
            throw new Error('SQLite database file path is required');
          }

          conn = await open({
            filename: connection.filename,
            driver: sqlite3.Database
          });
          // Test the connection with a simple query
          await conn.get('SELECT 1');
          break;

        default:
          throw new Error(`Unsupported database type: ${connection.type}`);
      }

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

      switch (conn.type) {
        case DatabaseType.MySQL:
          await conn.connection.end();
          break;

        case DatabaseType.PostgreSQL:
          await conn.connection.end();
          break;

        case DatabaseType.MSSQL:
          await conn.connection.close();
          break;

        case DatabaseType.SQLite:
          await conn.connection.close();
          break;
      }

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
    const startTime = Date.now();

    try {
      const conn = this.connections.get(connectionId);
      if (!conn) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      let result: any;
      let columns: string[] = [];
      let rows: any[] = [];
      let rowCount = 0;

      switch (conn.type) {
        case DatabaseType.MySQL:
          [result] = await conn.connection.query(sql);
          if (Array.isArray(result)) {
            rows = result;
            rowCount = result.length;
            if (rows.length > 0) {
              columns = Object.keys(rows[0]);
            }
          } else {
            rowCount = result.affectedRows || 0;
          }
          break;

        case DatabaseType.PostgreSQL:
          result = await conn.connection.query(sql);
          rows = result.rows;
          rowCount = rows.length;
          if (result.fields && result.fields.length > 0) {
            columns = result.fields.map((field: any) => field.name);
          }
          break;

        case DatabaseType.MSSQL:
          result = await conn.connection.request().query(sql);
          rows = result.recordset || [];
          rowCount = rows.length;
          if (rows.length > 0) {
            columns = Object.keys(rows[0]);
          }
          break;

        case DatabaseType.SQLite:
          if (sql.trim().toLowerCase().startsWith('select')) {
            rows = await conn.connection.all(sql);
            rowCount = rows.length;
            if (rows.length > 0) {
              columns = Object.keys(rows[0]);
            }
          } else {
            result = await conn.connection.run(sql);
            rowCount = result.changes || 0;
          }
          break;
      }

      const executionTime = Date.now() - startTime;

      return {
        columns,
        rows,
        rowCount,
        executionTime
      };
    } catch (error) {
      console.error('Query execution error:', error);
      throw error;
    }
  }

  public async getMetadata(connectionId: string): Promise<DatabaseMetadata> {
    try {
      const conn = this.connections.get(connectionId);
      if (!conn) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      const metadata: DatabaseMetadata = {
        databases: [],
        tables: {},
        views: {},
        procedures: {}
      };

      switch (conn.type) {
        case DatabaseType.MySQL:
          // Get databases
          const [dbResults] = await conn.connection.query('SHOW DATABASES');
          metadata.databases = dbResults.map((row: any) => row.Database);

          // For each database, get tables, views, and procedures
          for (const db of metadata.databases) {
            // Get tables
            const [tableResults] = await conn.connection.query(
              `SELECT TABLE_NAME FROM information_schema.TABLES 
               WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
              [db]
            );
            metadata.tables[db] = tableResults.map((row: any) => row.TABLE_NAME);

            // Get views
            const [viewResults] = await conn.connection.query(
              `SELECT TABLE_NAME FROM information_schema.VIEWS 
               WHERE TABLE_SCHEMA = ?`,
              [db]
            );
            metadata.views[db] = viewResults.map((row: any) => row.TABLE_NAME);

            // Get procedures
            const [procResults] = await conn.connection.query(
              `SELECT ROUTINE_NAME FROM information_schema.ROUTINES 
               WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'`,
              [db]
            );
            metadata.procedures[db] = procResults.map((row: any) => row.ROUTINE_NAME);
          }
          break;

        case DatabaseType.PostgreSQL:
          // Get databases
          const dbResult = await conn.connection.query(
            'SELECT datname FROM pg_database WHERE datistemplate = false'
          );
          metadata.databases = dbResult.rows.map((row: any) => row.datname);

          // For the current database, get schemas, tables, views, and procedures
          // Get tables
          const tableResult = await conn.connection.query(
            `SELECT table_name FROM information_schema.tables 
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
          );
          metadata.tables[conn.connection.options.database] = tableResult.rows.map(
            (row: any) => row.table_name
          );

          // Get views
          const viewResult = await conn.connection.query(
            `SELECT table_name FROM information_schema.views 
             WHERE table_schema = 'public'`
          );
          metadata.views[conn.connection.options.database] = viewResult.rows.map(
            (row: any) => row.table_name
          );

          // Get procedures
          const procResult = await conn.connection.query(
            `SELECT routine_name FROM information_schema.routines 
             WHERE routine_schema = 'public' AND routine_type = 'PROCEDURE'`
          );
          metadata.procedures[conn.connection.options.database] = procResult.rows.map(
            (row: any) => row.routine_name
          );
          break;

        case DatabaseType.MSSQL:
          // Get databases
          const dbRes = await conn.connection.request().query(
            'SELECT name FROM sys.databases WHERE name NOT IN (\'master\', \'tempdb\', \'model\', \'msdb\')'
          );
          metadata.databases = dbRes.recordset.map((row: any) => row.name);

          // For each database, get tables, views, and procedures
          for (const db of metadata.databases) {
            // Get tables
            const tableRes = await conn.connection.request().query(
              `USE [${db}]; 
               SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
               WHERE TABLE_TYPE = 'BASE TABLE'`
            );
            metadata.tables[db] = tableRes.recordset.map((row: any) => row.TABLE_NAME);

            // Get views
            const viewRes = await conn.connection.request().query(
              `USE [${db}]; 
               SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS`
            );
            metadata.views[db] = viewRes.recordset.map((row: any) => row.TABLE_NAME);

            // Get procedures
            const procRes = await conn.connection.request().query(
              `USE [${db}]; 
               SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES 
               WHERE ROUTINE_TYPE = 'PROCEDURE'`
            );
            metadata.procedures[db] = procRes.recordset.map((row: any) => row.ROUTINE_NAME);
          }
          break;

        case DatabaseType.SQLite:
          // SQLite has only one database (the file)
          metadata.databases = ['main'];

          // Get tables
          const tableRows = await conn.connection.all(
            `SELECT name FROM sqlite_master 
             WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
          );
          metadata.tables['main'] = tableRows.map((row: any) => row.name);

          // Get views
          const viewRows = await conn.connection.all(
            `SELECT name FROM sqlite_master 
             WHERE type = 'view'`
          );
          metadata.views['main'] = viewRows.map((row: any) => row.name);

          // SQLite doesn't have stored procedures
          metadata.procedures['main'] = [];
          break;
      }

      return metadata;
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

      const structure: TableStructure = {
        name: table,
        columns: []
      };

      switch (conn.type) {
        case DatabaseType.MySQL:
          const [columns] = await conn.connection.query(
            `SELECT 
              COLUMN_NAME as name, 
              DATA_TYPE as type, 
              IS_NULLABLE as nullable, 
              COLUMN_KEY as 'key', 
              COLUMN_DEFAULT as 'default'
             FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
             ORDER BY ORDINAL_POSITION`,
            [database, table]
          );

          structure.columns = columns.map((col: any) => ({
            name: col.name,
            type: col.type,
            nullable: col.nullable === 'YES',
            primaryKey: col.key === 'PRI',
            defaultValue: col.default
          }));
          break;

        case DatabaseType.PostgreSQL:
          const result = await conn.connection.query(
            `SELECT 
              column_name as name, 
              data_type as type, 
              is_nullable as nullable,
              column_default as default_value,
              (SELECT 
                 CASE WHEN COUNT(*) > 0 THEN true ELSE false END 
               FROM information_schema.table_constraints tc
               JOIN information_schema.constraint_column_usage ccu 
                 ON tc.constraint_name = ccu.constraint_name
               WHERE tc.constraint_type = 'PRIMARY KEY' 
                 AND tc.table_name = $1
                 AND ccu.column_name = c.column_name) as is_primary
             FROM information_schema.columns c
             WHERE table_name = $1
             ORDER BY ordinal_position`,
            [table]
          );

          structure.columns = result.rows.map((col: any) => ({
            name: col.name,
            type: col.type,
            nullable: col.nullable === 'YES',
            primaryKey: col.is_primary,
            defaultValue: col.default_value
          }));
          break;

        case DatabaseType.MSSQL:
          const res = await conn.connection.request()
            .input('database', mssql.VarChar, database)
            .input('table', mssql.VarChar, table)
            .query(
              `USE [@database];
               SELECT 
                 c.COLUMN_NAME as name, 
                 c.DATA_TYPE as type, 
                 c.IS_NULLABLE as nullable,
                 c.COLUMN_DEFAULT as default_value,
                 CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as is_primary
               FROM INFORMATION_SCHEMA.COLUMNS c
               LEFT JOIN (
                 SELECT ku.COLUMN_NAME
                 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                 JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                   ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                 WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                   AND ku.TABLE_NAME = @table
               ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
               WHERE c.TABLE_NAME = @table
               ORDER BY c.ORDINAL_POSITION`
            );

          structure.columns = res.recordset.map((col: any) => ({
            name: col.name,
            type: col.type,
            nullable: col.nullable === 'YES',
            primaryKey: col.is_primary === 1,
            defaultValue: col.default_value
          }));
          break;

        case DatabaseType.SQLite:
          const pragmaResult = await conn.connection.all(`PRAGMA table_info(${table})`);

          structure.columns = pragmaResult.map((col: any) => ({
            name: col.name,
            type: col.type,
            nullable: col.notnull === 0,
            primaryKey: col.pk === 1,
            defaultValue: col.dflt_value
          }));
          break;
      }

      return structure;
    } catch (error) {
      console.error('Table structure retrieval error:', error);
      throw error;
    }
  }

  public isConnected(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }
}
