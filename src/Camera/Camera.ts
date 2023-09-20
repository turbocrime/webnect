import type { CamCommandOut } from "./command";
import type { CamMode, CamModeSet } from "./mode";
import type { ToRgbaBuffer } from "../stream/format";

import type {
	CamIsoWorkerActiveMsg,
	CamIsoWorkerInitMsg,
	CamIsoWorkerMsg,
	CamIsoWorkerReply,
} from "../worker";

import { camIsoWorkerUrl } from "../worker";

import { CamOption, CamType, CamUsbCommand } from "./enum";

import { CamFrameDeveloper, CamStream } from "../stream";
import { CamIsoEndpoint } from "../stream/enum";
import { CamCommand, CamCommandIO } from "./command";
import { Modes, parseModeOpts } from "./mode";

const getDeviceIndex = (d: USBDevice) =>
	navigator.usb.getDevices().then((ds) => ds.indexOf(d));

const WORKER_REPLY_TIMEOUT_MS = 1000;

const Video = CamIsoEndpoint.VIDEO;
const Depth = CamIsoEndpoint.DEPTH;

type CameraInitOpts = {
	modes?: {
		depth?: Partial<CamMode> | boolean;
		video?: Partial<CamMode> | boolean;
	};
	deraw?: {
		depth?: CamFrameDeveloper | ToRgbaBuffer | boolean;
		video?: CamFrameDeveloper | ToRgbaBuffer | boolean;
	};
};

export default class Camera {
	public async mode({
		depth,
		video,
	}: {
		depth: boolean | Partial<CamMode>;
		video: boolean | Partial<CamMode>;
	}) {
		return this.setMode(Modes(depth, video));
	}

	public async deraw({
		depth,
		video,
	}: {
		depth?: boolean | CamFrameDeveloper | ToRgbaBuffer;
		video?: boolean | CamFrameDeveloper | ToRgbaBuffer;
	}) {
		if (depth != null) this[Depth].deraw = depth;
		if (video != null) this[Video].deraw = video;
	}

	public get depth() {
		return this[Depth].readable;
	}

	public get video() {
		return this[Video].readable;
	}

	public get cachedRegisters(): Readonly<
		Record<CamOption | keyof typeof CamOption, number>
	> {
		return this._cachedRegisters;
	}

	public get registers() {
		return this._asyncActualRegisters;
	}

	public set registers(someRegisters: Partial<
		typeof this._asyncActualRegisters
	>) {
		for (const [key, value] of Object.entries(someRegisters))
			this._asyncActualRegisters[
				key as keyof typeof this._asyncActualRegisters
			] = value;
	}

	public async register(
		addr: CamOption | keyof typeof CamOption,
		value?: number,
	): Promise<Uint16Array> {
		const reg =
			typeof addr === "string" && isNaN(Number(addr))
				? CamOption[addr as keyof typeof CamOption]
				: (Number(addr) as CamOption);
		return value == null
			? this.readRegister(reg)
			: this.writeRegister(reg, value);
	}

	public async command(
		cmdId: CamUsbCommand,
		content: Uint16Array,
	): Promise<Uint16Array> {
		const tag = this.cmdTag++;
		const cmd = new CamCommand({ cmdId, content, tag });
		const rCmd = this.cmdIO.sendCmd(cmd as CamCommandOut);
		return rCmd.then((r) => r.cmdContent);
	}

	private dev: USBDevice;

	private [Depth]: CamStream;
	private [Video]: CamStream;

	private _cmdTag = 0;
	private cmdIO: CamCommandIO;

	private usbWorker: Worker;

	public ready: Promise<this>;

	constructor(dev: USBDevice, initOpts?: CameraInitOpts) {
		this.dev = dev;
		this.cmdIO = new CamCommandIO(dev);

		const { modes, deraw } = {
			deraw: { depth: true, video: true },
			...initOpts,
		};

		this[Video] = new CamStream(deraw.video ?? true);
		this[Depth] = new CamStream(deraw.depth ?? true);

		const parsedMode =
			modes &&
			parseModeOpts({ [Depth]: Modes.OFF, [Video]: Modes.OFF }, true, {
				[Depth]: modes?.depth ?? Modes.OFF,
				[Video]: modes?.video ?? Modes.OFF,
			});

		this.usbWorker = new Worker(camIsoWorkerUrl, {
			name: "webnect iso worker",
			type: "module",
			credentials: "omit",
		} as WorkerOptions);

		this.ready = this.initWorker()
			.then(() => this.initRegisters())
			.then(() => parsedMode && this.setMode(parsedMode))
			.then(() => this);
	}

	private get cmdTag() {
		return this._cmdTag % 256;
	}

	private set cmdTag(i: number) {
		this._cmdTag = i % 256;
	}

	private async initRegisters() {
		for (const key of Object.keys(CamOption)) {
			if (!isNaN(Number(key))) {
				const addr = Number(key) as CamOption;
				await this.readRegister(addr);
			}
		}
	}

	private async initWorker() {
		const initMsg = {
			type: "init",
			config: { dev: await getDeviceIndex(this.dev) },
		} as CamIsoWorkerInitMsg;

		const initReply = await this.workerReply(initMsg);

		initReply.video.pipeTo(this[Video].writable);
		initReply.depth.pipeTo(this[Depth].writable);

		return initReply;
	}

	private async activeWorker(setBoth?: 1 | 0 | boolean) {
		const activeMsg = {
			type: "active",
			video: setBoth ?? this[Video].mode.stream ? 1 : 0,
			depth: setBoth ?? this[Depth].mode.stream ? 1 : 0,
		} as CamIsoWorkerActiveMsg;

		const activeReply = await this.workerReply(activeMsg);

		if (
			activeMsg.depth !== activeReply.depth ||
			activeMsg.video !== activeReply.video
		)
			throw activeReply;

		return activeReply;
	}

	private workerReply<M extends CamIsoWorkerMsg>(
		message: M,
		timeout = WORKER_REPLY_TIMEOUT_MS,
	): Promise<CamIsoWorkerReply<M>> {
		return new Promise<CamIsoWorkerReply<M>>((resolve, reject) => {
			const replyListener = (event: MessageEvent) => {
				if (event.data?.type === message.type) {
					resolve(event.data as CamIsoWorkerReply<M>);
					this.usbWorker.removeEventListener("message", replyListener);
				}
			};

			this.usbWorker.addEventListener("message", replyListener);
			this.usbWorker.postMessage(message);

			setTimeout(() => {
				this.usbWorker.removeEventListener("message", replyListener);
				reject(new Error(`Worker ${message.type} timeout`));
			}, timeout);
		});
	}

	private async setMode(modeOpt?: CamModeSet) {
		const modes = parseModeOpts(
			{
				[Video]: this[Video].mode,
				[Depth]: this[Depth].mode,
			},
			false,
			modeOpt,
		);

		await this.activeWorker(false);
		this[Video].mode = modes[Video];
		this[Depth].mode = modes[Depth];
		await this.writeModeRegisters();
		await this.activeWorker();
	}

	private async writeModeRegisters() {
		const d = this[Depth].mode;
		const v = this[Video].mode;

		// disable cameras while we change the mode
		this.writeRegister(CamOption.DEPTH_TYPE, 0);
		this.writeRegister(CamOption.VIDEO_TYPE, 0);

		if (d.stream) {
			this.writeRegister(CamOption.PROJECTOR_CYCLE, 0);
			this.writeRegister(CamOption.DEPTH_FMT, d.format);
			this.writeRegister(CamOption.DEPTH_RES, d.res);
			this.writeRegister(CamOption.DEPTH_FPS, d.fps);
			this.writeRegister(CamOption.DEPTH_FLIP, d.flip);
		}

		if (v.stream === CamType.VISIBLE) {
			this.writeRegister(CamOption.VISIBLE_FMT, v.format);
			this.writeRegister(CamOption.VISIBLE_RES, v.res);
			this.writeRegister(CamOption.VISIBLE_FPS, v.fps);
			this.writeRegister(CamOption.VISIBLE_FLIP, v.flip);
		}

		if (v.stream === CamType.INFRARED) {
			this.writeRegister(CamOption.PROJECTOR_CYCLE, 0);
			this.writeRegister(CamOption.INFRARED_FMT, v.format);
			this.writeRegister(CamOption.INFRARED_RES, v.res);
			this.writeRegister(CamOption.INFRARED_FPS, v.fps);
			this.writeRegister(CamOption.INFRARED_FLIP, v.flip);
		}

		d.stream && this.writeRegister(CamOption.DEPTH_TYPE, d.stream);
		v.stream && this.writeRegister(CamOption.VIDEO_TYPE, v.stream);
	}

	// this method is async, but you probably don't want to await it. the
	// device batches responses and your commands may not merit a response.
	private async writeRegister(addr: CamOption, value: number) {
		const write = await this.command(
			CamUsbCommand.WRITE_REGISTER,
			new Uint16Array([addr, value]),
		);
		if (write && write.length === 1 && write[0] === 0) {
			this._cachedRegisters[CamOption[addr] as keyof typeof CamOption] = value;
			return write;
		} else throw write;
	}

	private async readRegister(addr: CamOption) {
		const read = await this.command(
			CamUsbCommand.READ_REGISTER,
			new Uint16Array([addr]),
		);
		if (read && read.length === 2 && read[0] === 0) {
			this._cachedRegisters[addr] = read[1];
			return read;
		} else throw read;
	}

	private optionName = (key: string | number) =>
		(typeof key === "string" && isNaN(Number(key))
			? key
			: CamOption[Number(key)]) as keyof typeof CamOption;

	private _cachedRegisters = Object.keys(CamOption).reduce((regs, key) => {
		if (!isNaN(Number(key)))
			Object.defineProperty(regs, key, {
				set: (value: number) => {
					this._cachedRegisters[this.optionName(key)] = value;
				},
				get: () => this._cachedRegisters[this.optionName(key)],
				enumerable: false,
			});
		return regs;
	}, {} as Record<CamOption | keyof typeof CamOption, number>);

	private _asyncActualRegisters = new Proxy(this._cachedRegisters, {
		get: async (target, property) => {
			await this.readRegister(
				typeof property === "string" && isNaN(Number(property))
					? CamOption[property as keyof typeof CamOption]
					: (Number(property) as CamOption),
			);
			// side-effect: readRegister updates target this._cachedRegisters
			return target[property as keyof typeof target];
		},
		set: (_, property, value: number | boolean) => {
			this.writeRegister(
				typeof property === "string" && isNaN(Number(property))
					? CamOption[property as keyof typeof CamOption]
					: (Number(property) as CamOption),
				Number(value),
			);
			// side-effect: writeRegister updates target this._cachedRegisters
			return true;
		},
	});
}
