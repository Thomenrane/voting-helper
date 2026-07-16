import { parquetWriteBuffer } from 'hyparquet-writer';
import { describe, expect, it } from 'vitest';

import { readParquetRows } from './parquet.ts';

/** Builds a small in-memory Parquet payload — no network, no committed binary. */
function fixtureParquet(): Uint8Array {
  const buffer = parquetWriteBuffer({
    columnData: [
      { name: 'vote_id', data: ['0', '1'], type: 'STRING' },
      { name: 'date', data: ['2024-09-26', '2024-11-07'], type: 'STRING' },
      { name: 'members_yes', data: ['Staf Aerts, Khalil Aouasti', ''], type: 'STRING' },
    ],
  });
  return new Uint8Array(buffer);
}

describe('readParquetRows', () => {
  it('reads rows back as plain objects', async () => {
    const rows = await readParquetRows(fixtureParquet());
    expect(rows).toEqual([
      { vote_id: '0', date: '2024-09-26', members_yes: 'Staf Aerts, Khalil Aouasti' },
      { vote_id: '1', date: '2024-11-07', members_yes: '' },
    ]);
  });

  it('reads from a byte view with a non-zero offset', async () => {
    const bytes = fixtureParquet();
    const padded = new Uint8Array(bytes.byteLength + 8);
    padded.set(bytes, 8);
    const view = new Uint8Array(padded.buffer, 8, bytes.byteLength);
    const rows = await readParquetRows(view);
    expect(rows).toHaveLength(2);
  });

  it('rejects a payload that is not Parquet', async () => {
    await expect(readParquetRows(new TextEncoder().encode('not parquet'))).rejects.toThrow();
  });
});
