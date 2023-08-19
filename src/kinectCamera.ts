import { KinectStream } from "./kinectStream";

import {
	CamUsbControl,
	CamUsbCommand,
	CamRegAddr,
	CamFPS,
	CamDepthFormat,
	CamVisibleFormat,
	CamIRFormat,
	CamFlagActive,
	CamResolution,
} from "./kinectEnum";

const CAM_USB_INTERFACE = 0;
const CAM_USB_ENDPOINT_VIDEO = 1;
const CAM_USB_ENDPOINT_DEPTH = 2;
const MAGIC_OUT = 0x4d47;
const MAGIC_IN = 0x4252;
const HDR_SIZE = 8;

const OFF = 0;

export type CamMode = {
	fps: CamFPS;
	res: CamResolution;
	depth?: CamDepthFormat;
	visible?: CamVisibleFormat;
	ir?: CamIRFormat;
};

type CamVisibleMode = CamMode & { visible: CamVisibleFormat };
type CamDepthMode = CamMode & { depth: CamDepthFormat };
type CamIRMode = CamMode & { ir: CamIRFormat };

export class KinectCamera {
	dev: USBDevice;
	devIdx?: number;

	tag: number;

	kinectStreamHandler?: KinectStream;
	depthStream?: ReadableStream<ArrayBuffer>;
	videoStream?: ReadableStream<ArrayBuffer>;

	mode: CamMode;

	constructor(device: USBDevice) {
		this.dev = device;
		this.tag = 1;
		this.mode = {
			fps: CamFPS.F_30P,
			res: CamResolution.MED,
		};
		navigator.usb.getDevices().then((devs) => {
			this.devIdx = devs.indexOf(this.dev);
		});
	}

	async initDepthStream() {
		this.mode.depth ??= CamDepthFormat.D_11B;
		this.mode.depth = CamDepthFormat.D_10B;
		this.mode.fps ??= CamFPS.F_30P;
		this.mode.res ??= CamResolution.MED;
		const { depth, res, fps } = this.mode;

		//await this.writeRegister(CamRegAddr.PROJECTOR, OFF);
		await this.writeRegister(CamRegAddr.DEPTH_ACTIVE, OFF);

		await this.writeRegister(CamRegAddr.DEPTH_FORMAT, depth);
		await this.writeRegister(CamRegAddr.DEPTH_RES, res);
		await this.writeRegister(CamRegAddr.DEPTH_FPS, fps);
		//await this.writeRegister(CamRegAddr.DEPTH_FLIP, OFF);

		await this.writeRegister(CamRegAddr.DEPTH_ACTIVE, CamFlagActive.DEPTH);

		this.kinectStreamHandler = new KinectStream(this.devIdx!, {
			type: CamFlagActive.DEPTH,
			format: depth,
			res,
		});

		this.depthStream = await this.kinectStreamHandler.getWorkerStream();

		return this.depthStream;
	}

	async initVisibleStream() {
		this.mode.visible ??= CamVisibleFormat.BAYER_8B;
		this.mode.fps ??= CamFPS.F_30P;
		this.mode.res ??= CamResolution.MED;
		const { visible, res, fps } = this.mode;
		await this.writeRegister(CamRegAddr.VIDEO_ACTIVE, OFF);

		await this.writeRegister(CamRegAddr.VISIBLE_FORMAT, visible);
		await this.writeRegister(CamRegAddr.VISIBLE_RES, res);
		await this.writeRegister(CamRegAddr.VISIBLE_FPS, fps);

		await this.writeRegister(CamRegAddr.VIDEO_ACTIVE, CamFlagActive.VISIBLE);
		this.kinectStreamHandler = new KinectStream(this.devIdx!, {
			type: CamFlagActive.VISIBLE,
			format: visible,
			res,
		});
		this.videoStream = await this.kinectStreamHandler.getWorkerStream();
		return this.videoStream;
	}

	async initIRStream() {
		this.mode.ir ??= CamIRFormat.IR_10B;
		this.mode.fps ??= CamFPS.F_30P;
		this.mode.res ??= CamResolution.MED;
		const { ir, res, fps } = this.mode;
		await this.writeRegister(CamRegAddr.VIDEO_ACTIVE, OFF);

		//await this.writeRegister(CamRegAddr.IR_FORMAT, ir);
		await this.writeRegister(CamRegAddr.IR_RES, res);
		await this.writeRegister(CamRegAddr.IR_FPS, fps);

		await this.writeRegister(CamRegAddr.VIDEO_ACTIVE, CamFlagActive.IR);
		this.kinectStreamHandler = new KinectStream(this.devIdx!, {
			type: CamFlagActive.IR,
			format: ir,
			res,
		});
		this.videoStream = await this.kinectStreamHandler.getWorkerStream();
		return this.videoStream;
	}

	async endDepthStream() {
		this.mode.depth = undefined;
		await this.writeRegister(CamRegAddr.DEPTH_ACTIVE, OFF);
		this.depthStream?.cancel();
		this.depthStream = undefined;
	}

	async *depthFrames() {
		if (!this.depthStream) throw Error("depth stream not initialized");
		const r = this.depthStream.getReader();
		while (true) {
			const frame = await r.read();
			if (frame.done) break;
			yield frame.value;
		}
		r.releaseLock();
	}

	async *videoFrames() {
		if (!this.videoStream) throw Error("video stream not initialized");
		const r = this.videoStream.getReader();
		while (true) {
			const frame = await r.read();
			if (frame.done) break;
			yield frame.value;
		}
		r.releaseLock();
	}
	static unpack10bitGray(frame: ArrayBuffer) {
		const src = new Uint8Array(frame);
		const dest = new Uint16Array(640 * 480);
		let window = 0;
		let bits = 0;
		let s = 0;
		let d = 0;
		while (s < src.length) {
			while (bits < 10 && s < src.length) {
				window = (window << 8) | src[s++];
				bits += 8;
			}
			if (bits < 10) break;
			bits -= 10;
			dest[d++] = window >> bits;
			window &= (1 << bits) - 1;
		}
		return dest;
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
