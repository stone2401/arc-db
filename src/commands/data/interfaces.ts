/**
 * Interfaces for table data operations
 */

// Store current table view state
export interface TableViewState {
  connectionId: string;
  databaseName: string;
  tableName: string;
  connectionName: string;
  page: number;
  pageSize: number;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: TableFilter[];
  sortColumns?: { column: string; direction?: 'asc' | 'desc' }[];
}

// 用于导出时的无分页状态
export interface ExportTableViewState extends Omit<TableViewState, 'page' | 'pageSize'> {
  page?: number;
  pageSize?: number;
}

// Filter definition
export interface TableFilter {
  column: string;
  operator: string;
  value: string;
}
