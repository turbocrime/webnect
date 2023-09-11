declare type CamIsoPacket = {
	readonly stream: number;
	readonly startFrame: boolean;
	readonly endFrame: boolean;
	readonly loss: number;
	readonly header: CamIsoPacketHeader;
	readonly body: ArrayBuffer;
};

declare type CamIsoPacketHeader = {
	readonly pType: number;
	readonly pSeq: number;
	readonly pSize: number;
	readonly pTime: number;
};

declare type SerializedUSBIsochronousInTransferResult = {
	readonly serialized: true;
	readonly data: ArrayBuffer;
	readonly packets: {
		readonly byteOffset: number;
		readonly byteLength: number;
		readonly status: USBTransferStatus;
	}[];
};
