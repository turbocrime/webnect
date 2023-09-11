const DEFAULT_BATCH_SIZE = 256;
const DEFAULT_PULL_RATE_LIMIT = 5;
const DEFAULT_MAX_PENDING_TRANSFERS = 2;

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

	_paused: boolean;

	private cont?: ReadableStreamDefaultController;

	constructor(
		device: USBDevice,
		endpointNumber: number,
		packetSize: number,
		extraOpts?: UnderlyingIsochronousSourceOptions,
	) {
		this._paused = true;
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
		this.cont = cont;
	}

	pull(cont: ReadableStreamDefaultController) {
		if (!this.paused && this.pendingTransfers < this.maxPendingTransfers) {
			this.pendingTransfers++;
			this.device
				.isochronousTransferIn(
					this.endpointNumber,
					Array(this.batchSize).fill(this.packetSize),
				)
				.then((r) => {
					cont.enqueue(serializeIso(r));
				})
				.catch((e) => cont.error(e))
				.finally(() => this.pendingTransfers--);
		}
		// TODO: rate limit necessary?
		return new Promise<void>((r) => setTimeout(r, this.pullRateLimit));
	}

	get paused() {
		return this._paused;
	}

	set paused(i: boolean) {
		this._paused = i;
		if (!this._paused) this.pull(this.cont!);
	}

	//cancel() { this.device.close(); }
}
