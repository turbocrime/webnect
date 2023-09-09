import type { CamIsoPacket } from "./CamIsoParser";

export class CamFrameAssembler implements Transformer<CamIsoPacket, ArrayBuffer> {
	private frameIdx = 0;
	private sync = false;

	private _frameSize: number;
	private frame: Uint8Array;

	constructor(frameSize?: number) {
		this._frameSize = frameSize ?? 0;
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

	private desync(reason: string) {
		if (this.sync) console.warn("desync", reason);
		this.sync = false;
	}

	private resync() {
		this.sync = true;
		this.frameIdx = 0;
	}

	set frameSize(frameSize: number) {
		this._frameSize = frameSize;
		this.frame = new Uint8Array(this.frameSize);
		this.desync("frame resize");
	}

	get frameSize() {
		return this._frameSize;
	}
}
