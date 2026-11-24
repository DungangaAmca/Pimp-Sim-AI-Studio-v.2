import { GameState } from './types';

export const SAVE_STORAGE_KEY = 'number_one_club_save_v1';

export function serializeGameState(state: GameState): string {
  return JSON.stringify({
    version: 1,
    savedAt: Date.now(),
    state,
  });
}

export function deserializeGameState(raw: string): GameState | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.state) return null;
    const s = parsed.state as GameState;
    if (
      typeof s.money !== 'number' ||
      typeof s.day !== 'number' ||
      !Array.isArray(s.employees) ||
      !Array.isArray(s.rooms)
    ) {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveGameToStorage(state: GameState): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(SAVE_STORAGE_KEY, serializeGameState(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGameFromStorage(): GameState | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;
    return deserializeGameState(raw);
  } catch {
    return null;
  }
}

export function hasSavedGame(): boolean {
  return loadGameFromStorage() !== null;
}

export function clearSavedGame(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(SAVE_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}
