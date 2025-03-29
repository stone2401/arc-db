import { DatabaseConnection, DatabaseType } from '../models/connection';
import { QueryResult, DatabaseMetadata, TableStructure } from './databaseService';
import { IDatabaseService } from './IDatabaseService';
import { Logger } from './Logger';
import { createConnection, Connection } from 'mysql2/promise';

export class MySqlDatabaseService implements IDatabaseService<Connection> {
  private id: string = "";

  public async connect(connection: DatabaseConnection): Promise<Connection> {
    this.id = connection.id;
    try {
      const conn = await createConnection({
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
      Logger.logError('connecting to MySQL database', error);
      throw error;
    }
  }

  public async disconnect(connection: Connection): Promise<boolean> {
    try {
      await connection.end();
      return true;
    } catch (error) {
      Logger.logError('disconnecting from MySQL database', error);
      return false;
    }
  }

  public async executeQuery(connection: Connection, sql: string): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const [rows, fields] = await connection.query(sql);
      const columns = fields ? fields.map((field: any) => field.name) : [];

      return { columns, rows: Array.isArray(rows) ? rows : [], rowCount: Array.isArray(rows) ? rows.length : 0, executionTime: Date.now() - startTime };
    } catch (error) {
      Logger.logError('executing MySQL query', error);
      throw error;
    }
  }

  public async getDatabaseMetadata(connection: Connection): Promise<DatabaseMetadata> {
    try {
      // Get databases
      const [dbRows] = await connection.query('SHOW DATABASES');

      const databases = (dbRows as any[]).map((row: any) => row.Database);
      Logger.logQuery(this.id, DatabaseType.MySQL, 'SHOW DATABASES');
      const tables: { [database: string]: string[] } = {};
      const views: { [database: string]: string[] } = {};
      const procedures: { [database: string]: string[] } = {};

      // For each database, get tables, views, and procedures
      for (const database of databases) {
        // Get tables
        const [tableRows] = await connection.query(`SHOW TABLES FROM ${database}`);
        tables[database] = (tableRows as any[]).map((row: any) => row["Tables_in_" + database]);

        // Get views
        const [viewRows] = await connection.query(`SHOW FULL TABLES FROM ${database} WHERE Table_type = 'VIEW'`);
        views[database] = (viewRows as any[]).map((row: any) => row["Tables_in_" + database]);

        // Get procedures
        const [procRows] = await connection.query(
          `SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES 
           WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'`,
          [database]
        );
        procedures[database] = (procRows as any[]).map((row: any) => row.ROUTINE_NAME);
      }

      return { databases, tables, views, procedures };
    } catch (error) {
      Logger.logError('MySQL metadata retrieval error', error);
      throw error;
    }
  }

  public async getTableStructure(connection: Connection, database: string, table: string): Promise<TableStructure> {
    try {
      Logger.logOperation('MySQL', DatabaseType.MySQL, `Retrieving structure for table ${table} in database ${database}`);

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

      // Ensure columns is treated as an array and properly mapped
      const columnArray = Array.isArray(columns) ? columns : [];

      return {
        name: table,
        columns: columnArray.map((col: any) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable === 'YES',
          primaryKey: col.keyType === 'PRI',
          defaultValue: col.defaultValue
        }))
      };
    } catch (error) {
      Logger.logError('MySQL table structure retrieval error', error);
      throw error;
    }
  }
}
