import { CamStream, CamFrameDeveloper } from "./stream/CamStream";
import type {
	CamIsoWorkerInitReply,
	CamIsoWorkerToggleMsg,
} from "./worker/CamIsoWorker";

import {
	CamMagic,
	CamOption,
	CamType,
	CamUsbCommand,
	CamUsbControl,
	CamIsoEndpoint,
	ON,
	OFF,
} from "./CamEnums";

import {
	CamModeSet,
	parseModeOpts,
	modes,
	DEFAULTS,
	STREAM_OFF,
} from "./util/CamMode";

export * from "./CamEnums";
export * from "./util/CamMode";

const getDeviceIndex = (d: USBDevice) =>
	navigator.usb.getDevices().then((ds) => ds.indexOf(d));

export class KinectCamera {
	dev: USBDevice;

	_registers: Record<CamOption, number>;

	[CamIsoEndpoint.DEPTH]: CamStream;
	[CamIsoEndpoint.VIDEO]: CamStream;

	cmdTag: number;

	usbWorker: Worker;

	ready: Promise<this>;

	constructor(
		dev: USBDevice,
		cameraMode?: CamModeSet,
		deraw = true as CamFrameDeveloper | boolean,
	) {
		this.cmdTag = 1;
		this.cmdQueue = new Array();

		this.dev = dev;
		this._registers = {} as Record<CamOption, number>;
		//this.initRegisters();

		this[CamIsoEndpoint.VIDEO] = new CamStream(deraw);
		this[CamIsoEndpoint.DEPTH] = new CamStream(deraw);

		this.usbWorker = new Worker(
			new URL("./worker/CamIsoWorker.ts", import.meta.url),
			{
				name: "webnect",
				type: "module",
			},
		);
		/*
		this.writeRegister(CamOption.VISIBLE_FLIP, ON);
		this.writeRegister(CamOption.INFRARED_FLIP, OFF);
		this.writeRegister(CamOption.DEPTH_FLIP, OFF);
		*/
		this.ready = this.initWorker();
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

		const { video, depth } = await workerReply;
		video.pipeTo(this[CamIsoEndpoint.VIDEO].writable);
		depth.pipeTo(this[CamIsoEndpoint.DEPTH].writable);
		return this;
	}

	async setMode(modeOpt?: CamModeSet) {
		console.log("setting modes", modeOpt);
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

		this.usbWorker.postMessage({
			type: "toggle",
			video: "stop",
			depth: "stop",
		} as CamIsoWorkerToggleMsg);

		// sleep briefly
		await new Promise((r) => setTimeout(r, 50));

		await this.writeModeRegisters();

		await new Promise((r) => setTimeout(r, 50));

		const toggleMessage = {
			type: "toggle",
			video: modes[CamIsoEndpoint.VIDEO].stream ? "go" : "stop",
			depth: modes[CamIsoEndpoint.DEPTH].stream ? "go" : "stop",
		} as CamIsoWorkerToggleMsg;
		console.log("resuming streams", toggleMessage);
		this.usbWorker.postMessage(toggleMessage);
	}

	async writeModeRegisters() {
		console.log("SETTING MODE");
		await this.writeRegister(CamOption.PROJECTOR_CYCLE, OFF);
		{
			console.log("SETTING DEPTH MODE", this[CamIsoEndpoint.DEPTH].mode);
			const { format, res, fps, stream } = this[CamIsoEndpoint.DEPTH].mode;

			await this.writeRegister(CamOption.DEPTH_TYPE, OFF);

			await this.writeRegister(CamOption.DEPTH_FMT, format);
			await this.writeRegister(CamOption.DEPTH_RES, res);
			await this.writeRegister(CamOption.DEPTH_FPS, fps);

			await this.writeRegister(CamOption.DEPTH_TYPE, stream);
		}

		{
			console.log("SETTING VIDEO MODE", this[CamIsoEndpoint.VIDEO].mode);
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
		const cmdTag = this.cmdTag;
		this.cmdTag++;

		const cmd = new ArrayBuffer(CMD_HEADER_SIZE + content.byteLength);
		const cmd16 = new Uint16Array(cmd);
		cmd16.set([CamMagic.COMMAND_OUT, content.length, cmdId, cmdTag]);
		cmd16.set(content, CMD_HEADER_SIZE / cmd16.BYTES_PER_ELEMENT);

		const rCmd = new Promise<ArrayBuffer>((resolve, reject) => {
			this.cmdQueue.push({ cmdTag, cmd, resolve, reject });
		});

		this.processCmdQueue();

		const rCmd16 = new Uint16Array(await rCmd);
		const [rMagic, rLength, rCmdId, rTag, ...rContent] = rCmd16;

		/*
		if (rMagic !== CamMagic.COMMAND_IN) throw Error(`bad magic ${rMagic}`);
		if (rLength !== rContent.length)
			throw Error(`bad len ${rLength} ${rContent.length}`);
		if (rCmdId !== cmdId) throw Error(`bad cmd ${rCmdId} ${cmdId}`);
		if (rTag !== this.cmdTag) throw Error(`bad tag ${rTag} ${this.cmdTag}`);
		*/

		return rContent;
	}

	async controlOutIn(controlBuffer: ArrayBuffer) {}

	// TODO: sequence write attempts?
	async writeRegister(register: CamOption, value: number): Promise<[0]> {
		console.log("WRITING", CamOption[register], value);
		const write = await this.command(
			CamUsbCommand.WRITE_REGISTER,
			new Uint16Array([register, value]),
		);
		if (write.length === 1 && write[0] === 0) return write as [0];
		else throw Error(`bad write ${write}`);
	}

	async readRegister(register: number): Promise<[number, number]> {
		const read = await this.command(
			CamUsbCommand.READ_REGISTER,
			new Uint16Array([register]),
		);
		if (read.length === 2) return read as [number, number];
		else throw Error(`bad read ${read}`);
	}
}
