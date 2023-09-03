import type { CamMode } from "../util/CamMode";
import { selectFrameSize } from "../util/CamMode";
import { CamFrameAssembler } from "./CamFrameAssembler";
import { CamIsoPacket } from "./CamIsoParser";

import { CamCanvas } from "../util/CamCanvas";

export class CamStream implements ReadableStream<ArrayBuffer> {
	private frameAssembler: CamFrameAssembler;
	private _mode: CamMode;

	private frameStream: ReadableStream<ArrayBuffer>;
	private packetSink: WritableStream<CamIsoPacket>;

	constructor(mode: CamMode, packetStream?: ReadableStream<CamIsoPacket>) {
		this._mode = mode;
		this.frameAssembler = new CamFrameAssembler(selectFrameSize(mode));
		const { readable, writable } = new TransformStream(this.frameAssembler);

		this.frameStream = readable;
		this.packetSink = writable;
		packetStream?.pipeTo(this.packetSink);

		this.getReader = this.frameStream.getReader.bind(this.frameStream);
		this.cancel = this.frameStream.cancel.bind(this.frameStream);
		this.pipeTo = this.frameStream.pipeTo.bind(this.frameStream);
		this.pipeThrough = this.frameStream.pipeThrough.bind(this.frameStream);
		this.tee = this.frameStream.tee.bind(this.frameStream);
	}

	getReader: typeof this.frameStream.getReader;
	pipeTo: typeof this.frameStream.pipeTo;
	pipeThrough: typeof this.frameStream.pipeThrough;
	tee: typeof this.frameStream.tee;
	cancel: typeof this.frameStream.cancel;

	get locked(): typeof this.frameStream.locked {
		return this.frameStream.locked;
	}

	get readable() {
		return this.frameStream;
	}

	get writable() {
		return this.packetSink;
	}

	get mode() {
		return this._mode;
	}

	set mode(mode: CamMode) {
		this._mode = mode;
		this.frameAssembler.frameSize = selectFrameSize(mode);
	}

	getCanvas() {
		return CamCanvas.create(this._mode, this.frameStream);
	}
}
