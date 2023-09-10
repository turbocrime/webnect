const usbSupport = typeof navigator?.usb?.getDevices === "function";
if (!usbSupport) console.error("WebUSB supported not detected!");

enum VendorId {
	MICROSOFT = 0x045e,
}

enum ProductId {
	NUI_MOTOR = 0x02b0,
	NUI_CAMERA = 0x02ae,
	NUI_AUDIO = 0x02ad,
}

const claimNuiCamera = async (d?: USBDevice): Promise<USBDevice> => {
	const dev =
		d ||
		(await navigator.usb.requestDevice({
			filters: [
				{
					vendorId: VendorId.MICROSOFT,
					productId: ProductId.NUI_CAMERA,
				},
			],
		}));
	await dev.open();
	await dev.reset();
	await dev.selectConfiguration(1);
	return dev;
};

const claimNuiMotor = async (d?: USBDevice): Promise<USBDevice> => {
	const dev =
		d ||
		(await navigator.usb.requestDevice({
			filters: [
				{
					vendorId: VendorId.MICROSOFT,
					productId: ProductId.NUI_MOTOR,
				},
			],
		}));
	return dev;
};

import Motor from "./Motor";
import Camera from "./Camera";
import { Mode, DefaultMode } from "./Camera";

export default {
	ProductId,
	VendorId,
	claimNuiCamera,
	claimNuiMotor,
	Camera,
	Motor,
	Mode,
	DefaultMode,
};

export * from "./Camera";
export * from "./Motor";
