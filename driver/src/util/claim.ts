import { ProductId, VendorId } from "./product.js";

export function claimNuiCamera(
	filter: Partial<Omit<USBDeviceFilter, "vendorId" | "productId">> = {},
): Promise<USBDevice> {
	return navigator.usb.requestDevice({
		filters: [
			{
				...filter,
				vendorId: VendorId.MICROSOFT,
				productId: ProductId.NUI_CAMERA,
			},
		],
	});
}

export function claimNuiMotor(
	filter: Partial<Omit<USBDeviceFilter, "vendorId" | "productId">> = {},
): Promise<USBDevice> {
	return navigator.usb.requestDevice({
		filters: [
			{
				...filter,
				vendorId: VendorId.MICROSOFT,
				productId: ProductId.NUI_MOTOR,
			},
		],
	});
}

export function claimNuiAudio(
	filter: Partial<Omit<USBDeviceFilter, "vendorId" | "productId">> = {},
): Promise<USBDevice> {
	return navigator.usb.requestDevice({
		filters: [
			{
				...filter,
				vendorId: VendorId.MICROSOFT,
				productId: ProductId.NUI_AUDIO,
			},
		],
	});
}
