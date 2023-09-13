export type CamIsoPacket = {
	readonly stream: number;
	readonly startFrame: boolean;
	readonly endFrame: boolean;
	readonly loss: number;
	readonly header: CamIsoPacketHeader;
	readonly body: ArrayBuffer;
};

export type CamIsoPacketHeader = {
	readonly pType: number;
	readonly pSeq: number;
	readonly pSize: number;
	readonly pTime: number;
};

export type SerializedUSBIsochronousInTransferResult = {
	readonly serialized: true;
	readonly data: ArrayBuffer;
	readonly packets: {
		readonly byteOffset: number;
		readonly byteLength: number;
		readonly status: USBTransferStatus;
	}[];
};
