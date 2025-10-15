/** biome-ignore-all lint/style/noNonNullAssertion: lots of array access controlled by loop conditions */

/**
 * Unpack gray pixels to RGBA float16 format
 * @param bitsPerPixel Bit depth per pixel
 * @param packedBuffer Packed input buffer
 * @param outBuffer Output buffer
 * @returns RGBA float16 buffer
 */
export const unpackGrayToRgbaFloat16 = (
	bitsPerPixel: 10 | 11,
	packedBuffer: ArrayBuffer,
	outBuffer = new ArrayBuffer(
		(packedBuffer.byteLength / (bitsPerPixel / 8)) *
			Float16Array.BYTES_PER_ELEMENT *
			4,
	),
) => {
	const packed = new Uint8Array(packedBuffer);
	const rgba = new Float16Array(outBuffer);

	const maxPixel = (1 << bitsPerPixel) - 1;
	const normal = 1 / maxPixel;

	let window = 0;
	let bits = 0;
	let packedIndex = 0;
	let rgbaIndex = 0;

	while (packedIndex < packed.length) {
		while (bits < bitsPerPixel && packedIndex < packed.length) {
			window = (window << 8) | packed[packedIndex++]!;
			bits += 8;
		}
		if (bits < bitsPerPixel) {
			break;
		}
		bits -= bitsPerPixel;

		const pixel = window >> bits;
		window &= (1 << bits) - 1;

		if (pixel === maxPixel) {
			// empty pixel
			rgba[rgbaIndex + 0] = 0;
			rgba[rgbaIndex + 1] = 0;
			rgba[rgbaIndex + 2] = 0;
			rgba[rgbaIndex + 3] = 0;
		} else {
			const pixelNorm = pixel * normal;
			rgba[rgbaIndex + 0] = pixelNorm;
			rgba[rgbaIndex + 1] = pixelNorm;
			rgba[rgbaIndex + 2] = pixelNorm;
			rgba[rgbaIndex + 3] = 1;
		}

		rgbaIndex += 4;
	}

	return rgba.buffer;
};

const BAYER_NORMAL = 1 / 255;
const BAYER_NORMAL2 = 1 / (255 * 2);
const BAYER_NORMAL4 = 1 / (255 * 4);

/**
 * Convert Bayer pattern to RGBA float16 format
 * @param width Image width
 * @param bayerBuffer Bayer input buffer
 * @param outBuffer Output buffer
 * @returns RGBA float16 buffer
 */
export function bayerToRgbaFloat16(
	width: number,
	bayerBuffer: ArrayBuffer,
	outBuffer = new ArrayBuffer(
		bayerBuffer.byteLength * 4 * Float16Array.BYTES_PER_ELEMENT,
	),
): ArrayBuffer {
	const bayer = new Uint8Array(bayerBuffer);
	const rgba = new Float16Array(outBuffer);

	let r: number;
	let g: number;
	let b: number;

	let evenRowEvenCol = 0b11; // starts at 0,0

	for (
		let toRowEnd = width, bayerIndex = 0, rgbaIndex = 0;
		bayerIndex < bayer.length;
		evenRowEvenCol ^= 0b01, toRowEnd--, bayerIndex++, rgbaIndex += 4
	) {
		if (!toRowEnd) {
			toRowEnd = width;
			evenRowEvenCol |= 0b01;
			evenRowEvenCol ^= 0b10;
		}

		switch (evenRowEvenCol as 0b00 | 0b01 | 0b10 | 0b11) {
			case 0b00:
				// green kernel A
				r =
					(bayer[bayerIndex - width]! + bayer[bayerIndex + width]!) *
					BAYER_NORMAL2;
				g = bayer[bayerIndex]! * BAYER_NORMAL;
				b = (bayer[bayerIndex - 1]! + bayer[bayerIndex + 1]!) * BAYER_NORMAL2;
				break;
			case 0b01:
				// blue kernel
				r =
					(bayer[bayerIndex - width - 1]! +
						bayer[bayerIndex - width + 1]! +
						bayer[bayerIndex + width - 1]! +
						bayer[bayerIndex + width + 1]!) *
					BAYER_NORMAL4;
				g =
					(bayer[bayerIndex - 1]! +
						bayer[bayerIndex + 1]! +
						bayer[bayerIndex - width]! +
						bayer[bayerIndex + width]!) *
					BAYER_NORMAL4;
				b = bayer[bayerIndex]! * BAYER_NORMAL;
				break;
			case 0b10:
				// red kernel
				r = bayer[bayerIndex]! * BAYER_NORMAL;
				g =
					(bayer[bayerIndex - 1]! +
						bayer[bayerIndex + 1]! +
						bayer[bayerIndex - width]! +
						bayer[bayerIndex + width]!) *
					BAYER_NORMAL4;
				b =
					(bayer[bayerIndex - width - 1]! +
						bayer[bayerIndex - width + 1]! +
						bayer[bayerIndex + width - 1]! +
						bayer[bayerIndex + width + 1]!) *
					BAYER_NORMAL4;
				break;
			case 0b11:
				// green kernel B
				r = (bayer[bayerIndex - 1]! + bayer[bayerIndex + 1]!) * BAYER_NORMAL2;
				g = bayer[bayerIndex]! * BAYER_NORMAL;
				b =
					(bayer[bayerIndex - width]! + bayer[bayerIndex + width]!) *
					BAYER_NORMAL2;
				break;
		}

		rgba[rgbaIndex + 0]! = r;
		rgba[rgbaIndex + 1]! = g;
		rgba[rgbaIndex + 2]! = b;
		rgba[rgbaIndex + 3]! = 1;
	}

	return rgba.buffer;
}

// constants for BT.601 conversion
const YUV_V_R = 1.402;
const YUV_U_G = 0.344136;
const YUV_V_G = 0.714136;
const YUV_U_B = 1.772;
const YUV_OFFSET = 128;
const YUV_NORMAL = 1 / 255;

/**
 * Convert UYVY to RGBA float16 format
 * @param uyvyBuffer UYVY input buffer
 * @param outBuffer Output buffer
 * @returns RGBA float16 buffer
 */
export function yuvToRgbaFloat16(
	uyvyBuffer: ArrayBuffer,
	outBuffer = new ArrayBuffer(
		uyvyBuffer.byteLength * 2 * Float16Array.BYTES_PER_ELEMENT,
	),
): ArrayBuffer {
	const uyvy = new Uint32Array(uyvyBuffer);
	const rgba = new Float16Array(outBuffer);

	for (
		let uyvyIndex = 0, rgbaIndex = 0;
		uyvyIndex < uyvy.length;
		uyvyIndex++, rgbaIndex += 8
	) {
		// little-endian [U, Y1, V, Y2]
		const uyvyBytes = uyvy[uyvyIndex]!;
		const u = (uyvyBytes >> 0) & 0xff;
		const y1 = (uyvyBytes >> 8) & 0xff;
		const v = (uyvyBytes >> 16) & 0xff;
		const y2 = (uyvyBytes >> 24) & 0xff;

		const vOff = v - YUV_OFFSET;
		const uOff = u - YUV_OFFSET;

		const vR = YUV_V_R * vOff;
		const uG = YUV_U_G * uOff;
		const vG = YUV_V_G * vOff;
		const uB = YUV_U_B * uOff;

		rgba[rgbaIndex + 0] = Math.max(0, Math.min(1, (y1 + vR) * YUV_NORMAL));
		rgba[rgbaIndex + 1] = Math.max(0, Math.min(1, (y1 - uG - vG) * YUV_NORMAL));
		rgba[rgbaIndex + 2] = Math.max(0, Math.min(1, (y1 + uB) * YUV_NORMAL));
		rgba[rgbaIndex + 3] = 1;

		rgba[rgbaIndex + 4] = Math.max(0, Math.min(1, (y2 + vR) * YUV_NORMAL));
		rgba[rgbaIndex + 5] = Math.max(0, Math.min(1, (y2 - uG - vG) * YUV_NORMAL));
		rgba[rgbaIndex + 6] = Math.max(0, Math.min(1, (y2 + uB) * YUV_NORMAL));
		rgba[rgbaIndex + 7] = 1;
	}

	return rgba.buffer;
}
