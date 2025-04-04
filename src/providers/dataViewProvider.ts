import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class DataViewProvider {
    private static instance: DataViewProvider;
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public static getInstance(context?: vscode.ExtensionContext): DataViewProvider {
        if (!DataViewProvider.instance && context) {
            DataViewProvider.instance = new DataViewProvider(context);
        }
        return DataViewProvider.instance;
    }

    public showTableData(
        tableName: string,
        columns: string[],
        data: any[],
        connectionName: string,
        databaseName: string = '',
        primaryKey: string | string[] | null = null
    ): void {
        const title = `${connectionName}: ${tableName}`;

        if (this.panel) {
            this.panel.dispose();
        }

        this.panel = vscode.window.createWebviewPanel(
            'arcDbTableView',
            title,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
                ]
            }
        );

        this.panel.webview.html = this.getWebviewContent(tableName, columns, data, connectionName, databaseName, primaryKey);

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(async (message) => {
            console.log('Received message from webview:', message);

            switch (message.command) {
                case 'refresh':
                    vscode.commands.executeCommand('arc-db.refreshTableData', message.page, message.pageSize, message.sortColumn, message.sortDirection, message.filters);
                    break;
                case 'export':
                    vscode.commands.executeCommand('arc-db.exportData', message.format, message.selectedOnly);
                    break;
                case 'navigate':
                    // Handle pagination
                    vscode.commands.executeCommand('arc-db.navigateTableData', message.page, message.pageSize);
                    break;
                case 'sort':
                    // Handle sorting with support for multi-column sort
                    if (message.sortColumns && message.sortColumns.length > 0) {
                        // 多列排序 - 使用对象格式参数
                        console.log('Executing sortTableData with multi-column sort', message.sortColumns);
                        vscode.commands.executeCommand('arc-db.sortTableData', {
                            sortColumns: message.sortColumns,
                            filters: message.filters
                        });
                    } else {
                        // 单列排序
                        console.log('Executing sortTableData with single column', message.column, message.direction);
                        vscode.commands.executeCommand('arc-db.sortTableData', message.column, message.direction, message.filters);
                    }
                    break;
                case 'filter':
                    // Handle filtering with support for sorting info
                    if (message.sortColumns && message.sortColumns.length > 0) {
                        // 包含多列排序信息
                        console.log('Executing filterTableData with filters and multi-column sort', message.filters, message.sortColumns);
                        vscode.commands.executeCommand('arc-db.filterTableData', message.filters, undefined, undefined, message.sortColumns);
                    } else if (message.sortColumn) {
                        // 包含单列排序信息
                        console.log('Executing filterTableData with filters and single column sort', message.filters, message.sortColumn, message.sortDirection);
                        vscode.commands.executeCommand('arc-db.filterTableData', message.filters, message.sortColumn, message.sortDirection);
                    } else {
                        // 仅筛选，无排序
                        console.log('Executing filterTableData with filters only', message.filters);
                        vscode.commands.executeCommand('arc-db.filterTableData', message.filters);
                    }
                    break;
                case 'clearFilters':
                    // Clear filters
                    vscode.commands.executeCommand('arc-db.clearFilters');
                    break;
                case 'executeQuery':
                    // Execute custom query
                    vscode.commands.executeCommand('arc-db.executeCustomQuery', message.query);
                    break;
                case 'copyToClipboard':
                    // Copy to clipboard
                    vscode.env.clipboard.writeText(message.text);
                    break;
                case 'showError':
                    // Show error message
                    vscode.window.showErrorMessage(message.message);
                    break;
                case 'showSuccess':
                    // Show success message
                    vscode.window.showInformationMessage(message.message);
                    break;
            }
        }, undefined, this.context.subscriptions);
    }

    private getWebviewContent(
        tableName: string,
        columns: string[],
        data: any[],
        connectionName: string,
        databaseName: string = '',
        primaryKey: string | string[] | null = null
    ): string {
        // Get the local path to the webview resources
        const htmlPath = path.join(this.context.extensionPath, 'resources', 'webview', 'data-view', 'index.html');

        // 获取CSS和JS文件的URI
        const cssUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'webview', 'data-view', 'css', 'styles.css'))
        );

        const jsUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'webview', 'data-view', 'js', 'main.js'))
        );

        // Read the HTML template
        let html = fs.readFileSync(htmlPath, 'utf8');

        // Create the initialization data with all necessary information
        const initData = {
            tableName,
            columns,
            data,
            connectionName,
            databaseName: databaseName || tableName.split('.')[0] || '',
            rowCount: data.length,
            totalRowCount: data.length,
            primaryKey,
            currentPage: 1,
            totalPages: Math.ceil(data.length / 100)
        };

        // 将数据序列化为JSON字符串，确保正确处理特殊字符
        const dataString = JSON.stringify(initData);

        // Replace template variables in the HTML
        html = html.replace(/{{tableName}}/g, tableName)
            .replace(/{{connectionName}}/g, connectionName)
            .replace(/{{databaseName}}/g, databaseName || tableName.split('.')[0] || '')
            .replace(/{{rowCount}}/g, data.length.toString())
            .replace(/{{cspSource}}/g, this.panel?.webview.cspSource || '')
            .replace(/{{cssPath}}/g, cssUri.toString())
            .replace(/{{jsPath}}/g, jsUri.toString())
            .replace('DATA_PLACEHOLDER', dataString);

        return html;
    }

    public updateTableData(data: any[]): void {
        if (this.panel) {
            console.log('Updating table data with', data.length, 'rows');
            // Send updated data to the webview
            this.panel.webview.postMessage({
                command: 'updateData',
                data: {
                    data,
                    rowCount: data.length,
                    totalRowCount: data.length
                }
            });
        }
    }
}
