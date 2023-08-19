import { StreamPacketSize, StreamPacketType } from "./kinectEnum";

export type StreamPacket = {
	pBody: ArrayBuffer;
	pLoss: number;
	startFrame: boolean;
	endFrame: boolean;
};

export type SerializedUSBIsochronousInTransferResult = {
	isoData: ArrayBuffer;
	isoPackets: Array<{
		offset: number;
		length: number;
		status: USBTransferStatus;
	}>;
};

export class PacketTransformer
	implements Transformer<SerializedUSBIsochronousInTransferResult, StreamPacket>
{
	MAGIC = 0x5242;
	HEADER_SIZE = 12;

	packetSize: number;
	packetType: number;

	seq: number;

	constructor(packetType: StreamPacketType, packetSize: StreamPacketSize) {
		this.packetType = packetType;
		this.packetSize = packetSize;

		this.seq = 0;
	}

	transform(
		{ isoPackets, isoData }: SerializedUSBIsochronousInTransferResult,
		c: TransformStreamDefaultController<StreamPacket>,
	) {
		for (const p of isoPackets) {
			if (p.status !== "ok") continue;
			if (p.length < this.HEADER_SIZE) continue;
			const parsed = this.parsePacket(
				new DataView(isoData, p.offset, p.length),
			);
			if (parsed) c.enqueue(parsed);
		}
	}

	parseHeader = (pkt: DataView) =>
		this.MAGIC === pkt.getUint16(0) && {
			pType: pkt.getUint8(3),
			pSeq: pkt.getUint8(5),
			pSize: pkt.getUint16(6),
			pTime: pkt.getUint32(8),
		};

	parseType = (pType: number) =>
		// high bits identify stream
		pType >> 4 === this.packetType >> 4 && {
			// low bits are frame boundary sentinels
			startFrame: pType === (this.packetType | StreamPacketType.START),
			midFrame: pType === (this.packetType | StreamPacketType.MID),
			endFrame: pType === (this.packetType | StreamPacketType.END),
		};

	parsePacket = (pkt: DataView) => {
		const parsedHeader = this.parseHeader(pkt);
		if (!parsedHeader) return; // not for us
		const { pType, pSeq, pSize } = parsedHeader;

		if (pSize !== pkt.byteLength) {
			console.error("malformed packet", pkt.byteLength, parsedHeader);
			return;
		}

		const parsedType = this.parseType(pType);
		if (!parsedType) return; // not for us
		const { startFrame, endFrame } = parsedType;

		if (startFrame) this.seq = pSeq;

		let seqDelta = pSeq - this.seq;
		if (seqDelta < 0) seqDelta += 256;
		this.seq = pSeq;

		const pLoss =
			seqDelta > 1 ? (seqDelta - 1) * (this.packetSize - this.HEADER_SIZE) : 0;

		return {
			startFrame,
			endFrame,
			pBody: pkt.buffer.slice(
				pkt.byteOffset + this.HEADER_SIZE,
				pkt.byteOffset + pSize,
			),
			pLoss,
		};
	};
}

export class FrameTransformer implements Transformer<StreamPacket, ArrayBuffer> {
	frameSize: number;

	frame: Uint8Array;
	frameIdx: number;
	sync: boolean;

	constructor(frameSize: number) {
		this.frameSize = frameSize;

		this.frame = new Uint8Array(frameSize);
		this.frameIdx = 0;
		this.sync = false;
	}

	transform(
		{ pBody, pLoss, startFrame, endFrame }: StreamPacket,
		c: TransformStreamDefaultController<ArrayBuffer>,
	) {
		if (pLoss > this.frameSize - this.frameIdx) {
			if (this.sync) c.enqueue(this.frame.slice(0, this.frameIdx));
			this.desync("lost frame");
		}
		this.frameIdx += pLoss;
		if (startFrame) this.resync();
		if (pBody.byteLength > this.frameSize - this.frameIdx)
			this.desync("long frame");
		if (this.sync) {
			this.frame.set(new Uint8Array(pBody), this.frameIdx);
			this.frameIdx += pBody.byteLength;
		}
		if (endFrame) {
			if (this.frameIdx < this.frameSize) this.desync("short frame");
			if (this.sync) c.enqueue(this.frame.buffer.slice(0, this.frameIdx));
			this.frameIdx = 0;
		}
	}

	desync(reason: string) {
		if (this.sync) console.error("desync", reason);
		this.sync = false;
	}

	resync() {
		if (!this.sync) console.debug("resync");
		this.sync = true;
		this.frameIdx = 0;
	}
}
