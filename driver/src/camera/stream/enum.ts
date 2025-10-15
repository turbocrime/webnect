// endpoint reports support for a larger max, but always sends these.
// this size includes the 12-byte header.
export enum CamIsoPacketSize {
	VIDEO = 1920,
	DEPTH = 1760,
}

// usb endpoint id, not an array index
export enum CamIsoEndpoint {
	VIDEO = 0x01,
	DEPTH = 0x02,
}

export enum CamIsoInterface {
	CAMERA = 0,
}

export enum CamIsoStreamFlag {
	VIDEO = 0b1000,
	DEPTH = 0b0111,
}

export enum CamIsoFramePosition {
	START = 0b0001,
	MID = 0b0010,
	END = 0b0101,
}
