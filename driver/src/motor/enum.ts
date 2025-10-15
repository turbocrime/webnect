export enum MotorServoState {
	IDLE = 0b000,
	LIMIT = 0b001,
	MOVING = 0b100,
}

export enum MotorLed {
	OFF = 0b0000,

	// steady
	GREEN = 0b0001,
	RED = 0b0010,

	// steady GREEN & RED
	AMBER = 0b0011,

	// color & with BLINK, or defaults to green
	BLINK = 0b0100,
	// BLINK_GREEN = 0b0100,

	BLINK_GREEN = 0b0101,
	BLINK_RED_AMBER = 0b0110,
}
export enum UsbControlMotor {
	MOTOR_SET_LED = 0x06,
	MOTOR_SET_POSITION = 0x31,
	MOTOR_GET_POSITION = 0x32,
}
