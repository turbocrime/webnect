declare const self: Worker;
declare const navigator: Navigator & { usb: USB };

export const camIsoWorkerUrl = import.meta.url.toString();

import type {
	CamIsoWorkerActiveMsg,
	CamIsoWorkerActiveReply,
	CamIsoWorkerInitMsg,
	CamIsoWorkerInitReply,
	CamIsoWorkerMsg,
	CamIsoWorkerOpts,
} from ".";

import { CamIsoEndpoint, CamIsoPacketFlag, CamIsoPacketSize } from "../enum";
import { CamIsoParser } from "../stream/CamIsoParser";
import { UnderlyingIsochronousSource } from "../stream/UnderlyingIsochronousSource";

const DEFAULT_USB_DEV = 0;
const DEFAULT_USB_IFACE = 0;

let dev: USBDevice;
let iface: USBInterface;
//let devconf: USBConfiguration;
//let altiface: USBAlternateInterface;
let batchSize: number | undefined;

const sources = {
	[CamIsoEndpoint.DEPTH]: {} as UnderlyingIsochronousSource,
	[CamIsoEndpoint.VIDEO]: {} as UnderlyingIsochronousSource,
};
self.addEventListener("message", async (event: { data: CamIsoWorkerMsg }) => {
	switch (event.data?.type) {
		case "init": {
			event.data as CamIsoWorkerInitMsg;
			await initUsb(event.data.config);
			const depth = initStream("DEPTH");
			const video = initStream("VIDEO");
			self.postMessage(
				{ type: "init", depth, video } as CamIsoWorkerInitReply,
				[depth, video] as Transferable[],
			);
			break;
		}
		case "active": {
			event.data as CamIsoWorkerActiveMsg;
			const { depth, video } = event.data;
			sources[CamIsoEndpoint.DEPTH].active(depth);
			sources[CamIsoEndpoint.VIDEO].active(video);
			self.postMessage({
				type: "active",
				depth,
				video,
			} as CamIsoWorkerActiveReply);
			break;
		}
		default: {
			console.error("Unknown message", event);
			throw TypeError("Unknown message");
		}
	}
});

const initUsb = async (opt: CamIsoWorkerOpts) => {
	opt.dev ??= DEFAULT_USB_DEV;
	opt.iface ??= DEFAULT_USB_IFACE;

	const d = await navigator.usb.getDevices();
	dev = d[opt.dev];

	await dev.open();

	if (opt.devconf != null) await dev.selectConfiguration(opt.devconf);
	//devconf = dev.configuration!;

	iface = dev.configuration?.interfaces.find(
		({ interfaceNumber }) => interfaceNumber === opt.iface,
	)!;
	await dev.claimInterface(iface.interfaceNumber);

	if (opt.altiface != null)
		await dev.selectAlternateInterface(iface.interfaceNumber, opt.altiface);
	//altiface = iface.alternate;

	batchSize = opt.batchSize;
};

const initStream = (streamType: "DEPTH" | "VIDEO") => {
	const source = new UnderlyingIsochronousSource(
		dev,
		CamIsoEndpoint[streamType],
		CamIsoPacketSize[streamType],
		{ batchSize },
	);
	sources[CamIsoEndpoint[streamType]] = source;
	const packetStream = new ReadableStream(source).pipeThrough(
		new TransformStream(
			new CamIsoParser(
				CamIsoPacketFlag[streamType],
				CamIsoPacketSize[streamType],
			),
		),
	);
	return packetStream;
};

export {};
