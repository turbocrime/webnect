/**
 * Transform some raw buffer into an RGBA buffer.
 *
 * Returns the optional provided output buffer, or a new buffer. It's more
 * efficient to re-use the same output buffer every frame.
 */

export type RawToRgba = (i: ArrayBuffer, o?: ArrayBuffer) => ArrayBuffer;
