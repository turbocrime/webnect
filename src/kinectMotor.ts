import { MotorUsbControl, MotorLed, MotorServoState } from "./kinectEnum";

const STATE_SIZE = 10;
const GRAVITY = 9.80665;
export const MAX_TILT = 30;
export const ACCEL = 819;

export type MotorState = {
	angle?: number; // raw, half-degrees
	servo: MotorServoState;
	accel: [number, number, number];
};

export const accelToG = (x: number, y: number, z: number) => {
	const ag = ACCEL * GRAVITY;
	return [x / ag, y / ag, z / ag];
};

export class KinectMotor {
	dev: USBDevice;
	state?: MotorState;
	led?: MotorLed;

	constructor(device: USBDevice) {
		this.dev = device;
	}

	async cmdGetState() {
		const { data } = await this.dev.controlTransferIn(
			{
				requestType: "vendor",
				recipient: "device",
				request: MotorUsbControl.GET_STATE,
				value: 0,
				index: 0,
			},
			STATE_SIZE,
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

	async cmdSetLed(led: MotorLed) {
		return await this.dev.controlTransferOut({
			requestType: "vendor",
			recipient: "device",
			request: MotorUsbControl.SET_LED,
			value: led,
			index: 0,
		});
	}
}
