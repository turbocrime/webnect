// like in libfreenect
const t_gamma = new Uint16Array(2048).map((_, i) => {
	const v = i / 2048.0;
	return Math.round(v ** 3 * 6 * 6 * 256);
});

export type ToRgbaBuffer = <O extends ArrayBuffer>(
	b: ArrayBuffer,
	o?: O,
) => O extends ArrayBuffer ? void : ArrayBuffer;

export const unpackGray = (
	bitsPerPixel: number,
	packedBuffer: ArrayBuffer,
	outBuffer?: ArrayBuffer,
) => {
	const packed = new Uint8Array(packedBuffer);
	const unpacked = outBuffer
		? new Uint16Array(outBuffer)
		: new Uint16Array(packed.byteLength / (bitsPerPixel / 8));
	let window = 0;
	let bits = 0;
	let pI = 0;
	let uI = 0;
	while (pI < packed.length) {
		while (bits < bitsPerPixel && pI < packed.length) {
			window = (window << 8) | packed[pI++];
			bits += 8;
		}
		if (bits < bitsPerPixel) break;
		bits -= bitsPerPixel;

		unpacked[uI++] = window >> bits;
		window &= (1 << bits) - 1;
	}
	if (!outBuffer) return unpacked.buffer;
};

export const grayToRgba = (bitsPerPixel: number, grayBuffer: ArrayBuffer) => {
	const gray = new Uint16Array(grayBuffer);
	const rgba = new Uint32Array(gray.length);
	const maxPixel = (1 << bitsPerPixel) - 1;
	const reduceDepth = bitsPerPixel - 8;
	const alpha = 0xff;
	for (let gI = 0; gI < gray.length; gI++) {
		const pixel = gray[gI];
		if (pixel === maxPixel) continue; // pixels init transparent
		const reduced = pixel >> reduceDepth;
		rgba[gI] = (alpha << 24) | (reduced << 16) | (reduced << 8) | reduced;
	}
	return rgba.buffer;
};

export const unpackGrayToRgba = (
	bitsPerPixel: number,
	packedBuffer: ArrayBuffer,
	outBuffer?: ArrayBuffer,
) => {
	const packed = new Uint8Array(packedBuffer);
	const rgba = outBuffer
		? new Uint32Array(outBuffer)
		: new Uint32Array(packed.byteLength / (bitsPerPixel / 8));
	const maxPixel = (1 << bitsPerPixel) - 1;
	const reduceDepth = bitsPerPixel - 8;
	let window = 0;
	let bits = 0;
	let packedByteIndex = 0;
	let pixelIndex = 0;

	const alpha = 0xff;

	while (packedByteIndex < packed.length) {
		while (bits < bitsPerPixel && packedByteIndex < packed.length) {
			window = (window << 8) | packed[packedByteIndex++];
			bits += 8;
		}
		if (bits < bitsPerPixel) break;
		bits -= bitsPerPixel;

		const pixel = window >> bits;
		window &= (1 << bits) - 1;

		if (pixel !== maxPixel) {
			const reduced = pixel >> reduceDepth;
			rgba[pixelIndex] =
				(alpha << 24) | (reduced << 16) | (reduced << 8) | reduced;
		} else rgba[pixelIndex] = 0;

		pixelIndex++;
	}

	if (!outBuffer) return rgba.buffer;
};
export const grayToGamma = (
	bitsPerPixel: number,
	grayBuffer: ArrayBuffer,
	outBuffer?: ArrayBuffer,
) => {
	const gray = new Uint16Array(grayBuffer);
	const rgba = outBuffer
		? new Uint32Array(outBuffer)
		: new Uint32Array(gray.length);
	const maxPixel = (1 << bitsPerPixel) - 1;

	let red: number;
	let green: number;
	let blue: number;
	let alpha: number;

	for (let grayI = 0; grayI < gray.length; grayI++) {
		const pixel = gray[grayI];

		if (pixel === maxPixel) alpha = 0x00;
		else alpha = 0xff;

		const gamma = t_gamma[pixel];
		const high = gamma >> 8;
		const low = gamma & 0xff;

		switch (high) {
			case 0:
				red = 0xff;
				green = 0xff - low;
				blue = 0xff - low;
				break;
			case 1:
				red = 0xff;
				green = low;
				blue = 0x00;
				break;
			case 2:
				red = 0xff - low;
				green = 0xff;
				blue = 0x00;
				break;
			case 3:
				red = 0x00;
				green = 0xff;
				blue = low;
				break;
			case 4:
				red = 0x00;
				green = 0xff - low;
				blue = 0xff;
				break;
			case 5:
				red = 0x00;
				green = 0x00;
				blue = 0xff - low;
				break;
			default:
				red = 0xff;
				green = 0xff;
				blue = 0xff;
				break;
		}
		rgba[grayI] = (alpha << 24) | (blue << 16) | (green << 8) | red;
	}
	if (!outBuffer) return rgba.buffer;
};

export const unpackGrayToGamma = (
	bitsPerPixel: number,
	packedBuffer: ArrayBuffer,
	outBuffer?: ArrayBuffer,
) => {
	const packed = new Uint8Array(packedBuffer);
	const rgba = outBuffer
		? new Uint32Array(outBuffer)
		: new Uint32Array(packed.byteLength / (bitsPerPixel / 8));
	const maxPixel = (1 << bitsPerPixel) - 1;
	let window = 0;
	let bits = 0;
	let packedByteIndex = 0;
	let pixelIndex = 0;

	let red: number;
	let green: number;
	let blue: number;

	while (packedByteIndex < packed.length) {
		while (bits < bitsPerPixel && packedByteIndex < packed.length) {
			window = (window << 8) | packed[packedByteIndex++];
			bits += 8;
		}
		if (bits < bitsPerPixel) break;
		bits -= bitsPerPixel;

		const pixel = window >> bits;
		window &= (1 << bits) - 1;

		if (pixel !== maxPixel) {
			const gamma = t_gamma[pixel];
			const high = gamma >> 8;
			const low = gamma & 0xff;

			switch (high) {
				case 0:
					red = 0xff;
					green = 0xff - low;
					blue = 0xff - low;
					break;
				case 1:
					red = 0xff;
					green = low;
					blue = 0x00;
					break;
				case 2:
					red = 0xff - low;
					green = 0xff;
					blue = 0x00;
					break;
				case 3:
					red = 0x00;
					green = 0xff;
					blue = low;
					break;
				case 4:
					red = 0x00;
					green = 0xff - low;
					blue = 0xff;
					break;
				case 5:
					red = 0x00;
					green = 0x00;
					blue = 0xff - low;
					break;
				default:
					red = 0xff;
					green = 0xff;
					blue = 0xff;
					break;
			}
			rgba[pixelIndex] = (0xff << 24) | (blue << 16) | (green << 8) | red;
		} else rgba[pixelIndex] = 0;

		pixelIndex++;
	}

	if (!outBuffer) return rgba.buffer;
};

export const bayerToRgba = (
	width: number,
	height: number,
	bayerBuffer: ArrayBuffer,
	outBuffer?: ArrayBuffer,
) => {
	const bayer = new Uint8Array(bayerBuffer);
	const rgba = outBuffer
		? new Uint32Array(outBuffer)
		: new Uint32Array(width * height);

	let isEvenRow = true;
	const alpha = 0xff;
	for (
		let pixelIndex = 0, col = 0;
		pixelIndex < bayer.length;
		pixelIndex++, col++
	) {
		const isEvenCol = !(col & 1);
		if (col >= width) {
			col = 0;
			isEvenRow = !isEvenRow;
		}

		let red: number;
		let green: number;
		let blue: number;

		if (isEvenRow === isEvenCol) {
			// green kernel
			if (isEvenCol) {
				red = (bayer[pixelIndex - 1] + bayer[pixelIndex + 1]) >> 1;
				green = bayer[pixelIndex];
				blue = (bayer[pixelIndex - width] + bayer[pixelIndex + width]) >> 1;
			} else {
				red = (bayer[pixelIndex - width] + bayer[pixelIndex + width]) >> 1;
				green = bayer[pixelIndex];
				blue = (bayer[pixelIndex - 1] + bayer[pixelIndex + 1]) >> 1;
			}
		} else if (isEvenRow) {
			// red kernel
			red = bayer[pixelIndex];
			green =
				(bayer[pixelIndex - 1] +
					bayer[pixelIndex + 1] +
					bayer[pixelIndex - width] +
					bayer[pixelIndex + width]) >>
				2;
			blue =
				(bayer[pixelIndex - width - 1] +
					bayer[pixelIndex - width + 1] +
					bayer[pixelIndex + width - 1] +
					bayer[pixelIndex + width + 1]) >>
				2;
		} else {
			// blue kernel
			red =
				(bayer[pixelIndex - width - 1] +
					bayer[pixelIndex - width + 1] +
					bayer[pixelIndex + width - 1] +
					bayer[pixelIndex + width + 1]) >>
				2;
			green =
				(bayer[pixelIndex - 1] +
					bayer[pixelIndex + 1] +
					bayer[pixelIndex - width] +
					bayer[pixelIndex + width]) >>
				2;
			blue = bayer[pixelIndex];
		}
		rgba[pixelIndex] = (alpha << 24) | (blue << 16) | (green << 8) | red;
	}
	if (!outBuffer) return rgba.buffer;
};

export const uyvyToRgba = (
	width: number,
	height: number,
	uyvyBuffer: ArrayBuffer,
	outBuffer?: ArrayBuffer,
) => {
	const yuvPixelToRgbaPixel = (y: number, u: number, v: number) =>
		(y + 1.402 * (v - 128)) |
		((y - 0.344136 * (u - 128) - 0.714136 * (v - 128)) << 8) |
		((y + 1.772 * (u - 128)) << 16) |
		(0xff << 24);
	const uyvy = new Uint32Array(uyvyBuffer);
	const rgba = outBuffer
		? new Uint32Array(outBuffer)
		: new Uint32Array(width * height);
	let rgbaI = 0;
	for (let uyvyI = 0; uyvyI < uyvy.length; uyvyI++) {
		const uyvy32b = uyvy[uyvyI];
		const u = (uyvy32b >> 0) & 0xff;
		const y1 = (uyvy32b >> 8) & 0xff;
		const v = (uyvy32b >> 16) & 0xff;
		const y2 = (uyvy32b >> 24) & 0xff;

		rgba[rgbaI++] = yuvPixelToRgbaPixel(y1, u, v);
		rgba[rgbaI++] = yuvPixelToRgbaPixel(y2, u, v);
	}

	if (!outBuffer) return rgba.buffer;
};

export default {
	unpackGray,
	grayToRgba,
	unpackGrayToRgba,
	grayToGamma,
	unpackGrayToGamma,
	bayerToRgba,
	uyvyToRgba,
};
