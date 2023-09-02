import { CamIsoPacketFlag } from "../kinect/enums";

export type SerializedUSBIsochronousInTransferResult = {
	serialized: true;
	data: ArrayBuffer;
	packets: Array<{
		byteOffset: number;
		byteLength: number;
		status: USBTransferStatus;
	}>;
};

export const serializeIso = (
	r: USBIsochronousInTransferResult,
): SerializedUSBIsochronousInTransferResult =>
	({
		serialized: true,
		data: r.data!.buffer,
		packets: r.packets.map((p) => ({
			byteOffset: p.data!.byteOffset,
			byteLength: p.data!.byteLength,
			status: p.status!,
		})),
	}) as const;

export type CamPacket = {
	stream: CamIsoPacketFlag;
	startFrame: boolean;
	endFrame: boolean;
	loss: number;
	header: CamPacketHeader;
	body: ArrayBuffer;
};

type CamPacketHeader = {
	pType: number;
	pSeq: number;
	pSize: number;
	pTime: number;
};

const CAMERA_PACKET_MAGIC = 0x5242;
const CAMERA_PACKET_HEADER_SIZE = 12;

export class CameraPacketTransformer
	implements
		Transformer<
			USBIsochronousInTransferResult | SerializedUSBIsochronousInTransferResult,
			CamPacket
		>
{
	seq: number;
	packetSize: number;
	packetType: CamIsoPacketFlag;

	constructor(packetType: CamIsoPacketFlag, packetSize: number) {
		this.packetType = packetType;
		this.seq = 0;
		this.packetSize = packetSize;
	}

	transform(
		chunk:
			| USBIsochronousInTransferResult
			| SerializedUSBIsochronousInTransferResult,
		c: TransformStreamDefaultController<CamPacket>,
	) {
		if ("serialized" in chunk) {
			// serialized usb transfer result
			const { packets, data } = chunk;
			for (const p of packets) {
				if (p.status !== "ok") continue;
				if (p.byteLength < CAMERA_PACKET_HEADER_SIZE) continue;
				const parsed = this.parsePacket(
					new DataView(data, p.byteOffset, p.byteLength),
				);
				if (parsed) c.enqueue(parsed);
			}
		} else if ("data" in chunk && "packets" in chunk) {
			// raw usb transfer result
			for (const p of chunk.packets) {
				if (p.status !== "ok") continue;
				if (!p.data || p.data.byteLength < CAMERA_PACKET_HEADER_SIZE) continue;
				const parsed = this.parsePacket(p.data);
				if (parsed) c.enqueue(parsed);
			}
		} else throw new TypeError("unknown chunk");
	}

	parseHeader = (pkt: DataView): CamPacketHeader | false =>
		CAMERA_PACKET_MAGIC === pkt.getUint16(0) && {
			// 2
			pType: pkt.getUint8(3),
			// 4
			pSeq: pkt.getUint8(5),
			pSize: pkt.getUint16(6),
			pTime: pkt.getUint32(8), // TODO: wtf
		};

	parseType = (pType: number) =>
		// high bits identify stream
		this.packetType === (pType & 0xf0) && {
			stream: this.packetType,
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
			seqDelta > 1
				? (seqDelta - 1) * (this.packetSize - CAMERA_PACKET_HEADER_SIZE)
				: 0;

		this.seq = pSeq;

		return {
			...packetType,
			loss,
			header: header,
			body: pktView.buffer.slice(
				pktView.byteOffset + CAMERA_PACKET_HEADER_SIZE,
				pktView.byteOffset + pSize,
			),
		};
	};
}
