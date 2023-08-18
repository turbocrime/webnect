export const usbSupport = typeof navigator?.usb?.getDevices === "function";
if (!usbSupport) console.error("WebUSB supported not detected!");

export { KinectDevice } from "./kinectDevice";
export { KinectVendorId, KinectProductId } from "./kinectEnum";
export { KinectMotor } from "./kinectMotor";
export { KinectCamera } from "./kinectCamera";
