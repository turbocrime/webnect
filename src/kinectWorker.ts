let dev: USBDevice;
let iface: USBInterface;
let endP: USBEndpoint;
let batchSize: number;
let packetSize: number;
let writable: WritableStream<ArrayBuffer>;

let stopStream = false;

let runningStream: Promise<void>;

let makeReady: (value?: unknown) => void;
const ready = new Promise((resolve) => {
	makeReady = resolve;
});

self.addEventListener("message", async (event) => {
	console.log("worker received", event?.data?.type, event);
	switch (event.data?.type) {
		case "init": {
			const init = await initStream(event.data);
			postMessage({ ...init, type: "init" });
			makeReady();
			break;
		}
		case "start": {
			runningStream = beginStreaming();
			break;
		}
		case "abort": {
			console.error("kinectWorker abort", event);
			stopStream = true;
			writable?.abort(event.data?.reason);
			break;
		}
		case "close": {
			console.log("kinectWorker close", event);
			stopStream = true;
			writable?.close();
			break;
		}
		default: {
			console.error("kinectWorker unknown", event);
		}
	}
	console.log("exit worker listener");
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
	console.log("selected device", dev);
	await dev.open();
	await dev.selectConfiguration(1);
	iface = dev.configuration!.interfaces[opt.iFIdx ?? 0];
	await dev.claimInterface(opt.iFIdx ?? 0);
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

async function beginStreaming() {
	console.log("streaming waiting...");
	await ready;
	console.log("streaming ready");
	const tq = Array();
	const w = writable.getWriter();
	while (!stopStream) {
		if (tq.length < 2) {
			console.log("pushing to tq");
			tq.push(
				dev
					.isochronousTransferIn(
						endP.endpointNumber + 1, // god damn it
						Array(batchSize).fill(packetSize),
					)
					.then((r) => {
						if (r.data) w.write(r.data.buffer);
					}),
			);
		} else {
			const f = tq.shift();
			f.catch((e) => {
				console.error("error in tq", e);
				stopStream = true;
			});
			await Promise.allSettled([f, new Promise((r) => setTimeout(r, 10))]);
		}
	}
	console.log("exit beginStreaming");
	debugger;
	writable.close();
}
