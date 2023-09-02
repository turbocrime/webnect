const DEFAULT_BATCH_SIZE = 256;
const DEFAULT_PULL_RATE_LIMIT = 5;
const DEFAULT_MAX_PENDING_TRANSFERS = 2;

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

	pull = (
		cont: ReadableStreamDefaultController<USBIsochronousInTransferResult>,
	) => {
		if (this.pendingTransfers < this.maxPendingTransfers) {
			this.pendingTransfers++;
			this.device
				.isochronousTransferIn(
					this.endpointNumber,
					Array(this.batchSize).fill(this.packetSize),
				)
				.then((r) => cont.enqueue(r))
				.catch((e) => cont.error(e))
				.finally(() => this.pendingTransfers--);
		}
		// TODO: rate limit necessary?
		return new Promise<void>((r) => setTimeout(r, this.pullRateLimit));
	};
}
