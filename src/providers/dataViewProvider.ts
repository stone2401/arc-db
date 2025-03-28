import * as vscode from 'vscode';

export class DataViewProvider {
  private static instance: DataViewProvider;
  private panel: vscode.WebviewPanel | undefined;

  private constructor() {}

  public static getInstance(): DataViewProvider {
    if (!DataViewProvider.instance) {
      DataViewProvider.instance = new DataViewProvider();
    }
    return DataViewProvider.instance;
  }

  public showTableData(
    tableName: string, 
    columns: string[], 
    data: any[], 
    connectionName: string
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
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = this.getWebviewContent(tableName, columns, data, connectionName);
    
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private getWebviewContent(
    tableName: string, 
    columns: string[], 
    data: any[], 
    connectionName: string
  ): string {
    const tableHeaders = columns.map(col => `<th>${col}</th>`).join('');
    
    const tableRows = data.map(row => {
      const cells = columns.map(col => `<td>${row[col] !== null ? row[col] : 'NULL'}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${tableName} - Data</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 10px;
            }
            .container {
                display: flex;
                flex-direction: column;
                height: 100vh;
            }
            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            .title {
                font-size: 1.2em;
                font-weight: bold;
            }
            .actions {
                display: flex;
                gap: 10px;
            }
            .button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 6px 12px;
                cursor: pointer;
                border-radius: 2px;
            }
            .button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .table-container {
                flex: 1;
                overflow: auto;
                border: 1px solid var(--vscode-panel-border);
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                position: sticky;
                top: 0;
                text-align: left;
                padding: 8px;
                border-bottom: 1px solid var(--vscode-panel-border);
                font-weight: bold;
            }
            td {
                padding: 6px 8px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            tr:nth-child(even) {
                background-color: var(--vscode-list-hoverBackground);
            }
            .footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 0;
            }
            .pagination {
                display: flex;
                gap: 5px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="title">${connectionName} > ${tableName}</div>
                <div class="actions">
                    <button class="button" id="refresh">Refresh</button>
                    <button class="button" id="export">Export</button>
                </div>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>${tableHeaders}</tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
            <div class="footer">
                <div>Total: ${data.length} rows</div>
                <div class="pagination">
                    <button class="button" id="prev">Previous</button>
                    <button class="button" id="next">Next</button>
                </div>
            </div>
        </div>
        <script>
            (function() {
                const vscode = acquireVsCodeApi();
                
                document.getElementById('refresh').addEventListener('click', () => {
                    vscode.postMessage({ command: 'refresh' });
                });
                
                document.getElementById('export').addEventListener('click', () => {
                    vscode.postMessage({ command: 'export' });
                });
                
                document.getElementById('prev').addEventListener('click', () => {
                    vscode.postMessage({ command: 'prev' });
                });
                
                document.getElementById('next').addEventListener('click', () => {
                    vscode.postMessage({ command: 'next' });
                });
            }())
        </script>
    </body>
    </html>`;
  }
}
