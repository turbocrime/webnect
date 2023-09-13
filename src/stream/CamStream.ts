import type { CamMode } from "../Camera/mode";
import type { CamIsoPacket } from "./isochronousTypes";

import { MODE_OFF } from "../Camera/mode";
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
		mode = MODE_OFF as CamMode,
		deraw = true as CamFrameDeveloper | boolean,
		packets?: ReadableStream<CamIsoPacket>,
	) {
		this._mode = mode;

		if (deraw === true) this.rawDeveloper = new CamFrameDeveloper(this._mode);
		else if (deraw) this.rawDeveloper = deraw;

		this.frameAssembler = new CamFrameAssembler(this._mode);
		const { readable: rawStream, writable: packetSink } = new TransformStream(
			this.frameAssembler,
		);
		this.rawStream = rawStream;
		this.packetSink = packetSink;

		this.packetStream = packets;
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

	set mode(m: CamMode) {
		// TODO: pause like UnderlyingIsochronousSource?
		this._mode = m;
		this.frameAssembler.mode = m;
		if (this.rawDeveloper) this.rawDeveloper.mode = m;
	}
}
