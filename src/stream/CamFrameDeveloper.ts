import type { CamMode } from "../Camera/mode";
import type { ToRgbaBuffer } from "./format";

import {
	CamType,
	CamFmtDepth,
	CamFmtInfrared,
	CamFmtVisible,
	CamRes,
} from "../Camera/enum";

import fmt from "./format";

const outputRes = {
	[CamRes.LOW]: [320, 240],
	[CamRes.MED]: [640, 480],
	[CamRes.HIGH]: [1280, 1024],
} as Record<CamRes, [number, number]>;

export const selectFnToRgba = (mode: CamMode): ToRgbaBuffer => {
	const [width, height] = outputRes[mode.res] ?? [640, 480];
	let selectedFn = (f: ArrayBuffer, o?: ArrayBuffer) => {
		if (o == null) return f;
		const oA = new Uint32Array(o);
		const fA = new Uint32Array(f);
		oA.set(fA);
	};
	switch (mode.stream) {
		case CamType.VISIBLE:
			if (mode.format === CamFmtVisible.BAYER_8B)
				selectedFn = (f, o) => fmt.bayerToRgba(width, height, f, o);
			else if (mode.format === CamFmtVisible.YUV_16B)
				selectedFn = (f, o) => fmt.uyvyToRgba(width, height, f, o);
			break;
		case CamType.DEPTH:
			if (mode.format === CamFmtDepth.D_11B)
				selectedFn = (f, o) => fmt.unpackGrayToGamma(11, f, o);
			else if (mode.format === CamFmtDepth.D_10B)
				selectedFn = (f, o) => fmt.unpackGrayToGamma(10, f, o);
			break;
		case CamType.INFRARED:
			if (mode.format === CamFmtInfrared.IR_10B)
				selectedFn = (f, o) => fmt.unpackGrayToRgba(10, f, o);
			break;
	}
	return selectedFn as ToRgbaBuffer;
};

export class CamFrameDeveloper implements Transformer<ArrayBuffer, ImageData> {
	private _mode: CamMode;
	private _customFn?: ToRgbaBuffer;
	private rawToRgbaBuffer: ToRgbaBuffer;
	private frameImage?: ImageData;
	private rgba?: Uint8ClampedArray;

	frameWidth: number;

	constructor(mode: CamMode, customFn?: ToRgbaBuffer) {
		this._mode = mode;
		this._customFn = customFn;
		this.rawToRgbaBuffer = customFn ?? selectFnToRgba(mode)!;

		const r = outputRes[mode.res] ?? [640, 480];
		this.frameWidth = r[0];
	}

	get mode() {
		return this._mode;
	}

	set mode(newMode: CamMode) {
		this._mode = newMode;
		this.rawToRgbaBuffer = this.customFn ?? selectFnToRgba(this._mode)!;
		this.frameWidth = (outputRes[newMode.res] ?? [640, 480])[0];
		this.frameImage = undefined;
		this.rgba = undefined;
	}

	set customFn(newCustomFn: ToRgbaBuffer | undefined) {
		this._customFn = newCustomFn;
		this.rawToRgbaBuffer = this.customFn ?? selectFnToRgba(this._mode)!;
	}

	get customFn(): ToRgbaBuffer | undefined {
		return this._customFn;
	}

	transform(raw: ArrayBuffer, c: TransformStreamDefaultController<ImageData>) {
		if (this.rgba?.buffer) this.rawToRgbaBuffer(raw, this.rgba.buffer);
		else {
			this.rgba = new Uint8ClampedArray(this.rawToRgbaBuffer(raw)!);
			this.frameImage = new ImageData(this.rgba, this.frameWidth);
		}
		c.enqueue(this.frameImage);
	}
}
