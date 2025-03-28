import { DatabaseConnection } from '../models/connection';
import { QueryResult, DatabaseMetadata, TableStructure } from './databaseService';

export interface IDatabaseService {
  connect(connection: DatabaseConnection): Promise<any>;
  disconnect(connection: any): Promise<boolean>;
  executeQuery(connection: any, sql: string): Promise<QueryResult>;
  getDatabaseMetadata(connection: any): Promise<DatabaseMetadata>;
  getTableStructure(connection: any, database: string, table: string): Promise<TableStructure>;
}
