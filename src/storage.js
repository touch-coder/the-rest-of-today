import { createState, validateState } from './domain.js';
const KEY = 'sleeping-table:v1';
export function readState() {
  const value = localStorage.getItem(KEY);
  if (value === null) return createState();
  // Do not silently replace damaged storage with empty data.
  return validateState(JSON.parse(value));
}
export function writeState(state) { localStorage.setItem(KEY, JSON.stringify(state)); }
