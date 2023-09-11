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

// iso packets contain identifiers
export enum CamIsoPacketFlag {
	VIDEO = 0b1000_0000,
	DEPTH = 0b0111_0000,
	START = 0b0000_0001,
	MID = 0b0000_0010,
	END = 0b0000_0101,
}
