// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { initializeExtensionComponents } from './initialization/extensionInitializer';
import {
  registerConnectionCommands,
  registerQueryCommands,
  registerDataCommands
} from './commands';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Initialize all extension components
  const {
    connectionService,
    databaseService,
    connectionFormProvider,
    dataViewProvider,
    queryResultsProvider
  } = initializeExtensionComponents(context);

  // Register all commands
  const commands = [
    // Hello world command for testing
    vscode.commands.registerCommand('arc-db.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World from arc-db!');
    }),

    // Register domain-specific commands
    ...registerConnectionCommands(context, connectionService, connectionFormProvider, databaseService),
    ...registerQueryCommands(connectionService, databaseService, queryResultsProvider),
    ...registerDataCommands(databaseService, dataViewProvider)
  ];

  // Add all commands to subscriptions
  commands.forEach(command => context.subscriptions.push(command));
}

// This method is called when your extension is deactivated
export function deactivate() {
  // Clean up resources if needed
}
