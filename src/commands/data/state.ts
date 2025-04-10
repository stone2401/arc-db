import { TableViewState } from './interfaces';

/**
 * State management for table data operations
 */

// Current active table view
let currentTableView: TableViewState | undefined;

/**
 * Get the current table view state
 */
export function getCurrentTableView(): TableViewState | undefined {
  return currentTableView;
}

/**
 * Set the current table view state
 */
export function setCurrentTableView(state: TableViewState): void {
  currentTableView = state;
}

/**
 * Update the current table view state
 */
export function updateCurrentTableView(updates: Partial<TableViewState>): void {
  if (!currentTableView) {
    return;
  }
  
  currentTableView = {
    ...currentTableView,
    ...updates
  };
}
