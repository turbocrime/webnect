const PKT_MAGIC = 0x5242;
const HDR_SIZE = 12;

enum KinectFrameSize {
	// TODO: more modes
	DEPTH_11B = 422400, // (640 * 480 * 11) / 8
}

// endpoint specifies a larger max, but iso transfer sends these.
// this size includes the header.
enum KinectPacketSize {
	DEPTH = 1760,
	VIDEO = 1920,
}

enum KinectPacketType {
	DEPTH = 0x70,
	VIDEO = 0x80,
	START = 0b001,
	MID = 0b010,
	END = 0b101,
}

export class KinectStream {
	dev: USBDevice;
	endP: USBEndpoint;
	abortController: AbortController;

	packetType: KinectPacketType;
	frameSize: KinectFrameSize;
	packetSize: KinectPacketSize;
	packetLoss: number;

	sync: boolean;
	seq: number;
	stats: {
		parsed: number;
		valid: number;
		used: number;
		skipped: number;
	};

	constructor(dev: USBDevice, endP: USBEndpoint) {
		this.dev = dev;
		this.endP = endP;
		this.abortController = new AbortController();
		this.packetType = KinectPacketType.DEPTH;
		this.packetSize = KinectPacketSize.DEPTH;
		this.frameSize = KinectFrameSize.DEPTH_11B;
		this.sync = false;
		this.packetLoss = 0;
		this.seq = 0;
		this.stats = { parsed: 0, valid: 0, used: 0, skipped: 0 };
	}

	// rome-ignore lint/suspicious/noExplicitAny: abort for any reason
	abort(reason?: any) {
		this.abortController.abort(reason);
	}

	// rome-ignore lint/suspicious/noExplicitAny: desync for any reason
	desync(...reasons: any) {
		this.sync = false;
		console.warn("desync", this.seq, ...reasons);
	}

	async *stream() {
		const process = (pkt: USBIsochronousInTransferPacket) => {
			const BUF_SIZE = pkt.data!.buffer.byteLength;
			const PKT_OFFSET = pkt.data!.byteOffset;
			const PKT_SIZE = pkt.data!.byteLength;

			if (PKT_SIZE < HDR_SIZE) return {};
			if (BUF_SIZE < PKT_OFFSET + PKT_SIZE) return {};

			const pH = pkt.data!.buffer.slice(PKT_OFFSET, PKT_OFFSET + HDR_SIZE);
			const pB = pkt.data!.buffer.slice(
				PKT_OFFSET + HDR_SIZE,
				PKT_OFFSET + PKT_SIZE,
			);

			const pHeader = new DataView(pH);
			const pBody = new DataView(pB);

			const pMagic = pHeader.getUint16(0);
			const pType: KinectPacketType = pHeader.getUint8(3);
			const pSeq = pHeader.getUint8(5);
			const pSize: number = pHeader.getUint16(6); // includes header
			//const pTime = pHeader.getUint32(8);

			if (pMagic !== PKT_MAGIC) return {};
			if (!(pType & this.packetType)) return {};
			if (pSize !== pBody.byteLength + HDR_SIZE) return {};

			const startFrame = pType === (this.packetType | KinectPacketType.START);
			const endFrame = pType === (this.packetType | KinectPacketType.END);

			if (startFrame) {
				if (!this.sync) console.info("stream sync, seq", pSeq);
				this.sync = true;
				this.seq = pSeq;
			}

			this.packetLoss = pSeq - this.seq;
			if (this.sync) {
				this.seq = pSeq;
				if (Math.abs(this.packetLoss) > 3 && this.packetLoss !== 255)
					this.desync(
						"packet loss",
						this.packetLoss,
						KinectPacketType[pType - this.packetType],
					);
			}

			if (!this.sync) return {};

			return {
				pBody,
				pSeq,
				startFrame,
				endFrame,
			};
		};

		const frame = new Uint8Array(this.frameSize);
		let frameIdx = 0;
		while (!this.abortController.signal.aborted) {
			const transfer = await this.dev.isochronousTransferIn(
				this.endP.endpointNumber,
				Array(512).fill(this.endP.packetSize),
				// TODO: number requested is arbitrary, and it never actually reaches packetSize??
			);
			for (const pkt in transfer.packets) {
				this.stats.parsed++;
				this.seq = (this.seq + 1) % 256;
				const { pBody, startFrame, endFrame } = process(transfer.packets[pkt]);
				if (pBody) {
					this.stats.valid++;
					const remaining = frame.byteLength - frameIdx;
					if (startFrame) frameIdx = 0;
					else if (remaining < pBody.byteLength) {
						this.desync("long frame", {
							frameIdx,
							remaining,
							pBody: pBody.byteLength,
							stats: this.stats,
						});
						//yield frame.slice(0, frameIdx);
						//debugger;
						frameIdx = 0;
						continue;
					}
					frame.set(new Uint8Array(pBody.buffer), frameIdx);
					this.stats.used++;
					frameIdx += pBody.byteLength;
					if (endFrame && this.sync) {
						if (frameIdx < this.frameSize)
							this.desync("short frame", {
								frameIdx,
								remaining,
								stats: this.stats,
							});
						else yield frame.slice(0, frameIdx);
						frameIdx = 0;
					}
				}
			}
		}
	}
}
