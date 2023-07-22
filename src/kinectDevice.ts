import { KinectMotor } from "./kinectMotor";
import { KinectCamera } from "./kinectCamera";
import { ProductId, VendorId } from "./webnect";
//import { KinectAudio } from "./kinectAudio";

export class KinectDevice {
	camera?: KinectCamera;
	motor?: KinectMotor;
	audio?: undefined; //KinectAudio;
	ready: Promise<this>;

	constructor(devices?: {
		motor?: USBDevice | boolean;
		camera?: USBDevice | boolean;
		audio?: USBDevice | boolean;
	}) {
		this.ready = this.init(devices?.motor, devices?.camera, devices?.audio);
	}

	async init(
		motor?: USBDevice | boolean,
		camera?: USBDevice | boolean,
		audio?: USBDevice | boolean,
	) {
		if (motor !== false)
			this.motor = await this.claimNuiMotor(motor === true ? undefined : motor);
		if (camera !== false)
			this.camera = await this.claimNuiCamera(
				camera === true ? undefined : camera,
			);
		if (audio !== false) this.audio = audio === true ? undefined : undefined; //await claimNuiAudio();
		return this;
	}

	async claimNuiCamera(select?: USBDevice): Promise<KinectCamera> {
		const dev =
			select ||
			(await navigator.usb.requestDevice({
				filters: [
					{ vendorId: VendorId.MICROSOFT, productId: ProductId.NUI_CAMERA },
				],
			}));
		await dev.open();
		await dev.selectConfiguration(1);
		await dev.claimInterface(0);
		return new KinectCamera(dev);
	}

	async claimNuiMotor(select?: USBDevice): Promise<KinectMotor> {
		const dev =
			select ||
			(await navigator.usb.requestDevice({
				filters: [
					{ vendorId: VendorId.MICROSOFT, productId: ProductId.NUI_MOTOR },
				],
			}));
		await dev.open();
		await dev.selectConfiguration(1);
		await dev.claimInterface(0);
		return new KinectMotor(dev);
	}
}
