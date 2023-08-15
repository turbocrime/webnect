let dev: USBDevice;
let iface: USBInterface;
let endP: USBEndpoint;
let batchSize: number;
let packetSize: number;
let writable: WritableStream;

let stopStream = false;

let runningStream: Promise<void>;

let makeReady: (value?: unknown) => void;
const ready = new Promise((resolve) => {
	makeReady = resolve;
});

self.addEventListener("message", async (event) => {
	switch (event.data?.type) {
		case "init": {
			console.info("kinectWorker init", event);
			const init = await initStream(event.data);
			postMessage({ ...init, type: "init" });
			makeReady();
			break;
		}
		case "start": {
			console.info("kinectWorker start", event);
			runningStream = isochronousStream();
			break;
		}
		case "stop": {
			console.info("kinectWorker stop", event);
			stopStream = true;
			break;
		}
		case "abort": {
			console.error("kinectWorker abort", event);
			stopStream = true;
			writable?.abort(event.data?.reason);
			break;
		}
		case "close": {
			console.warn("kinectWorker close", event);
			stopStream = true;
			break;
		}
		default: {
			console.error("kinectWorker unknown", event);
		}
	}
});

async function initStream(opt: {
	device: number;
	iFIdx?: number;
	ePIdx: number;
	batchSize?: number;
	packetSize?: number;
	// rome-ignore lint/suspicious/noExplicitAny: <explanation>
	writable: WritableStream<any>;
}) {
	const d = await navigator.usb.getDevices();
	dev = d[opt.device];
	await dev.open();
	await dev.selectConfiguration(1);
	iface = dev.configuration!.interfaces[opt.iFIdx ?? 0];
	// TODO: can other interfaces be simultaneously claimed by other workers?
	await dev.claimInterface(opt.iFIdx ?? 0);
	console.info("worker claimed interface", iface);
	endP = iface.alternate.endpoints[opt.ePIdx ?? 0];
	batchSize = opt.batchSize ?? 512;
	packetSize = opt.packetSize ?? endP.packetSize;
	writable = opt.writable;
	return {
		device: opt.device,
		iface: opt.iFIdx ?? 0,
		endpoint: opt.ePIdx ?? 0,
		batchSize,
		packetSize,
	};
}

async function isochronousStream() {
	const w = writable.getWriter();
	let iterCount = 0;
	let transferCount = 0;
	while (!stopStream) {
		iterCount++;
		await Promise.all([
			// TODO: apply backpressure at promise creation, not resolution
			new Promise((resolve) => setTimeout(resolve, 57)),
			w.ready,
		]);

		dev
			.isochronousTransferIn(
				endP.endpointNumber + 1, // god damn it
				Array(batchSize).fill(packetSize),
			)
			.then((r: USBIsochronousInTransferResult) => {
				transferCount++;
				w.write({
					isoData: r.data!.buffer,
					isoPackets: r.packets.map((p: USBIsochronousInTransferPacket) => ({
						offset: p.data!.byteOffset,
						length: p.data!.byteLength,
						status: p.status,
					})),
				});
			})
			.catch((e) => {
				console.error("transfer/write error", e);
				stopStream = true;
			});
	}
	console.warn("stopStream", { iterCount, transferCount });
	w.ready
		.then(async () => {
			w.releaseLock();
			await writable.close();
			console.log("writable closed");
			await dev.releaseInterface(iface.interfaceNumber);
			await dev.close();
			console.log("dev closed");
		})
		.catch((e) => console.error("error closing", e));
}
