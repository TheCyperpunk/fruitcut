import { beforeAll, describe, expect, it, vi } from 'vitest';

// The module reads VITE_SUPABASE_* when it loads, and a developer's .env.local
// would point these tests at the real board. Pin an empty backend first.
let sb: typeof import('../src/scoreboard');
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  vi.resetModules();
  sb = await import('../src/scoreboard');
});

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
    expect(sb.SHARED).toBe(false);
  });

  it('gives a player a stable id and remembers their name', () => {
    const storage = new MemoryStorage();
    const p = sb.loadPlayer(storage);
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.name).toBe('');
    sb.savePlayer(storage, { ...p, name: '  Sam   K ' });
    const again = sb.loadPlayer(storage);
    expect(again.id).toBe(p.id);
    expect(again.name).toBe('Sam K');
  });

  it('trims and caps names', () => {
    expect(sb.cleanName('  a  very   long name indeed, truly  ')).toBe('a very long name ind');
  });

  it('keeps each player’s best score and ranks the top list', async () => {
    const storage = new MemoryStorage();
    const sam = { id: 'sam', name: 'Sam' };
    const ali = { id: 'ali', name: 'Ali' };
    await sb.submitScore(sam, 40, 3, storage);
    await sb.submitScore(sam, 25, 2, storage); // worse: ignored
    await sb.submitScore(ali, 60, 4, storage);
    await sb.submitScore({ id: 'nobody', name: '' }, 99, 9, storage); // no name: not recorded

    const board = await sb.fetchBoard(sam, storage);
    expect(board.rows.map((r) => [r.name, r.score])).toEqual([
      ['Ali', 60],
      ['Sam', 40],
    ]);
    expect(board.rank).toBe(2);
    expect(board.total).toBe(2);
    expect((await sb.fetchBoard({ id: 'new', name: 'New' }, storage)).rank).toBeNull();
  });
});
