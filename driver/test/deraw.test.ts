import { beforeEach, describe, expect, test } from "vitest";
import {
	bayerToRgbaFloat16,
	unpackGrayToRgbaFloat16,
	yuvToRgbaFloat16,
} from "../src/camera/deraw/formats.js";
import {
	MODE_DEPTH,
	MODE_INFRARED,
	MODE_VISIBLE_BAYER,
	MODE_VISIBLE_YUV,
} from "../src/camera/mode.js";
import { selectRes } from "../src/camera/stream/dimensions.js";

// available since chrome 140
declare global {
	interface Uint8Array {
		toBase64(): string;
	}
}

console.debug("chrome version", navigator.userAgent);

describe("deraw", () => {
	let testDiv: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let canvasContext: CanvasRenderingContext2D;

	document.body.style.width = "800px";

	beforeEach((ctx) => {
		testDiv = document.createElement("div");
		testDiv.id = ctx.task.name;
		testDiv.textContent = ctx.task.name;
		document.body.appendChild(testDiv);

		canvas = document.createElement("canvas");
		testDiv.appendChild(canvas);

		canvas.width = 640;
		canvas.height = 488;

		// biome-ignore lint/style/noNonNullAssertion: canvas should have a context
		canvasContext = canvas.getContext("2d")!;
	});

	test("depth 11bit", async () => {
		const [width, height] = selectRes(MODE_DEPTH);

		const rawBuffer = await fetch(
			new URL("./data/depth.11bit.raw", import.meta.url),
		).then((response) => response.arrayBuffer());

		const rgbaBuffer = unpackGrayToRgbaFloat16(11, rawBuffer);

		const imageData = new ImageData(
			new Float16Array(rgbaBuffer) as never,
			width,
			height,
			{ pixelFormat: "rgba-float16" } as never,
		);
		canvasContext.putImageData(imageData, 0, 0);

		expect(imageData.data.length).toMatchSnapshot();
		expect(
			new Uint8Array(
				canvasContext.getImageData(0, 0, width, height).data.buffer,
			).toBase64(),
		).toMatchSnapshot();
	});

	test("infrared 10bit", async () => {
		const [width, height] = selectRes(MODE_INFRARED);

		const rawBuffer = await fetch(
			new URL("./data/infrared.10bit.raw", import.meta.url),
		).then((response) => response.arrayBuffer());

		const rgbaBuffer = unpackGrayToRgbaFloat16(10, rawBuffer);

		const imageData = new ImageData(
			new Float16Array(rgbaBuffer) as never,
			width,
			height,
			{ pixelFormat: "rgba-float16" } as never,
		);
		canvasContext.putImageData(imageData, 0, 0);

		expect(imageData.data.length).toMatchSnapshot();
		expect(
			new Uint8Array(
				canvasContext.getImageData(0, 0, width, height).data.buffer,
			).toBase64(),
		).toMatchSnapshot();
	});

	test("yuv", async () => {
		const [width, height] = selectRes(MODE_VISIBLE_YUV);

		const rawBuffer = await fetch(
			new URL("./data/yuv.raw", import.meta.url),
		).then((response) => response.arrayBuffer());

		const rgbaBuffer = yuvToRgbaFloat16(rawBuffer);

		const imageData = new ImageData(
			new Float16Array(rgbaBuffer) as never,
			width,
			height,
			{ pixelFormat: "rgba-float16" } as never,
		);
		canvasContext.putImageData(imageData, 0, 0);

		expect(imageData.data.length).toMatchSnapshot();
		expect(
			new Uint8Array(
				canvasContext.getImageData(0, 0, width, height).data.buffer,
			).toBase64(),
		).toMatchSnapshot();
	});

	test("bayer", async () => {
		const [width, height] = selectRes(MODE_VISIBLE_BAYER);

		const rawBuffer = await fetch(
			new URL("./data/bayer.raw", import.meta.url),
		).then((response) => response.arrayBuffer());

		const rgbaBuffer = bayerToRgbaFloat16(640, rawBuffer);

		const imageData = new ImageData(
			new Float16Array(rgbaBuffer) as never,
			width,
			height,
			{ pixelFormat: "rgba-float16" } as never,
		);
		canvasContext.putImageData(imageData, 0, 0);

		expect(imageData.data.length).toMatchSnapshot();
		expect(
			new Uint8Array(
				canvasContext.getImageData(0, 0, width, height).data.buffer,
			).toBase64(),
		).toMatchSnapshot();
	});
});
