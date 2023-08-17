const MAX_PENDING_TRANSFERS = 2;

export type SerializedIso = {
	isoData: ArrayBuffer;
	isoPackets: Array<{
		offset: number;
		length: number;
		status: USBTransferStatus;
	}>;
};

export type WorkerInitMsg = {
	type: "init";
	dev: number;
	devconf?: number;
	iface: number;
	altiface?: number;
	endpt: number;
	batchSize?: number;
	packetSize?: number;
	stream?: WritableStream<SerializedIso> | ReadableStream<SerializedIso>;
};

export type WorkerMsg =
	| WorkerInitMsg
	| { type: "start" }
	| { type: "close" }
	| { type: "abort"; reason?: string }
	| { type: "terminate" };

let dev: USBDevice;
let devconf: USBConfiguration;
let iface: USBInterface;
let altiface: USBAlternateInterface;
let endpt: USBEndpoint;

let batchSize: number;
let packetSize: number;

let writable: WritableStream<SerializedIso>;
let writer: WritableStreamDefaultWriter<SerializedIso>;

let stopStream = false;
let runningStream: Promise<void>;

self.addEventListener("message", async (event: { data: WorkerMsg }) => {
	switch (event.data?.type) {
		case "init": {
			postMessage(await configureWorker(event.data));
			break;
		}
		case "start": {
			writer = writable.getWriter();
			runningStream = streamIsoTransfers();
			break;
		}
		case "abort": {
			writer.closed.finally(() => postMessage({ type: "terminate" }));
			writer.abort(event.data?.reason);
			break;
		}
		case "close": {
			stopStream = true;
			await runningStream;
			writer.close();
			break;
		}
		default: {
			console.error("Unknown message in kinectWorker", event);
			throw TypeError("Unknown message type");
		}
	}
});

async function claimInterface(
	devIdx: number,
	devconfNum?: number,
	ifaceNum?: number,
	altifaceNum?: number,
	endptNum?: number,
) {
	const d = await navigator.usb.getDevices();
	dev = d[devIdx];
	await dev.open();
	if (devconfNum != null) await dev.selectConfiguration(devconfNum);
	devconf = dev.configuration!;
	iface = devconf.interfaces.find(
		({ interfaceNumber }) => interfaceNumber === ifaceNum ?? 0,
	)!;
	await dev.claimInterface(iface.interfaceNumber);
	if (altifaceNum != null)
		await dev.selectAlternateInterface(iface.interfaceNumber, altifaceNum);
	altiface = iface.alternate;

	endpt = altiface.endpoints.find(
		({ direction, endpointNumber }) =>
			direction === "in" && endpointNumber === (endptNum ?? 0),
	)!;

	return {
		device: devIdx,
		devconf: devconf.configurationValue,
		iface: iface.interfaceNumber,
		altiface: iface.alternate.alternateSetting,
		endpt: endpt.endpointNumber,
		packetSize: endpt.packetSize,
	};
}

async function configureWorker(opt: WorkerInitMsg) {
	const claimed = await claimInterface(
		opt.dev,
		opt.devconf,
		opt.iface,
		opt.altiface,
		opt.endpt,
	);
	batchSize = opt.batchSize ?? 256;
	packetSize = opt.packetSize ?? claimed.packetSize;
	writable = opt.stream as WritableStream<SerializedIso>;
	return {
		type: "init",
		...claimed,
		batchSize,
		packetSize,
	};
}
async function streamIsoTransfers() {
	let pendingTransfers = 0;
	const requestIsoTransfer = () => {
		pendingTransfers++;
		dev
			.isochronousTransferIn(
				endpt.endpointNumber,
				Array(batchSize).fill(packetSize),
			)
			.then((r) => {
				//TODO: can these arrive out-of-order? possible desync
				writer.write({
					isoData: r.data!.buffer,
					isoPackets: r.packets.map((p) => ({
						offset: p.data!.byteOffset,
						length: p.data!.byteLength,
						status: p.status!,
					})),
				});
			})
			.catch((e) => {
				stopStream = true;
				writer.abort(e);
			})
			.finally(() => pendingTransfers--);
	};
	await writer.ready;
	while (!stopStream)
		if (pendingTransfers < MAX_PENDING_TRANSFERS) requestIsoTransfer();
		else await new Promise((r) => setTimeout(r, 15));
	dev.releaseInterface(iface.interfaceNumber);
}
