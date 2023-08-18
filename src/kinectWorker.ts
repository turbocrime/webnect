const MAX_PENDING_TRANSFERS = 2;

export type SerializedUSBIsochronousTransferResult = {
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
	stream?:
		| WritableStream<SerializedUSBIsochronousTransferResult>
		| ReadableStream<SerializedUSBIsochronousTransferResult>;
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

let runningStream: ReadableStream<SerializedUSBIsochronousTransferResult>;
let streamController: ReadableStreamDefaultController<SerializedUSBIsochronousTransferResult>;

self.addEventListener("message", async (event: { data: WorkerMsg }) => {
	switch (event.data?.type) {
		case "init": {
			const configured = await configureWorker(event.data);
			runningStream = initStream();
			postMessage(
				{
					...configured,
					stream: runningStream,
				},
				[runningStream],
			);
			break;
		}
		case "start": {
			break;
		}
		case "abort": {
			runningStream.cancel(event.data.reason);
			postMessage({ type: "terminate" });
			break;
		}
		case "close": {
			streamController.close();
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
	return {
		type: "init",
		...claimed,
		batchSize,
		packetSize,
	};
}

function initStream() {
	let pendingTransfers = 0;
	const isoTransfer = () =>
		dev.isochronousTransferIn(
			endpt.endpointNumber,
			Array(batchSize).fill(packetSize),
		);
	const serializeIso = (
		r: USBIsochronousInTransferResult,
	): SerializedUSBIsochronousTransferResult => ({
		isoData: r.data!.buffer,
		isoPackets: r.packets.map((p) => ({
			offset: p.data!.byteOffset,
			length: p.data!.byteLength,
			status: p.status!,
		})),
	});
	return new ReadableStream<SerializedUSBIsochronousTransferResult>({
		pull(cont) {
			if (pendingTransfers < MAX_PENDING_TRANSFERS) {
				pendingTransfers++;
				isoTransfer()
					.then((r) => cont.enqueue(serializeIso(r)))
					.catch((e) => cont.error(e))
					.finally(() => pendingTransfers--);
			}
			return new Promise((r) => setTimeout(r, 20));
		},
	});
}
