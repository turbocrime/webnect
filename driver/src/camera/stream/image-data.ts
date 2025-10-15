import type { RawToRgba } from "../deraw/raw-to-rgba.js";
import { selectRawToRgba } from "../deraw/select-format.js";
import { Cam } from "../enum.js";
import type { CamMode } from "../mode.js";
import { selectRes } from "./dimensions.js";

/** Extends ImageData, and accepts a raw frame stream to continuosuly update the image */
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
		this.rawToRgba(rawFrame, this.data.buffer);
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
