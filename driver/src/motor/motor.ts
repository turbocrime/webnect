import { usbInOk, usbOutOk } from "../util/usb-ok.js";
import { ACCEL_PER_G, MOTOR_MAX_TILT, MOTOR_STATE_SIZE } from "./constants.js";
import type { MotorLed, MotorServoState } from "./enum.js";
import { UsbControlMotor } from "./enum.js";

/**
 */
export type MotorState = {
	servo: MotorServoState;

	/**
	 * Raw int8 angle output in half-degrees. Range is -61 to 61 and device report
	 * seems to be noisy. Impossible -128 if servo is in motion.
	 *
	 * @see {@link MOTOR_MAX_TILT}
	 */
	rawAngle: number;
	/**
	 * Servo angle converted to degrees. Undefined if servo is in motion.
	 */
	angleDegrees?: number | undefined;

	/**
	 * Raw accelerometer output in device units. Device report seems noisy.
	 *
	 * Right-hand rule for an upright device looking at you: Point your thumb at
	 * your chest, with your palm towards the floor.
	 * @see {@link ACCEL_PER_G}.
	 */
	rawAccel: [stageleft: number, down: number, upstage: number];
	/**
	 * Accelerometer data converted to gravity units.
	 *
	 * Right-hand rule for an upright device looking at you: Point your thumb at
	 * your chest, with your palm towards the floor.
	 */
	accelG: [stageleft: number, down: number, upstage: number];
};

/** Kinect motor device */
export class Motor {
	public readonly ready: Promise<void>;

	/**
	 * @param device USB device instance
	 */
	constructor(private readonly device: USBDevice) {
		this.ready = device.opened ? Promise.resolve() : device.open();
	}

	/** Get current motor position and state */
	public async getPosition(): Promise<MotorState> {
		await this.ready;

		const data = usbInOk(
			await this.device.controlTransferIn(
				{
					requestType: "vendor",
					recipient: "device",
					request: UsbControlMotor.MOTOR_GET_POSITION,
					value: 0,
					index: 0,
				},
				MOTOR_STATE_SIZE,
			),
		);

		// @ts-expect-error unknown data not used
		const _unknown = data.getInt16(0);

		const accelX = data.getInt16(2);
		const accelY = data.getInt16(4);
		const accelZ = data.getInt16(6);

		// will be -128 if servo is moving
		const halfDegrees = data.getInt8(8);
		const degrees = halfDegrees === -128 ? undefined : halfDegrees / 2;

		const servo = data.getUint8(9);

		return {
			servo,

			rawAngle: halfDegrees,
			angleDegrees: degrees,

			rawAccel: [accelX, accelY, accelZ],
			accelG: [
				accelX / ACCEL_PER_G,
				accelY / ACCEL_PER_G,
				accelZ / ACCEL_PER_G,
			],
		};
	}

	/**
	 * Set motor tilt angle
	 * @param degrees Tilt angle in degrees, -31 to 31
	 */
	public async setPosition(degrees: number): Promise<void> {
		await this.ready;

		const halfDegrees = Math.trunc(degrees * 2);
		const limited = Math.max(
			Math.min(halfDegrees, MOTOR_MAX_TILT),
			-MOTOR_MAX_TILT,
		);

		const out = await this.device.controlTransferOut({
			requestType: "vendor",
			recipient: "device",
			request: UsbControlMotor.MOTOR_SET_POSITION,
			value: limited,
			index: 0,
		});

		usbOutOk(out);
	}

	/**
	 * Set motor LED state
	 * @param led LED configuration
	 */
	public async setLed(led: MotorLed): Promise<void> {
		await this.ready;

		usbOutOk(
			await this.device.controlTransferOut({
				requestType: "vendor",
				recipient: "device",
				request: UsbControlMotor.MOTOR_SET_LED,
				value: led,
				index: 0,
			}),
		);
	}
}
