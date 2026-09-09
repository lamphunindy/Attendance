import { it, expect } from 'vitest';
import { thaiDate } from '@/lib/utils';
it('formats timestamps in Bangkok time and Buddhist year', () => {
  expect(thaiDate('2026-09-07T18:00:00Z')).toBe('08/09/2569');
  expect(thaiDate('2026-09-08')).toBe('08/09/2569');
});
