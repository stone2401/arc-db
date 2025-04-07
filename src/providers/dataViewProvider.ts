import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class DataViewProvider {
    private static instance: DataViewProvider;
    // 修改为存储多个面板的映射，键为表名
    private panels: Map<string, vscode.WebviewPanel>;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.panels = new Map();
    }

    public static getInstance(context?: vscode.ExtensionContext): DataViewProvider {
        if (!DataViewProvider.instance && context) {
            DataViewProvider.instance = new DataViewProvider(context);
        }
        return DataViewProvider.instance;
    }

    // 生成唯一的面板ID
    private getPanelId(connectionName: string, databaseName: string, tableName: string): string {
        return `${connectionName}:${databaseName}:${tableName}`;
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
        const panelId = this.getPanelId(connectionName, databaseName, tableName);

        // 检查是否已存在此表的面板
        const existingPanel = this.panels.get(panelId);

        if (existingPanel) {
            // 如果已存在，则显示该面板
            existingPanel.reveal();
            return;
        }

        // 创建新的面板
        const panel = vscode.window.createWebviewPanel(
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

        // 存储面板
        this.panels.set(panelId, panel);

        panel.webview.html = this.getWebviewContent(tableName, columns, data, connectionName, databaseName, primaryKey);

        panel.onDidDispose(() => {
            // 面板关闭时从映射中移除
            this.panels.delete(panelId);
        });

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(async (message) => {
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
                        vscode.commands.executeCommand('arc-db.sortTableData', {
                            sortColumns: message.sortColumns,
                            filters: message.filters
                        });
                    } else {
                        // 单列排序
                        vscode.commands.executeCommand('arc-db.sortTableData', message.column, message.direction, message.filters);
                    }
                    break;
                case 'filter':
                    // Handle filtering with support for sorting info
                    if (message.sortColumns && message.sortColumns.length > 0) {
                        // 包含多列排序信息
                        vscode.commands.executeCommand('arc-db.filterTableData', message.filters, undefined, undefined, message.sortColumns);
                    } else if (message.sortColumn) {
                        // 包含单列排序信息
                        vscode.commands.executeCommand('arc-db.filterTableData', message.filters, message.sortColumn, message.sortDirection);
                    } else {
                        // 仅筛选，无排序
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
        const panelId = this.getPanelId(connectionName, databaseName, tableName);
        const panel = this.panels.get(panelId);

        if (!panel) {
            throw new Error(`Panel not found for ${panelId}`);
        }

        const cssUri = panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'webview', 'data-view', 'css', 'styles.css'))
        );

        const jsUri = panel.webview.asWebviewUri(
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
            .replace(/{{cspSource}}/g, panel.webview.cspSource || '')
            .replace(/{{cssPath}}/g, cssUri.toString())
            .replace(/{{jsPath}}/g, jsUri.toString())
            .replace('DATA_PLACEHOLDER', dataString);

        return html;
    }

    public updateTableData(data: any[], connectionName: string, databaseName: string, tableName: string, columns?: string[]): void {
        // 使用传入的参数确定需要更新的面板
        const panelId = this.getPanelId(connectionName, databaseName, tableName);
        const panel = this.panels.get(panelId);

        if (panel) {
            // 发送更新数据到webview，包含列信息以确保空数据时能正确渲染表头
            panel.webview.postMessage({
                command: 'updateData',
                data: {
                    data,
                    columns: columns, // 发送列信息
                    rowCount: data.length,
                    totalRowCount: data.length
                }
            });
        }
    }
}
