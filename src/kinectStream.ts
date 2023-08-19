import type { WorkerInitMsg } from "./kinectWorker";

import {
	SerializedUSBIsochronousInTransferResult,
	PacketTransformer,
	FrameTransformer,
} from "./transformers";

import {
	CamFlagActive,
	CamDepthFormat,
	CamVisibleFormat,
	CamIRFormat,
	CamResolution,
	StreamPacketSize,
	StreamPacketType,
	StreamUsbEndpoint,
} from "./kinectEnum";

type TransferConfig = {
	dev: number;
	iface: number;
	endpt: number;
	devconf?: number;
	altiface?: number;
	batchSize: number;
	packetSize: StreamPacketSize;
};

const DEFAULT_USB_IFACE = 0;
const DEFAULT_USB_CONF = 1;
const DEFAULT_USB_BATCH = 256;
//const DEFAULT_USB_ALTERNATE = 0;

type StreamMode = {
	type: CamFlagActive;
	res: CamResolution;
	format: CamDepthFormat | CamVisibleFormat | CamIRFormat;
};

type WorkerInitReply = WorkerInitMsg & {
	batchSize: number;
	packetSize: number;
	stream: ReadableStream<SerializedUSBIsochronousInTransferResult>;
};

/*
const DEFAULT_CAM_MODE: StreamMode = {
	type: CamFlagActive.DEPTH,
	res: CamResolution.MED,
	format: CamDepthFormat.D_11B,
};
*/

const frameDimension = {
	[CamResolution.LOW]: 320 * 240,
	[CamResolution.MED]: 640 * 480,
	[CamResolution.HIGH]: 1280 * 1024,
};
const irFrameDimension = {
	...frameDimension,
	[CamResolution.MED]: 640 * 488,
};
const bitsPerPixel = {
	[(CamFlagActive.VISIBLE << 4) | CamVisibleFormat.BAYER_8B]: 8,
	[(CamFlagActive.VISIBLE << 4) | CamVisibleFormat.YUV_16B]: 16,
	[(CamFlagActive.DEPTH << 4) | CamDepthFormat.D_10B]: 10,
	[(CamFlagActive.DEPTH << 4) | CamDepthFormat.D_11B]: 11,
	[(CamFlagActive.IR << 4) | CamIRFormat.IR_10B]: 10,
};

const selectStreamConfig = ({ type, format, res }: StreamMode) =>
	({
		[CamFlagActive.VISIBLE]: {
			packetSize: StreamPacketSize.VIDEO,
			packetType: StreamPacketType.VIDEO,
			frameSize: (frameDimension[res] * bitsPerPixel[(type << 4) | format]) / 8,
		},
		[CamFlagActive.DEPTH]: {
			packetSize: StreamPacketSize.DEPTH,
			packetType: StreamPacketType.DEPTH,
			frameSize: (frameDimension[res] * bitsPerPixel[(type << 4) | format]) / 8,
		},
		[CamFlagActive.IR]: {
			packetSize: StreamPacketSize.VIDEO,
			packetType: StreamPacketType.VIDEO,
			frameSize:
				(irFrameDimension[res] * bitsPerPixel[(type << 4) | format]) / 8,
		},
	})[type];

const selectTransferConfig = (
	devIdx: number,
	camMode: StreamMode,
	usbOpt?: {
		batchSize?: number;
		devconf?: number;
		altiface?: number;
	},
) => ({
	batchSize: usbOpt?.batchSize ?? DEFAULT_USB_BATCH,
	devconf: usbOpt?.devconf ?? DEFAULT_USB_CONF,
	dev: devIdx,
	iface: DEFAULT_USB_IFACE,
	endpt:
		camMode.type === CamFlagActive.DEPTH
			? StreamUsbEndpoint.DEPTH
			: StreamUsbEndpoint.VIDEO,
});

export class KinectStream {
	transferConfig: {
		dev: number;
		iface: number;
		endpt: number;
		devconf?: number;
		altiface?: number;
		batchSize: number;
		packetSize: StreamPacketSize;
	};
	streamConfig: {
		packetType: StreamPacketType;
		frameSize: number;
		packetSize: StreamPacketSize;
	};

	ready: Promise<this>;

	usbWorker: Worker;
	workerStream?: ReadableStream<SerializedUSBIsochronousInTransferResult>;

	constructor(
		devIdx: number,
		camMode: StreamMode,
		usbOpt?: {
			devConf?: number;
			altiface?: number;
			batchSize?: number;
		},
	) {
		this.streamConfig = selectStreamConfig(camMode);
		this.transferConfig = {
			...selectTransferConfig(devIdx, camMode, usbOpt),
			packetSize: this.streamConfig.packetSize,
		};
		this.usbWorker = new Worker(new URL("./kinectWorker.ts", import.meta.url));
		this.ready = this.initWorker();
	}

	close() {
		this.usbWorker.postMessage({ type: "close" });
	}

	abort() {
		this.usbWorker.terminate();
	}

	async initWorker() {
		const requestConfig: WorkerInitMsg = {
			type: "init",
			...this.transferConfig,
		};

		let handleInitConfig: (value: WorkerInitReply) => void;
		const workerReady = new Promise<WorkerInitReply>((iR) => {
			handleInitConfig = iR;
		}).then((workerConfig: WorkerInitReply) => {
			if (
				Object.keys(requestConfig).reduce(
					(acc, k) =>
						acc ||
						workerConfig[k as keyof WorkerInitMsg] !==
							requestConfig[k as keyof WorkerInitMsg],
					false,
				)
			)
				console.warn("worker changed usb config", {
					workerConfig,
					requestConfig,
				});
			this.workerStream = workerConfig.stream;
			this.transferConfig = workerConfig;
			this.streamConfig.packetSize = workerConfig.packetSize;
		});

		this.usbWorker.addEventListener("message", (event) => {
			switch (event.data?.type) {
				case "init":
					handleInitConfig(event.data);
					break;
				case "terminate":
					console.warn("terminate message");
					this.usbWorker.terminate();
					break;
				default:
					console.error("Unknown message type in kinectStream", event);
					throw TypeError(`Unknown message type ${event.data?.type}`);
			}
		});

		this.usbWorker.postMessage(requestConfig as WorkerInitMsg);
		await workerReady;
		return this;
	}

	async getWorkerStream() {
		await this.ready;
		return this.workerStream
			?.pipeThrough(
				new TransformStream(
					new PacketTransformer(
						this.streamConfig.packetType,
						this.streamConfig.packetSize,
					),
				),
			)
			.pipeThrough(
				new TransformStream(new FrameTransformer(this.streamConfig.frameSize)),
			);
	}
}
