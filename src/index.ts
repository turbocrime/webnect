export const usbSupport = typeof navigator?.usb?.getDevices === "function";
if (!usbSupport) console.error("WebUSB supported not detected!");

import KinectCamera from "./KinectCamera";
import KinectMotor from "./KinectMotor";

import { KinectProductId, KinectVendorId } from "./DeviceEnums";

const claimNuiCamera = async (d?: USBDevice): Promise<KinectCamera> => {
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
	//await dev.open();
	//await dev.selectConfiguration(1);
	return new KinectCamera(dev);
};

const claimNuiMotor = async (d?: USBDevice): Promise<KinectMotor> => {
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
	return new KinectMotor(dev);
};

export default {
	claimNuiCamera,
	claimNuiMotor,
	KinectProductId,
	KinectVendorId,
};

export { default as KinectMotor } from "./KinectMotor";
export { MotorLed, MotorServoState } from "./MotorEnums";
export { default as KinectCamera } from "./KinectCamera";
export type { KinectCameraMode, CamModeOpt } from "./KinectCamera";
export {
	CamFormatDepth,
	CamFPS,
	CamFormatInfrared,
	CamResolution,
	CamType,
	CamFormatVisible,
	OFF,
	ON,
} from "./CameraEnums";
