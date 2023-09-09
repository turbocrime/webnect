import { CamIsoPacketFlag, CamMagic } from "../enum/cam";
import { SerializedUSBIsochronousInTransferResult } from "./UnderlyingIsochronousSource";

export type CamIsoPacket = {
	stream: CamIsoPacketFlag;
	startFrame: boolean;
	endFrame: boolean;
	loss: number;
	header: CamIsoPacketHeader;
	body: ArrayBuffer;
};

type CamIsoPacketHeader = {
	pType: number;
	pSeq: number;
	pSize: number;
	pTime: number;
};

const PKT_HEADER_SIZE = 12;

export class CamIsoParser
	implements
		Transformer<
			USBIsochronousInTransferResult | SerializedUSBIsochronousInTransferResult,
			CamIsoPacket
		>
{
	seq: number;
	packetSize: number;
	packetFlag: CamIsoPacketFlag;

	constructor(packetFlag: CamIsoPacketFlag, packetSize: number) {
		this.seq = 0;
		this.packetSize = packetSize;
		this.packetFlag = packetFlag;
	}

	transform(
		chunk:
			| USBIsochronousInTransferResult
			| SerializedUSBIsochronousInTransferResult,
		c: TransformStreamDefaultController<CamIsoPacket>,
	) {
		if ("serialized" in chunk) {
			// a serialized usb transfer result
			const { packets, data } = chunk;
			for (const p of packets) {
				if (p.status !== "ok" || p.byteLength < PKT_HEADER_SIZE) continue;
				const parsed = this.parsePacket(
					new DataView(data, p.byteOffset, p.byteLength),
				);
				if (parsed) c.enqueue(parsed);
			}
		} else if ("data" in chunk && "packets" in chunk) {
			// a live usb transfer result
			for (const p of chunk.packets) {
				if (!p.data || p.status !== "ok" || p.data.byteLength < PKT_HEADER_SIZE)
					continue;
				const parsed = this.parsePacket(p.data);
				if (parsed) c.enqueue(parsed);
			}
		} else throw new TypeError("unknown chunk");
	}

	parseHeader = (pkt: DataView): CamIsoPacketHeader | false =>
		CamMagic.ISOCHRONOUS_IN === pkt.getUint16(0) && {
			// 2
			pType: pkt.getUint8(3),
			// 4
			pSeq: pkt.getUint8(5),
			pSize: pkt.getUint16(6),
			pTime: pkt.getUint32(8), // TODO: wtf
		};

	parseType = (pType: number) =>
		// high bits identify stream
		this.packetFlag === (pType & 0xf0) && {
			stream: this.packetFlag,
			// low bits indicate frame boundaries
			startFrame: (pType & 0x0f) === CamIsoPacketFlag.START,
			//midFrame: (pType & 0x0f) === CamIsoPacketFlag.MID,
			endFrame: (pType & 0x0f) === CamIsoPacketFlag.END,
		};

	parsePacket = (pktView: DataView) => {
		const header = this.parseHeader(pktView);
		if (!header) return; // not for us
		const { pType, pSeq, pSize } = header;

		if (pSize !== pktView.byteLength)
			return console.error("bad packet length", pktView.byteLength, header);

		const packetType = this.parseType(pType);
		if (!packetType) return; // not for us
		if (packetType.startFrame) this.seq = pSeq;

		let seqDelta = pSeq - this.seq;
		if (seqDelta < 0) seqDelta += 256;
		const loss =
			seqDelta > 1 ? (seqDelta - 1) * (this.packetSize - PKT_HEADER_SIZE) : 0;

		this.seq = pSeq;

		return {
			...packetType,
			loss,
			header: header,
			body: pktView.buffer.slice(
				pktView.byteOffset + PKT_HEADER_SIZE,
				pktView.byteOffset + pSize,
			),
		};
	};
}
