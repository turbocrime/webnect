import type { CamPacket } from "./CameraPacketTransformer";

import type { KinectCameraMode } from "../kinect/KinectCamera";

import {
	CamResolution,
	CamType,
	CamVisibleFormat,
	CamDepthFormat,
	CamIRFormat,
	OFF,
} from "../kinect/enums";

// TODO: throw on invalid mode
export const selectFrameSize = ({
	stream,
	format,
	res,
}: Pick<KinectCameraMode, "stream" | "format" | "res">) => {
	const frameDimension = {
		[CamResolution.LOW]: 320 * 240,
		[CamResolution.MED]: 640 * 480,
		[CamResolution.HIGH]: 1280 * 1024,
	};

	const irFrameDimension = {
		...frameDimension,
		[CamResolution.MED]: 640 * 488,
	};

	const bitsPerPixel = {
		[(CamType.VISIBLE << 4) | CamVisibleFormat.BAYER_8B]: 8,
		[(CamType.VISIBLE << 4) | CamVisibleFormat.YUV_16B]: 16,
		[(CamType.DEPTH << 4) | CamDepthFormat.D_10B]: 10,
		[(CamType.DEPTH << 4) | CamDepthFormat.D_11B]: 11,
		[(CamType.IR << 4) | CamIRFormat.IR_10B]: 10,
	};
	switch (stream) {
		case CamType.VISIBLE:
			return (frameDimension[res] * bitsPerPixel[(stream << 4) | format]) / 8;
		case CamType.DEPTH:
			return (frameDimension[res] * bitsPerPixel[(stream << 4) | format]) / 8;
		case CamType.IR:
			return (irFrameDimension[res] * bitsPerPixel[(stream << 4) | format]) / 8;
		case OFF:
			return 0;
		default:
			throw new TypeError("Invalid stream type");
	}
};

export class CameraFrameTransformer
	implements Transformer<CamPacket, ArrayBuffer>
{
	frameSize: number;
	frame: Uint8Array;
	frameIdx: number;
	sync: boolean;

	constructor(frameSize: number) {
		this.frameSize = frameSize;
		this.frame = new Uint8Array(frameSize);
		this.frameIdx = 0;
		this.sync = false;
	}

	reconfigure(frameSize: number) {
		this.frameSize = frameSize;
		this.frame = new Uint8Array(frameSize);
		this.desync("resized frame");
	}

	transform(
		{ body, loss, startFrame, endFrame }: CamPacket,
		c: TransformStreamDefaultController<ArrayBuffer>,
	) {
		if (!this.frameSize) return;
		if (loss > this.frameSize - this.frameIdx) this.desync("lost frame");
		this.frameIdx += loss;
		if (startFrame) this.resync();
		if (body.byteLength > this.frameSize - this.frameIdx)
			this.desync("long frame");
		if (this.sync) {
			this.frame.set(new Uint8Array(body), this.frameIdx);
			this.frameIdx += body.byteLength;
		}
		if (endFrame) {
			if (this.frameSize > this.frameIdx) this.desync("short frame");
			if (this.sync) c.enqueue(this.frame.buffer.slice(0, this.frameIdx));
			this.frameIdx = 0;
		}
	}

	desync(reason: string) {
		if (this.sync) console.warn("desync", reason);
		this.sync = false;
	}

	resync() {
		this.sync = true;
		this.frameIdx = 0;
	}
}
