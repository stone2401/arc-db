import { TableViewState, ExportTableViewState, TableFilter } from './interfaces';

/**
 * Utility functions for building SQL queries
 */

/**
 * Builds a SQL query for table data with pagination and sorting
 */
export function buildTableQuery(state: TableViewState): string {
  let sql = `SELECT * FROM ${state.tableName}`;

  // Add WHERE clause for filters
  sql = addFiltersToQuery(sql, state.filters);

  // Add sorting
  sql = addSortingToQuery(sql, state);

  // Add pagination
  const offset = (state.page - 1) * state.pageSize;
  sql += ` LIMIT ${state.pageSize} OFFSET ${offset}`;

  return sql;
}

/**
 * Builds a SQL query for exporting table data (without pagination)
 */
export function buildExportQuery(state: ExportTableViewState): string {
  let sql = `SELECT * FROM ${state.tableName}`;

  // Add WHERE clause for filters
  sql = addFiltersToQuery(sql, state.filters);

  // Add sorting
  sql = addSortingToQuery(sql, state);

  return sql;
}

/**
 * Helper function to add filters to a SQL query
 */
function addFiltersToQuery(sql: string, filters?: TableFilter[]): string {
  if (!filters || filters.length === 0) {
    return sql;
  }

  const whereConditions = filters.map(filter => {
    // Handle special operators
    if (filter.operator === 'IS NULL') {
      return `${filter.column} IS NULL`;
    } else if (filter.operator === 'IS NOT NULL') {
      return `${filter.column} IS NOT NULL`;
    } else if (filter.operator === 'LIKE') {
      return `${filter.column} LIKE '%${filter.value}%'`;
    } else if (filter.operator === 'IN') {
      // 将逗号分隔的值转换为IN子句
      const values = filter.value.split(',')
        .map(val => val.trim())
        .filter(val => val)
        .map(val => `'${val.replace(/'/g, "''")}'`)
        .join(', ');
      return `${filter.column} IN (${values})`;
    } else if (filter.operator === 'NOT IN') {
      // 将逗号分隔的值转换为NOT IN子句
      const values = filter.value.split(',')
        .map(val => val.trim())
        .filter(val => val)
        .map(val => `'${val.replace(/'/g, "''")}'`)
        .join(', ');
      return `${filter.column} NOT IN (${values})`;
    } else {
      return `${filter.column} ${filter.operator} '${filter.value}'`;
    }
  });

  return `${sql} WHERE ${whereConditions.join(' AND ')}`;
}

/**
 * Helper function to add sorting to a SQL query
 */
function addSortingToQuery(sql: string, state: TableViewState | ExportTableViewState): string {
  if (state.sortColumn) {
    return `${sql} ORDER BY ${state.sortColumn} ${state.sortDirection || 'ASC'}`;
  } else if (state.sortColumns && state.sortColumns.length > 0) {
    // 支持多字段排序
    const sortClauses = state.sortColumns.map(sort =>
      `${sort.column} ${sort.direction || 'ASC'}`
    );
    return `${sql} ORDER BY ${sortClauses.join(', ')}`;
  }
  
  return sql;
}
