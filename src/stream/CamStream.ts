import type { CamMode } from "../Camera/mode";
import type { CamIsoPacket } from "./CamIsoParser";

import { STREAM_OFF } from "../Camera/mode";
import { CamFrameAssembler } from "./CamFrameAssembler";
import { CamFrameDeveloper } from "./CamFrameDeveloper";

export class CamStream
	implements TransformStream<CamIsoPacket, ArrayBuffer | ImageData>
{
	private _mode: CamMode;

	private packetStream?: ReadableStream<CamIsoPacket>;

	frameAssembler: CamFrameAssembler;
	private packetSink: WritableStream<CamIsoPacket>;
	private rawStream: ReadableStream<ArrayBuffer>;

	rawDeveloper?: CamFrameDeveloper;
	private frameSink?: WritableStream<ArrayBuffer>;
	private imageStream?: ReadableStream<ImageData>;

	constructor(
		//mode: CamMode,
		deraw?: CamFrameDeveloper | boolean,
		packets?: ReadableStream<CamIsoPacket>,
	) {
		this._mode = STREAM_OFF as CamMode;
		this.packetStream = packets;

		this.frameAssembler = new CamFrameAssembler(this._mode);

		if (deraw == null || deraw === true)
			this.rawDeveloper = new CamFrameDeveloper(this._mode);
		else if (deraw) this.rawDeveloper = deraw;

		const { readable: rawStream, writable: packetSink } = new TransformStream(
			this.frameAssembler,
		);
		this.rawStream = rawStream;
		this.packetSink = packetSink;
		if (this.packetStream) this.packetStream.pipeTo(this.packetSink);

		if (this.rawDeveloper) {
			const { readable: imageStream, writable: frameSink } =
				new TransformStream(this.rawDeveloper);
			this.imageStream = imageStream;
			this.frameSink = frameSink;
			this.rawStream.pipeTo(this.frameSink);
		}
	}

	get readable() {
		return this.imageStream ?? this.rawStream;
	}

	get writable() {
		return this.packetSink;
	}

	get mode() {
		return this._mode;
	}

	set mode(mode: CamMode) {
		// TODO: pause like UnderlyingIsochronousSource?
		this._mode = mode;
		this.frameAssembler.mode = mode;
		if (this.rawDeveloper) this.rawDeveloper.mode = mode;
	}
}
