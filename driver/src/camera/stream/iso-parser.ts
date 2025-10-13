import { usbInOk } from "../../util/usb-ok.js";
import { CamIsoMagic } from "../enum.js";
import type { CamIsoFramePosition, CamIsoStreamFlag } from "./enum.js";

export const HEADER_BYTES = 12;

/** Parsed ISO packet */
export type CamIsoPacket = {
	magic: number;
	stream: CamIsoStreamFlag;
	segment: CamIsoFramePosition;
	sequence: number;
	packetSize: number;
	time: number;
	body: ArrayBuffer;
};

/** Parses ISO packets from USB isochronous transfers */
export class CamIsoStream
	implements Transformer<USBIsochronousInTransferResult, CamIsoPacket>
{
	/**
	 * @param streamFlag Stream type to filter for
	 */
	constructor(private readonly streamFlag: CamIsoStreamFlag) {}

	async transform(
		usbResult: USBIsochronousInTransferResult,
		cont: TransformStreamDefaultController<CamIsoPacket>,
	) {
		for (const pkt of usbResult.packets) {
			const data = usbInOk(pkt);
			if (!data.byteLength) {
				continue;
			}

			if (data.getUint16(0) !== CamIsoMagic.ISOCHRONOUS_IN) {
				/*
				// sometimes it's not present, sometimes it's offset by 4 bytes?
				if (data.getUint16(4) === CamIsoMagic.ISOCHRONOUS_IN) {
					console.debug(
						"magic offset, discarding head",
						data.buffer.slice(data.byteOffset, data.byteOffset + 4),
					);
					data = new DataView(
						data.buffer,
						data.byteOffset + 4,
						data.byteLength - 4,
					);
				} else {
					continue;
				}
				*/
				continue;
			}

			const header = this.parseHeader(data);

			if (header.stream !== this.streamFlag) {
				console.debug(
					"skip stream",
					header.stream,
					{ header },
					data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
				);
				continue;
			}
			const body = data.buffer.slice(
				data.byteOffset + HEADER_BYTES,
				data.byteOffset + header.packetSize,
			);

			// console.debug( "packet sizes", header.packetSize, body.byteLength, CamIsoPacketSize.DEPTH,);

			cont.enqueue({ ...header, body });
		}
	}

	/**
	 * The isochronous packet header is 12 bytes of various big endian values.
	 *
	 * | index | field       | type    | value                                                         |
	 * |-------|-------------|---------|---------------------------------------------------------------|
	 * | 0     | magic       | u16     | {@link CamIsoMagic}                                           |
	 * | 2     | unknown     |         |                                                               |
	 * | 3     | flags       | u8      | high {@link CamIsoFramePosition} low {@link CamIsoStreamFlag} |
	 * | 4     | unknown     |         |                                                               |
	 * | 5     | sequence    | u8      | monotonic incrementing 0 to 255                               |
	 * | 6     | packetSize  | u16     | total size in bytes including header                          |
	 * | 8     | time        | u32     | timestamp                                                     |
	 *
	 */
	private parseHeader(data: DataView<ArrayBuffer>): Omit<CamIsoPacket, "body"> {
		const magic = data.getUint16(0); // magic

		// @ts-expect-error unknown data not used
		const _unknown1 = data.getUint8(2);

		const flags = data.getUint8(3); // stream and segment
		const [stream, segment] = [flags >> 4, flags & 0x0f];

		// @ts-expect-error unknown data not used
		const _unknown2 = data.getUint8(4);

		const sequence = data.getUint8(5); // sequence

		const packetSize = data.getUint16(6); // packetSize
		if (packetSize !== data.byteLength) {
			if (packetSize > data.byteLength) {
				throw new RangeError(
					`Bad packet length ${packetSize} > ${data.byteLength}`,
					{ cause: { pSize: packetSize, pkt: data } },
				);
			}
			console.debug(
				`packet size mismatch ${packetSize} < ${data.byteLength}, discarding tail`,
				data.buffer.slice(
					data.byteOffset + packetSize,
					data.byteOffset + data.byteLength,
				),
			);
		}

		const time = data.getUint32(8); // TODO

		return { magic, stream, segment, sequence, packetSize, time };
	}
}
