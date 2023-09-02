export const getDeviceIndex = (d: USBDevice) =>
	navigator.usb.getDevices().then((ds) => ds.indexOf(d));
