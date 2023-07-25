export const usbSupport = typeof navigator?.usb?.getDevices === "function";

if (!usbSupport) console.error("WebUSB supported not detected!");

export { KinectDevice, VendorId, ProductId } from "./kinectDevice";
export { KinectMotor } from "./kinectMotor";
export { KinectCamera } from "./kinectCamera";
