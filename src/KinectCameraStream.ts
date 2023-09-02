import type { KinectCameraMode } from "./KinectCamera";

import type { CamPacket } from "./streams/CameraPacketTransformer";

import {
	CameraFrameTransformer,
	selectFrameSize,
} from "./streams/CameraFrameTransformer";

import { OFF } from "./CameraEnums";

export class KinectCameraStream {
	private _packets?: ReadableStream<CamPacket>;
	private _mode: KinectCameraMode;
	private _frameSize: number;

	frames: ReadableStream<ArrayBuffer>;

	private packetSink: WritableStream<CamPacket>;
	private frameTransformer: CameraFrameTransformer;
	private frameTransformStream: TransformStream<CamPacket, ArrayBuffer>;

	constructor(
		mode = { stream: OFF } as KinectCameraMode,
		packetStream?: ReadableStream<CamPacket>,
	) {
		this._mode = mode;
		this._frameSize = selectFrameSize(mode);
		this.frameTransformer = new CameraFrameTransformer(selectFrameSize(mode));
		this.frameTransformStream = new TransformStream(this.frameTransformer);

		this.frames = this.frameTransformStream.readable;
		this.packetSink = this.frameTransformStream.writable;

		if (packetStream) {
			this._packets = packetStream;
			this._packets.pipeTo(this.packetSink);
		}
	}

	set mode(mode: KinectCameraMode) {
		this._mode = mode;
		this.frameSize = selectFrameSize(mode);
	}

	get mode() {
		return this._mode;
	}

	set frameSize(frameSize: number) {
		this._frameSize = frameSize;
		this.frameTransformer.reconfigure(frameSize);
	}

	get frameSize() {
		return this._frameSize;
	}

	set packets(packetStream: ReadableStream<CamPacket>) {
		this._packets = packetStream;
		this._packets.pipeTo(this.packetSink);
	}

	get packets(): ReadableStream<CamPacket> | undefined {
		return this._packets;
	}
}
