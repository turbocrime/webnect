export const usbSupport = typeof navigator?.usb?.getDevices === "function";
if (!usbSupport) console.error("WebUSB supported not detected!");
