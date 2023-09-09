const usbSupport = typeof navigator?.usb?.getDevices === "function";
if (!usbSupport) console.error("WebUSB supported not detected!");

export enum VendorId {
	MICROSOFT = 0x045e,
}

export enum ProductId {
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

export const claimNuiMotor = async (d?: USBDevice): Promise<USBDevice> => {
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

export * from "./Motor";
export * from "./Camera";
export * from "./enum/index";
export * from "./util/index";
export * from "./stream/index";
