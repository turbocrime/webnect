export enum CamMagic {
	COMMAND_OUT = 0x4d47,
	COMMAND_IN = 0x4252,
	ISOCHRONOUS_IN = 0x5242,
}

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

// hardware register addresses
export enum CamOption {
	VIDEO_TYPE = 0x05, // VISIBLE | INFRARED
	DEPTH_TYPE = 0x06, // DEPTH

	VISIBLE_FMT = 0x0c,
	VISIBLE_RES = 0x0d,
	VISIBLE_FPS = 0x0e,

	DEPTH_FMT = 0x12,
	DEPTH_RES = 0x13,
	DEPTH_FPS = 0x14,

	INFRARED_BRIGHTNESS = 0x15,

	DEPTH_FLIP = 0x17,

	INFRARED_FMT = 0x19,
	INFRARED_RES = 0x1a,
	INFRARED_FPS = 0x1b,

	VISIBLE_FLIP = 0x47,
	INFRARED_FLIP = 0x48,

	PROJECTOR_CYCLE = 0x105,
}

export enum CamFps {
	F_15P = 15,
	F_30P = 30,
}

export enum CamFmtDepth {
	D_11B = 0b11,
	D_10B = 0b10,
}

export enum CamFmtVisible {
	BAYER_8B = 0x00,
	YUV_16B = 0x05,
}

export enum CamFmtInfrared {
	IR_10B = 0x00,
}

export enum CamType {
	NONE = 0,
	VISIBLE = 0b001,
	DEPTH = 0b010,
	INFRARED = 0b011,
}

// actual device output varies, generally gets chopped to standard
export enum CamRes {
	LOW = 0, // QVGA
	MED = 1, // VGA
	HIGH = 2, // SXGA
}

/*
// TODO: support cmos
// another set of hardware register addresses on the camera cmos
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
*/
