import type {
	KinectCameraWorkerInitConfig,
	KinectCameraWorkerInitReply,
} from "../workers/KinectCameraWorker";

import { KinectCameraStream } from "./KinectCameraStream";

import { getDeviceIndex } from "../utils/DeviceUtil";

import {
	CamUsbControl,
	CamUsbCommand,
	CamUsbEndpoint,
	CamOption,
	CamFPS,
	CamDepthFormat,
	CamVisibleFormat,
	CamIRFormat,
	CamType,
	CamResolution,
	OFF,
	ON,
} from "./enums";

export type KinectCameraMode = {
	stream: CamType | OFF;
	format: CamDepthFormat | CamVisibleFormat | CamIRFormat;
	res: CamResolution;
	fps: CamFPS;
	flip: ON | OFF;
};

export const DEFAULT_MODE_VISIBLE = {
	stream: CamType.VISIBLE,
	format: CamVisibleFormat.BAYER_8B,
	res: CamResolution.MED,
	flip: OFF,
	fps: CamFPS.F_30P,
} as const;

export const DEFAULT_MODE_INFRARED = {
	stream: CamType.IR,
	format: CamIRFormat.IR_10B,
	res: CamResolution.MED,
	flip: OFF,
	fps: CamFPS.F_30P,
} as const;

export const DEFAULT_MODE_DEPTH = {
	stream: CamType.DEPTH,
	format: CamDepthFormat.D_11B,
	res: CamResolution.MED,
	flip: OFF,
	fps: CamFPS.F_30P,
} as const;

type SingleMode = Partial<KinectCameraMode> & { stream: CamType | OFF };
type SomeModes = Partial<Record<CamUsbEndpoint, SingleMode>>;

export class KinectCamera {
	dev: USBDevice;

	[CamUsbEndpoint.DEPTH]: KinectCameraStream;
	[CamUsbEndpoint.VIDEO]: KinectCameraStream;

	cmdTag: number;

	usbWorker: Worker;

	ready: Promise<void>;

	constructor(dev: USBDevice, cameraMode?: SingleMode | SomeModes) {
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
		let handleInitReply: (value: KinectCameraWorkerInitReply) => void;
		let rejectInitReply: () => void;
		const workerReply = new Promise<KinectCameraWorkerInitReply>(
			(resolve, reject) => {
				handleInitReply = resolve;
				rejectInitReply = reject;
			},
		);

		this.usbWorker.addEventListener("message", (event) => {
			switch (event.data?.type) {
				case "init":
					handleInitReply(event.data);
					break;
				default:
					rejectInitReply();
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
		modeOpt = {} as SingleMode | SomeModes,
		useDefaults = false,
	): Record<CamUsbEndpoint, KinectCameraMode> {
		const defaults = {
			[CamType.VISIBLE]: DEFAULT_MODE_VISIBLE,
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
			else if (
				modeOpt.stream === CamType.VISIBLE ||
				modeOpt.stream === CamType.IR
			)
				this.parseModeOpts({
					[CamUsbEndpoint.DEPTH]: this[CamUsbEndpoint.DEPTH].mode,
					...getUpdatedMode(CamUsbEndpoint.VIDEO, modeOpt),
				});
		} else if (isSomeModes(modeOpt))
			return {
				...getUpdatedMode(CamUsbEndpoint.VIDEO, modeOpt[CamUsbEndpoint.VIDEO]),
				...getUpdatedMode(CamUsbEndpoint.DEPTH, modeOpt[CamUsbEndpoint.DEPTH]),
			} as Record<CamUsbEndpoint, KinectCameraMode>;
		return this.parseModeOpts({
			[CamUsbEndpoint.VIDEO]: { stream: OFF },
			[CamUsbEndpoint.DEPTH]: defaults[CamType.DEPTH],
		});
	}

	async setMode(modeOpt?: SingleMode | SomeModes) {
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
				case CamType.VISIBLE: {
					await this.writeRegister(CamOption.VISIBLE_FORMAT, format);
					await this.writeRegister(CamOption.VISIBLE_RES, res);
					await this.writeRegister(CamOption.VISIBLE_FPS, fps);
					await this.writeRegister(CamOption.VISIBLE_FLIP, flip);
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
		const MAGIC_OUT = 0x4d47;
		const MAGIC_IN = 0x4252;
		const HEADER_SIZE = 8; // bytes

		const cmd = new Uint16Array(
			new ArrayBuffer(HEADER_SIZE + content.byteLength),
		);
		cmd.set([MAGIC_OUT, content.length, cmdId, this.cmdTag]);
		cmd.set(content, HEADER_SIZE / cmd.BYTES_PER_ELEMENT);

		const rCmd = new Uint16Array(await this.controlOutIn(cmd.buffer));
		const [rMagic, rLength, rCmdId, rTag, ...rContent] = rCmd;

		if (
			rMagic !== MAGIC_IN ||
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
