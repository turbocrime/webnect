import { MotorUsbControl, MotorLed, MotorServoState } from "./enum";

export type MotorState = {
	angle: number; // raw, half-degrees
	servo: MotorServoState;
	accel: [number, number, number];
};

// enforced by setTilt. tilt may be positive or negative.
export const MOTOR_MAX_TILT = 30;

// arbitrary, device-specific unit
export const ACCEL_PER_G = 819;

const ag = ACCEL_PER_G * 9.80665;
export const accelRawToG = ([x, y, z]: [number, number, number]) =>
	[x / ag, y / ag, z / ag] as [number, number, number];

const DEFAULT_POLL_INTERVAL_MS = 1000;

export default class Motor {
	get state(): Readonly<MotorState> {
		return this._state;
	}

	get led(): MotorLed {
		return this._led;
	}

	set led(i: MotorLed) {
		this.setLed(i);
	}

	get tiltRaw(): number {
		// half degrees
		return this.state.angle;
	}

	get tilt(): number {
		// convert to degrees
		return this.state.angle / 2;
	}

	set tiltRaw(i: number) {
		// half degrees
		this.setTilt(i);
	}

	set tilt(i: number) {
		// convert to degrees
		this.setTilt(i * 2);
	}

	get accelRaw(): Readonly<[number, number, number]> {
		return this.state.accel;
	}

	get accel(): Readonly<[number, number, number]> {
		return accelRawToG(this.state.accel);
	}

	get servo(): Readonly<MotorServoState> {
		return this.state.servo;
	}

	private dev: USBDevice;

	private _state: MotorState;
	private _led: MotorLed;
	private poll?: number;

	constructor(device: USBDevice, pollState = false as boolean | number) {
		this.dev = device;

		this._state = {} as MotorState;
		this._led = {} as MotorLed;

		if (pollState)
			this.startPoll(pollState === true ? DEFAULT_POLL_INTERVAL_MS : pollState);
	}

	public startPoll(interval?: number) {
		this.poll ??= setInterval(
			() => this.getState(),
			interval ?? DEFAULT_POLL_INTERVAL_MS,
		);
		return this.poll;
	}

	public stopPoll() {
		clearInterval(this.poll);
		this.poll = undefined;
	}

	async getState() {
		const MOTOR_STATE_SIZE = 10;

		const usbResult = await this.dev.controlTransferIn(
			{
				requestType: "vendor",
				recipient: "device",
				request: MotorUsbControl.GET_STATE,
				value: 0,
				index: 0,
			},
			MOTOR_STATE_SIZE,
		);

		if (
			usbResult.status !== "ok" ||
			usbResult.data?.byteLength !== MOTOR_STATE_SIZE
		)
			throw usbResult;

		// TODO: validate
		//const h = usbResult.data.getInt16(0);

		this._state = {
			accel: [
				usbResult.data.getInt16(2),
				usbResult.data.getInt16(4),
				usbResult.data.getInt16(6),
			] as [number, number, number],

			// -128 (invalid) while servo is in motion
			angle: (usbResult.data.getInt8(8) + 128 || NaN) - 128,

			servo: usbResult.data.getUint8(9),
		};

		return this._state;
	}

	async setTilt(angle: number) {
		// half degrees
		const usbResult = await this.dev.controlTransferOut({
			requestType: "vendor",
			recipient: "device",
			request: MotorUsbControl.SET_TILT,
			value: angle % MOTOR_MAX_TILT,
			index: 0,
		});
		// TODO: validate
		if (usbResult.status !== "ok") throw usbResult;
		return usbResult;
	}

	async setLed(led: MotorLed) {
		const usbResult = await this.dev.controlTransferOut({
			requestType: "vendor",
			recipient: "device",
			request: MotorUsbControl.SET_LED,
			value: led,
			index: 0,
		});
		// TODO: validate
		if (usbResult.status !== "ok") throw usbResult;
		this._led = led;
		return usbResult;
	}
}
