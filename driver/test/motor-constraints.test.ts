/// <reference types="w3c-web-usb" />
/** biome-ignore-all lint/style/noNonNullAssertion: test code */

import { describe, expect, test, vi } from "vitest";
import { MOTOR_MAX_TILT } from "../src/motor/constants.js";
import { Motor } from "../src/motor/motor.js";

describe("motor constraints", () => {
	const andNegatives = (x: number) => [x, -x];
	const andFractionals = (x: number) => {
		const rand = Math.random() * 0.5 * Math.sign(x);
		return [x, x + rand];
	};

	const inRange = Array.from({ length: MOTOR_MAX_TILT + 1 }, (_, i) => i / 2);

	const outOfRange = [
		Infinity,
		Number.MAX_SAFE_INTEGER,
		1000,
		100,
		50,
		31,
		30.5,
	];

	const mockControlTransferOut = vi
		.fn<USBDevice["controlTransferOut"]>()
		.mockResolvedValue({ status: "ok", bytesWritten: 0 });

	const mockDevice: Partial<USBDevice> = {
		opened: true,
		controlTransferOut: mockControlTransferOut,
	};

	const motor = new Motor(mockDevice as USBDevice);

	test("setPosition should send valid integer controls", async () => {
		for (const goodInput of inRange
			.flatMap(andNegatives)
			.flatMap(andFractionals)) {
			await motor.setPosition(goodInput);

			const lastTransfer = mockControlTransferOut.mock.lastCall![0];

			expect(lastTransfer.value).not.toBeGreaterThan(MOTOR_MAX_TILT);
			expect(lastTransfer.value).not.toBeLessThan(-MOTOR_MAX_TILT);

			expect(lastTransfer.value).toBe(Math.trunc(goodInput * 2));
		}
	});

	test("setPosition should clamp controls to servo limits", async () => {
		for (const badInput of outOfRange
			.flatMap(andNegatives)
			.flatMap(andFractionals)) {
			await motor.setPosition(badInput);

			const lastTransfer = mockControlTransferOut.mock.lastCall![0];

			expect(lastTransfer.value).not.toBe(Math.trunc(badInput * 2));

			expect(Math.abs(lastTransfer.value)).toBe(MOTOR_MAX_TILT);
			expect(Math.sign(lastTransfer.value)).toBe(Math.sign(badInput));
		}
	});
});
