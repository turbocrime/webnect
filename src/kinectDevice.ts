import { KinectMotor } from "./kinectMotor";
import { KinectCamera } from "./kinectCamera";
//import { KinectAudio } from "./kinectAudio";

export enum KinectVendorId {
	MICROSOFT = 0x045e,
}

export enum KinectProductId {
	NUI_MOTOR = 0x02b0,
	NUI_CAMERA = 0x02ae,
	NUI_AUDIO = 0x02ad,
}

export class KinectDevice {
	camera?: KinectCamera;
	motor?: KinectMotor;
	audio?: undefined; //KinectAudio;
	ready: Promise<this>;

	rgbBuffer: ArrayBuffer;
	depthBuffer: ArrayBuffer;

	constructor(devices?: {
		camera?: USBDevice | boolean;
		motor?: USBDevice | boolean;
		audio?: USBDevice | boolean;
	}) {
		this.rgbBuffer = new ArrayBuffer(640 * 480 * 4);
		this.depthBuffer = new ArrayBuffer(640 * 480 * 2);

		this.ready = this.init(
			devices?.camera ?? true,
			devices?.motor ?? false,
			devices?.audio ?? false,
		);
	}

	async init(
		camera?: USBDevice | boolean,
		motor?: USBDevice | boolean,
		audio?: USBDevice | boolean,
	) {
		const dPromises = Array();
		if (motor)
			dPromises.push(this.claimNuiMotor(motor === true ? undefined : motor));
		if (camera)
			dPromises.push(this.claimNuiCamera(camera === true ? undefined : camera));
		if (audio) dPromises.push(Promise.resolve(undefined));
		await Promise.allSettled(dPromises);
		return this;
	}

	async claimNuiCamera(select?: USBDevice): Promise<KinectCamera> {
		const dev =
			select ||
			(await navigator.usb.requestDevice({
				filters: [
					{
						vendorId: KinectVendorId.MICROSOFT,
						productId: KinectProductId.NUI_CAMERA,
					},
				],
			}));
		await dev.open();
		await dev.selectConfiguration(1);
		this.camera = new KinectCamera(dev);
		return this.camera;
	}

	async claimNuiMotor(select?: USBDevice): Promise<KinectMotor> {
		const dev =
			select ||
			(await navigator.usb.requestDevice({
				filters: [
					{
						vendorId: KinectVendorId.MICROSOFT,
						productId: KinectProductId.NUI_MOTOR,
					},
				],
			}));
		this.motor = new KinectMotor(dev);
		return this.motor;
	}

	async handleWorkerMessage(event: MessageEvent) {}
}
