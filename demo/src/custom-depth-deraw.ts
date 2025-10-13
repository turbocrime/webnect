/** biome-ignore-all lint/style/noNonNullAssertion: known array bounds */

import { type RawToRgba, unpackGrayToUint16 } from "@webnect/driver/deraw";
import { hsvToRgb } from "./hsv-to-rgb";

const norm = 1 / 0x7ff;

let march = 0;

/** Example custom depth visualization with animated color mapping */
export const customDepthRgba: RawToRgba = (
	raw: ArrayBuffer,
	out = new ArrayBuffer(640 * 480 * 4 * Float16Array.BYTES_PER_ELEMENT),
) => {
	const rgbaFrame = new Float16Array(out);
	const grayFrame = new Uint16Array(unpackGrayToUint16(11, raw));

	march += 0.5;

	for (let grayI = 0, rgbI = 0; grayI < grayFrame.length; grayI++, rgbI += 4) {
		const grayPx = grayFrame[grayI]!;

		const chance = Math.random();
		if (grayPx === 0x7ff || chance < 0.3) {
			continue;
		}

		const grayMarch = (grayPx + march) & 0x7ff;
		const grayNorm = grayPx * norm;
		const grayNormMarch = grayMarch * norm;

		const hue = 1 - (((grayMarch ** 3) >> 17) & 0x7ff) * norm;
		const sat = 0.9 - Math.sin(grayNorm * Math.PI * 1024) * 0.4;
		const val = 0.9 - Math.cos(grayNormMarch * Math.PI * 512) * 0.2;

		const [r, g, b] = hsvToRgb(hue, sat, val);
		rgbaFrame[rgbI + 0] = r;
		rgbaFrame[rgbI + 1] = g;
		rgbaFrame[rgbI + 2] = b;
		rgbaFrame[rgbI + 3] = 1;
	}

	return out;
};
