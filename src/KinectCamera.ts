import type {
	CamIsoWorkerInitReply,
	CamIsoWorkerActiveMsg,
	CamIsoWorkerActiveReply,
	CamIsoWorkerInitMsg,
} from "./worker/CamIsoWorker";

import type { CamMode, CamModeSet } from "./util/CamMode";

import { CamStream, CamFrameDeveloper } from "./stream/CamStream";

import {
	CamOption,
	CamType,
	CamUsbCommand,
	CamIsoEndpoint,
	ON,
	OFF,
} from "./CamEnums";

import { parseModeOpts } from "./util/CamMode";

import {
	CamCommand,
	CamCommandOut,
	CamCommandIn,
	CamCommandIO,
} from "./stream/CamCommand";

export * from "./CamEnums";
export * from "./util/CamMode";

const getDeviceIndex = (d: USBDevice) =>
	navigator.usb.getDevices().then((ds) => ds.indexOf(d));

export class KinectCamera {
	dev: USBDevice;

	_registers: Record<CamOption, number>;

	[CamIsoEndpoint.DEPTH]: CamStream;
	[CamIsoEndpoint.VIDEO]: CamStream;

	cmdTag: number; // TODO: maximum?
	cmdIO: CamCommandIO;

	usbWorker: Worker;

	ready: Promise<this>;

	constructor(
		dev: USBDevice,
		cameraModes?: CamModeSet,
		deraw = [true, true] as [
			CamFrameDeveloper | boolean,
			CamFrameDeveloper | boolean,
		],
	) {
		this.cmdTag = 0;
		this.cmdIO = new CamCommandIO(dev);

		this.dev = dev;
		this._registers = {} as Record<CamOption, number>;

		this[CamIsoEndpoint.VIDEO] = new CamStream(deraw[0]);
		this[CamIsoEndpoint.DEPTH] = new CamStream(deraw[1]);

		this.usbWorker = new Worker(
			new URL("./worker/CamIsoWorker.ts", import.meta.url),
			{
				name: "webnect",
				type: "module",
				credentials: "omit",
			} as WorkerOptions,
		);
		this.ready = this.initWorker()
			.then(() =>
				this.setMode(parseModeOpts({} as CamModeSet, true, cameraModes)),
			)
			.then(() => this);
	}

	get depth() {
		return this[CamIsoEndpoint.DEPTH];
	}

	get video() {
		return this[CamIsoEndpoint.VIDEO];
	}

	async initWorker() {
		const initMsg = {
			type: "init",
			config: {
				dev: await getDeviceIndex(this.dev),
			},
		} as CamIsoWorkerInitMsg;

		const initReply = new Promise<CamIsoWorkerInitReply>((resolve, reject) => {
			const initReplyListener = (event: MessageEvent) => {
				if (event.data?.type === "init") {
					event.data.video.pipeTo(this[CamIsoEndpoint.VIDEO].writable);
					event.data.depth.pipeTo(this[CamIsoEndpoint.DEPTH].writable);
					resolve(event.data);
					this.usbWorker.removeEventListener("message", initReplyListener);
				}
			};
			this.usbWorker.addEventListener("message", initReplyListener);
			setTimeout(() => {
				this.usbWorker.removeEventListener("message", initReplyListener);
				reject(new Error("Worker init timeout"));
			}, 1000);
		});

		this.usbWorker.postMessage(initMsg);
		return initReply;
	}

	activeWorker(setBoth?: "stop" | "go") {
		const activeMsg = {
			type: "active",
			video: setBoth ?? this[CamIsoEndpoint.VIDEO].mode.stream ? "go" : "stop",
			depth: setBoth ?? this[CamIsoEndpoint.DEPTH].mode.stream ? "go" : "stop",
		} as CamIsoWorkerActiveMsg;

		const activeReply = new Promise<CamIsoWorkerActiveReply>(
			(resolve, reject) => {
				const activeReplyListener = (event: MessageEvent) => {
					if (event.data?.type === "active") {
						if (
							activeMsg.depth === event.data.depth &&
							activeMsg.video === event.data.video
						)
							resolve(event.data);
						else reject(event.data);
						this.usbWorker.removeEventListener("message", activeReplyListener);
					}
				};
				this.usbWorker.addEventListener("message", activeReplyListener);
				setTimeout(() => {
					this.usbWorker.removeEventListener("message", activeReplyListener);
					reject(new Error("Worker timeout"));
				}, 1000);
			},
		);

		this.usbWorker.postMessage(activeMsg);
		return activeReply;
	}

	async setMode(modeOpt?: CamModeSet) {
		const modes = parseModeOpts(
			{
				[CamIsoEndpoint.VIDEO]: this[CamIsoEndpoint.VIDEO].mode,
				[CamIsoEndpoint.DEPTH]: this[CamIsoEndpoint.DEPTH].mode,
			},
			false,
			modeOpt,
		);

		await this.activeWorker("stop");
		this[CamIsoEndpoint.VIDEO].mode = modes[CamIsoEndpoint.VIDEO];
		this[CamIsoEndpoint.DEPTH].mode = modes[CamIsoEndpoint.DEPTH];
		await this.writeModeRegisters();
		await this.activeWorker();
	}

	async writeModeRegisters() {
		await Promise.all([
			this.writeRegister(CamOption.PROJECTOR_CYCLE, OFF),
			this.writeRegister(CamOption.DEPTH_TYPE, CamType.NONE),
			this.writeRegister(CamOption.VIDEO_TYPE, CamType.NONE),
		]);
		{
			const { format, res, fps, flip, stream } =
				this[CamIsoEndpoint.DEPTH].mode;

			this.writeRegister(CamOption.DEPTH_FMT, format);
			this.writeRegister(CamOption.DEPTH_RES, res);
			this.writeRegister(CamOption.DEPTH_FPS, fps);
			this.writeRegister(CamOption.DEPTH_FLIP, flip);
			await this.writeRegister(CamOption.DEPTH_TYPE, stream);
		}

		{
			const { format, res, fps, flip, stream } =
				this[CamIsoEndpoint.VIDEO].mode;

			switch (stream) {
				case CamType.VISIBLE: {
					this.writeRegister(CamOption.VISIBLE_FMT, format);
					this.writeRegister(CamOption.VISIBLE_RES, res);
					this.writeRegister(CamOption.VISIBLE_FPS, fps);
					this.writeRegister(CamOption.VISIBLE_FLIP, flip);
					await this.writeRegister(CamOption.VIDEO_TYPE, stream).catch((e) =>
						console.error("Caught", e),
					);
					break;
				}
				case CamType.INFRARED: {
					this.writeRegister(CamOption.INFRARED_FMT, format);
					this.writeRegister(CamOption.INFRARED_RES, res);
					this.writeRegister(CamOption.INFRARED_FPS, fps);
					this.writeRegister(CamOption.INFRARED_FLIP, flip);
					await this.writeRegister(CamOption.VIDEO_TYPE, stream);
					break;
				}
			}
		}
	}

	async command(
		cmdId: CamUsbCommand,
		content: Uint16Array,
	): Promise<Uint16Array> {
		const tag = this.cmdTag++;
		const cmd = new CamCommand({ cmdId, content, tag }) as CamCommandOut;
		const rCmd = this.cmdIO.sendCmd(cmd) as Promise<CamCommandIn>;
		return (await rCmd).cmdContent;
	}

	async writeRegister(register: CamOption, value: number) {
		console.log("WRITING", CamOption[register], value);
		const write = await this.command(
			CamUsbCommand.WRITE_REGISTER,
			new Uint16Array([register, value]),
		);
		if (write && write.length === 1 && write[0] === 0) return write;
		else throw Error(`bad write ${write}`);
	}

	async readRegister(register: number) {
		const read = await this.command(
			CamUsbCommand.READ_REGISTER,
			new Uint16Array([register]),
		);
		if (read && read.length === 2) return read;
		else throw Error(`bad read ${read}`);
	}
}
