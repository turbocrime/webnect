import type { CamIsoInterface } from "../stream/enum.js";

export async function prepareCamDevice(
	dev: USBDevice,
	usbInterface: CamIsoInterface,
): Promise<USBDevice> {
	if (!dev.opened) {
		await dev.open();
	}

	const iface = dev.configuration?.interfaces.find(
		(i) => i.interfaceNumber === usbInterface,
	);
	if (!iface) {
		throw new ReferenceError(`Interface ${usbInterface} not found`);
	}

	if (!iface.claimed) {
		await dev.claimInterface(usbInterface);
	}

	await dev.selectAlternateInterface(
		usbInterface,
		iface.alternate.alternateSetting,
	);

	return dev;
}
