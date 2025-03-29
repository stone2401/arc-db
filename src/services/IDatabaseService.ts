import { DatabaseConnection } from '../models/connection';
import { QueryResult, DatabaseMetadata, TableStructure } from './databaseService';

export interface IDatabaseService<T = any> {
  connect(connection: DatabaseConnection): Promise<T>;
  disconnect(connection: T): Promise<boolean>;
  executeQuery(connection: T, sql: string): Promise<QueryResult>;
  getDatabaseMetadata(connection: T): Promise<DatabaseMetadata>;
  getTableStructure(connection: T, database: string, table: string): Promise<TableStructure>;
}
