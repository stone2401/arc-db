import * as vscode from 'vscode';

export class QueryResultsProvider {
  private static instance: QueryResultsProvider;
  private outputChannel: vscode.OutputChannel;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Arc DB Query Results');
  }

  public static getInstance(): QueryResultsProvider {
    if (!QueryResultsProvider.instance) {
      QueryResultsProvider.instance = new QueryResultsProvider();
    }
    return QueryResultsProvider.instance;
  }

  public showResults(
    sql: string,
    results: any[],
    connectionName: string,
    executionTime: number
  ): void {
    this.outputChannel.clear();
    this.outputChannel.appendLine(`Connection: ${connectionName}`);
    this.outputChannel.appendLine(`Execution Time: ${executionTime}ms`);
    this.outputChannel.appendLine(`SQL: ${sql}`);
    this.outputChannel.appendLine('');
    
    if (results.length === 0) {
      this.outputChannel.appendLine('No results returned.');
      this.outputChannel.show();
      return;
    }

    // Get column names from the first result
    const columns = Object.keys(results[0]);
    
    // Calculate column widths
    const columnWidths: { [key: string]: number } = {};
    columns.forEach(col => {
      // Start with the column name length
      columnWidths[col] = col.length;
      
      // Check each row for the maximum value length
      results.forEach(row => {
        const value = row[col] !== null ? String(row[col]) : 'NULL';
        columnWidths[col] = Math.max(columnWidths[col], value.length);
      });
    });
    
    // Create header row
    let headerRow = '| ';
    columns.forEach(col => {
      headerRow += col.padEnd(columnWidths[col]) + ' | ';
    });
    this.outputChannel.appendLine(headerRow);
    
    // Create separator row
    let separatorRow = '| ';
    columns.forEach(col => {
      separatorRow += '-'.repeat(columnWidths[col]) + ' | ';
    });
    this.outputChannel.appendLine(separatorRow);
    
    // Create data rows
    results.forEach(row => {
      let dataRow = '| ';
      columns.forEach(col => {
        const value = row[col] !== null ? String(row[col]) : 'NULL';
        dataRow += value.padEnd(columnWidths[col]) + ' | ';
      });
      this.outputChannel.appendLine(dataRow);
    });
    
    this.outputChannel.appendLine('');
    this.outputChannel.appendLine(`${results.length} row(s) returned.`);
    
    // Show the output channel
    this.outputChannel.show();
  }
}
