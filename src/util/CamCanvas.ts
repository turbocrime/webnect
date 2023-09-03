import type { CamMode } from "./CamMode";
import type { CamIsoPacket } from "../stream/CamIsoParser";
import { CamRes, OFF } from "../CamEnums";

import { selectFnToRgba, RESOLUTIONS } from "./FrameUtil";
import { selectFrameSize } from "./CamMode";

import { CamFrameAssembler } from "../stream/CamFrameAssembler";

export class CamCanvas extends OffscreenCanvas {
	private frameAssembler: CamFrameAssembler;
	private toRgba: (frame: ArrayBuffer) => Uint8ClampedArray;
	private _mode: CamMode = { stream: OFF } as CamMode;
	private packetSink: WritableStream<CamIsoPacket>;
	private frameStream: ReadableStream<ArrayBuffer>;

	private constructor(
		width: number,
		height: number,
		mode: CamMode,
		frameStream: ReadableStream<ArrayBuffer>,
	) {
		super(width, height);

		this._mode = mode;
		this.frameAssembler = new CamFrameAssembler(selectFrameSize(mode));
		this.toRgba = selectFnToRgba(mode)!;
		this.frameStream = frameStream;
	}

	static create(mode: CamMode, frameStream: ReadableStream<ArrayBuffer>) {
		const [width, height] = RESOLUTIONS[mode.res as CamRes];

		const newCanvas = new CamCanvas(width, height, mode, frameStream);
		newCanvas.streamImageData();
		return newCanvas;
	}

	streamImageData() {
		const ctx = this.getContext("2d");
		if (!ctx) throw new Error("Could not get rendering context");

		this.frameStream.pipeTo(
			new WritableStream<ArrayBuffer>({
				write: (chunk) =>
					ctx.putImageData(
						new ImageData(this.toRgba(chunk), this.width, this.height),
						0,
						0,
					),
			}),
		);
	}

	get mode() {
		return this._mode;
	}

	set mode(mode: CamMode) {
		this._mode = mode;
		this.toRgba = selectFnToRgba(mode)!;
	}
}
