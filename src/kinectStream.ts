import type { SerializedIso, WorkerMsg, WorkerInitMsg } from "./kinectWorker";

const debug = undefined;
/*
const debug = {
	s: Array(),
	stat: (s: any) => debug.s?.push(s),
	anomaly: (reason: string, etc?: any) => {
		console.warn(reason, etc);
		debug.s?.push({ anomaly: reason, ...(etc ?? {}) });
	},
	reset: () => {
		debug.s = Array();
	},
};
*/

const PKT_MAGIC = 0x5242;
const HDR_SIZE = 12;

enum StreamFrameSize {
	// TODO: more modes
	DEPTH_11B = (640 * 480 * 11) / 8,
	DEPTH_10B = (640 * 480 * 10) / 8,
}

// endpoint specifies a larger max, but iso transfer sends these.
// this size includes the 12-byte header.
enum StreamPacketSize {
	DEPTH = 1760,
	VIDEO = 1920,
}

enum StreamPacketType {
	DEPTH = 0b0111_0000,
	VIDEO = 0b1000_0000,
	START = 0b001,
	MID = 0b010,
	END = 0b101,
}

type ParsedPacket = {
	pBody: ArrayBuffer;
	pLoss: number;
	startFrame: boolean;
	endFrame: boolean;
};

export class KinectStream {
	ifaceNum: number;
	endptNum: number;
	devIdx: number;

	packetType: StreamPacketType;
	frameSize: StreamFrameSize;
	packetSize: StreamPacketSize;
	batchSize: number;

	sync: boolean;
	time?: number;
	seq: number;

	usbWorker: Worker;

	constructor(devIdx: number, ifaceNum: number, endptNum: number) {
		this.devIdx = devIdx;
		this.ifaceNum = ifaceNum;
		this.endptNum = endptNum;

		this.frameSize = StreamFrameSize.DEPTH_11B;
		this.packetType = StreamPacketType.DEPTH;
		this.packetSize = StreamPacketSize.DEPTH;

		this.batchSize = 512;

		this.sync = false;
		this.seq = 0;

		this.usbWorker = new Worker(new URL("./kinectWorker.ts", import.meta.url));
	}

	close() {
		this.usbWorker.postMessage({ type: "close" } as WorkerMsg);
	}

	// rome-ignore lint/suspicious/noExplicitAny: desync for any reason
	desync(reason: any) {
		this.sync = false;
		debug && console.error("desync", this.seq, reason, debug?.s);
	}

	resync(sequence: number) {
		if (!this.sync) debug && console.debug("resync");
		debug?.reset();
		this.sync = true;
		this.time = undefined;
		this.seq = sequence;
	}

	parsePacket(pkt: DataView) {
		if (!pkt) return;
		if (pkt.byteLength < HDR_SIZE) return;
		if (pkt.getUint16(0) !== PKT_MAGIC) return;

		const pType: StreamPacketType = pkt.getUint8(3);
		if (pType >> 4 !== this.packetType >> 4) return;

		const pSeq = pkt.getUint8(5);

		const pSize = pkt.getUint16(6);
		if (pSize !== pkt.byteLength) return;

		const pTime = pkt.getUint32(8);

		const startFrame = pType === (this.packetType | StreamPacketType.START);
		//const midFrame = pType === (this.packetType | KinectPacketType.MID);
		const endFrame = pType === (this.packetType | StreamPacketType.END);

		if (startFrame) this.resync(pSeq);
		if (!this.sync) return;

		let seqDelta = pSeq - this.seq;
		if (seqDelta < 0) seqDelta += 256;
		this.seq = pSeq;

		const pLoss = seqDelta && (seqDelta - 1) * (this.packetSize - HDR_SIZE);
		if (pLoss) debug?.anomaly("packet loss", { seqDelta, pLoss });

		if (this.time && this.time !== pTime)
			debug?.anomaly("timestamp", { time: this.time, pTime });
		this.time = pTime;

		debug?.stat({ pType, pLoss, pSeq, pTime, pSize });

		return {
			pBody: pkt.buffer.slice(
				pkt.byteOffset + HDR_SIZE,
				pkt.byteOffset + pSize,
			),
			pLoss,
			startFrame,
			endFrame,
		};
	}

	async initWorker() {
		const workerInit: Promise<
			WorkerInitMsg & { batchSize: number; packetSize: number }
		> = new Promise((initReply) => {
			this.usbWorker.addEventListener("message", (event) => {
				switch (event.data?.type) {
					case "init":
						initReply(event.data);
						break;
					case "terminate":
						this.usbWorker.terminate();
						break;
					default:
						console.error("Unknown message in kinectStream", event);
						this.usbWorker.terminate();
						throw TypeError("Unknown message type");
				}
			});
		});

		this.usbWorker.postMessage({
			type: "init",
			packetSize: this.packetSize,
			dev: this.devIdx,
			iface: this.ifaceNum,
			endpt: this.endptNum,
		} as WorkerInitMsg);

		const { batchSize, packetSize, stream, ...bus } = await workerInit;
		this.batchSize = batchSize!;
		this.packetSize = packetSize!;

		return stream as ReadableStream<SerializedIso>;
	}

	async transform(isoStream: ReadableStream<SerializedIso>) {
		// TODO: there's gotta be problems with the desync/resync logic now that iteration is decoupled
		const packetTransformer = new TransformStream<SerializedIso, ParsedPacket>({
			transform: async (sIso, controller) => {
				if (!sIso) return;
				const { isoData, isoPackets } = sIso;
				for (const p of isoPackets)
					if (p.length)
						controller.enqueue(
							this.parsePacket(new DataView(isoData, p.offset, p.length)),
						);
			},
		});

		const frame = new Uint8Array(this.frameSize);
		let frameIdx = 0;
		const remaining = () => frame.byteLength - frameIdx;
		const frameTransformer = new TransformStream<ParsedPacket, ArrayBuffer>({
			transform: async (pkt, controller) => {
				if (!pkt) return;
				const { pBody, pLoss, startFrame, endFrame } = pkt || { pLoss: 0 };
				if (!pBody) return;
				if (remaining() < pLoss) controller.enqueue(frame.slice(0, frameIdx));
				frameIdx += pLoss;
				if (startFrame) frameIdx = 0;
				if (remaining() < pBody.byteLength) this.desync("long frame");
				if (this.sync) {
					frame.set(new Uint8Array(pBody), frameIdx);
					frameIdx += pBody.byteLength;
				}
				if (endFrame) {
					if (frameIdx < this.frameSize) this.desync("short frame");
					if (this.sync) controller.enqueue(frame.buffer.slice(0, frameIdx));
					frameIdx = 0;
				}
			},
		});

		return isoStream
			.pipeThrough(packetTransformer)
			.pipeThrough(frameTransformer);
	}

	async *frames() {
		// TODO: emit stream to caller
		const frameStream = await this.transform(await this.initWorker());
		const reader = frameStream.getReader();
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) return;
				yield value;
			}
		} finally {
			reader.releaseLock();
		}
	}
}
