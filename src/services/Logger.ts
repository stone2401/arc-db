import * as vscode from 'vscode';
import { DatabaseType } from '../models/connection';

// Create an output channel for SQL query logging
const sqlOutputChannel = vscode.window.createOutputChannel('SQL Queries');

/**
 * Helper class for logging database operations
 */
export class Logger {
    /**
     * Log a message to the SQL output channel
     * @param connectionName Connection name
     * @param connectionType Connection type
     * @param operation Operation being performed
     * @param details Additional details about the operation
     */
    static logOperation(connectionName: string, connectionType: DatabaseType, operation: string, details?: string): void {
        sqlOutputChannel.appendLine(`[${new Date().toISOString()}] Connection: ${connectionName} (${connectionType})`);
        sqlOutputChannel.appendLine(`Operation: ${operation}`);
        if (details) {
            sqlOutputChannel.appendLine(details);
        }
        sqlOutputChannel.show(true);
    }

    /**
     * Log a SQL query
     * @param connectionName Connection name
     * @param connectionType Connection type
     * @param sql SQL query
     */
    static logQuery(connectionName: string, connectionType: DatabaseType, sql: string): void {
        this.logOperation(connectionName, connectionType, 'Executing SQL query', `SQL: ${sql}`);
    }

    /**
     * Log a result
     * @param message Result message
     */
    static logResult(message: string): void {
        sqlOutputChannel.appendLine(`Result: ${message}`);
    }

    /**
     * Log detailed results with indentation
     * @param items Items to log
     * @param itemFormatter Function to format each item
     */
    static logDetailedResults<T>(items: T[], itemFormatter: (item: T) => string): void {
        items.forEach(item => {
            sqlOutputChannel.appendLine(`  - ${itemFormatter(item)}`);
        });
        sqlOutputChannel.appendLine('');
    }

    /**
     * Log an error
     * @param operation Operation that failed
     * @param error Error that occurred
     */
    static logError(operation: string, error: any): void {
        sqlOutputChannel.appendLine(`Error ${operation}: ${error}\n`);
    }
}
