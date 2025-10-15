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

describe("deraw", () => {
	let canvasContext: CanvasRenderingContext2D;

	beforeEach((ctx) => {
		const testDiv = document.createElement("div");
		testDiv.id = ctx.task.id;
		testDiv.textContent = ctx.task.name;
		document.body.appendChild(testDiv);

		const canvas = document.createElement("canvas");
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

		const hashCanvas = await crypto.subtle.digest(
			"SHA-256",
			canvasContext.getImageData(0, 0, width, height).data,
		);
		expect(hashCanvas).toMatchSnapshot();
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

		const hashCanvas = await crypto.subtle.digest(
			"SHA-256",
			canvasContext.getImageData(0, 0, width, height).data,
		);
		expect(hashCanvas).toMatchSnapshot();
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

		const hashCanvas = await crypto.subtle.digest(
			"SHA-256",
			canvasContext.getImageData(0, 0, width, height).data,
		);
		expect(hashCanvas).toMatchSnapshot();
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

		const hashCanvas = await crypto.subtle.digest(
			"SHA-256",
			canvasContext.getImageData(0, 0, width, height).data,
		);
		expect(hashCanvas).toMatchSnapshot();
	});
});
