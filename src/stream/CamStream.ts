import type { CamMode } from "../Camera/mode";

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
		//mode: CamMode,
		deraw = true as CamFrameDeveloper | boolean,
		packets?: ReadableStream<CamIsoPacket>,
	) {
		this._mode = MODE_OFF as CamMode;
		this.packetStream = packets;

		this.frameAssembler = new CamFrameAssembler(this._mode);

		if (deraw === true) this.rawDeveloper = new CamFrameDeveloper(this._mode);
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

	set mode(m: CamMode) {
		// TODO: pause like UnderlyingIsochronousSource?
		console.log("setting mode", m);
		this._mode = m;
		this.frameAssembler.mode = m;
		if (this.rawDeveloper) this.rawDeveloper.mode = m;
	}
}
