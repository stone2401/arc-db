import * as mssql from 'mssql';
import { DatabaseConnection } from '../models/connection';
import { QueryResult, DatabaseMetadata, TableStructure } from './databaseService';
import { IDatabaseService } from './IDatabaseService';

export class MsSqlDatabaseService implements IDatabaseService {
  
  public async connect(connection: DatabaseConnection): Promise<any> {
    try {
      const conn = await mssql.connect({
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
      return conn;
    } catch (error) {
      console.error('MSSQL connection error:', error);
      throw error;
    }
  }

  public async disconnect(connection: any): Promise<boolean> {
    try {
      await connection.close();
      return true;
    } catch (error) {
      console.error('MSSQL disconnection error:', error);
      return false;
    }
  }

  public async executeQuery(connection: any, sql: string): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      const result = await connection.request().query(sql);
      
      return {
        columns: result.recordset && result.recordset.columns ? 
          Object.keys(result.recordset.columns) : [],
        rows: result.recordset || [],
        rowCount: result.rowsAffected && result.rowsAffected.length > 0 ? 
          result.rowsAffected[0] : 0,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('MSSQL query execution error:', error);
      throw error;
    }
  }

  public async getDatabaseMetadata(connection: any): Promise<DatabaseMetadata> {
    try {
      // Get databases
      const dbResult = await connection.request().query(
        `SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb') ORDER BY name`
      );
      const databases = dbResult.recordset.map((row: any) => row.name);
      
      const tables: { [database: string]: string[] } = {};
      const views: { [database: string]: string[] } = {};
      const procedures: { [database: string]: string[] } = {};
      
      // For each database, get tables, views, and procedures
      for (const database of databases) {
        // Get tables
        const tableResult = await connection.request().query(
          `USE [${database}]; 
           SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
           WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = 'dbo'`
        );
        tables[database] = tableResult.recordset.map((row: any) => row.TABLE_NAME);
        
        // Get views
        const viewResult = await connection.request().query(
          `USE [${database}]; 
           SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS 
           WHERE TABLE_SCHEMA = 'dbo'`
        );
        views[database] = viewResult.recordset.map((row: any) => row.TABLE_NAME);
        
        // Get procedures
        const procResult = await connection.request().query(
          `USE [${database}]; 
           SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES 
           WHERE ROUTINE_TYPE = 'PROCEDURE' AND ROUTINE_SCHEMA = 'dbo'`
        );
        procedures[database] = procResult.recordset.map((row: any) => row.ROUTINE_NAME);
      }
      
      return { databases, tables, views, procedures };
    } catch (error) {
      console.error('MSSQL metadata retrieval error:', error);
      throw error;
    }
  }

  public async getTableStructure(connection: any, database: string, table: string): Promise<TableStructure> {
    try {
      // Switch to the specified database
      await connection.request().query(`USE [${database}]`);
      
      // Get table columns
      const result = await connection.request().query(
        `SELECT 
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
            AND ku.TABLE_NAME = '${table}'
        ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
        WHERE c.TABLE_NAME = '${table}'
        ORDER BY c.ORDINAL_POSITION`
      );
      
      return {
        name: table,
        columns: result.recordset.map((col: any) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable === 'YES',
          primaryKey: col.is_primary === 1,
          defaultValue: col.default_value
        }))
      };
    } catch (error) {
      console.error('MSSQL table structure retrieval error:', error);
      throw error;
    }
  }
}
