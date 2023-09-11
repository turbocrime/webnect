import type { CamMode } from "../Camera/mode";

import {
	CamRes,
	CamType,
	CamFmtVisible,
	CamFmtDepth,
	CamFmtInfrared,
} from "../Camera/enum";

// TODO: throw invalid modes
export const selectFrameSize = ({
	stream,
	format,
	res,
}: Pick<CamMode, "stream" | "format" | "res">) => {
	const frameDimension = {
		[CamRes.LOW]: 320 * 240,
		[CamRes.MED]: 640 * 480,
		[CamRes.HIGH]: 1280 * 1024,
	};

	const irFrameDimension = {
		...frameDimension,
		[CamRes.MED]: 640 * 488,
		// TODO: other wierd ones?
	};

	const bitsPerPixel = {
		[(CamType.VISIBLE << 4) | CamFmtVisible.BAYER_8B]: 8,
		[(CamType.VISIBLE << 4) | CamFmtVisible.YUV_16B]: 16,
		[(CamType.DEPTH << 4) | CamFmtDepth.D_10B]: 10,
		[(CamType.DEPTH << 4) | CamFmtDepth.D_11B]: 11,
		[(CamType.INFRARED << 4) | CamFmtInfrared.IR_10B]: 10,
	};

	switch (stream) {
		case CamType.VISIBLE:
			return (frameDimension[res] * bitsPerPixel[(stream << 4) | format]) / 8;
		case CamType.DEPTH:
			return (frameDimension[res] * bitsPerPixel[(stream << 4) | format]) / 8;
		case CamType.INFRARED:
			return (irFrameDimension[res] * bitsPerPixel[(stream << 4) | format]) / 8;
		case CamType.NONE:
			return 0;
		default:
			throw new TypeError("Invalid stream type");
	}
};
export class CamFrameAssembler implements Transformer<CamIsoPacket, ArrayBuffer> {
	private frameIdx = 0;
	private sync = false;

	private _mode: CamMode;
	private frameSize: number;
	private frame: Uint8Array;

	constructor(mode: CamMode) {
		this._mode = mode;
		this.frameSize = selectFrameSize(mode) ?? 0;
		this.frame = new Uint8Array(this.frameSize);
	}

	transform(
		{ body, loss, startFrame, endFrame }: CamIsoPacket,
		c: TransformStreamDefaultController<ArrayBuffer>,
	) {
		if (!this.frameSize) return;
		if (loss > this.frameSize - this.frameIdx) this.desync("lost frame");
		this.frameIdx += loss;
		if (startFrame) this.resync();
		if (body.byteLength > this.frameSize - this.frameIdx)
			return this.desync("long frame");
		if (this.sync) {
			this.frame.set(new Uint8Array(body), this.frameIdx);
			this.frameIdx += body.byteLength;
		}
		if (endFrame) {
			if (this.frameSize > this.frameIdx) return this.desync("short frame");
			if (this.sync) c.enqueue(this.frame.buffer.slice(0, this.frameIdx));
			this.frameIdx = 0;
		}
	}

	private desync(reason: string) {
		if (this.sync) console.warn("desync", reason);
		this.sync = false;
		this.frameIdx = 0;
	}

	private resync() {
		this.sync = true;
		this.frameIdx = 0;
	}

	//set frameSize(frameSize: number) {
	set mode(m: CamMode) {
		this._mode = m;
		this.frameSize = selectFrameSize(m);
		this.frame = new Uint8Array(this.frameSize);
		console.log("new framesize", this.frameSize);
		this.desync("frame resize");
	}

	get mode() {
		return this._mode;
	}
}
