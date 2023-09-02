export type OFF = 0;
export const OFF = 0 as OFF;
export type ON = 1;
export const ON = 1 as ON;

export enum CamUsbControl {
	CAMERA = 0x00,
}

export enum CamUsbCommand {
	READ_REGISTER = 0x02,
	WRITE_REGISTER = 0x03,
	ZEROPLANE = 0x04,
	REGISTRATION = 0x16,
	CMOS = 0x95,
}

export enum CamOption {
	// register addresses
	PROJECTOR_CYCLE = 0x105,

	VIDEO_ACTIVE = 0x05, // VIS | IR
	DEPTH_ACTIVE = 0x06, // DEPTH

	VIS_FORMAT = 0x0c,
	VIS_RES = 0x0d,
	VIS_FPS = 0x0e,

	DEPTH_FORMAT = 0x12,
	DEPTH_RES = 0x13,
	DEPTH_FPS = 0x14,

	IR_BRIGHTNESS = 0x15,

	IR_FORMAT = 0x19,
	IR_RES = 0x1a,
	IR_FPS = 0x1b,

	DEPTH_FLIP = 0x17,
	VIS_FLIP = 0x47,
	IR_FLIP = 0x48,
}

export enum CamFPS {
	F_15P = 15,
	F_30P = 30,
}

export enum CamFormatDepth {
	D_11B = 0b11,
	D_10B = 0b10,
}

export enum CamFormatVisible {
	BAYER_8B = 0x00,
	YUV_16B = 0x05,
}

export enum CamFormatInfrared {
	IR_10B = 0x00,
}

export enum CamType {
	VIS = 0b001,
	DEPTH = 0b010,
	IR = 0b011,
}

// Some res/video combos are incompatible, actual output res may vary.
export enum CamResolution {
	LOW = 0, // QVGA
	MED = 1, // VGA
	HIGH = 2, // SXGA
}

export enum CamCMOSOption {
	WHITEBALANCE_MANUAL = 1 << 15,
	EXPOSURE_AUTO = 1 << 14, // important
	DEFECT_CORRECTION = 1 << 13,
	//UNKNOWN_12 = 1 << 12,
	//UNKNOWN_11 = 1 << 11,
	LENS_SHADING = 1 << 10,
	//UNKNOWN_9 = 1 << 9,
	//UNKNOWN_8 = 1 << 8,
	ANTIFLICKER = 1 << 7, // important
	//UNKNOWN_6 = 1 << 6,
	//UNKNOWN_5 = 1 << 5,
	COLOR_RAW = 1 << 4, // important
	EXPOSURE_WEIGHTED = 1 << 3,
	EXPOSURE_WINDOW = 1 << 2,
	WHITEBALANCE_AUTO = 1 << 1, // important
}

// endpoint reports support for a larger max, but iso transfer always sends these.
// this size includes the 12-byte header.
export enum CamIsoPacketSize {
	VIDEO = 1920,
	DEPTH = 1760,
}

export enum CamIsoPacketFlag {
	VIDEO = 0b1000_0000,
	DEPTH = 0b0111_0000,
	START = 0b0000_0001,
	MID = 0b0000_0010,
	END = 0b0000_0101,
}

// usb endpoint id, not an array index
export enum CamUsbEndpoint {
	VIDEO = 0x01,
	DEPTH = 0x02,
}
