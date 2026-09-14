import { describe, expect, it, vi } from 'vitest';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { Store, type Doc, type Filter } from '@/lib/firebase/store';

function database(rows: Doc[]) {
  const documents = new Map(rows.map((row) => [row.id, row]));
  const snapshot = (id: string) => ({ id, exists: documents.has(id), data: () => documents.get(id) });
  const read = vi.fn(async (id: string) => snapshot(id));
  // Firestore does not guarantee getAll results follow the requested order.
  const getAll = vi.fn(async (...refs: { id: string }[]) => refs.map((ref) => snapshot(ref.id)).reverse());
  const query = vi.fn(async (filter?: Filter) => ({
    docs: rows
      .filter(
        (row) =>
          !filter ||
          (filter.op === 'in'
            ? (filter.value as unknown[]).includes(row[filter.field])
            : row[filter.field] === filter.value),
      )
      .map((row) => snapshot(row.id)),
  }));
  const db = {
    collection: () => ({
      doc: (id: string) => ({ id, get: () => read(id) }),
      get: () => query(),
      where: (field: string, op: Filter['op'], value: unknown) => ({
        get: () => query({ field, op, value }),
      }),
    }),
    getAll,
  } as unknown as Firestore;
  return { db, read, getAll, query };
}

describe('request-scoped Firestore reads', () => {
  it('fetches a 60-student roster in one batch and reuses it for later lookups', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: `student-${i}`, name: `Student ${i}` }));
    const fixture = database(rows);
    const store = new Store(fixture.db);
    const ids = rows.map((row) => row.id);
    const [first, overlapping] = await Promise.all([
      store.getMany('students', ids),
      store.getMany('students', ids.slice(20)),
    ]);
    expect(first).toEqual(rows);
    expect(overlapping).toEqual(rows.slice(20));
    expect(await Promise.all(ids.map((id) => store.get('students', id)))).toEqual(rows);
    expect(fixture.getAll).toHaveBeenCalledTimes(1);
    expect(fixture.read).not.toHaveBeenCalled();
  });

  it('preserves duplicates and missing records, skips invalid IDs, and bounds large batches', async () => {
    const rows = Array.from({ length: 201 }, (_, i) => ({ id: `student-${i}` }));
    const fixture = database(rows);
    const store = new Store(fixture.db);
    const ids = [...rows.map((row) => row.id), 'student-0', 'missing', '', 'invalid/path'];
    expect(await store.getMany('students', ids)).toEqual([...rows, rows[0], null, null, null]);
    expect(fixture.getAll.mock.calls.map((call) => call.length)).toEqual([100, 100, 2]);
    expect(await store.get('students', 'missing')).toBeNull();
    expect(fixture.read).not.toHaveBeenCalled();
    expect(await store.getMany('students', [])).toEqual([]);
  });

  it('reuses documents returned by a list without sharing them between requests', async () => {
    const fixture = database([{ id: 'a', school_id: 'school' }]);
    const store = new Store(fixture.db);
    const rows = await store.list('classrooms');
    expect(await store.getMany('classrooms', ['a'])).toEqual(rows);
    expect(fixture.getAll).not.toHaveBeenCalled();
    expect(fixture.read).not.toHaveBeenCalled();
    await new Store(fixture.db).get('classrooms', 'a');
    expect(fixture.read).toHaveBeenCalledTimes(1);
  });

  it('groups filters into legal queries and performs no query for empty input', async () => {
    const rows = Array.from({ length: 61 }, (_, i) => ({ id: `score-${i}`, score_item_id: `item-${i}` }));
    const fixture = database(rows);
    const store = new Store(fixture.db);
    expect(await store.listIn('student_scores', 'score_item_id', [])).toEqual([]);
    expect(fixture.query).not.toHaveBeenCalled();
    expect(
      await store.listIn('student_scores', 'score_item_id', [
        ...rows.map((row) => row.score_item_id),
        'item-0',
      ]),
    ).toEqual(rows);
    expect(
      fixture.query.mock.calls.map(([filter]) =>
        filter?.op === 'in' ? (filter.value as unknown[]).length : 1,
      ),
    ).toEqual([30, 30, 1]);
  });

  it('reads through the transaction and lets pending edits/deletes override query caches', async () => {
    const fixture = database([{ id: 'a', name: 'old' }, { id: 'b' }]);
    const tx = {
      get: vi.fn(async () => fixture.query()),
      getAll: vi.fn(async (...refs: { id: string }[]) =>
        refs.map((ref) => ({ id: ref.id, exists: true, data: () => ({ name: 'transaction' }) })),
      ),
    };
    const store = new Store(fixture.db, tx as unknown as Transaction);
    await store.list('students');
    store.put('students', { id: 'a', name: 'edited' });
    store.remove('students', 'b');
    expect(await store.getMany('students', ['a', 'b', 'c'])).toEqual([
      { id: 'a', name: 'edited' },
      null,
      { id: 'c', name: 'transaction' },
    ]);
    expect(tx.getAll).toHaveBeenCalledTimes(1);
    expect(tx.getAll.mock.calls[0].map((ref) => ref.id)).toEqual(['c']);
    expect(await store.list('students')).toEqual([{ id: 'a', name: 'edited' }]);
    expect(tx.get).toHaveBeenCalledTimes(1);
    expect(fixture.getAll).not.toHaveBeenCalled();
    expect(fixture.read).not.toHaveBeenCalled();
  });

  it('propagates a failed batch without treating it as missing data', async () => {
    const fixture = database([]);
    fixture.getAll.mockRejectedValue(new Error('database unavailable'));
    const store = new Store(fixture.db);
    await expect(store.getMany('students', ['a', 'b'])).rejects.toThrow('database unavailable');
    await expect(store.get('students', 'a')).rejects.toThrow('database unavailable');
    expect(fixture.read).not.toHaveBeenCalled();
  });
});
