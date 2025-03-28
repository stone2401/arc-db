import * as mysql from 'mysql2/promise';
import * as vscode from 'vscode';
import { DatabaseConnection } from '../models/connection';
import { QueryResult, DatabaseMetadata, TableStructure } from './databaseService';
import { IDatabaseService } from './IDatabaseService';

export class MySqlDatabaseService implements IDatabaseService {
  
  public async connect(connection: DatabaseConnection): Promise<any> {
    try {
      const conn = await mysql.createConnection({
        host: connection.host || 'localhost',
        port: connection.port || 3306,
        user: connection.username,
        password: connection.password,
        database: connection.database,
        connectTimeout: 10000 // Add timeout for connection attempts
      });
      
      // Test the connection with a simple query
      await conn.query('SELECT 1');
      return conn;
    } catch (error) {
      console.error('MySQL connection error:', error);
      throw error;
    }
  }

  public async disconnect(connection: any): Promise<boolean> {
    try {
      await connection.end();
      return true;
    } catch (error) {
      console.error('MySQL disconnection error:', error);
      return false;
    }
  }

  public async executeQuery(connection: any, sql: string): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      const [rows, fields] = await connection.query(sql);
      const columns = fields ? fields.map((field: any) => field.name) : [];
      
      return {
        columns,
        rows: Array.isArray(rows) ? rows : [],
        rowCount: Array.isArray(rows) ? rows.length : 0,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('MySQL query execution error:', error);
      throw error;
    }
  }

  public async getDatabaseMetadata(connection: any): Promise<DatabaseMetadata> {
    try {
      // Get databases
      const [dbRows] = await connection.query('SHOW DATABASES');
      const databases = dbRows.map((row: any) => row.Database);
      
      const tables: { [database: string]: string[] } = {};
      const views: { [database: string]: string[] } = {};
      const procedures: { [database: string]: string[] } = {};
      
      // For each database, get tables, views, and procedures
      for (const database of databases) {
        // Get tables
        const [tableRows] = await connection.query(
          `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
           WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
          [database]
        );
        tables[database] = tableRows.map((row: any) => row.TABLE_NAME);
        
        // Get views
        const [viewRows] = await connection.query(
          `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS 
           WHERE TABLE_SCHEMA = ?`,
          [database]
        );
        views[database] = viewRows.map((row: any) => row.TABLE_NAME);
        
        // Get procedures
        const [procRows] = await connection.query(
          `SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES 
           WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'`,
          [database]
        );
        procedures[database] = procRows.map((row: any) => row.ROUTINE_NAME);
      }
      
      return { databases, tables, views, procedures };
    } catch (error) {
      console.error('MySQL metadata retrieval error:', error);
      throw error;
    }
  }

  public async getTableStructure(connection: any, database: string, table: string): Promise<TableStructure> {
    try {
      // Switch to the specified database
      await connection.query(`USE ${database}`);
      
      // Get table columns
      const [columns] = await connection.query(
        `SELECT 
          COLUMN_NAME as name,
          DATA_TYPE as type,
          IS_NULLABLE as nullable,
          COLUMN_KEY as keyType,
          COLUMN_DEFAULT as defaultValue
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION`,
        [database, table]
      );
      
      return {
        name: table,
        columns: columns.map((col: any) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable === 'YES',
          primaryKey: col.keyType === 'PRI',
          defaultValue: col.defaultValue
        }))
      };
    } catch (error) {
      console.error('MySQL table structure retrieval error:', error);
      throw error;
    }
  }
}
