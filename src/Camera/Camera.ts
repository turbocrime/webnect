import type {
	CamIsoWorkerActiveMsg,
	CamIsoWorkerInitMsg,
	CamIsoWorkerMsg,
	CamIsoWorkerReply,
} from "worker";

import type { CamMode, CamModeSet } from "./mode";
import type { CamCommandOut } from "./command";

import { CamOption, CamType, CamUsbCommand, CamIsoEndpoint } from "Camera/enum";

import { camIsoWorkerUrl } from "worker";

import { parseModeOpts, mode } from "./mode";
import { CamCommand, CamCommandIO } from "./command";
import { CamStream, CamFrameDeveloper } from "stream";

const getDeviceIndex = (d: USBDevice) =>
	navigator.usb.getDevices().then((ds) => ds.indexOf(d));

const WORKER_TIMEOUT_MS = 1000;

const Depth = CamIsoEndpoint.DEPTH;
const Video = CamIsoEndpoint.VIDEO;

export default class Camera {
	public async mode(
		depthMode?: false | Partial<CamMode>,
		videoMode?: false | Partial<CamMode>,
	) {
		return this.setMode(mode(depthMode, videoMode));
	}

	public get depth() {
		return this[Depth];
	}

	public get video() {
		return this[Video];
	}

	public get registers(): Readonly<Record<CamOption, number>> {
		return this._registers;
	}

	public async register(
		addr: CamOption,
		value?: number | boolean,
	): Promise<Uint16Array> {
		return value == null
			? this.readRegister(addr)
			: this.writeRegister(addr, value);
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

	private _registers = {} as Record<CamOption, number>;

	private _cmdTag = 0;
	private cmdIO: CamCommandIO;

	private usbWorker: Worker;

	public ready: Promise<this>;

	constructor(
		dev: USBDevice,
		cameraModes?: CamModeSet,
		deraw = [true, true] as [
			CamFrameDeveloper | boolean,
			CamFrameDeveloper | boolean,
		],
	) {
		this.dev = dev;
		this.cmdIO = new CamCommandIO(dev);

		this[Video] = new CamStream(deraw[0]);
		this[Depth] = new CamStream(deraw[1]);

		const parsedMode = parseModeOpts({} as CamModeSet, true, cameraModes);

		this.usbWorker = new Worker(camIsoWorkerUrl, {
			name: "webnect iso worker",
			type: "module",
			credentials: "omit",
		} as WorkerOptions);

		this.ready = this.initWorker()
			.then(() => this.setMode(parsedMode))
			.then(() => this);
	}

	private get cmdTag() {
		return this._cmdTag % 256;
	}

	private set cmdTag(i: number) {
		this._cmdTag = i % 256;
	}

	private async initWorker() {
		const initMsg = {
			type: "init",
			config: {
				dev: await getDeviceIndex(this.dev),
			},
		} as CamIsoWorkerInitMsg;

		const initReply = await this.workerReply(initMsg);

		initReply.video.pipeTo(this[Video].writable);
		initReply.depth.pipeTo(this[Depth].writable);

		return initReply;
	}

	private async activeWorker(setBoth?: ON | OFF) {
		const activeMsg = {
			type: "active",
			video: setBoth ?? this[Video].mode.stream ? ON : OFF,
			depth: setBoth ?? this[Depth].mode.stream ? ON : OFF,
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
		timeout = WORKER_TIMEOUT_MS,
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

		await this.activeWorker(OFF);
		this[Video].mode = modes[Video];
		this[Depth].mode = modes[Depth];
		await this.writeModeRegisters();
		await this.activeWorker();
	}

	private async writeModeRegisters() {
		const d = this[Depth].mode;
		const v = this[Video].mode;

		await Promise.all([
			this.writeRegister(CamOption.DEPTH_TYPE, OFF),
			this.writeRegister(CamOption.VIDEO_TYPE, OFF),
		]);

		if (d.stream) {
			this.writeRegister(CamOption.PROJECTOR_CYCLE, OFF);
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
			this.writeRegister(CamOption.PROJECTOR_CYCLE, OFF);
			this.writeRegister(CamOption.INFRARED_FMT, v.format);
			this.writeRegister(CamOption.INFRARED_RES, v.res);
			this.writeRegister(CamOption.INFRARED_FPS, v.fps);
			this.writeRegister(CamOption.INFRARED_FLIP, v.flip);
		}

		await Promise.all([
			d.stream && this.writeRegister(CamOption.DEPTH_TYPE, d.stream),
			v.stream && this.writeRegister(CamOption.VIDEO_TYPE, v.stream),
		]);
	}

	private async writeRegister(addr: CamOption, value: number | boolean) {
		const write = await this.command(
			CamUsbCommand.WRITE_REGISTER,
			new Uint16Array([addr, value as number]),
		);
		if (write && write.length === 1 && write[0] === 0) {
			this._registers[addr] = value as number;
			return write;
		} else throw Error(`bad write ${write}`);
	}

	private async readRegister(addr: CamOption) {
		const read = await this.command(
			CamUsbCommand.READ_REGISTER,
			new Uint16Array([addr]),
		);
		if (read && read.length === 2 && read[0] === addr) {
			this._registers[read[0] as CamOption] = read[1];
			return read;
		} else throw Error(`bad read ${read}`);
	}
}
