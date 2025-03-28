export enum DatabaseType {
  MySQL = 'mysql',
  PostgreSQL = 'postgresql',
  SQLite = 'sqlite',
  MSSQL = 'mssql'
}

export interface DatabaseConnection {
  id: string;
  name: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  filename?: string; // For SQLite
  options?: Record<string, any>;
}

export interface ConnectionGroup {
  id: string;
  name: string;
  connections: DatabaseConnection[];
  subgroups?: ConnectionGroup[];
}

export interface ConnectionsConfiguration {
  connections: DatabaseConnection[];
  groups: ConnectionGroup[];
}
