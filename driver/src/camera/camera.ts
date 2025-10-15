import { CamCommander } from "./commander.js";
import { type CameraConfig, resolveConfig } from "./config.js";
import {
	Cam,
	CamRegister,
	type CamRegisterValue,
	CamUsbCommand,
} from "./enum.js";
import { type CamMode, isCamMode } from "./mode.js";
import { CamIsoEndpoint, CamIsoInterface } from "./stream/enum.js";
import { CamFrameAssembler } from "./stream/frame-assembler.js";
import type { CamImageData } from "./stream/image-data.js";
import { sendIsoWorkerMessage } from "./worker/iso-worker-message.js";

/** USB camera device controller */
export class Camera {
	public readonly serialNumber: string;

	public readonly ready: Promise<this>;

	public depth?: CamImageData<CamMode<Cam.DEPTH>>;
	public video?:
		| CamImageData<CamMode<Cam.VISIBLE>>
		| CamImageData<CamMode<Cam.INFRARED>>;

	private cmd: CamCommander;
	private worker = new Worker(new URL("./worker/worker.js", import.meta.url), {
		type: "module",
	});

	/**
	 * @param dev USB device instance
	 * @param config Initial camera configuration
	 */
	constructor(
		private readonly dev: USBDevice,
		config?: CameraConfig,
	) {
		// biome-ignore lint/style/noNonNullAssertion: will be present
		this.serialNumber = this.dev.serialNumber!;

		this.ready = dev.open().then(async () => {
			await dev.reset();
			await dev.selectConfiguration(1);
			return this;
		});

		this.cmd = new CamCommander(dev);

		if (config) {
			const images = resolveConfig(config);

			this.depth = images.depth;
			this.video = images.video;

			void Promise.all([
				this.streamDepth(images.depth?.mode)?.then(
					(rawStream) =>
						void rawStream?.pipeTo(new WritableStream(images.depth)),
				),
				this.streamVideo(images.video?.mode)?.then(
					(rawStream) =>
						void rawStream?.pipeTo(new WritableStream(images.video)),
				),
			]);
		}
	}

	/**
	 * Write to a camera register
	 * @param addr Register address
	 * @param value Register value
	 * @warning Responses may be buffered by the device, so may not resolve.
	 */
	public async writeRegister<R extends CamRegister>(
		addr: R,
		value: CamRegisterValue<R>,
	): Promise<void> {
		await this.ready;

		const cmd = await this.cmd.send(
			CamUsbCommand.WRITE_REGISTER,
			new Uint16Array([addr, Number(value)]),
		);

		const [err] = cmd.body;

		if (err || cmd.body.length !== 1) {
			throw new Error(`Bad write ${cmd.body.join()}`, { cause: cmd });
		}
	}

	/**
	 * Read from a camera register
	 * @param addr Register address
	 * @returns Register value
	 */
	public async readRegister<R extends CamRegister>(
		addr: R,
	): Promise<CamRegisterValue<R>> {
		await this.ready;

		const cmd = await this.cmd.send(
			CamUsbCommand.READ_REGISTER,
			new Uint16Array([addr]),
		);

		const [err, value] = cmd.body;

		if (err || cmd.body.length !== 2) {
			throw new Error(`Bad read ${err}`, { cause: cmd });
		}

		return value as CamRegisterValue<R>;
	}

	/**
	 * Configure camera and return images
	 * @param config Camera configuration
	 * @returns Active image data streams
	 */
	public async setMode<C extends CameraConfig>(config: C) {
		await this.ready;

		const images = resolveConfig(config);

		this.depth = images.depth;
		this.video = images.video;

		await Promise.all([
			this.streamDepth(images.depth?.mode)?.then(
				(rawStream) => void rawStream?.pipeTo(new WritableStream(images.depth)),
			),
			this.streamVideo(images.video?.mode)?.then(
				(rawStream) => void rawStream?.pipeTo(new WritableStream(images.video)),
			),
		]);

		return images;
	}

	private async activate(endpoint: CamIsoEndpoint, mode: NonNullable<CamMode>) {
		await this.ready;

		return sendIsoWorkerMessage(this.worker, "activate", {
			serialNumber: this.serialNumber,
			usbEndpoint: endpoint,
			usbInterface: CamIsoInterface.CAMERA,
		}).then(({ stream }) =>
			stream.pipeThrough(new TransformStream(new CamFrameAssembler(mode))),
		);
	}

	private async deactivate(endpoint: CamIsoEndpoint) {
		await this.ready;

		const response = await sendIsoWorkerMessage(this.worker, "deactivate", {
			serialNumber: this.serialNumber,
			usbEndpoint: endpoint,
			usbInterface: CamIsoInterface.CAMERA,
		});

		console.debug("deactivate response", response);
	}

	public async streamDepth<M extends CamMode<Cam.DEPTH> | CamMode<Cam.OFF>>(
		mode: M,
	): Promise<
		M extends CamMode<Cam.OFF> ? undefined : ReadableStream<ArrayBuffer>
	> {
		// stop updating the old image
		await this.deactivate(CamIsoEndpoint.DEPTH);

		// disable hardware while manipulating config
		void this.writeRegister(CamRegister.DEPTH_TYPE, Cam.OFF);

		if (isCamMode(Cam.OFF, mode)) {
			return undefined as M extends CamMode<Cam.OFF> ? undefined : never;
		}

		if (isCamMode(Cam.DEPTH, mode)) {
			void this.writeRegister(CamRegister.PROJECTOR_CYCLE, 0);
			void this.writeRegister(CamRegister.DEPTH_FMT, mode.format);
			void this.writeRegister(CamRegister.DEPTH_RES, mode.res);
			void this.writeRegister(CamRegister.DEPTH_FPS, mode.fps ?? 30);
			void this.writeRegister(CamRegister.DEPTH_FLIP, mode.flip ? 1 : 0);

			// re-enable the hardware
			void this.writeRegister(CamRegister.DEPTH_TYPE, mode.stream);

			return this.activate(CamIsoEndpoint.DEPTH, mode) as Promise<
				M extends CamMode<Cam.OFF> ? never : ReadableStream<ArrayBuffer>
			>;
		}

		throw new RangeError("Invalid depth mode", { cause: mode });
	}

	public async streamVideo<
		M extends CamMode<Cam.VISIBLE> | CamMode<Cam.INFRARED> | CamMode<Cam.OFF>,
	>(
		mode: M,
	): Promise<
		M extends CamMode<Cam.OFF> ? undefined : ReadableStream<ArrayBuffer>
	> {
		// stop updating the old image
		await this.deactivate(CamIsoEndpoint.VIDEO);

		// disable hardware while manipulating config
		void this.writeRegister(CamRegister.VIDEO_TYPE, Cam.OFF);

		if (isCamMode(Cam.OFF, mode)) {
			return undefined as M extends CamMode<Cam.OFF> ? undefined : never;
		}

		if (isCamMode(Cam.VISIBLE, mode)) {
			void this.writeRegister(CamRegister.VISIBLE_FMT, mode.format);
			void this.writeRegister(CamRegister.VISIBLE_RES, mode.res);
			void this.writeRegister(CamRegister.VISIBLE_FPS, mode.fps);
			void this.writeRegister(CamRegister.VISIBLE_FLIP, mode.flip ? 1 : 0);

			// re-enable the hardware
			void this.writeRegister(CamRegister.VIDEO_TYPE, mode.stream);

			return this.activate(CamIsoEndpoint.VIDEO, mode) as Promise<
				M extends CamMode<Cam.OFF> ? never : ReadableStream<ArrayBuffer>
			>;
		}

		if (isCamMode(Cam.INFRARED, mode)) {
			void this.writeRegister(CamRegister.PROJECTOR_CYCLE, 0);
			void this.writeRegister(CamRegister.INFRARED_FMT, mode.format);
			void this.writeRegister(CamRegister.INFRARED_RES, mode.res);
			void this.writeRegister(CamRegister.INFRARED_FPS, mode.fps);
			void this.writeRegister(CamRegister.INFRARED_FLIP, mode.flip ? 1 : 0);

			// re-enable the hardware
			void this.writeRegister(CamRegister.VIDEO_TYPE, mode.stream);

			return this.activate(CamIsoEndpoint.VIDEO, mode) as Promise<
				M extends CamMode<Cam.OFF> ? never : ReadableStream<ArrayBuffer>
			>;
		}

		throw new RangeError("Invalid video mode", { cause: mode });
	}
}
