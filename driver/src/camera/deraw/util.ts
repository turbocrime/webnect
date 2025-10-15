/**
 * Unpack gray pixels to 16-bit values
 * @param bitsPerPixel Bit depth per pixel
 * @param packedBuffer Packed input buffer
 * @param outBuffer Preallocated output buffer
 * @returns outBuffer
 */
export const unpackGrayToUint16 = (
	bitsPerPixel: 10 | 11,
	packedBuffer: ArrayBuffer,
	outBuffer = new ArrayBuffer(
		(packedBuffer.byteLength / (bitsPerPixel / 8)) *
			Uint16Array.BYTES_PER_ELEMENT,
	),
) => {
	const packed = new Uint8Array(packedBuffer);
	const unpacked = new Uint16Array(outBuffer);

	let window = 0;
	let bits = 0;
	let packedI = 0;
	let unpackedI = 0;

	while (packedI < packed.length) {
		// fill window
		while (bits < bitsPerPixel && packedI < packed.length) {
			// biome-ignore lint/style/noNonNullAssertion: while condition in bounds
			window = (window << 8) | packed[packedI++]!;
			bits += 8;
		}

		if (bits < bitsPerPixel) {
			console.warn(
				"end of packed buffer reached before filling the pixel window",
				{ bits, bitsPerPixel, window, packedI, packed, unpackedI, unpacked },
			);
			break;
		}

		// consume window
		bits -= bitsPerPixel;
		unpacked[unpackedI++] = window >> bits;
		window &= (1 << bits) - 1;
	}

	return unpacked.buffer;
};
