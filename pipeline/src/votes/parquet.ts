/**
 * Thin typed wrapper around hyparquet for reading source Parquet files.
 */
import { parquetReadObjects } from 'hyparquet';

/** Copies a byte view into a standalone ArrayBuffer (hyparquet's input type). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Reads every row of a Parquet payload as plain objects.
 * Column typing/validation is the caller's responsibility.
 */
export async function readParquetRows(bytes: Uint8Array): Promise<Record<string, unknown>[]> {
  return parquetReadObjects({ file: toArrayBuffer(bytes) });
}
