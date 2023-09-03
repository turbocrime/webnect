import type { CamMode } from "./CamMode";
import {
	CamFmtDepth,
	CamFmtInfrared,
	CamFmtVisible,
	CamRes,
	CamType,
} from "../CamEnums";

export const unpackGray = (bitsPerPixel: number, packedBuffer: ArrayBuffer) => {
	const packed = new Uint8Array(packedBuffer);
	const unpacked = new Uint16Array(packed.byteLength / (bitsPerPixel / 8));
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
	return unpacked;
};

export const grayToRgba = (bitsPerPixel: number, grayBuffer: ArrayBuffer) => {
	const gray = new Uint16Array(grayBuffer);
	const rgba = new Uint8ClampedArray(gray.length * 4);
	const maxPixel = (1 << bitsPerPixel) - 1;
	const reduceDepth = bitsPerPixel - 8;
	for (let gI = 0, rI = 0; gI < gray.length; gI++, rI += 4) {
		const pixel = gray[gI];
		if (pixel === maxPixel) continue; // pixels init transparent
		const reduced = pixel >> reduceDepth;
		rgba[rI + 0] = reduced;
		rgba[rI + 1] = reduced;
		rgba[rI + 2] = reduced;
		rgba[rI + 3] = 0xff;
	}
	return rgba;
};

export const unpackGrayToRgba = (
	bitsPerPixel: number,
	packedBuffer: ArrayBuffer,
) => {
	const packed = new Uint8Array(packedBuffer);
	const rgba = new Uint8ClampedArray(
		(packed.byteLength / (bitsPerPixel / 8)) * 4,
	);
	const maxPixel = (1 << bitsPerPixel) - 1;
	const reduceDepth = bitsPerPixel - 8;
	let window = 0;
	let bits = 0;
	let pI = 0;
	let rI = 0;

	while (pI < packed.length) {
		while (bits < bitsPerPixel && pI < packed.length) {
			window = (window << 8) | packed[pI++];
			bits += 8;
		}
		if (bits < bitsPerPixel) break;
		bits -= bitsPerPixel;

		const pixel = window >> bits;
		window &= (1 << bits) - 1;

		if (pixel !== maxPixel) {
			const reduced = pixel >> reduceDepth;
			rgba[rI++] = reduced;
			rgba[rI++] = reduced;
			rgba[rI++] = reduced;
			rgba[rI++] = 0xff;
		} else rI += 4; // pixels init transparent
	}

	return rgba;
};

export const bayerToRgba = (
	width: number,
	height: number,
	bayerBuffer: ArrayBuffer,
) => {
	const bayer = new Uint8Array(bayerBuffer);
	const rgba = new Uint8ClampedArray(width * height * 4);

	const bayerIndex = (x: number, y: number) =>
		Math.min(Math.max(y * width + x, 0), width * height - 1);

	const colorKernel = (x: number, y: number, offsets: [number, number][]) =>
		offsets.reduce(
			(sum, [dx, dy]) => sum + bayer[bayerIndex(x + dx, y + dy)],
			0,
		) / offsets.length;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = bayerIndex(x, y) * 4;
			const isEvenRow = y % 2 === 0;
			const isEvenCol = x % 2 === 0;

			if (isEvenRow === isEvenCol) {
				// green kernel
				const [r, b] = !isEvenRow ? [2, 0] : [0, 2];
				rgba[i + r] = colorKernel(x, y, [
					[-1, 0],
					[1, 0],
				]);
				rgba[i + 1] = bayer[bayerIndex(x, y)];
				rgba[i + b] = colorKernel(x, y, [
					[0, -1],
					[0, 1],
				]);
			} else if (isEvenRow) {
				// red kernel
				rgba[i + 0] = bayer[bayerIndex(x, y)];
				rgba[i + 1] = colorKernel(x, y, [
					[-1, 0],
					[1, 0],
					[0, -1],
					[0, 1],
				]);
				rgba[i + 2] = colorKernel(x, y, [
					[-1, -1],
					[1, 1],
					[1, -1],
					[-1, 1],
				]);
			} else {
				// blue kernel
				rgba[i + 0] = colorKernel(x, y, [
					[-1, -1],
					[1, 1],
					[1, -1],
					[-1, 1],
				]);
				rgba[i + 1] = colorKernel(x, y, [
					[-1, 0],
					[1, 0],
					[0, -1],
					[0, 1],
				]);
				rgba[i + 2] = bayer[bayerIndex(x, y)];
			}

			// alpha
			rgba[i + 3] = 255;
		}
	}

	return rgba;
};

export const uyvyToRgba = (
	width: number,
	height: number,
	uyvyBuffer: ArrayBuffer,
) => {
	const yuvPixelToRgbaPixel = (y: number, u: number, v: number) => [
		y + 1.402 * (v - 128),
		y - 0.344136 * (u - 128) - 0.714136 * (v - 128),
		y + 1.772 * (u - 128),
		255,
	];
	const uyvy = new Uint8Array(uyvyBuffer);
	const rgba = new Uint8ClampedArray(width * height * 4);
	let rgbaI = 0;
	for (let uyvyI = 0; uyvyI < uyvy.length; uyvyI += 4) {
		const u = uyvy[uyvyI];
		const y1 = uyvy[uyvyI + 1];
		const v = uyvy[uyvyI + 2];
		const y2 = uyvy[uyvyI + 3];

		rgba.set(yuvPixelToRgbaPixel(y1, u, v), rgbaI);
		rgbaI += 4;
		rgba.set(yuvPixelToRgbaPixel(y2, u, v), rgbaI);
		rgbaI += 4;
	}

	return rgba;
};

export const selectFnToRgba = (mode: CamMode) => {
	const [width, height] = RESOLUTIONS[mode.res as CamRes];
	switch (mode.stream) {
		case CamType.VISIBLE:
			if (mode.format === CamFmtVisible.BAYER_8B)
				return bayerToRgba.bind(null, width, height);
			else if (mode.format === CamFmtVisible.YUV_16B)
				return uyvyToRgba.bind(null, width, height);
			break;
		case CamType.DEPTH:
			if (mode.format === CamFmtDepth.D_11B) return grayToRgba.bind(null, 11);
			else if (mode.format === CamFmtDepth.D_10B)
				return grayToRgba.bind(null, 10);
			break;
		case CamType.INFRARED:
			if (mode.format === CamFmtInfrared.IR_10B)
				return grayToRgba.bind(null, 10);
			break;
		default: // yolo it
			return (frame: ArrayBuffer) => new Uint8ClampedArray(frame);
	}
};

export const RESOLUTIONS = {
	[CamRes.LOW]: [320, 240, 320 * 240],
	[CamRes.MED]: [640, 480, 640 * 480],
	[CamRes.HIGH]: [1280, 1024, 1280 * 1024],
};

export const readAsGenerator = async function* (
	streamOrReader: ReadableStream | ReadableStreamDefaultReader,
) {
	// make sure it's teed
	const isReadableStream = "getReader" in streamOrReader;
	const isReader = "read" in streamOrReader;
	let reader: ReadableStreamDefaultReader;
	if (isReadableStream) {
		const [tee1, tee2] = streamOrReader.tee();
		reader = tee1.getReader();
		//reader = streamOrReader.getReader();
	} else if (isReader) reader = streamOrReader;
	try {
		while (true) {
			const frame = await reader.read();
			if (frame.done) break;
			yield frame.value;
		}
	} finally {
		reader.releaseLock();
	}
};

export const frameToImageData = (mode: CamMode) => {
	const fn = selectFnToRgba(mode)!;
	const [w] = RESOLUTIONS[mode.res as CamRes];
	return new TransformStream<ArrayBuffer, ImageData>({
		transform: (chunk, c) => c.enqueue(new ImageData(fn(chunk), w)),
	});
};
