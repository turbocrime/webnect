// like in libfreenect
const t_gamma = new Uint16Array(2048).map((_, i) => {
	const v = i / 2048.0;
	return Math.round(v ** 3 * 6 * 6 * 256);
});

export default {
	unpackGray: (bitsPerPixel: number, packedBuffer: ArrayBuffer) => {
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
	},

	grayToRgba: (bitsPerPixel: number, grayBuffer: ArrayBuffer) => {
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
	},

	unpackGrayToRgba: (bitsPerPixel: number, packedBuffer: ArrayBuffer) => {
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
	},

	grayToGamma: (bitsPerPixel: number, grayBuffer: ArrayBuffer) => {
		const gray = new Uint16Array(grayBuffer);
		const rgba = new Uint8ClampedArray(gray.length * 4);
		const maxPixel = (1 << bitsPerPixel) - 1;
		const adjustDepth = 11 - bitsPerPixel;

		for (let grayI = 0; grayI < gray.length; grayI++) {
			const pixel = gray[grayI];
			if (pixel === maxPixel) continue;

			const red = grayI << 2;
			const green = red + 1;
			const blue = red + 2;
			const alpha = red + 3;

			const gamma = t_gamma[pixel << adjustDepth];
			const high = gamma >> 8;
			const low = gamma & 0xff;

			switch (high) {
				case 0:
					rgba[red] = 0xff;
					rgba[green] = 0xff - low;
					rgba[blue] = 0xff - low;
					rgba[alpha] = 0xff;
					break;
				case 1:
					rgba[red] = 0xff;
					rgba[green] = low;
					rgba[blue] = 0x00;
					rgba[alpha] = 0xff;
					break;
				case 2:
					rgba[red] = 0xff - low;
					rgba[green] = 0xff;
					rgba[blue] = 0x00;
					rgba[alpha] = 0xff;
					break;
				case 3:
					rgba[red] = 0x00;
					rgba[green] = 0xff;
					rgba[blue] = low;
					rgba[alpha] = 0xff;
					break;
				case 4:
					rgba[red] = 0x00;
					rgba[green] = 0xff - low;
					rgba[blue] = 0xff;
					rgba[alpha] = 0xff;
					break;
				case 5:
					rgba[red] = 0x00;
					rgba[green] = 0x00;
					rgba[blue] = 0xff - low;
					rgba[alpha] = 0xff;
					break;
				default:
					rgba[red] = 0xff;
					rgba[green] = 0xff;
					rgba[blue] = 0xff;
					rgba[alpha] = 0xff;
					break;
			}
		}
		return rgba;
	},

	bayerToRgba: (width: number, height: number, bayerBuffer: ArrayBuffer) => {
		const bayer = new Uint8Array(bayerBuffer);
		const rgba = new Uint8ClampedArray(width * height * 4);

		let isEvenRow = true;
		for (
			let bayerI = 0, rgbaI = 0, col = 0;
			bayerI < bayer.length;
			bayerI++, col++, rgbaI += 4
		) {
			const isEvenCol = !(col & 1);
			if (col >= width) {
				col = 0;
				isEvenRow = !isEvenRow;
			}

			const red = rgbaI;
			const green = rgbaI + 1;
			const blue = rgbaI + 2;
			const alpha = rgbaI + 3;

			if (isEvenRow === isEvenCol) {
				// green kernel
				if (isEvenCol) {
					rgba[red] = (bayer[bayerI - 1] + bayer[bayerI + 1]) >> 1;
					rgba[green] = bayer[bayerI];
					rgba[blue] = (bayer[bayerI - width] + bayer[bayerI + width]) >> 1;
					rgba[alpha] = 0xff;
				} else {
					rgba[red] = (bayer[bayerI - width] + bayer[bayerI + width]) >> 1;
					rgba[green] = bayer[bayerI];
					rgba[blue] = (bayer[bayerI - 1] + bayer[bayerI + 1]) >> 1;
					rgba[alpha] = 0xff;
				}
			} else if (isEvenRow) {
				// red kernel
				rgba[red] = bayer[bayerI];
				rgba[green] =
					(bayer[bayerI - 1] +
						bayer[bayerI + 1] +
						bayer[bayerI - width] +
						bayer[bayerI + width]) >>
					2;
				rgba[blue] =
					(bayer[bayerI - width - 1] +
						bayer[bayerI - width + 1] +
						bayer[bayerI + width - 1] +
						bayer[bayerI + width + 1]) >>
					2;
				rgba[alpha] = 0xff;
			} else {
				// blue kernel
				rgba[red] =
					(bayer[bayerI - width - 1] +
						bayer[bayerI - width + 1] +
						bayer[bayerI + width - 1] +
						bayer[bayerI + width + 1]) >>
					2;
				rgba[green] =
					(bayer[bayerI - 1] +
						bayer[bayerI + 1] +
						bayer[bayerI - width] +
						bayer[bayerI + width]) >>
					2;
				rgba[blue] = bayer[bayerI];
				rgba[alpha] = 0xff;
			}
		}
		return rgba;
	},

	uyvyToRgba: (width: number, height: number, uyvyBuffer: ArrayBuffer) => {
		const yuvPixelToRgbaPixel = (y: number, u: number, v: number) => [
			y + 1.402 * (v - 128),
			y - 0.344136 * (u - 128) - 0.714136 * (v - 128),
			y + 1.772 * (u - 128),
			0xff,
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
	},
};
