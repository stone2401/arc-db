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
            vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
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
    // Get the local path to the webview resources
    const htmlPath = path.join(this.context.extensionPath, 'resources', 'webview', 'connection-form', 'index.html');

    // Read the HTML template
    let html = fs.readFileSync(htmlPath, 'utf8');

    // Prepare the initial connection data
    const initialConnection = connection || {
      name: '',
      type: DatabaseType.MySQL,
      host: 'localhost',
      port: this.getDefaultPort(DatabaseType.MySQL),
      username: '',
      password: '',
      database: ''
    };

    // Create the initialization data
    const initData = {
      initialConnection,
      isEditMode: !!connection
    };

    // Replace template variables in the HTML
    html = html.replace('{{title}}', connection ? 'Edit Connection' : 'Add Connection')
      .replace(/{{cspSource}}/g, this.panel?.webview.cspSource || '')
      .replace('TEMPLATE_INITIAL_DATA', JSON.stringify(initData));

    return html;
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
