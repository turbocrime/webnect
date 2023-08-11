const PKT_MAGIC = 0x5242;
const HDR_SIZE = 12;

enum KinectFrameSize {
	// TODO: more modes
	DEPTH_11B = 422400, // (640 * 480 * 11) / 8
}

// endpoint specifies a larger max, but iso transfer sends these.
// this size includes the 12-byte header.
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
	iFIdx: number;
	ePIdx: number;
	devIdx: number;
	abortController: AbortController;

	packetType: KinectPacketType;
	frameSize: KinectFrameSize;
	packetSize: KinectPacketSize;
	batchSize: number;

	sync: boolean;
	time: number;
	seq: number;

	streamWorker: Worker;

	// rome-ignore lint/suspicious/noExplicitAny: <explanation>
	frameSizes: any;

	constructor(devIdx: number, iFIdx: number, ePIdx: number) {
		this.devIdx = devIdx;
		this.ePIdx = ePIdx;
		this.iFIdx = iFIdx;
		this.abortController = new AbortController();
		this.packetType = KinectPacketType.DEPTH;
		this.packetSize = KinectPacketSize.DEPTH;
		this.frameSize = KinectFrameSize.DEPTH_11B;
		this.frameSizes = [];
		this.batchSize = 512;
		this.sync = false;
		this.time = 0;
		this.seq = 0;

		this.streamWorker = new Worker(
			new URL("./kinectWorker.ts", import.meta.url),
		);
		console.log("created KinectStream", this);
	}

	// rome-ignore lint/suspicious/noExplicitAny: abort for any reason
	abort(reason?: any) {
		this.abortController.abort(reason);
	}

	// rome-ignore lint/suspicious/noExplicitAny: desync for any reason
	desync(...reasons: any) {
		this.sync = false;
		//console.warn("desync", this.seq, ...reasons);
	}

	resync(sequence: number) {
		this.sync = true;
		this.time = 0;
		this.seq = sequence;
		//console.info("resync", this.seq);
	}

	parsePacket(pkt: DataView) {
		console.log("parsePacket", pkt, pkt.getUint16(0));
		if (!pkt) return;
		if (pkt.byteLength < HDR_SIZE) return;
		if (pkt.getUint16(0) !== PKT_MAGIC) return;

		const pType: KinectPacketType = pkt.getUint8(3);
		if (pType >> 4 !== this.packetType >> 4) return;

		const pSeq = pkt.getUint8(5);

		const pSize = pkt.getUint16(6);
		//if (pSize !== pkt.byteLength) return;

		const pTime = pkt.getUint32(8);

		const startFrame = pType === (this.packetType | KinectPacketType.START);
		const midFrame = pType === (this.packetType | KinectPacketType.MID);
		const endFrame = pType === (this.packetType | KinectPacketType.END);

		if (startFrame) this.resync(pSeq);
		const seqDelta = Math.abs(pSeq - this.seq);
		this.seq = pSeq;

		if (this.time && this.time !== pTime)
			console.log("new timestamp", this.time, pTime);
		this.time = pTime;

		if (seqDelta % 255 > 5)
			this.desync(
				"packet loss",
				seqDelta,
				pSeq,
				KinectPacketType[pType - this.packetType],
			);

		return {
			pBody: pkt.buffer.slice(
				pkt.byteOffset + HDR_SIZE,
				pkt.byteOffset + pSize,
			),
			pType,
			pTime,
			pSeq,
			pSize,
			startFrame,
			endFrame,
		};
	}

	async launchStreamWorker() {
		console.log("streamWorker", this.streamWorker);

		const sW = this.streamWorker;

		const { readable, writable } = new TransformStream<
			ArrayBuffer,
			ArrayBuffer
		>();

		const workerInit: Promise<{
			type: "init";
			device: number;
			iface: number;
			endpoint: number;
			batchSize: number;
			packetSize: number;
		}> = new Promise((resolve) => {
			this.streamWorker.addEventListener("message", (event) => {
				console.log("streamWorker reply", event);
				if (event.data.type === "init") resolve(event.data);
			});
		});

		console.log("preparing device");
		const devs = await navigator.usb.getDevices();
		console.log("device number", this.devIdx);
		console.log("device", devs[this.devIdx]);
		const dev = devs[this.devIdx];
		if (dev.configuration?.interfaces[this.iFIdx].claimed) {
			console.log("releasing claimed interface...");
			await dev.releaseInterface(this.iFIdx);
			console.log("released");
		} else {
			console.log("interface is unclaimed, no release needed");
		}
		console.log("postMessage init");
		this.streamWorker.postMessage(
			{
				type: "init",
				packetSize: this.packetSize,
				device: 0,
				iFIdx: 0,
				ePIdx: 0,
				writable,
			},
			[writable],
		);

		const { batchSize, packetSize, ...bus } = await workerInit;
		this.batchSize = batchSize;
		this.packetSize = packetSize;

		console.log("kinectStream initted", {
			...bus,
			batchSize,
			packetSize,
		});

		this.streamWorker.postMessage({ type: "start" });

		return readable;
	}

	async *packets() {
		console.log("packets");
		const stream = await this.launchStreamWorker();
		console.log("stream", stream);
		const reader = stream.getReader();
		console.log("reader", reader);
		let t = await reader.read();
		console.log("initial read", t);
		do {
			console.log("iterate");
			t = await reader.read();
			console.log("iterate read", t);
			const tbuf = t.value;
			if (!tbuf) continue;
			let byteOffset = 0;
			while (byteOffset < t.value!.byteLength) {
				console.log("byteOffset", byteOffset);
				const pdv = new DataView(tbuf, byteOffset, this.packetSize);
				console.log("magic", pdv.getUint16(0));
				const pkt = this.parsePacket(pdv);
				console.log("pkt parsed", pkt);
				byteOffset += pkt?.pSize ?? this.packetSize;
				yield pkt;
			}
		} while (!t.done);
	}

	async *frames() {
		console.log("streaming");
		const frame = new Uint8Array(this.frameSize);
		let frameIdx = 0;
		for await (const pkt of this.packets()) {
			const { pBody, pType, pSeq, pTime, startFrame, endFrame } = pkt || {};
			if (!pBody) continue;
			const remaining = frame.byteLength - frameIdx;
			if (startFrame) {
				frameIdx = 0;
				this.frameSizes = [];
			}
			this.frameSizes.push({
				pType,
				pSeq,
				pTime,
				pBody: pBody.byteLength,
			});
			if (remaining < pBody.byteLength) {
				this.desync("long frame", {
					frameIdx,
					remaining,
					frameSizes: this.frameSizes,
				});
				frameIdx = 0;
				continue;
			}
			frame.set(new Uint8Array(pBody), frameIdx);
			frameIdx += pBody.byteLength;
			if (endFrame && this.sync) {
				if (frameIdx < this.frameSize)
					this.desync("short frame", {
						frameIdx,
						remaining,
						frameSizes: this.frameSizes,
					});
				else {
					console.log("frame successful", {
						frameIdx,
						remaining,
						frameSizes: this.frameSizes,
					});

					yield frame.slice(0, frameIdx);
				}
				frameIdx = 0;
				this.frameSizes = [];
			}
		}
	}
}
