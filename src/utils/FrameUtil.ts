const streamToGenerator = async function* (
	streamOrReader: ReadableStream | ReadableStreamDefaultReader,
) {
	const reader =
		streamOrReader instanceof ReadableStream
			? streamOrReader.getReader()
			: streamOrReader;
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

const unpackGray = (bitDepth: number, frame: ArrayBuffer) => {
	const src = new Uint8Array(frame);
	const dest = new Uint16Array(src.byteLength / (bitDepth / 8));
	let window = 0;
	let bits = 0;
	let s = 0;
	let d = 0;
	while (s < src.length) {
		while (bits < bitDepth && s < src.length) {
			window = (window << 8) | src[s++];
			bits += 8;
		}
		if (bits < bitDepth) break;
		bits -= bitDepth;
		dest[d++] = window >> bits;
		window &= (1 << bits) - 1;
	}
	return dest;
};

const grayToRgba = (frame: ArrayBuffer, bitDepth = 11) => {
	const invalid = (1 << bitDepth) - 1;
	const shift = bitDepth - 8;
	const src = new Uint16Array(frame);
	const dest = new Uint8ClampedArray(src.length * 4);
	for (let i = 0; i < src.length; i++) {
		const pixel = src[i];
		const reduced = pixel >> shift;
		dest[i * 4 + 0] = reduced;
		dest[i * 4 + 1] = reduced;
		dest[i * 4 + 2] = reduced;
		dest[i * 4 + 3] = pixel === invalid ? 0x00 : 0xff;
	}
	return dest;
};

const unpack10bitGrayToRgba = (frame: ArrayBuffer) =>
	grayToRgba(unpackGray(10, frame), 10);

const unpack11bitGrayToRgba = (frame: ArrayBuffer) =>
	grayToRgba(unpackGray(11, frame), 11);

const bayerToRgba = (frame: ArrayBuffer, width: number, height: number) => {
	const bayer = new Uint8Array(frame);
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
				const [r, b] = isEvenRow ? [2, 0] : [0, 2];
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

const yuvPixelToRgbaPixel = (y: number, u: number, v: number) =>
	new Uint8ClampedArray([
		y + 1.402 * (v - 128),
		y - 0.344136 * (u - 128) - 0.714136 * (v - 128),
		y + 1.772 * (u - 128),
		255,
	]);

const uyvyToRgba = (rawBuf: ArrayBuffer, width: number, height: number) => {
	const uyvy = new Uint8Array(rawBuf);
	const rgba = new Uint8ClampedArray(width * height * 4);
	let rgbaI = 0;

	for (let uyvyI = 0; uyvyI < uyvy.length; uyvyI += 4) {
		const [u, y1, v, y2] = uyvy.subarray(uyvyI, uyvyI + 4);

		rgba.set(yuvPixelToRgbaPixel(y1, u, v), rgbaI);
		rgbaI += 4;
		rgba.set(yuvPixelToRgbaPixel(y2, u, v), rgbaI);
		rgbaI += 4;
	}

	return rgba;
};

export default {
	streamToGenerator,
	unpackGray,
	grayToRgba,
	unpack10bitGrayToRgba,
	unpack11bitGrayToRgba,
	bayerToRgba,
	yuvPixelToRgbaPixel,
	uyvyToRgba,
};
