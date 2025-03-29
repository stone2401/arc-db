import * as pg from 'pg';
import { DatabaseConnection } from '../models/connection';
import { QueryResult, DatabaseMetadata, TableStructure } from './databaseService';
import { IDatabaseService } from './IDatabaseService';

export class PostgreSqlDatabaseService implements IDatabaseService<any> {
  
  public async connect(connection: DatabaseConnection): Promise<any> {
    try {
      const conn = new pg.Pool({
        host: connection.host || 'localhost',
        port: connection.port || 5432,
        user: connection.username,
        password: connection.password,
        database: connection.database,
        connectionTimeoutMillis: 10000 // Add timeout for connection attempts
      });
      
      // Test the connection with a simple query
      await conn.query('SELECT 1');
      return conn;
    } catch (error) {
      console.error('PostgreSQL connection error:', error);
      throw error;
    }
  }

  public async disconnect(connection: any): Promise<boolean> {
    try {
      await connection.end();
      return true;
    } catch (error) {
      console.error('PostgreSQL disconnection error:', error);
      return false;
    }
  }

  public async executeQuery(connection: any, sql: string): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      const result = await connection.query(sql);
      
      return {
        columns: result.fields ? result.fields.map((field: any) => field.name) : [],
        rows: result.rows || [],
        rowCount: result.rowCount || 0,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('PostgreSQL query execution error:', error);
      throw error;
    }
  }

  public async getDatabaseMetadata(connection: any): Promise<DatabaseMetadata> {
    try {
      // Get databases
      const dbResult = await connection.query(
        `SELECT datname FROM pg_database 
         WHERE datistemplate = false 
         ORDER BY datname`
      );
      const databases = dbResult.rows.map((row: any) => row.datname);
      
      const tables: { [database: string]: string[] } = {};
      const views: { [database: string]: string[] } = {};
      const procedures: { [database: string]: string[] } = {};
      
      // For each database, get tables, views, and procedures
      for (const database of databases) {
        // Create a new connection for each database
        const dbConn = new pg.Pool({
          host: (connection as any).options?.host || (connection as any)._clients?.[0]?._host || 'localhost',
          port: (connection as any).options?.port || (connection as any)._clients?.[0]?._port || 5432,
          user: (connection as any).options?.user || (connection as any)._clients?.[0]?._user || 'postgres',
          password: (connection as any).options?.password || (connection as any)._clients?.[0]?._password || '',
          database: database,
          connectionTimeoutMillis: 10000
        });
        
        try {
          // Get tables
          const tableResult = await dbConn.query(
            `SELECT table_name FROM information_schema.tables 
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
          );
          tables[database] = tableResult.rows.map((row: any) => row.table_name);
          
          // Get views
          const viewResult = await dbConn.query(
            `SELECT table_name FROM information_schema.views 
             WHERE table_schema = 'public'`
          );
          views[database] = viewResult.rows.map((row: any) => row.table_name);
          
          // Get procedures
          const procResult = await dbConn.query(
            `SELECT routine_name FROM information_schema.routines 
             WHERE routine_schema = 'public' AND routine_type = 'PROCEDURE'`
          );
          procedures[database] = procResult.rows.map((row: any) => row.routine_name);
        } finally {
          // Close the connection
          await dbConn.end();
        }
      }
      
      return { databases, tables, views, procedures };
    } catch (error) {
      console.error('PostgreSQL metadata retrieval error:', error);
      throw error;
    }
  }

  public async getTableStructure(connection: any, database: string, table: string): Promise<TableStructure> {
    try {
      // Create a connection for the specific database if needed
      let dbConn = connection;
      let shouldCloseConnection = false;
      
      const currentDatabase = (connection as any).options?.database || 
                             (connection as any)._clients?.[0]?._database || 
                             '';
      
      if (currentDatabase !== database) {
        dbConn = new pg.Pool({
          host: (connection as any).options?.host || (connection as any)._clients?.[0]?._host || 'localhost',
          port: (connection as any).options?.port || (connection as any)._clients?.[0]?._port || 5432,
          user: (connection as any).options?.user || (connection as any)._clients?.[0]?._user || 'postgres',
          password: (connection as any).options?.password || (connection as any)._clients?.[0]?._password || '',
          database: database,
          connectionTimeoutMillis: 10000
        });
        shouldCloseConnection = true;
      }
      
      try {
        // Get table columns
        const result = await dbConn.query(
          `SELECT 
            column_name as name,
            data_type as type,
            is_nullable as nullable,
            column_default as default_value,
            (SELECT count(*) FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
              WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_name = $1
                AND kcu.column_name = columns.column_name) > 0 as is_primary
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position`,
          [table]
        );
        
        return {
          name: table,
          columns: result.rows.map((col: any) => ({
            name: col.name,
            type: col.type,
            nullable: col.nullable === 'YES',
            primaryKey: col.is_primary,
            defaultValue: col.default_value
          }))
        };
      } finally {
        // Close the connection if we created a new one
        if (shouldCloseConnection) {
          await dbConn.end();
        }
      }
    } catch (error) {
      console.error('PostgreSQL table structure retrieval error:', error);
      throw error;
    }
  }
}
