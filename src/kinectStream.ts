const PKT_MAGIC = 0x5242;
const HDR_SIZE = 12;

type SerializedIso = {
	isoData: ArrayBuffer;
	isoPackets: Array<{
		offset: number;
		length: number;
		status: USBTransferStatus;
	}>;
};

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
	frameStats: any;

	constructor(devIdx: number, iFIdx: number, ePIdx: number) {
		this.devIdx = devIdx;
		this.ePIdx = ePIdx;
		this.iFIdx = iFIdx;
		this.abortController = new AbortController();
		this.packetType = KinectPacketType.DEPTH;
		this.packetSize = KinectPacketSize.DEPTH;
		this.frameSize = KinectFrameSize.DEPTH_11B;
		this.frameStats = [];
		this.batchSize = 512;
		this.sync = false;
		this.time = 0;
		this.seq = 0;

		this.streamWorker = new Worker(
			new URL("./kinectWorker.ts", import.meta.url),
		);
	}

	// rome-ignore lint/suspicious/noExplicitAny: abort for any reason
	abort(reason?: any) {
		this.abortController.abort(reason);
	}

	// rome-ignore lint/suspicious/noExplicitAny: desync for any reason
	desync(...reasons: any) {
		const anomalies = this.frameStats.filter((f: any) => f.anomaly);
		this.sync = false;
		console.error(
			`desync seq ${this.seq}`,
			...reasons,
			anomalies
				.map((a: any) => a.seqDelta - 1 || 0)
				.reduce((a: any, b: any) => a + b, 0),
		);
		console.debug(...reasons, ...anomalies, this.frameStats);
	}

	resync(sequence: number) {
		if (!this.sync) console.debug("resync");
		this.frameStats = [];
		this.sync = true;
		this.time = 0;
		this.seq = sequence;
	}

	parsePacket(pkt: DataView) {
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
		let seqDelta = pSeq - this.seq;
		if (seqDelta < 0) seqDelta += 256;

		const pLossFill = startFrame ? 0 : (seqDelta - 1) * (this.packetSize - 12);
		if (pLossFill) {
			this.frameStats.push({ anomaly: "packet loss", seqDelta, pLossFill });
		}

		this.seq = pSeq;

		if (this.time && this.time !== pTime) {
			this.frameStats.push({ anomaly: "timestamp changed" });
			console.warn("timestamp changed", this.time, pTime);
		}
		this.time = pTime;

		return {
			pBody: pkt.buffer.slice(
				pkt.byteOffset + HDR_SIZE,
				pkt.byteOffset + pSize,
			),
			pLossFill,
			pType,
			pTime,
			pSeq,
			pSize,
			startFrame,
			endFrame,
		};
	}

	async initWorker() {
		// TODO: proper backpressure, proper transforms
		const { readable, writable } = new TransformStream<
			SerializedIso,
			SerializedIso
		>(undefined, { highWaterMark: 3 }, { highWaterMark: 3 });

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
				else console.error("unexpected streamWorker message", event.data);
			});
		});

		console.log("preparing device for handoff to worker");
		const devs = await navigator.usb.getDevices();
		console.log("device number", this.devIdx, "of", devs);
		const dev = devs[this.devIdx];
		if (dev.configuration?.interfaces[this.iFIdx].claimed) {
			console.log("releasing claimed interface...");
			await dev.releaseInterface(this.iFIdx);
			console.log("released");
		} else {
			console.log("interface is unclaimed, no release needed");
		}
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

		return readable;
	}

	async *packets() {
		const stream = await this.initWorker();
		this.streamWorker.postMessage({ type: "start" });
		const reader = stream.getReader();
		let r: ReadableStreamReadResult<SerializedIso>;
		do {
			r = await reader.read();
			this.frameStats?.push({ anomaly: "transfer boundary" });
			if (!r.value) continue; // TODO: identify possible cases
			const { isoData, isoPackets } = r.value;
			for (const p of isoPackets)
				yield this.parsePacket(new DataView(isoData, p.offset, p.length));
		} while (!r.done);
		console.log("packets done");
	}

	async *frames() {
		const frame = new Uint8Array(this.frameSize);
		let frameIdx = 0;
		let remaining = frame.byteLength - frameIdx;
		for await (const pkt of this.packets()) {
			const { pBody, pLossFill, pType, pSeq, pTime, startFrame, endFrame } =
				pkt || { pLossFill: 0 };
			if (!pBody) continue;
			remaining = frame.byteLength - frameIdx;
			if (pLossFill && pLossFill < remaining) {
				frame.set(new Uint8Array(Array(pLossFill).fill(1)), frameIdx);
				frameIdx += pLossFill;
				remaining = frame.byteLength - frameIdx;
			}
			if (startFrame) {
				frameIdx = 0;
				remaining = frame.byteLength - frameIdx;
				this.frameStats = [];
			}
			this.frameStats.push({
				pTy: pType,
				pLF: pLossFill,
				pS: pSeq,
				pTi: pTime,
				pBL: pBody.byteLength,
				fIdx: frameIdx,
				r: remaining,
			});
			if (remaining < pBody.byteLength) {
				this.desync("long frame");
				// probably hit a frame boundary during transfer gap.
				// you should see timestamp changed.
				frameIdx = 0;
				continue;
			}
			frame.set(new Uint8Array(pBody), frameIdx);
			frameIdx += pBody.byteLength;
			remaining = frame.byteLength - frameIdx;
			if (endFrame && this.sync) {
				if (frameIdx < this.frameSize) this.desync("short frame", remaining);
				else yield frame.slice(0, frameIdx);
				frameIdx = 0;
				this.frameStats = [];
			}
		}
	}
}
