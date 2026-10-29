import { describe, expect, it } from 'vitest';
import { cleanName, fetchBoard, loadPlayer, savePlayer, SHARED, submitScore } from '../src/scoreboard';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('scoreboard (this-device fallback)', () => {
  it('runs without a backend in tests', () => {
    expect(SHARED).toBe(false);
  });

  it('gives a player a stable id and remembers their name', () => {
    const storage = new MemoryStorage();
    const p = loadPlayer(storage);
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.name).toBe('');
    savePlayer(storage, { ...p, name: '  Sam   K ' });
    const again = loadPlayer(storage);
    expect(again.id).toBe(p.id);
    expect(again.name).toBe('Sam K');
  });

  it('trims and caps names', () => {
    expect(cleanName('  a  very   long name indeed, truly  ')).toBe('a very long name ind');
  });

  it('keeps each player’s best score and ranks the top list', async () => {
    const storage = new MemoryStorage();
    const sam = { id: 'sam', name: 'Sam' };
    const ali = { id: 'ali', name: 'Ali' };
    await submitScore(sam, 40, 3, storage);
    await submitScore(sam, 25, 2, storage); // worse: ignored
    await submitScore(ali, 60, 4, storage);
    await submitScore({ id: 'nobody', name: '' }, 99, 9, storage); // no name: not recorded

    const board = await fetchBoard(sam, storage);
    expect(board.rows.map((r) => [r.name, r.score])).toEqual([
      ['Ali', 60],
      ['Sam', 40],
    ]);
    expect(board.rank).toBe(2);
    expect(board.total).toBe(2);
    expect((await fetchBoard({ id: 'new', name: 'New' }, storage)).rank).toBeNull();
  });
});
