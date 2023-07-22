export const MAX_TILT = 30;
export const ACCEL = 819;

enum MotorUsbControl {
	SET_LED = 0x06,
	SET_TILT = 0x31,
	GET_STATE = 0x32,
}

export enum ServoMode {
	IDLE = 0,
	LIMIT = 1,
	MOVING = 4,
}

export enum LedMode {
	OFF = 0,
	GREEN = 1,
	RED = 2,
	AMBER = 3,
	BLINK_GREEN = 4,
	ALSO_BLINK_GREEN = 5, // same as 4?
	BLINK_RED_AMBER = 6,
}

export type MotorState = {
	angle?: number; // raw, half-degrees
	servo: ServoMode;
	accel: [number, number, number];
};

export class KinectMotor {
	dev: USBDevice;
	state?: MotorState;
	led?: LedMode;

	constructor(device: USBDevice) {
		this.dev = device;
	}

	static accelToG(x: number, y: number, z: number) {
		const ag = ACCEL * 9.80665;
		return [x / ag, y / ag, z / ag];
	}

	async cmdGetState() {
		const STATE_SIZE_BYTES = 10;
		const { data } = await this.dev.controlTransferIn(
			{
				requestType: "vendor",
				recipient: "device",
				request: MotorUsbControl.GET_STATE,
				value: 0,
				index: 0,
			},
			STATE_SIZE_BYTES,
		);

		// TODO: validate header at data[0]

		const accel: [number, number, number] = [
			data!.getInt16(2),
			data!.getInt16(4),
			data!.getInt16(6),
		];
		const angle = data!.getInt8(8);
		const servo = data!.getUint8(9);

		this.state = {
			angle: angle !== -128 ? angle : undefined,
			servo,
			accel,
		};
		return this.state;
	}

	async cmdSetTilt(angle: number) {
		return await this.dev.controlTransferOut({
			requestType: "vendor",
			recipient: "device",
			request: MotorUsbControl.SET_TILT,
			value: angle % MAX_TILT, // crude limit
			index: 0,
		});
	}

	async cmdSetLed(led: LedMode) {
		return await this.dev.controlTransferOut({
			requestType: "vendor",
			recipient: "device",
			request: MotorUsbControl.SET_LED,
			value: led,
			index: 0,
		});
	}
}
