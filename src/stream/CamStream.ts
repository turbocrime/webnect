import type { CamMode } from "../util/mode";
import { selectFrameSize, STREAM_OFF } from "../util/mode";
import { CamFrameAssembler } from "./CamFrameAssembler";
import { CamIsoPacket } from "./CamIsoParser";

//import { CamCanvas } from "../util/CamCanvas";
import { selectFnToRgba } from "../index";
import { RESOLUTIONS } from "../index";

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

		this.frameAssembler = new CamFrameAssembler(selectFrameSize(this._mode));

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
		this.frameAssembler.frameSize = selectFrameSize(mode);
		if (this.rawDeveloper) this.rawDeveloper.mode = mode;
	}
}

type ToRgba = (b: ArrayBuffer) => Uint8ClampedArray;
export class CamFrameDeveloper implements Transformer<ArrayBuffer, ImageData> {
	private _mode: CamMode;
	private _customFn?: ToRgba;
	private rawToRgba: ToRgba;

	frameWidth: number;

	constructor(mode: CamMode, customFn?: (r: ArrayBuffer) => Uint8ClampedArray) {
		this._mode = mode;
		this._customFn = customFn;
		this.rawToRgba = customFn ?? selectFnToRgba(mode)!;
		this.frameWidth = (RESOLUTIONS[mode.res] ?? [640, 480])[0];
	}

	get mode() {
		return this._mode;
	}

	set mode(newMode: CamMode) {
		this._mode = newMode;
		this.rawToRgba = this.customFn ?? selectFnToRgba(this._mode)!;
		this.frameWidth = (RESOLUTIONS[newMode.res] ?? [640, 480])[0];
	}

	set customFn(newCustomFn: ToRgba) {
		this._customFn = newCustomFn;
		this.rawToRgba = this.customFn ?? selectFnToRgba(this._mode)!;
	}

	get customFn(): ToRgba | undefined {
		return this._customFn;
	}

	transform(raw: ArrayBuffer, c: TransformStreamDefaultController<ImageData>) {
		c.enqueue(new ImageData(this.rawToRgba(raw), this.frameWidth));
	}
}
