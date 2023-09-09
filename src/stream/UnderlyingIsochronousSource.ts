import { CamIsoEndpoint } from "../CamEnums";

const DEFAULT_BATCH_SIZE = 256;
const DEFAULT_PULL_RATE_LIMIT = 5;
const DEFAULT_MAX_PENDING_TRANSFERS = 2;

export type SerializedUSBIsochronousInTransferResult = {
	readonly serialized: true;
	readonly data: ArrayBuffer;
	readonly packets: {
		readonly byteOffset: number;
		readonly byteLength: number;
		readonly status: USBTransferStatus;
	}[];
};

export const serializeIso = (
	r: USBIsochronousInTransferResult,
): SerializedUSBIsochronousInTransferResult => ({
	serialized: true,
	data: r.data!.buffer,
	packets: r.packets.map((p) => ({
		byteOffset: p.data!.byteOffset,
		byteLength: p.data!.byteLength,
		status: p.status!,
	})),
});

type UnderlyingIsochronousSourceOptions = {
	batchSize?: number;
	pullRateLimit?: number;
	maxPendingTransfers?: number;
};

export class UnderlyingIsochronousSource
	implements UnderlyingDefaultSource<USBIsochronousInTransferResult>
{
	device: USBDevice;
	pendingTransfers: number;
	endpointNumber: number;
	packetSize: number;

	batchSize: number;
	maxPendingTransfers: number;
	pullRateLimit: number;

	paused: Promise<void> | false = false;
	unpause = () => {};

	constructor(
		device: USBDevice,
		endpointNumber: number,
		packetSize: number,
		extraOpts?: UnderlyingIsochronousSourceOptions,
	) {
		this.pendingTransfers = 0;

		this.device = device;
		this.endpointNumber = endpointNumber;
		this.packetSize = packetSize;

		const {
			batchSize = DEFAULT_BATCH_SIZE,
			pullRateLimit = DEFAULT_PULL_RATE_LIMIT,
			maxPendingTransfers = DEFAULT_MAX_PENDING_TRANSFERS,
		} = extraOpts || {};

		this.batchSize = batchSize;
		this.pullRateLimit = pullRateLimit;
		this.maxPendingTransfers = maxPendingTransfers;
	}

	start(cont: ReadableStreamDefaultController) {
		Array(this.maxPendingTransfers).forEach(() => this.pull(cont));
	}

	pull(cont: ReadableStreamDefaultController) {
		if (this.paused) return this.paused;
		if (this.pendingTransfers < this.maxPendingTransfers) {
			this.pendingTransfers++;
			this.device
				.isochronousTransferIn(
					this.endpointNumber,
					Array(this.batchSize).fill(this.packetSize),
				)
				.then((r) => cont.enqueue(serializeIso(r)))
				.catch((e) => cont.error(e))
				.finally(() => this.pendingTransfers--);
		}
		// TODO: rate limit necessary?
		return new Promise<void>((r) => setTimeout(r, this.pullRateLimit));
	}

	cancel() {
		this.device.close();
	}

	active(s: "stop" | "go") {
		if (s === "stop")
			this.paused = new Promise<void>((resolve) => {
				this.unpause = resolve;
			});
		else {
			this.paused = false;
			this.unpause();
		}
		return s;
	}
}
