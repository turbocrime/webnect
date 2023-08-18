import { KinectStream } from "./kinectStream";

import {
	CamUsbCommand,
	CamRegAddr,
	CamFPS,
	CamDepthFormat,
	CamFlagActive,
	CamResolution,
	CamUsbControl,
} from "./kinectEnum";

const CAM_USB_INTERFACE = 0;
const CAM_USB_ENDPOINT_VIDEO = 1;
const CAM_USB_ENDPOINT_DEPTH = 2;

const MAGIC_OUT = 0x4d47;
const MAGIC_IN = 0x4252;
const HDR_SIZE = 8;

const OFF = 0;

type CamMode = {
	fps: CamFPS;
	res: CamResolution;
	depth?: CamDepthFormat;
	//visible?: CamModeVisible;
	//ir?: CamModeIR;
};

export class KinectCamera {
	dev: USBDevice;

	tag: number;

	//visibleStream?: KinectStream;
	//irStream?: KinectStream;
	depthStream?: KinectStream;
	mode: CamMode;

	constructor(device: USBDevice) {
		this.dev = device;
		this.tag = 1;
		this.mode = {
			// arbitrary default
			depth: CamDepthFormat.D_11B,
			fps: CamFPS.F_30P,
			res: CamResolution.MED,
		};
	}

	async endDepthStream() {
		this.mode.depth = undefined;
		await this.writeRegister(CamRegAddr.DEPTH_ACTIVE, OFF);
		this.depthStream?.close();
		this.depthStream = undefined;
	}

	async initDepthStream() {
		this.mode.depth ??= CamDepthFormat.D_11B;
		this.mode.fps ??= CamFPS.F_30P;
		this.mode.res ??= CamResolution.MED;

		await this.writeRegister(CamRegAddr.PROJECTOR, OFF);
		await this.writeRegister(CamRegAddr.DEPTH_ACTIVE, OFF);

		await this.writeRegister(CamRegAddr.DEPTH_FORMAT, this.mode.depth);
		await this.writeRegister(CamRegAddr.DEPTH_RES, this.mode.res);
		await this.writeRegister(CamRegAddr.DEPTH_FPS, this.mode.fps);
		await this.writeRegister(CamRegAddr.DEPTH_FLIP, OFF);

		await this.writeRegister(CamRegAddr.DEPTH_ACTIVE, CamFlagActive.DEPTH);
	}

	async *streamDepthFrames() {
		await this.initDepthStream();

		const devIdx = await navigator.usb
			.getDevices()
			.then((devs) => devs.indexOf(this.dev));
		this.depthStream = new KinectStream(
			devIdx,
			CAM_USB_INTERFACE,
			CAM_USB_ENDPOINT_DEPTH,
		);
		yield* this.depthStream.frames();
	}

	static unpack11bitGray(frame: ArrayBuffer) {
		const src = new Uint8Array(frame);
		const dest = new Uint16Array(640 * 480);
		let window = 0;
		let bits = 0;
		let s = 0;
		let d = 0;
		while (s < src.length) {
			while (bits < 11 && s < src.length) {
				window = (window << 8) | src[s++];
				bits += 8;
			}
			if (bits < 11) break;
			bits -= 11;
			dest[d++] = window >> bits;
			window &= (1 << bits) - 1;
		}
		return dest;
	}

	async command(cmdId: CamUsbCommand, body: Uint16Array) {
		const cmdBuffer = new ArrayBuffer(HDR_SIZE + body.byteLength);

		const cmdHeader = new Uint16Array(cmdBuffer, 0, HDR_SIZE / 2);
		cmdHeader.set([MAGIC_OUT, body.length, cmdId, this.tag]);

		const cmdBody = new Uint16Array(
			cmdBuffer,
			cmdHeader.byteLength,
			body.length,
		);
		cmdBody.set(body);

		const usbResponse = await this.dev.controlTransferOut(
			{
				requestType: "vendor",
				recipient: "device",
				request: CamUsbControl.CAMERA,
				value: 0,
				index: 0,
			},
			cmdBuffer,
		);

		if (usbResponse.status !== "ok")
			throw Error(`command failed ${usbResponse}`);

		let cmdResponse: USBInTransferResult;
		let delay = Promise.resolve();
		do {
			await delay;
			delay = new Promise((resolve) => setTimeout(resolve, 10));
			cmdResponse = await this.dev.controlTransferIn(
				{
					requestType: "vendor",
					recipient: "device",
					request: CamUsbControl.CAMERA,
					value: 0,
					index: 0,
				},
				512,
			);
		} while (!cmdResponse!.data?.byteLength);

		const rHeader = new Uint16Array(cmdResponse.data!.buffer, 0, HDR_SIZE / 2);
		const rBody = new Uint16Array(cmdResponse.data!.buffer, HDR_SIZE);

		const [rMagic, rLength, rCmdId, rTag] = rHeader;

		if (rMagic !== MAGIC_IN) throw Error(`bad magic ${rMagic}`);
		if (rLength !== rBody.length)
			throw Error(`bad length ${rLength} expected ${rBody.length}`);
		if (rCmdId !== cmdId)
			throw Error(`bad command ${rCmdId} expected ${cmdId}`);
		if (rTag !== this.tag) throw Error(`bad tag ${rTag} expected ${this.tag}`);

		this.tag++;
		return rBody;
	}

	async writeRegister(register: CamRegAddr, value: number) {
		console.debug("writeRegister", CamRegAddr[register], value);
		const write = await this.command(
			CamUsbCommand.WRITE_REGISTER,
			new Uint16Array([register, value]),
		);
		if (write?.length !== 1 || write[0] !== 0)
			throw Error(`bad write ${write}`);
		else return write;
	}

	async readRegister(register: number) {
		console.debug("readRegister", CamRegAddr[register]);
		const read = await this.command(
			CamUsbCommand.READ_REGISTER,
			new Uint16Array([register]),
		);
		if (read!.length !== 2) throw Error(`bad read ${read}`);
		else return read;
	}
}
