import type { CamMode } from "../mode.js";
import { selectFrameSize } from "./dimensions.js";
import { CamIsoFramePosition } from "./enum.js";
import type { CamIsoPacket } from "./iso-parser.js";

/** Assembles ISO packets into complete raw frames */
export class CamFrameAssembler<M extends CamMode>
	implements Transformer<CamIsoPacket, ArrayBuffer>
{
	public readonly frameSize: number;

	private frame: Uint8Array<ArrayBuffer>;

	private frameIdx = 0;
	private sync = false;

	private desyncCount = 0;
	private seq?: number;

	private discardPackets = 2;

	private get remaining() {
		return this.frameSize - this.frameIdx;
	}

	/**
	 * @param mode Camera mode configuration
	 */
	constructor(public readonly mode: NonNullable<M>) {
		this.frameSize = selectFrameSize(mode);
		this.frame = new Uint8Array(this.frameSize);
	}

	async transform(
		{ body, ...header }: CamIsoPacket,
		c: TransformStreamDefaultController<ArrayBuffer>,
	) {
		let loss = 0;

		// before sequence is tracked
		if (this.seq == null) {
			// discard first two packets
			if (this.discardPackets) {
				this.discardPackets--;
				console.debug(
					"discard init",
					header.sequence,
					CamIsoFramePosition[header.segment],
				);
				return;
			} else {
				// keep the third packet
				console.debug(
					"keep init",
					header.sequence,
					CamIsoFramePosition[header.segment],
				);
			}
		} else {
			// detect dropped packets
			let step = header.sequence - this.seq;
			if (step < 0) {
				step += 256;
			}
			if (step !== 1) {
				loss = (step - 1) * body.byteLength;
				console.debug(
					`lost about ${loss} bytes skipping ${step - 1} from ${this.seq} to ${header.sequence}`,
				);
			}
		}

		// advance sequence
		this.seq = header.sequence;

		switch (header.segment) {
			case CamIsoFramePosition.START:
				if (this.remaining !== this.frameSize) {
					this.desync(
						`frame reset ${this.remaining} early out of ${this.frameSize}`,
					);
				}
				if (loss) {
					console.debug(`start loss ${loss} ignored at ${this.seq}`);
				}
				this.frameIdx = 0;
				this.sync = true;
				this.fill(body);
				break;
			case CamIsoFramePosition.MID:
				if (this.sync) {
					this.frameIdx += loss;
					this.fill(body);
				}
				break;
			case CamIsoFramePosition.END:
				if (this.sync) {
					this.frameIdx += loss;
					this.fill(body);
					if (this.remaining) {
						this.desync(
							`frame short by ${this.remaining} out of ${this.frameSize}`,
						);
					} else {
						c.enqueue(this.frame.buffer.transfer());
					}
					this.frame = new Uint8Array(this.frameSize);
					this.frameIdx = 0;
				}
				break;
			default:
				throw new TypeError(`Unknown frame segment ${header.segment}`, {
					cause: header,
				});
		}
	}

	private fill(body: ArrayBuffer) {
		if (body.byteLength <= this.remaining) {
			this.frame.set(new Uint8Array(body), this.frameIdx);
			this.frameIdx += body.byteLength;
		} else {
			this.desync(
				`frame long by ${body.byteLength - this.remaining} over ${this.frameSize}`,
			);
		}
	}

	private desync(reason: string) {
		if (this.sync) {
			this.desyncCount = 0;
		}
		this.desyncCount++;
		console.debug(`${this.desyncCount} desync`, reason);
		this.sync = false;
		this.frameIdx = 0;
	}
}
