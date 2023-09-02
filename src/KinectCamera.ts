import type {
	KinectCameraWorkerInitConfig,
	KinectCameraWorkerInitReply,
} from "./workers/KinectCameraWorker";

import { KinectCameraStream } from "./KinectCameraStream";

import {
	CamFPS,
	CamFormatDepth,
	CamFormatInfrared,
	CamFormatVisible,
	CamOption,
	CamResolution,
	CamType,
	CamUsbCommand,
	CamUsbControl,
	CamUsbEndpoint,
	OFF,
	ON,
} from "./CameraEnums";

export type KinectCameraMode = {
	stream: CamType | OFF;
	format: CamFormatDepth | CamFormatVisible | CamFormatInfrared;
	res: CamResolution;
	fps: CamFPS;
	flip: ON | OFF;
};

const CAMERA_COMMAND_MAGIC_OUT = 0x4d47;
const CAMERA_COMMAND_MAGIC_IN = 0x4252;
const CAMERA_COMMAND_HEADER_SIZE = 8; // bytes

export const DEFAULT_MODE_VISIBLE = {
	stream: CamType.VIS,
	format: CamFormatVisible.BAYER_8B,
	res: CamResolution.MED,
	flip: OFF,
	fps: CamFPS.F_30P,
};

export const DEFAULT_MODE_INFRARED = {
	stream: CamType.IR,
	format: CamFormatInfrared.IR_10B,
	res: CamResolution.MED,
	flip: OFF,
	fps: CamFPS.F_30P,
};

export const DEFAULT_MODE_DEPTH = {
	stream: CamType.DEPTH,
	format: CamFormatDepth.D_11B,
	res: CamResolution.MED,
	flip: OFF,
	fps: CamFPS.F_30P,
};

type SingleMode = Partial<KinectCameraMode> & { stream: CamType | OFF };
type SomeModes = Partial<Record<CamUsbEndpoint, SingleMode>>;
export type CamModeOpt = SingleMode | SomeModes;

const getDeviceIndex = (d: USBDevice) =>
	navigator.usb.getDevices().then((ds) => ds.indexOf(d));

export default class KinectCamera {
	dev: USBDevice;

	[CamUsbEndpoint.DEPTH]: KinectCameraStream;
	[CamUsbEndpoint.VIDEO]: KinectCameraStream;

	cmdTag: number;

	usbWorker: Worker;

	ready: Promise<void>;

	constructor(dev: USBDevice, cameraMode?: CamModeOpt) {
		this.cmdTag = 1;

		this.dev = dev;

		const modes = this.parseModeOpts(cameraMode, true);

		this[CamUsbEndpoint.VIDEO] = new KinectCameraStream(
			modes[CamUsbEndpoint.VIDEO],
		);
		this[CamUsbEndpoint.DEPTH] = new KinectCameraStream(
			modes[CamUsbEndpoint.DEPTH],
		);

		this.usbWorker = new Worker(
			new URL("./workers/KinectCameraWorker.ts", import.meta.url),
			{ type: "module" },
		);

		this.ready = this.initWorker();
	}

	async initWorker() {
		let handleInit: (value: KinectCameraWorkerInitReply) => void;
		let rejectInit: () => void;
		const workerReply = new Promise<KinectCameraWorkerInitReply>(
			(resolve, reject) => {
				handleInit = resolve;
				rejectInit = reject;
			},
		);

		this.usbWorker.addEventListener("message", (event) => {
			switch (event.data?.type) {
				case "init":
					handleInit(event.data);
					break;
				default:
					rejectInit();
					console.error("Unknown message from worker, killing it", event);
					this.usbWorker.terminate();
					throw TypeError(`Unknown message type ${event.data?.type}`);
			}
		});

		this.usbWorker.postMessage({
			type: "init",
			config: {
				dev: await getDeviceIndex(this.dev),
			},
		} as KinectCameraWorkerInitConfig);

		const workerStreams = (await workerReply).streams;

		this[CamUsbEndpoint.VIDEO].packets = workerStreams[CamUsbEndpoint.VIDEO];
		this[CamUsbEndpoint.DEPTH].packets = workerStreams[CamUsbEndpoint.DEPTH];
	}

	parseModeOpts(
		modeOpt = {} as CamModeOpt,
		useDefaults = false,
	): Record<CamUsbEndpoint, KinectCameraMode> {
		const defaults = {
			[CamType.VIS]: DEFAULT_MODE_VISIBLE,
			[CamType.IR]: DEFAULT_MODE_INFRARED,
			[CamType.DEPTH]: DEFAULT_MODE_DEPTH,
		};

		const isSingleMode = (
			modeOpt: SingleMode | SomeModes,
		): modeOpt is SingleMode => "stream" in modeOpt;

		const isSomeModes = (
			modeOpt: SingleMode | SomeModes,
		): modeOpt is SomeModes =>
			CamUsbEndpoint.DEPTH in modeOpt || CamUsbEndpoint.VIDEO in modeOpt;

		const getUpdatedMode = (
			endpoint: CamUsbEndpoint,
			mode?: SingleMode,
		): Partial<Record<CamUsbEndpoint, KinectCameraMode>> => ({
			[endpoint]: mode?.stream
				? {
						...(useDefaults ? defaults[mode.stream] : this[endpoint].mode),
						...mode,
				  }
				: { ...this[endpoint].mode, ...mode },
		});

		if (isSingleMode(modeOpt)) {
			if (modeOpt.stream === OFF)
				this.parseModeOpts({
					[CamUsbEndpoint.VIDEO]: { stream: OFF },
					[CamUsbEndpoint.DEPTH]: { stream: OFF },
				});
			else if (modeOpt.stream === CamType.DEPTH)
				this.parseModeOpts({
					[CamUsbEndpoint.VIDEO]: this[CamUsbEndpoint.VIDEO].mode,
					...getUpdatedMode(CamUsbEndpoint.DEPTH, modeOpt),
				});
			else if (modeOpt.stream === CamType.VIS || modeOpt.stream === CamType.IR)
				this.parseModeOpts({
					[CamUsbEndpoint.DEPTH]: this[CamUsbEndpoint.DEPTH].mode,
					...getUpdatedMode(CamUsbEndpoint.VIDEO, modeOpt),
				});
		} else if (isSomeModes(modeOpt))
			return {
				...getUpdatedMode(CamUsbEndpoint.VIDEO, modeOpt[CamUsbEndpoint.VIDEO]),
				...getUpdatedMode(CamUsbEndpoint.DEPTH, modeOpt[CamUsbEndpoint.DEPTH]),
			} as Record<CamUsbEndpoint, KinectCameraMode>;

		// fallback
		return this.parseModeOpts({
			[CamUsbEndpoint.VIDEO]: DEFAULT_MODE_INFRARED,
			[CamUsbEndpoint.DEPTH]: DEFAULT_MODE_DEPTH,
		});
	}

	async setMode(modeOpt?: CamModeOpt) {
		const modes = this.parseModeOpts(modeOpt);
		this[CamUsbEndpoint.VIDEO].mode = modes[CamUsbEndpoint.VIDEO];
		this[CamUsbEndpoint.DEPTH].mode = modes[CamUsbEndpoint.DEPTH];
		this.writeModeRegisters();
	}

	async writeModeRegisters() {
		{
			const { format, res, fps, flip, stream } =
				this[CamUsbEndpoint.DEPTH].mode;

			await this.writeRegister(CamOption.DEPTH_ACTIVE, OFF);

			await this.writeRegister(CamOption.PROJECTOR_CYCLE, OFF);
			await this.writeRegister(CamOption.DEPTH_FORMAT, format);
			await this.writeRegister(CamOption.DEPTH_RES, res);
			await this.writeRegister(CamOption.DEPTH_FPS, fps);
			await this.writeRegister(CamOption.DEPTH_FLIP, flip);
			await this.writeRegister(CamOption.DEPTH_ACTIVE, stream);
		}

		{
			const { format, res, fps, flip, stream } =
				this[CamUsbEndpoint.VIDEO].mode;

			await this.writeRegister(CamOption.VIDEO_ACTIVE, OFF);

			switch (stream) {
				case CamType.VIS: {
					await this.writeRegister(CamOption.VIS_FORMAT, format);
					await this.writeRegister(CamOption.VIS_RES, res);
					await this.writeRegister(CamOption.VIS_FPS, fps);
					await this.writeRegister(CamOption.VIS_FLIP, flip);
					break;
				}
				case CamType.IR: {
					await this.writeRegister(CamOption.PROJECTOR_CYCLE, OFF);
					await this.writeRegister(CamOption.IR_FORMAT, format);
					await this.writeRegister(CamOption.IR_RES, res);
					await this.writeRegister(CamOption.IR_FPS, fps);
					await this.writeRegister(CamOption.IR_FLIP, flip);
					break;
				}
			}
			await this.writeRegister(CamOption.VIDEO_ACTIVE, stream);
		}
	}

	async command(cmdId: CamUsbCommand, content: Uint16Array) {
		const cmd = new Uint16Array(
			new ArrayBuffer(CAMERA_COMMAND_HEADER_SIZE + content.byteLength),
		);
		cmd.set([CAMERA_COMMAND_MAGIC_OUT, content.length, cmdId, this.cmdTag]);
		cmd.set(content, CAMERA_COMMAND_HEADER_SIZE / cmd.BYTES_PER_ELEMENT);

		const rCmd = new Uint16Array(await this.controlOutIn(cmd.buffer));
		const [rMagic, rLength, rCmdId, rTag, ...rContent] = rCmd;

		if (
			rMagic !== CAMERA_COMMAND_MAGIC_IN ||
			rLength !== rContent.length ||
			rCmdId !== cmdId ||
			rTag !== this.cmdTag
		)
			throw Error("Camera command reply invalid");

		this.cmdTag++;
		return rContent;
	}

	async controlOutIn(controlBuffer: ArrayBuffer) {
		const RESPONSE_TIMEOUT = 100;
		const RESPONSE_RETRY_DELAY = 10;

		let usbResult;

		usbResult = await this.dev.controlTransferOut(
			{
				requestType: "vendor",
				recipient: "device",
				request: CamUsbControl.CAMERA,
				value: 0,
				index: 0,
			},
			controlBuffer,
		);

		if (usbResult.status !== "ok")
			throw Error(`Camera control failure ${usbResult}`);

		const responseTimeout = setTimeout(() => {
			throw Error("Camera control timeout");
		}, RESPONSE_TIMEOUT);

		let retryDelay = Promise.resolve();

		do {
			await retryDelay;
			retryDelay = new Promise((resolve) =>
				setTimeout(resolve, RESPONSE_RETRY_DELAY),
			);
			usbResult = await this.dev.controlTransferIn(
				{
					requestType: "vendor",
					recipient: "device",
					request: CamUsbControl.CAMERA,
					value: 0,
					index: 0,
				},
				512,
			);
		} while (!usbResult.data?.byteLength);

		clearTimeout(responseTimeout);

		return usbResult.data?.buffer;
	}

	// TODO: sequence write attempts?
	async writeRegister(register: CamOption, value: number) {
		const write = await this.command(
			CamUsbCommand.WRITE_REGISTER,
			new Uint16Array([register, value]),
		);
		if (write.length === 1 && write[0] === 0) return write;
		else throw Error(`bad write ${write}`);
	}

	async readRegister(register: number) {
		const read = await this.command(
			CamUsbCommand.READ_REGISTER,
			new Uint16Array([register]),
		);
		if (read.length === 2) return read;
		else throw Error(`bad read ${read}`);
	}
}
