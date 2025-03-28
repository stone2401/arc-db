import { DatabaseType } from '../models/connection';
import { IDatabaseService } from './IDatabaseService';
import { MySqlDatabaseService } from './MySqlDatabaseService';
import { PostgreSqlDatabaseService } from './PostgreSqlDatabaseService';
import { MsSqlDatabaseService } from './MsSqlDatabaseService';
import { SqliteDatabaseService } from './SqliteDatabaseService';

export class DatabaseServiceFactory {
  private static instance: DatabaseServiceFactory;
  private services: Map<DatabaseType, IDatabaseService> = new Map();

  private constructor() {
    // Initialize the database services
    this.services.set(DatabaseType.MySQL, new MySqlDatabaseService());
    this.services.set(DatabaseType.PostgreSQL, new PostgreSqlDatabaseService());
    this.services.set(DatabaseType.MSSQL, new MsSqlDatabaseService());
    this.services.set(DatabaseType.SQLite, new SqliteDatabaseService());
  }

  public static getInstance(): DatabaseServiceFactory {
    if (!DatabaseServiceFactory.instance) {
      DatabaseServiceFactory.instance = new DatabaseServiceFactory();
    }
    return DatabaseServiceFactory.instance;
  }

  public getService(type: DatabaseType): IDatabaseService {
    const service = this.services.get(type);
    if (!service) {
      throw new Error(`Unsupported database type: ${type}`);
    }
    return service;
  }
}
