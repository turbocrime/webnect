export const usbSupport = typeof navigator?.usb?.getDevices === "function";

if (!usbSupport) console.error("WebUSB supported not detected!");

export enum VendorId {
	MICROSOFT = 0x045e,
}

export enum ProductId {
	NUI_MOTOR = 0x02b0,
	NUI_CAMERA = 0x02ae,
	NUI_AUDIO = 0x02ad,
}

export { KinectDevice } from "./kinectDevice";
export { KinectMotor } from "./kinectMotor";
export { KinectCamera } from "./kinectCamera";
