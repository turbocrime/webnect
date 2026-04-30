/// <reference types="w3c-web-usb" />
/** biome-ignore-all lint/style/noNonNullAssertion: test code */

import { describe, expect, test, vi } from "vitest";
import {
	CamIsoAltSetting,
	CamIsoInterface,
} from "../src/camera/stream/enum.js";
import { prepareCamDevice } from "../src/camera/worker/get-device.js";

const makeAlt = (alternateSetting: number): USBAlternateInterface =>
	({
		alternateSetting,
		interfaceClass: 0xff,
		interfaceSubclass: 0,
		interfaceProtocol: 0,
		interfaceName: null,
		endpoints: [],
	}) as unknown as USBAlternateInterface;

const makeIface = (
	interfaceNumber: number,
	{ claimed = false, alternateSetting = 0 } = {},
): USBInterface => {
	const alt = makeAlt(alternateSetting);
	return {
		interfaceNumber,
		alternate: alt,
		alternates: [alt],
		claimed,
	} as unknown as USBInterface;
};

const makeDevice = (
	iface: USBInterface,
	{ opened = true } = {},
): {
	device: USBDevice;
	open: ReturnType<typeof vi.fn<USBDevice["open"]>>;
	claimInterface: ReturnType<typeof vi.fn<USBDevice["claimInterface"]>>;
	selectAlternateInterface: ReturnType<
		typeof vi.fn<USBDevice["selectAlternateInterface"]>
	>;
} => {
	const open = vi.fn<USBDevice["open"]>().mockResolvedValue(undefined);
	const claimInterface = vi
		.fn<USBDevice["claimInterface"]>()
		.mockResolvedValue(undefined);
	const selectAlternateInterface = vi
		.fn<USBDevice["selectAlternateInterface"]>()
		.mockResolvedValue(undefined);
	const device: Partial<USBDevice> = {
		opened,
		configuration: {
			interfaces: [iface],
		} as unknown as USBConfiguration,
		open,
		claimInterface,
		selectAlternateInterface,
	};
	return {
		device: device as USBDevice,
		open,
		claimInterface,
		selectAlternateInterface,
	};
};

describe("prepareCamDevice", () => {
	test("claims then selects target alt when interface is unclaimed and on a different alt", async () => {
		const iface = makeIface(CamIsoInterface.CAMERA, {
			claimed: false,
			alternateSetting: 1,
		});
		const { device, claimInterface, selectAlternateInterface } =
			makeDevice(iface);

		await prepareCamDevice(device, CamIsoInterface.CAMERA);

		expect(claimInterface).toHaveBeenCalledWith(CamIsoInterface.CAMERA);
		expect(selectAlternateInterface).toHaveBeenCalledWith(
			CamIsoInterface.CAMERA,
			CamIsoAltSetting.CAMERA,
		);

		const claimOrder = claimInterface.mock.invocationCallOrder[0]!;
		const selectOrder = selectAlternateInterface.mock.invocationCallOrder[0]!;
		expect(claimOrder).toBeLessThan(selectOrder);
	});

	test("skips claim when already claimed but still selects target alt if currently on a different alt", async () => {
		const iface = makeIface(CamIsoInterface.CAMERA, {
			claimed: true,
			alternateSetting: 1,
		});
		const { device, claimInterface, selectAlternateInterface } =
			makeDevice(iface);

		await prepareCamDevice(device, CamIsoInterface.CAMERA);

		expect(claimInterface).not.toHaveBeenCalled();
		expect(selectAlternateInterface).toHaveBeenCalledWith(
			CamIsoInterface.CAMERA,
			CamIsoAltSetting.CAMERA,
		);
	});

	test("skips selectAlternateInterface when device is already on the target alt", async () => {
		const iface = makeIface(CamIsoInterface.CAMERA, {
			claimed: false,
			alternateSetting: CamIsoAltSetting.CAMERA,
		});
		const { device, claimInterface, selectAlternateInterface } =
			makeDevice(iface);

		await prepareCamDevice(device, CamIsoInterface.CAMERA);

		expect(claimInterface).toHaveBeenCalledWith(CamIsoInterface.CAMERA);
		expect(selectAlternateInterface).not.toHaveBeenCalled();
	});

	test("throws ReferenceError when the requested interface is not present", async () => {
		const iface = makeIface(7);
		const { device } = makeDevice(iface);

		await expect(
			prepareCamDevice(device, CamIsoInterface.CAMERA),
		).rejects.toBeInstanceOf(ReferenceError);
	});

	test("opens the device before claiming when not yet open", async () => {
		const iface = makeIface(CamIsoInterface.CAMERA, { claimed: false });
		const { device, open, claimInterface } = makeDevice(iface, {
			opened: false,
		});

		await prepareCamDevice(device, CamIsoInterface.CAMERA);

		expect(open).toHaveBeenCalled();
		const openOrder = open.mock.invocationCallOrder[0]!;
		const claimOrder = claimInterface.mock.invocationCallOrder[0]!;
		expect(openOrder).toBeLessThan(claimOrder);
	});
});
