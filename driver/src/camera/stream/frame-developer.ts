import type { RawToRgba } from "../deraw/raw-to-rgba.js";
import { selectRawToRgba } from "../deraw/select-format.js";
import type { CamMode } from "../mode.js";

/**
 * Processes raw camera frames into RGBA format.
 *
 * @note No longer used
 */
export class CamFrameDeveloper<M extends CamMode>
	implements Transformer<ArrayBuffer, ArrayBuffer>
{
	/**
	 * @param mode Camera mode configuration
	 * @param rawToRgba Raw to RGBA conversion function
	 */
	constructor(
		public readonly mode: NonNullable<M>,
		private readonly rawToRgba: RawToRgba = selectRawToRgba(mode),
	) {}

	transform(
		rawFrame: ArrayBuffer,
		c: TransformStreamDefaultController<ArrayBuffer>,
	) {
		c.enqueue(this.rawToRgba(rawFrame).transfer());
	}
}
