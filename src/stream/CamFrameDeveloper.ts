import type { CamMode } from "Camera";

import {
	CamType,
	CamFmtDepth,
	CamFmtInfrared,
	CamFmtVisible,
	RESOLUTION,
} from "Camera";

import fmt from "./format";

type ToRgba = (b: ArrayBuffer) => Uint8ClampedArray;

export const selectFnToRgba = (
	mode: CamMode,
): ((f: ArrayBuffer) => Uint8ClampedArray) => {
	const [width, height] = RESOLUTION[mode.res] ?? [640, 480];
	switch (mode.stream) {
		case CamType.VISIBLE:
			if (mode.format === CamFmtVisible.BAYER_8B)
				return (f) => fmt.bayerToRgba(width, height, f);
			else if (mode.format === CamFmtVisible.YUV_16B)
				return (f) => fmt.uyvyToRgba(width, height, f);
			break;
		case CamType.DEPTH:
			if (mode.format === CamFmtDepth.D_11B)
				return (f) => fmt.unpackGrayToRgba(11, f);
			else if (mode.format === CamFmtDepth.D_10B)
				return (f) => fmt.unpackGrayToRgba(10, f);
			break;
		case CamType.INFRARED:
			if (mode.format === CamFmtInfrared.IR_10B)
				return (f) => fmt.unpackGrayToRgba(10, f);
			break;
	}
	return (f: ArrayBuffer) => {
		console.error("untransformed buffer");
		return new Uint8ClampedArray(f);
	};
};

export class CamFrameDeveloper implements Transformer<ArrayBuffer, ImageData> {
	private _mode: CamMode;
	private _customFn?: ToRgba;
	private rawToRgba: ToRgba;

	frameWidth: number;

	constructor(mode: CamMode, customFn?: (r: ArrayBuffer) => Uint8ClampedArray) {
		this._mode = mode;
		this._customFn = customFn;
		this.rawToRgba = customFn ?? selectFnToRgba(mode)!;
		this.frameWidth = (RESOLUTION[mode.res] ?? [640, 480])[0];
	}

	get mode() {
		return this._mode;
	}

	set mode(newMode: CamMode) {
		this._mode = newMode;
		this.rawToRgba = this.customFn ?? selectFnToRgba(this._mode)!;
		this.frameWidth = (RESOLUTION[newMode.res] ?? [640, 480])[0];
	}

	set customFn(newCustomFn: ToRgba) {
		this._customFn = newCustomFn;
		this.rawToRgba = this.customFn ?? selectFnToRgba(this._mode)!;
	}

	get customFn(): ToRgba | undefined {
		return this._customFn;
	}

	transform(raw: ArrayBuffer, c: TransformStreamDefaultController<ImageData>) {
		c.enqueue(new ImageData(this.rawToRgba(raw), this.frameWidth));
	}
}
