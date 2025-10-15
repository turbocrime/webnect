import { bench, describe } from "vitest";
import {
	bayerToRgbaFloat16,
	unpackGrayToRgbaFloat16,
	yuvToRgbaFloat16,
} from "../src/camera/deraw/formats.js";

describe("deraw gray", async () => {
	const depthBuffer = await fetch(
		new URL("./data/depth.11bit.raw", import.meta.url),
	).then((response) => response.arrayBuffer());

	const irBuffer = await fetch(
		new URL("./data/infrared.10bit.raw", import.meta.url),
	).then((response) => response.arrayBuffer());

	const depthOut = new ArrayBuffer(
		640 * 480 * 4 * Float16Array.BYTES_PER_ELEMENT,
	);
	const irOut = new ArrayBuffer(640 * 488 * 4 * Float16Array.BYTES_PER_ELEMENT);

	bench(
		"gray11",
		() => void unpackGrayToRgbaFloat16(11, depthBuffer, depthOut),
	);

	bench("gray10", () => void unpackGrayToRgbaFloat16(10, irBuffer, irOut));
});

describe("deraw color", async () => {
	const yuvBuffer = await fetch(
		new URL("./data/yuv.raw", import.meta.url),
	).then((response) => response.arrayBuffer());

	const bayerBuffer = await fetch(
		new URL("./data/bayer.raw", import.meta.url),
	).then((response) => response.arrayBuffer());

	const yuvOut = new ArrayBuffer(
		640 * 480 * 4 * Float16Array.BYTES_PER_ELEMENT,
	);

	const bayerOut = new ArrayBuffer(
		640 * 480 * 4 * Float16Array.BYTES_PER_ELEMENT,
	);

	bench("yuv", () => void yuvToRgbaFloat16(yuvBuffer, yuvOut));

	bench("bayer", () => void bayerToRgbaFloat16(640, bayerBuffer, bayerOut));
});
