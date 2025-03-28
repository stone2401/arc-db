import * as sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { DatabaseConnection } from '../models/connection';
import { QueryResult, DatabaseMetadata, TableStructure } from './databaseService';
import { IDatabaseService } from './IDatabaseService';

export class SqliteDatabaseService implements IDatabaseService {
  
  public async connect(connection: DatabaseConnection): Promise<any> {
    try {
      if (!connection.filename) {
        throw new Error('SQLite database file path is required');
      }

      const conn = await open({
        filename: connection.filename,
        driver: sqlite3.Database
      });
      
      // Test the connection with a simple query
      await conn.get('SELECT 1');
      return conn;
    } catch (error) {
      console.error('SQLite connection error:', error);
      throw error;
    }
  }

  public async disconnect(connection: any): Promise<boolean> {
    try {
      await connection.close();
      return true;
    } catch (error) {
      console.error('SQLite disconnection error:', error);
      return false;
    }
  }

  public async executeQuery(connection: any, sql: string): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      // Determine if this is a SELECT query (which returns rows)
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
      
      let rows: any[] = [];
      let rowCount = 0;
      
      if (isSelect) {
        rows = await connection.all(sql);
        rowCount = rows.length;
      } else {
        const result = await connection.run(sql);
        rowCount = result.changes || 0;
      }
      
      // Get column names from the first row
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      
      return {
        columns,
        rows,
        rowCount,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('SQLite query execution error:', error);
      throw error;
    }
  }

  public async getDatabaseMetadata(connection: any): Promise<DatabaseMetadata> {
    try {
      // SQLite has only one database per file, so we use 'main' as the database name
      const databases = ['main'];
      
      // Get tables
      const tableRows = await connection.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      const tables: { [database: string]: string[] } = {
        main: tableRows.map((row: any) => row.name)
      };
      
      // Get views
      const viewRows = await connection.all(
        "SELECT name FROM sqlite_master WHERE type='view'"
      );
      const views: { [database: string]: string[] } = {
        main: viewRows.map((row: any) => row.name)
      };
      
      // SQLite doesn't have stored procedures, so we return an empty array
      const procedures: { [database: string]: string[] } = {
        main: []
      };
      
      return { databases, tables, views, procedures };
    } catch (error) {
      console.error('SQLite metadata retrieval error:', error);
      throw error;
    }
  }

  public async getTableStructure(connection: any, database: string, table: string): Promise<TableStructure> {
    try {
      // Get table columns
      const columns = await connection.all(`PRAGMA table_info(${table})`);
      
      return {
        name: table,
        columns: columns.map((col: any) => ({
          name: col.name,
          type: col.type,
          nullable: col.notnull === 0,
          primaryKey: col.pk === 1,
          defaultValue: col.dflt_value
        }))
      };
    } catch (error) {
      console.error('SQLite table structure retrieval error:', error);
      throw error;
    }
  }
}
