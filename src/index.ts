export const usbSupport = typeof navigator?.usb?.getDevices === "function";
if (!usbSupport) console.error("WebUSB supported not detected!");

import { KinectCamera } from "./KinectCamera";
import { KinectMotor } from "./KinectMotor";

export enum KinectVendorId {
	MICROSOFT = 0x045e,
}

export enum KinectProductId {
	NUI_MOTOR = 0x02b0,
	NUI_CAMERA = 0x02ae,
	NUI_AUDIO = 0x02ad,
}

export const claimNuiCamera = async (d?: USBDevice): Promise<USBDevice> => {
	const dev =
		d ||
		(await navigator.usb.requestDevice({
			filters: [
				{
					vendorId: KinectVendorId.MICROSOFT,
					productId: KinectProductId.NUI_CAMERA,
				},
			],
		}));
	await dev.open();
	await dev.reset();
	await dev.selectConfiguration(1);
	return dev;
};

export const claimNuiMotor = async (d?: USBDevice): Promise<USBDevice> => {
	const dev =
		d ||
		(await navigator.usb.requestDevice({
			filters: [
				{
					vendorId: KinectVendorId.MICROSOFT,
					productId: KinectProductId.NUI_MOTOR,
				},
			],
		}));
	return dev;
};

export * from "./KinectMotor";
export * from "./KinectCamera";
export * from "./util/index";
export * from "./stream/index";
