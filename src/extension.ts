// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ConnectionService } from './services/connectionService';
import { ConnectionTreeProvider, ConnectionTreeItem } from './providers/connectionTreeProvider';
import { DataViewProvider } from './providers/dataViewProvider';
import { QueryResultsProvider } from './providers/queryResultsProvider';
import { ConnectionFormProvider } from './views/connectionFormProvider';
import { DatabaseService } from './services/databaseService';
import { DatabaseConnection, DatabaseType } from './models/connection';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "arc-db" is now active!');

  // Initialize services
  const connectionService = ConnectionService.getInstance(context);
  const databaseService = DatabaseService.getInstance();
  
  // Initialize tree view
  const connectionTreeProvider = new ConnectionTreeProvider();
  const treeView = vscode.window.createTreeView('arcDbConnectionsView', {
    treeDataProvider: connectionTreeProvider,
    showCollapseAll: true
  });
  
  // Update tree view when connections change
  connectionService.onDidChangeConnections(() => {
    connectionTreeProvider.setConnections(connectionService.getConnections());
  });
  
  // Initialize providers
  const dataViewProvider = DataViewProvider.getInstance();
  const queryResultsProvider = QueryResultsProvider.getInstance();
  const connectionFormProvider = ConnectionFormProvider.getInstance(context);
  
  // Register commands
  const commands = [
    vscode.commands.registerCommand('arc-db.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World from arc-db!');
    }),
    
    vscode.commands.registerCommand('arc-db.addConnection', () => {
      connectionFormProvider.showConnectionForm();
    }),
    
    vscode.commands.registerCommand('arc-db.refreshConnections', async () => {
      await connectionService.loadConnections();
      vscode.window.showInformationMessage('Connections refreshed.');
    }),
    
    vscode.commands.registerCommand('arc-db.executeQuery', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
      }
      
      const sql = editor.document.getText(editor.selection.isEmpty 
        ? undefined 
        : editor.selection);
        
      if (!sql.trim()) {
        vscode.window.showErrorMessage('No SQL query to execute.');
        return;
      }
      
      // Get connection to use
      const connections = connectionService.getConnections();
      if (connections.length === 0) {
        vscode.window.showErrorMessage('No database connections available. Add a connection first.');
        return;
      }
      
      // If there's more than one connection, ask the user which one to use
      let selectedConnection: DatabaseConnection;
      
      if (connections.length === 1) {
        selectedConnection = connections[0];
      } else {
        const connectionItems = connections.map(conn => ({
          label: conn.name,
          connection: conn
        }));
        
        const selected = await vscode.window.showQuickPick(connectionItems, {
          placeHolder: 'Select a connection to execute the query'
        });
        
        if (!selected) {
          return;
        }
        
        selectedConnection = selected.connection;
      }
      
      try {
        // Ensure the connection is established
        if (!databaseService.isConnected(selectedConnection.id)) {
          const connected = await databaseService.connect(selectedConnection);
          if (!connected) {
            vscode.window.showErrorMessage(`Failed to connect to ${selectedConnection.name}.`);
            return;
          }
        }
        
        // Execute the query
        const result = await databaseService.executeQuery(selectedConnection.id, sql);
        
        // Show the results
        queryResultsProvider.showResults(
          sql,
          result.rows,
          selectedConnection.name,
          result.executionTime
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Query execution failed: ${error}`);
      }
    }),
    
    vscode.commands.registerCommand('arc-db.viewTable', async (item: ConnectionTreeItem) => {
      if (!item || !item.connection || !item.databaseName) {
        vscode.window.showErrorMessage('Invalid table selection.');
        return;
      }
      
      try {
        // Ensure the connection is established
        if (!databaseService.isConnected(item.connection.id)) {
          const connected = await databaseService.connect(item.connection);
          if (!connected) {
            vscode.window.showErrorMessage(`Failed to connect to ${item.connection.name}.`);
            return;
          }
        }
        
        // Get table structure first to get column names
        const structure = await databaseService.getTableStructure(
          item.connection.id, 
          item.databaseName, 
          item.label
        );
        
        // Execute a query to get the table data
        const sql = `SELECT * FROM ${item.label} LIMIT 100`;
        const result = await databaseService.executeQuery(item.connection.id, sql);
        
        // Show the data in a new editor tab
        dataViewProvider.showTableData(
          item.label,
          structure.columns.map(col => col.name),
          result.rows,
          item.connection.name
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to view table data: ${error}`);
      }
    }),
    
    vscode.commands.registerCommand('arc-db.editConnection', (item: ConnectionTreeItem) => {
      if (!item || !item.connection) {
        vscode.window.showErrorMessage('Invalid connection selection.');
        return;
      }
      
      connectionFormProvider.showConnectionForm(item.connection);
    }),
    
    vscode.commands.registerCommand('arc-db.deleteConnection', async (item: ConnectionTreeItem) => {
      if (!item || !item.connection) {
        vscode.window.showErrorMessage('Invalid connection selection.');
        return;
      }
      
      const confirmed = await vscode.window.showWarningMessage(
        `Are you sure you want to delete the connection "${item.connection.name}"?`,
        { modal: true },
        'Delete'
      );
      
      if (confirmed === 'Delete') {
        // Disconnect if connected
        if (databaseService.isConnected(item.connection.id)) {
          await databaseService.disconnect(item.connection.id);
        }
        
        // Delete the connection
        await connectionService.deleteConnection(item.connection.id);
        vscode.window.showInformationMessage(`Connection "${item.connection.name}" deleted.`);
      }
    }),
    
    vscode.commands.registerCommand('arc-db.newQuery', async (item: ConnectionTreeItem) => {
      if (!item || !item.connection) {
        vscode.window.showErrorMessage('Invalid connection selection.');
        return;
      }
      
      // Create a new untitled SQL document
      const document = await vscode.workspace.openTextDocument({
        language: 'sql',
        content: `-- New Query on ${item.connection.name}\n-- ${new Date().toLocaleString()}\n\n`
      });
      
      // Show the document in the editor
      await vscode.window.showTextDocument(document);
      
      // Add a comment with connection info
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        editor.edit(editBuilder => {
          editBuilder.insert(new vscode.Position(3, 0), 
            `-- Connection: ${item.connection?.name}\n-- Database: ${item.connection?.database || 'N/A'}\n\n`);
        });
      }
      
      vscode.window.showInformationMessage(`New query created for ${item.connection.name}`);
    }),
    
    vscode.commands.registerCommand('arc-db.exportData', async (item: ConnectionTreeItem) => {
      if (!item || !item.connection || !item.databaseName) {
        vscode.window.showErrorMessage('Invalid table selection.');
        return;
      }
      
      // Ask for export format
      const format = await vscode.window.showQuickPick(
        ['CSV', 'JSON', 'SQL Insert Statements'], 
        { placeHolder: 'Select export format' }
      );
      
      if (!format) {
        return;
      }
      
      // Ask for file path
      const defaultPath = `${item.label}_export.${format.toLowerCase() === 'sql insert statements' ? 'sql' : format.toLowerCase()}`;
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultPath),
        filters: {
          'All Files': ['*']
        }
      });
      
      if (!uri) {
        return;
      }
      
      try {
        // Ensure the connection is established
        if (!databaseService.isConnected(item.connection.id)) {
          const connected = await databaseService.connect(item.connection);
          if (!connected) {
            vscode.window.showErrorMessage(`Failed to connect to ${item.connection.name}.`);
            return;
          }
        }
        
        // Get table data
        const sql = `SELECT * FROM ${item.label}`;
        const result = await databaseService.executeQuery(item.connection.id, sql);
        
        // Get the table structure for column information
        const structure = await databaseService.getTableStructure(
          item.connection.id, 
          item.databaseName, 
          item.label
        );
        
        // Export the data based on the selected format
        const fs = require('fs');
        const path = require('path');
        
        if (format === 'CSV') {
          // Create CSV content
          const header = structure.columns.map(col => col.name).join(',');
          const rows = result.rows.map(row => 
            structure.columns.map(col => 
              typeof row[col.name] === 'string' ? `"${row[col.name]}"` : row[col.name]
            ).join(',')
          );
          const csvContent = [header, ...rows].join('\n');
          
          // Write to file
          fs.writeFileSync(uri.fsPath, csvContent);
        } else if (format === 'JSON') {
          // Write JSON data
          fs.writeFileSync(uri.fsPath, JSON.stringify(result.rows, null, 2));
        } else if (format === 'SQL Insert Statements') {
          // Create SQL insert statements
          const insertStatements = result.rows.map(row => {
            const columns = structure.columns.map(col => col.name).join(', ');
            const values = structure.columns.map(col => {
              const value = row[col.name];
              if (value === null) {
                return 'NULL';
              } else if (typeof value === 'string') {
                return `'${value.replace(/'/g, "''")}'`;
              } else if (typeof value === 'object' && value instanceof Date) {
                return `'${value.toISOString()}'`;
              } else {
                return value;
              }
            }).join(', ');
            
            return `INSERT INTO ${item.label} (${columns}) VALUES (${values});`;
          });
          
          // Write to file
          fs.writeFileSync(uri.fsPath, insertStatements.join('\n'));
        }
        
        vscode.window.showInformationMessage(
          `Table "${item.label}" exported as ${format} to ${uri.fsPath}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to export data: ${error}`);
      }
    })
  ];
  
  // Add all commands to subscriptions
  commands.forEach(command => context.subscriptions.push(command));
  
  // Add tree view to subscriptions
  context.subscriptions.push(treeView);
  
  // Load connections
  connectionService.loadConnections().then(() => {
    connectionTreeProvider.setConnections(connectionService.getConnections());
    
    // If no connections exist, show the add connection form
    if (connectionService.getConnections().length === 0) {
      // For demo purposes, let's add a sample connection
      connectionService.addConnection({
        name: 'Sample MySQL Connection',
        type: DatabaseType.MySQL,
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'password',
        database: 'sample_db'
      });
    }
  });
}

// This method is called when your extension is deactivated
export function deactivate() {
  // Disconnect all database connections
  const databaseService = DatabaseService.getInstance();
  const connectionService = ConnectionService.getInstance();
  
  // Get all connections and disconnect them
  const connections = connectionService.getConnections();
  connections.forEach(conn => {
    if (databaseService.isConnected(conn.id)) {
      databaseService.disconnect(conn.id);
    }
  });
}
