const DEFAULT_PULL_INTERVAL = 15; // fast enough
const MAX_PENDING = 2; // more than 2 unnecessary, less than 2 may drop frames

/**
 * This `UnderlyingDefaultSource` will automatically request and enqueue
 * `USBIsochronousInTransferResult`s from the device.
 *
 * You should have already configured the device and claimed the relevant
 * interface before starting the stream.
 */
export class UnderlyingIsochronousTransferSource
	implements UnderlyingDefaultSource<USBIsochronousInTransferResult>
{
	private pendingTransfers = 0;

	private interval?: ReturnType<typeof setInterval>;

	/**
	 * @param dev - The USBDevice containing the isochronous endpoint.
	 * @param usbEndpoint - The index of the isochronous endpoint.
	 * @param packetLengths - Array specifying byte size of each packet in batch.
	 * @param pullInterval - Interval in milliseconds between transfer requests.
	 */
	constructor(
		private readonly dev: USBDevice,
		private readonly usbEndpoint: number,
		private readonly packetLengths: number[],
		private readonly pullInterval: number = DEFAULT_PULL_INTERVAL,
	) {
		if (!this.dev.opened) {
			throw new Error("Device not opened");
		}
	}

	async start(
		cont: ReadableStreamDefaultController<USBIsochronousInTransferResult>,
	) {
		this.interval = setInterval(() => this.pull(cont), this.pullInterval);
	}

	pull(cont: ReadableStreamDefaultController<USBIsochronousInTransferResult>) {
		if (this.pendingTransfers < MAX_PENDING) {
			this.pendingTransfers++;
			void this.dev
				.isochronousTransferIn(this.usbEndpoint, this.packetLengths)
				.then((usbResult) => cont.enqueue(usbResult))
				.catch(async (e) => {
					cont.error(e);
					clearInterval(this.interval);
				})
				.finally(() => this.pendingTransfers--);
		}
	}

	cancel(reason?: unknown) {
		console.debug("cancel", this.constructor.name, reason);
		clearInterval(this.interval);
	}
}
