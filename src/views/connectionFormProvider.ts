import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConnectionService } from '../services/connectionService';
import { DatabaseService } from '../services/databaseService';
import { DatabaseConnection, DatabaseType } from '../models/connection';

export class ConnectionFormProvider {
  private static instance: ConnectionFormProvider;
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public static getInstance(context?: vscode.ExtensionContext): ConnectionFormProvider {
    if (!ConnectionFormProvider.instance && context) {
      ConnectionFormProvider.instance = new ConnectionFormProvider(context);
    }
    return ConnectionFormProvider.instance;
  }

  public showConnectionForm(connection?: DatabaseConnection): void {
    const isEditMode = !!connection;
    const columnToShowIn = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (this.panel) {
      this.panel.reveal(columnToShowIn);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'connectionForm',
        isEditMode ? 'Edit Connection' : 'Add Connection',
        columnToShowIn || vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))
          ]
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      }, null, this.context.subscriptions);

      // Set webview content
      this.panel.webview.html = this.getWebviewContent(connection);

      // Handle messages from the webview
      this.panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'saveConnection') {
          const connectionService = ConnectionService.getInstance();
          try {
            if (isEditMode && connection) {
              await connectionService.updateConnection(connection.id, message.connection);
              vscode.window.showInformationMessage('Connection updated successfully.');
            } else {
              await connectionService.addConnection(message.connection);
              vscode.window.showInformationMessage('Connection added successfully.');
            }
            this.panel?.dispose();
          } catch (error) {
            vscode.window.showErrorMessage(`Failed to save connection: ${error}`);
          }
        } else if (message.command === 'testConnection') {
          const databaseService = DatabaseService.getInstance();
          try {
            const result = await databaseService.testConnection(message.connection);
            this.panel?.webview.postMessage({
              command: 'testConnectionResult',
              success: result,
              message: result ? 'Connection successful!' : 'Connection failed.'
            });
          } catch (error) {
            this.panel?.webview.postMessage({
              command: 'testConnectionResult',
              success: false,
              message: `Connection failed: ${error}`
            });
          }
        } else if (message.command === 'cancel') {
          this.panel?.dispose();
        }
      });
    }
  }

  private getWebviewContent(connection?: DatabaseConnection): string {
    const styleUri = this.panel?.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'views', 'styles.css'))
    );

    const initialConnection = connection || {
      name: '',
      type: DatabaseType.MySQL,
      host: 'localhost',
      port: this.getDefaultPort(DatabaseType.MySQL),
      username: '',
      password: '',
      database: ''
    };

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel?.webview.cspSource} https:; script-src 'unsafe-inline'; style-src ${this.panel?.webview.cspSource} 'unsafe-inline';">
        <title>${connection ? 'Edit Connection' : 'Add Connection'}</title>
        <link rel="stylesheet" href="${styleUri}">
        <style>
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
            }
            .form-group {
                margin-bottom: 15px;
            }
            label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
            }
            input, select {
                width: 100%;
                padding: 8px;
                box-sizing: border-box;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border, transparent);
                border-radius: 2px;
            }
            input:focus, select:focus {
                outline: 1px solid var(--vscode-focusBorder);
                border-color: var(--vscode-focusBorder);
            }
            button {
                padding: 8px 12px;
                margin-right: 8px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 2px;
                cursor: pointer;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            button.secondary {
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }
            button.secondary:hover {
                background-color: var(--vscode-button-secondaryHoverBackground);
            }
            .status {
                margin-top: 15px;
                padding: 10px;
                border-radius: 3px;
                display: none;
            }
            .status.success {
                background-color: var(--vscode-notificationsSuccessIcon-foreground, rgba(0, 255, 0, 0.1));
                color: var(--vscode-notificationsSuccessIcon-foreground, green);
                border: 1px solid var(--vscode-notificationsSuccessIcon-foreground, green);
            }
            .status.error {
                background-color: var(--vscode-notificationsErrorIcon-foreground, rgba(255, 0, 0, 0.1));
                color: var(--vscode-notificationsErrorIcon-foreground, red);
                border: 1px solid var(--vscode-notificationsErrorIcon-foreground, red);
            }
            .hidden {
                display: none;
            }
        </style>
    </head>
    <body>
        <form id="connectionForm">
            <div class="form-group">
                <label for="name">Connection Name</label>
                <input type="text" id="name" name="name" required>
            </div>
            
            <div class="form-group">
                <label for="type">Database Type</label>
                <select id="type" name="type">
                    <option value="mysql">MySQL</option>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mssql">SQL Server</option>
                    <option value="sqlite">SQLite</option>
                </select>
            </div>
            
            <div id="standardFields">
                <div class="form-group">
                    <label for="host">Host</label>
                    <input type="text" id="host" name="host" value="localhost">
                </div>
                
                <div class="form-group">
                    <label for="port">Port</label>
                    <input type="number" id="port" name="port">
                </div>
                
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username">
                </div>
                
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password">
                </div>
                
                <div class="form-group">
                    <label for="database">Database</label>
                    <input type="text" id="database" name="database">
                </div>
            </div>
            
            <div id="sqliteFields" class="hidden">
                <div class="form-group">
                    <label for="file">Database File</label>
                    <input type="text" id="file" name="file">
                </div>
            </div>
            
            <div id="statusMessage" class="status"></div>
            
            <div class="form-actions" style="margin-top: 20px;">
                <button type="button" id="testButton">Test Connection</button>
                <button type="submit" id="saveButton">Save</button>
                <button type="button" id="cancelButton" class="secondary">Cancel</button>
            </div>
        </form>
        
        <script>
            // Get VS Code API
            const vscode = acquireVsCodeApi();
            
            // Initialize form with data
            const initialConnection = ${JSON.stringify(initialConnection)};
            const isEditMode = ${connection ? 'true' : 'false'};
            
            // DOM elements
            const form = document.getElementById('connectionForm');
            const typeSelect = document.getElementById('type');
            const standardFields = document.getElementById('standardFields');
            const sqliteFields = document.getElementById('sqliteFields');
            const statusMessage = document.getElementById('statusMessage');
            const testButton = document.getElementById('testButton');
            const saveButton = document.getElementById('saveButton');
            const cancelButton = document.getElementById('cancelButton');
            
            // Initialize form values
            document.getElementById('name').value = initialConnection.name || '';
            typeSelect.value = initialConnection.type || 'mysql';
            document.getElementById('host').value = initialConnection.host || 'localhost';
            document.getElementById('port').value = initialConnection.port || getDefaultPort(typeSelect.value);
            document.getElementById('username').value = initialConnection.username || '';
            document.getElementById('password').value = initialConnection.password || '';
            document.getElementById('database').value = initialConnection.database || '';
            document.getElementById('file').value = initialConnection.file || '';
            
            // Toggle fields based on database type
            function toggleFields() {
                const type = typeSelect.value;
                if (type === 'sqlite') {
                    standardFields.classList.add('hidden');
                    sqliteFields.classList.remove('hidden');
                } else {
                    standardFields.classList.remove('hidden');
                    sqliteFields.classList.add('hidden');
                    document.getElementById('port').value = getDefaultPort(type);
                }
            }
            
            // Get default port based on database type
            function getDefaultPort(type) {
                switch (type) {
                    case 'mysql': return 3306;
                    case 'postgres': return 5432;
                    case 'mssql': return 1433;
                    default: return '';
                }
            }
            
            // Show status message
            function showStatus(message, isSuccess) {
                statusMessage.textContent = message;
                statusMessage.className = 'status ' + (isSuccess ? 'success' : 'error');
                statusMessage.style.display = 'block';
                
                // Hide after 5 seconds if it's a success message
                if (isSuccess) {
                    setTimeout(() => {
                        statusMessage.style.display = 'none';
                    }, 5000);
                }
            }
            
            // Get form data as object
            function getFormData() {
                const type = typeSelect.value;
                const data = {
                    name: document.getElementById('name').value,
                    type: type
                };
                
                if (type === 'sqlite') {
                    data.filename = document.getElementById('file').value;
                } else {
                    data.host = document.getElementById('host').value;
                    data.port = parseInt(document.getElementById('port').value, 10);
                    data.username = document.getElementById('username').value;
                    data.password = document.getElementById('password').value;
                    data.database = document.getElementById('database').value;
                }
                
                return data;
            }
            
            // Event listeners
            typeSelect.addEventListener('change', toggleFields);
            
            // Initialize fields based on type
            toggleFields();
            
            // Test connection
            testButton.addEventListener('click', () => {
                const connection = getFormData();
                testButton.disabled = true;
                testButton.textContent = 'Testing...';
                
                vscode.postMessage({
                    command: 'testConnection',
                    connection: connection
                });
            });
            
            // Save connection
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const connection = getFormData();
                
                vscode.postMessage({
                    command: 'saveConnection',
                    connection: connection
                });
            });
            
            // Cancel
            cancelButton.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'cancel'
                });
            });
            
            // Handle messages from extension
            window.addEventListener('message', (event) => {
                const message = event.data;
                
                if (message.command === 'testConnectionResult') {
                    testButton.disabled = false;
                    testButton.textContent = 'Test Connection';
                    showStatus(message.message, message.success);
                }
            });
        </script>
    </body>
    </html>`;
  }

  private getDefaultPort(type: DatabaseType): number {
    switch (type) {
      case DatabaseType.MySQL:
        return 3306;
      case DatabaseType.PostgreSQL:
        return 5432;
      case DatabaseType.MSSQL:
        return 1433;
      default:
        return 0;
    }
  }
}
