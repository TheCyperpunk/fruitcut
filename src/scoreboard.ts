// Shared scoreboard. Rows live in a Supabase table reached over its REST API
// with plain fetch (no SDK to ship); the player's name and a random id live
// in localStorage, so nobody logs in. The server keeps one row per player id
// with their best score. With no backend configured (no VITE_SUPABASE_URL)
// the board is kept on this device only.

export interface ScoreRow {
  player_id: string;
  name: string;
  score: number;
  level: number;
}

export interface Player {
  id: string;
  name: string;
}

export interface Board {
  rows: ScoreRow[];
  rank: number | null; // the player's 1-based rank, if they have a score
  total: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PLAYER_KEY = 'fruitcut.player';
const LOCAL_KEY = 'fruitcut.scores';
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SHARED = Boolean(URL && KEY);
export const MAX_NAME = 20;

export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

export function loadPlayer(storage: StorageLike | null): Player {
  try {
    const raw = storage?.getItem(PLAYER_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Player>;
      if (typeof p.id === 'string' && typeof p.name === 'string') return { id: p.id, name: cleanName(p.name) };
    }
  } catch {
    // corrupt or blocked storage: a fresh player
  }
  return { id: newId(), name: '' };
}

export function savePlayer(storage: StorageLike | null, player: Player): void {
  try {
    storage?.setItem(PLAYER_KEY, JSON.stringify(player));
  } catch {
    // private mode or storage blocked: the name is asked for again next time
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

/** The top rows, plus where the player stands. */
export async function fetchBoard(player: Player, storage: StorageLike | null, limit = 10): Promise<Board> {
  if (!SHARED) return localBoard(player, storage, limit);
  const headers = { apikey: KEY!, Authorization: `Bearer ${KEY}` };
  const res = await fetch(`${URL}/rest/v1/scores?select=player_id,name,score,level&order=score.desc,updated_at.asc&limit=${limit}`, {
    headers: { ...headers, Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`scoreboard: HTTP ${res.status}`);
  const rows = (await res.json()) as ScoreRow[];
  const total = Number(res.headers.get('content-range')?.split('/')[1]) || rows.length;
  let rank: number | null = rows.findIndex((r) => r.player_id === player.id) + 1 || null;
  if (!rank && total > rows.length) {
    // Not in the top rows: rank = players above me + 1.
    const mine = await fetch(`${URL}/rest/v1/scores?select=score&player_id=eq.${player.id}`, { headers });
    const [me] = (await mine.json()) as { score: number }[];
    if (me) {
      const above = await fetch(`${URL}/rest/v1/scores?select=player_id&score=gt.${me.score}&limit=1`, {
        headers: { ...headers, Prefer: 'count=exact' },
      });
      rank = (Number(above.headers.get('content-range')?.split('/')[1]) || 0) + 1;
    }
  }
  return { rows, rank, total };
}

/** Record a score; the server (or the local list) keeps the player's best. */
export async function submitScore(player: Player, score: number, level: number, storage: StorageLike | null): Promise<void> {
  if (!player.name || score <= 0) return;
  if (!SHARED) {
    localSubmit(player, score, level, storage);
    return;
  }
  const res = await fetch(`${URL}/rest/v1/rpc/submit_score`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_player_id: player.id, p_name: player.name, p_score: score, p_level: level }),
  });
  if (!res.ok) throw new Error(`scoreboard: HTTP ${res.status}`);
}

// ---- this device only -----------------------------------------------------

function localRows(storage: StorageLike | null): ScoreRow[] {
  try {
    const rows = JSON.parse(storage?.getItem(LOCAL_KEY) ?? '[]') as unknown;
    return Array.isArray(rows) ? (rows as ScoreRow[]) : [];
  } catch {
    return [];
  }
}

function localSubmit(player: Player, score: number, level: number, storage: StorageLike | null): void {
  const rows = localRows(storage);
  const prev = rows.find((r) => r.player_id === player.id);
  const best = prev && prev.score >= score ? { ...prev, name: player.name } : { player_id: player.id, name: player.name, score, level };
  const next = [...rows.filter((r) => r.player_id !== player.id), best].sort((a, b) => b.score - a.score).slice(0, 50);
  try {
    storage?.setItem(LOCAL_KEY, JSON.stringify(next));
  } catch {
    // storage blocked: the score just isn't remembered
  }
}

function localBoard(player: Player, storage: StorageLike | null, limit: number): Board {
  const rows = localRows(storage).sort((a, b) => b.score - a.score);
  return { rows: rows.slice(0, limit), rank: rows.findIndex((r) => r.player_id === player.id) + 1 || null, total: rows.length };
}
