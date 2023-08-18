export enum KinectVendorId {
	MICROSOFT = 0x045e,
}

export enum KinectProductId {
	NUI_MOTOR = 0x02b0,
	NUI_CAMERA = 0x02ae,
	NUI_AUDIO = 0x02ad,
}

export enum CamUsbControl {
	CAMERA = 0x00,
}

export enum MotorUsbControl {
	SET_LED = 0x06,
	SET_TILT = 0x31,
	GET_STATE = 0x32,
}

export enum MotorServoState {
	IDLE = 0,
	LIMIT = 1,
	MOVING = 4,
}

export enum MotorLed {
	OFF = 0,
	GREEN = 1,
	RED = 2,
	AMBER = 3,
	BLINK_GREEN = 4,
	BLINK_GREEN_TOO = 5,
	BLINK_RED_AMBER = 6,
}

export enum CamUsbCommand {
	READ_REGISTER = 0x02,
	WRITE_REGISTER = 0x03,
	ZEROPLANE = 0x04,
	REGISTRATION = 0x16,
	CMOS = 0x95,
}

export enum CamRegAddr {
	PROJECTOR = 0x105,

	VIDEO_ACTIVE = 0x05, // CamModeActive  VISIBLE | IR
	DEPTH_ACTIVE = 0x06, // CamModeActive  DEPTH

	VISIBLE_FORMAT = 0x0c,
	VISIBLE_RES = 0x0d,
	VISIBLE_FPS = 0x0e,

	DEPTH_FORMAT = 0x12, // 0b11 11bit, 0b10 10bit
	DEPTH_RES = 0x13,
	DEPTH_FPS = 0x14,

	IR_BRIGHTNESS = 0x15,

	IR_FORMAT = 0x19,
	IR_RES = 0x1a,
	IR_FPS = 0x1b,

	DEPTH_FLIP = 0x17,
	VIDEO_FLIP = 0x47,
	IR_FLIP = 0x48,
}

export enum CamFPS {
	F_15P = 15,
	F_30P = 30,
}

export enum CamDepthFormat {
	D_11B = 0b11,
	D_10B = 0b10,
}

export enum CamVisibleFormat {
	BAYER_8B = 0x00,
	YUV_16B = 0x05,
}

export enum CamIRFormat {
	IR_10B = 0x00,
}

export enum CamFlagActive {
	VISIBLE = 0b001,
	DEPTH = 0b010,
	IR = 0b100,
}

// Some res/video combos are incompatible, actual output res may vary.
export enum CamResolution {
	LOW = 0, // QVGA - 320x240
	MED = 1, // VGA  - 640x480
	HIGH = 2, // SXGA - 1280x1024
}

export enum CamCMOSFlag {
	WHITEBALANCE_MANUAL = 1 << 15,
	EXPOSURE_AUTO = 1 << 14, // important
	DEFECT_CORRECTION = 1 << 13,
	UNKNOWN_12 = 1 << 12,
	UNKNOWN_11 = 1 << 11,
	LENS_SHADING = 1 << 10,
	UNKNOWN_9 = 1 << 9,
	UNKNOWN_8 = 1 << 8,
	ANTIFLICKER = 1 << 7, // important
	UNKNOWN_6 = 1 << 6,
	UNKNOWN_5 = 1 << 5,
	COLOR_RAW = 1 << 4, // important
	EXPOSURE_WEIGHTED = 1 << 3,
	EXPOSURE_WINDOW = 1 << 2,
	WHITEBALANCE_AUTO = 1 << 1, // important
}

// endpoint reports support for a larger max, but iso transfer always sends these.
// this size includes the 12-byte header.
export enum StreamPacketSize {
	DEPTH = 1760,
	VIDEO = 1920,
}

export enum StreamPacketType {
	DEPTH = 0b0111_0000,
	VIDEO = 0b1000_0000,
	START = 0b0000_0001,
	MID = 0b0000_0010,
	END = 0b0000_0101,
}

// usb endpoint id, not an array index
export enum StreamUsbEndpoint {
	VIDEO = 0x01,
	DEPTH = 0x02,
}
