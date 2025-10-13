export enum CamCmdMagic {
	COMMAND_OUT = 0x4d47,
	COMMAND_IN = 0x4252,
}

export enum CamIsoMagic {
	ISOCHRONOUS_IN = 0x5242,
}

export enum CamUsbCommand {
	READ_REGISTER = 0x02,
	WRITE_REGISTER = 0x03,
	ZEROPLANE = 0x04,
	REGISTRATION = 0x16,
	CMOS = 0x95,
}

// hardware register addresses
export enum CamRegister {
	VIDEO_TYPE = 0x05,
	DEPTH_TYPE = 0x06,

	VISIBLE_FMT = 0x0c,
	VISIBLE_RES = 0x0d,
	VISIBLE_FPS = 0x0e,

	DEPTH_FMT = 0x12,
	DEPTH_RES = 0x13,
	DEPTH_FPS = 0x14,

	INFRARED_BRIGHTNESS = 0x15, // 1 to 50

	DEPTH_FLIP = 0x17,

	INFRARED_FMT = 0x19,
	INFRARED_RES = 0x1a,
	INFRARED_FPS = 0x1b,

	VISIBLE_FLIP = 0x47,
	INFRARED_FLIP = 0x48,

	PROJECTOR_CYCLE = 0x105,
}

interface CamRegisters {
	[CamRegister.VIDEO_TYPE]: Cam.VISIBLE | Cam.INFRARED | Cam.OFF;
	[CamRegister.DEPTH_TYPE]: Cam.DEPTH | Cam.OFF;

	[CamRegister.VISIBLE_FMT]: CamFmtVisible;
	[CamRegister.VISIBLE_RES]: CamRes;
	[CamRegister.VISIBLE_FPS]: 15 | 30;

	[CamRegister.DEPTH_FMT]: CamFmtDepth;
	[CamRegister.DEPTH_RES]: CamRes;
	[CamRegister.DEPTH_FPS]: 15 | 30;

	/** 1 to 50 */
	[CamRegister.INFRARED_BRIGHTNESS]: number;

	[CamRegister.DEPTH_FLIP]: boolean;

	[CamRegister.INFRARED_FMT]: CamFmtInfrared;
	[CamRegister.INFRARED_RES]: CamRes;
	[CamRegister.INFRARED_FPS]: 15 | 30;

	[CamRegister.VISIBLE_FLIP]: boolean;
	[CamRegister.INFRARED_FLIP]: boolean;

	[CamRegister.PROJECTOR_CYCLE]: boolean;
}

export type CamRegisterValue<R extends CamRegister> =
	CamRegisters[R] extends boolean ? 1 | 0 : CamRegisters[R];

export enum CamFmtDepth {
	D_10B = 0b10,
	D_11B = 0b11,
}

export enum CamFmtVisible {
	BAYER_8B = 0x00,
	YUV_16B = 0x05,
}

export enum CamFmtInfrared {
	IR_10B = 0x00,
}

export enum Cam {
	OFF = 0,
	VISIBLE = 1,
	DEPTH = 2,
	INFRARED = 3,
}

export enum CamRes {
	QVGA = 0,
	VGA = 1,
	SXGA = 2,
}
export enum UsbControlCamera {
	CAMERA = 0x00,
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
