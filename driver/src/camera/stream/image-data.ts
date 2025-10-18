import type { RawToRgba } from "../deraw/raw-to-rgba.js";
import { selectRawToRgba } from "../deraw/select-format.js";
import { Cam } from "../enum.js";
import type { CamMode } from "../mode.js";
import { selectRes } from "./dimensions.js";

/** Extends ImageData, and accepts a raw frame stream to continuosuly update the image */

const frameTimes: number[] = [];

const countFrame = () => {
	frameTimes.push(performance.now());
	if (frameTimes.length === 100) {
		// biome-ignore lint/style/noNonNullAssertion: ok
		const totalDiff = frameTimes[0]! - frameTimes[99]!;
		const diffs = [];
		let maxDiff = -Infinity;
		let minDiff = Infinity;
		for (let i = 1; i < frameTimes.length; i++) {
			// biome-ignore lint/style/noNonNullAssertion: ok
			const diff = frameTimes[i]! - frameTimes[i - 1]!;
			diffs.push(diff);
			maxDiff = Math.max(maxDiff, diff);
			minDiff = Math.min(minDiff, diff);
		}
		const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
		console.debug((1000 / avgDiff).toFixed(2), "fps");
		console.debug(
			"avg",
			avgDiff.toFixed(2),
			"max",
			maxDiff.toFixed(2),
			"min",
			minDiff.toFixed(2),
			"total",
			totalDiff,
		);
		frameTimes.length = 0;
	}
};

let odd = false;
export class CamImageData<M extends CamMode>
	extends ImageData
	implements UnderlyingSink<ArrayBuffer>
{
	/**
	 * @param mode Camera mode configuration
	 * @param rawToRgba Raw to RGBA conversion function
	 * @param superArgs ImageData constructor arguments
	 */
	constructor(
		public readonly mode: NonNullable<M>,
		private readonly rawToRgba: RawToRgba = selectRawToRgba(mode),
		...superArgs: [] | ConstructorParameters<typeof ImageData>
	) {
		if (!superArgs.length) {
			const [width, height] = selectRes(mode);
			const rgbaSize = width * height * 4;

			// supported by chrome but not known by typescript
			const data: ImageDataArray = new Float16Array(rgbaSize) as never;
			const settings: ImageDataSettings = {
				pixelFormat: "rgba-float16",
			} as never;

			superArgs = [data, width, height, settings];
		}
		super(...superArgs);

		console.debug(this.rawToRgba.name, this);
	}

	async write(rawFrame: ArrayBuffer) {
		odd = !odd;
		if (!odd) {
			countFrame();
			this.rawToRgba(rawFrame, this.data.buffer);
		}
	}
}

/**
 * Type guard to narrow by camera type
 */
export function isCamImageData<C extends Cam>(
	value: unknown,
	cam: C,
): value is C extends Cam.OFF ? undefined : CamImageData<CamMode<C>> {
	if (cam === Cam.OFF) {
		return value === undefined;
	}
	return (
		value instanceof CamImageData &&
		(value as CamImageData<CamMode>).mode.stream === cam
	);
}
