import { CamStream } from "./stream/CamStream";
import type { CamIsoWorkerInitReply } from "./worker/CamIsoWorker";

import {
	CamMagic,
	CamOption,
	CamType,
	CamUsbCommand,
	CamUsbControl,
	CamIsoEndpoint,
	OFF,
} from "./CamEnums";

import { CamModeOpt, parseModeOpts, ALL_OFF } from "./util/CamMode";

export * from "./CamEnums";
export * from "./util/CamMode";

const getDeviceIndex = (d: USBDevice) =>
	navigator.usb.getDevices().then((ds) => ds.indexOf(d));

export class KinectCamera {
	dev: USBDevice;

	[CamIsoEndpoint.DEPTH]: CamStream;
	[CamIsoEndpoint.VIDEO]: CamStream;

	cmdTag: number;

	usbWorker: Worker;

	ready: Promise<this>;

	constructor(dev: USBDevice, cameraMode?: CamModeOpt) {
		this.cmdTag = 1;

		this.dev = dev;

		const modes = parseModeOpts(ALL_OFF, true, cameraMode);
		this[CamIsoEndpoint.VIDEO] = new CamStream(modes[CamIsoEndpoint.VIDEO]);
		this[CamIsoEndpoint.DEPTH] = new CamStream(modes[CamIsoEndpoint.DEPTH]);

		this.usbWorker = new Worker(
			new URL("./worker/CamIsoWorker.ts", import.meta.url),
			{
				name: "webnect",
				type: "module",
			},
		);
		this.ready = this.initWorker();
		//this.writeRegister(CamOption.VISIBLE_FLIP, OFF);
		//this.writeRegister(CamOption.INFRARED_FLIP, OFF);
		//this.writeRegister(CamOption.DEPTH_FLIP, OFF);
	}

	get depth() {
		return this[CamIsoEndpoint.DEPTH];
	}

	get video() {
		return this[CamIsoEndpoint.VIDEO];
	}

	async initWorker() {
		let handleInit: (value: CamIsoWorkerInitReply) => void;
		const workerReply = new Promise<CamIsoWorkerInitReply>((resolve) => {
			handleInit = resolve;
		});

		this.usbWorker.addEventListener("message", (event) => {
			switch (event.data?.type) {
				case "init":
					handleInit(event.data);
					break;
				default:
					this.usbWorker.terminate();
					throw TypeError(`Unknown message ${event}`);
			}
		});

		this.usbWorker.postMessage({
			type: "init",
			config: {
				dev: await getDeviceIndex(this.dev),
			},
		});

		const { videoIso, depthIso } = await workerReply;
		videoIso.pipeTo(this[CamIsoEndpoint.VIDEO].writable);
		depthIso.pipeTo(this[CamIsoEndpoint.DEPTH].writable);
		return this;
	}

	async setMode(modeOpt?: CamModeOpt) {
		const modes = parseModeOpts(
			{
				[CamIsoEndpoint.VIDEO]: this[CamIsoEndpoint.VIDEO].mode,
				[CamIsoEndpoint.DEPTH]: this[CamIsoEndpoint.DEPTH].mode,
			},
			false,
			modeOpt,
		);
		this[CamIsoEndpoint.VIDEO].mode = modes[CamIsoEndpoint.VIDEO];
		this[CamIsoEndpoint.DEPTH].mode = modes[CamIsoEndpoint.DEPTH];
		this.writeModeRegisters();
	}

	async writeModeRegisters() {
		await this.writeRegister(CamOption.PROJECTOR_CYCLE, OFF);
		{
			const { format, res, fps, flip, stream } =
				this[CamIsoEndpoint.DEPTH].mode;

			await this.writeRegister(CamOption.DEPTH_TYPE, OFF);

			await this.writeRegister(CamOption.DEPTH_FMT, format);
			await this.writeRegister(CamOption.DEPTH_RES, res);
			await this.writeRegister(CamOption.DEPTH_FPS, fps);

			await this.writeRegister(CamOption.DEPTH_TYPE, stream);
		}

		{
			const { format, res, fps, flip, stream } =
				this[CamIsoEndpoint.VIDEO].mode;

			await this.writeRegister(CamOption.VIDEO_TYPE, OFF);
			switch (stream) {
				case CamType.VISIBLE: {
					await this.writeRegister(CamOption.VISIBLE_FMT, format);
					await this.writeRegister(CamOption.VISIBLE_RES, res);
					await this.writeRegister(CamOption.VISIBLE_FPS, fps);
					await this.writeRegister(CamOption.VIDEO_TYPE, stream);
					break;
				}
				case CamType.INFRARED: {
					await this.writeRegister(CamOption.INFRARED_FMT, format);
					await this.writeRegister(CamOption.INFRARED_RES, res);
					await this.writeRegister(CamOption.INFRARED_FPS, fps);
					await this.writeRegister(CamOption.VIDEO_TYPE, stream);
					break;
				}
			}
		}
	}

	async command(cmdId: CamUsbCommand, content: Uint16Array) {
		const CMD_HEADER_SIZE = 8; // bytes
		const cmd = new Uint16Array(
			new ArrayBuffer(CMD_HEADER_SIZE + content.byteLength),
		);
		cmd.set([CamMagic.COMMAND_OUT, content.length, cmdId, this.cmdTag]);
		cmd.set(content, CMD_HEADER_SIZE / cmd.BYTES_PER_ELEMENT);

		const rCmd = new Uint16Array(await this.controlOutIn(cmd.buffer));
		const [rMagic, rLength, rCmdId, rTag, ...rContent] = rCmd;

		if (rMagic !== CamMagic.COMMAND_IN) throw Error(`bad magic ${rMagic}`);
		if (rLength !== rContent.length)
			throw Error(`bad len ${rLength} ${rContent.length}`);
		if (rCmdId !== cmdId) throw Error(`bad cmd ${rCmdId} ${cmdId}`);
		if (rTag !== this.cmdTag) throw Error(`bad tag ${rTag} ${this.cmdTag}`);
		console.log("rCmd", rCmd);

		this.cmdTag++;
		return rContent;
	}

	async controlOutIn(controlBuffer: ArrayBuffer) {
		const timeout = 150;
		const retry = 10;
		let usbResult: USBInTransferResult | USBOutTransferResult;

		try {
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
			if (usbResult.status !== "ok") throw Error(`Camera control ${usbResult}`);

			const responseTimeout = setTimeout(() => {
				throw Error(`Camera control timeout`);
			}, timeout);

			let retryDelay = Promise.resolve();

			do {
				await retryDelay;
				retryDelay = new Promise((resolve) => setTimeout(resolve, retry));
				usbResult = await this.dev.controlTransferIn(
					{
						requestType: "vendor",
						recipient: "device",
						request: CamUsbControl.CAMERA,
						value: 0,
						index: 0,
					},
					10,
				);
			} while (!usbResult.data?.byteLength);
			clearTimeout(responseTimeout);

			return usbResult.data?.buffer;
		} catch (e) {
			// retry
			console.error(e);
			return this.controlOutIn(controlBuffer);
		}
	}

	// TODO: sequence write attempts?
	async writeRegister(register: CamOption, value: number) {
		try {
			console.log("WRITING", CamOption[register], value);
			const write = await this.command(
				CamUsbCommand.WRITE_REGISTER,
				new Uint16Array([register, value]),
			);
			if (write.length === 1 && write[0] === 0) return write;
			else throw Error(`bad write ${write}`);
		} catch (e) {
			// retry
			console.error(e);
			return this.writeRegister(register, value);
		}
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
