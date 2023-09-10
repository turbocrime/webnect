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
