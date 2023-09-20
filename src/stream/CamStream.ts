import type { CamMode } from "../Camera/mode";
import type { CamIsoPacket } from "./isochronousTypes";
import type { ToRgbaBuffer } from "./format";

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
	private rawFrameStream: ReadableStream<ArrayBuffer>;

	rawDeveloper?: CamFrameDeveloper;
	private abortDeraw?: AbortController;
	private rawFrameSink?: WritableStream<ArrayBuffer>;
	private imageStream?: ReadableStream<ImageData>;

	constructor(
		deraw = true as CamFrameDeveloper | ToRgbaBuffer | boolean,
		packets?: ReadableStream<CamIsoPacket>,
	) {
		this._mode = MODE_OFF;

		if (deraw)
			this.rawDeveloper =
				deraw instanceof CamFrameDeveloper
					? deraw
					: new CamFrameDeveloper(
							this._mode,
							deraw === true ? undefined : deraw,
					  );

		this.frameAssembler = new CamFrameAssembler(this._mode);
		const { readable: rawStream, writable: packetSink } = new TransformStream(
			this.frameAssembler,
		);
		this.rawFrameStream = rawStream;
		this.packetSink = packetSink;

		this.packetStream = packets;
		if (this.packetStream) this.packetStream.pipeTo(this.packetSink);

		if (this.rawDeveloper) this.initRawDeveloper();
	}

	set deraw(onofffn: boolean | ToRgbaBuffer | CamFrameDeveloper) {
		if (onofffn === true) {
			if (this.rawDeveloper) this.rawDeveloper.customFn = undefined;
			else {
				this.rawDeveloper = new CamFrameDeveloper(this._mode);
				this.initRawDeveloper();
			}
		} else if (onofffn === false) {
			this.abortDeraw?.abort();
			this.rawDeveloper = undefined;
		} else if (onofffn instanceof CamFrameDeveloper) {
			this.abortDeraw?.abort();
			this.rawDeveloper = onofffn;
			this.initRawDeveloper();
		} else if (typeof onofffn === "function") {
			if (!this.rawDeveloper) {
				this.rawDeveloper = new CamFrameDeveloper(this._mode);
				this.initRawDeveloper();
			}
			this.rawDeveloper.customFn = onofffn;
		}
	}

	get readable() {
		return this.imageStream ?? this.rawFrameStream;
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

	initRawDeveloper() {
		this.abortDeraw = new AbortController();
		const { readable: imageStream, writable: rawFrameSink } =
			new TransformStream(this.rawDeveloper);
		this.imageStream = imageStream;
		this.rawFrameSink = rawFrameSink;
		this.rawFrameStream.pipeTo(this.rawFrameSink, {
			signal: this.abortDeraw.signal,
		});
	}
}
