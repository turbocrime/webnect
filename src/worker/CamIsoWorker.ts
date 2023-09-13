declare const self: Worker;
declare const navigator: Navigator & { usb: USB };

export const camIsoWorkerUrl = import.meta.url.toString();

import { CamIsoParser, UnderlyingIsochronousSource } from "../stream";
import {
	CamIsoEndpoint,
	CamIsoPacketFlag,
	CamIsoPacketSize,
} from "../stream/enum";

import {
	CamIsoWorkerActiveMsg,
	CamIsoWorkerActiveReply,
	CamIsoWorkerInitMsg,
	CamIsoWorkerInitReply,
	CamIsoWorkerMsg,
	CamIsoWorkerOpts,
} from "./messageTypes";

const DEFAULT_USB_DEV = 0;
const DEFAULT_USB_IFACE = 0;

let dev: USBDevice;
let iface: USBInterface;
//let devconf: USBConfiguration;
//let altiface: USBAlternateInterface;
let batchSize: number | undefined;

const Video = CamIsoEndpoint.VIDEO;
const Depth = CamIsoEndpoint.DEPTH;

const sources = {
	[Depth]: {} as UnderlyingIsochronousSource,
	[Video]: {} as UnderlyingIsochronousSource,
};
self.addEventListener("message", async (event: { data: CamIsoWorkerMsg }) => {
	switch (event.data?.type) {
		case "init": {
			event.data as CamIsoWorkerInitMsg;
			await initUsb(event.data.config);
			const depth = initStream(Depth);
			const video = initStream(Video);
			self.postMessage(
				{ type: "init", depth, video } as CamIsoWorkerInitReply,
				[depth, video] as Transferable[],
			);
			break;
		}
		case "active": {
			event.data as CamIsoWorkerActiveMsg;
			const { depth, video } = event.data;
			sources[Depth].paused = !depth;
			sources[Video].paused = !video;
			self.postMessage({
				type: "active",
				depth,
				video,
			} as CamIsoWorkerActiveReply);
			break;
		}
		default:
			throw event;
	}
});

const initUsb = async (opt: CamIsoWorkerOpts) => {
	opt.dev ??= DEFAULT_USB_DEV;
	opt.iface ??= DEFAULT_USB_IFACE;

	const d = await navigator.usb.getDevices();
	dev = d[opt.dev];

	await dev.open();

	//if (opt.devconf != null) await dev.selectConfiguration(opt.devconf);
	//devconf = dev.configuration!;

	iface = dev.configuration?.interfaces.find(
		({ interfaceNumber }) => interfaceNumber === opt.iface,
	)!;
	await dev.claimInterface(iface.interfaceNumber);

	//if (opt.altiface != null) await dev.selectAlternateInterface(iface.interfaceNumber, opt.altiface);
	//altiface = iface.alternate;

	batchSize = opt.batchSize;
};

const initStream = (ep: CamIsoEndpoint) => {
	const epName = CamIsoEndpoint[ep] as keyof typeof CamIsoEndpoint;
	const source = new UnderlyingIsochronousSource(
		dev,
		ep,
		CamIsoPacketSize[epName],
		{ batchSize },
	);
	sources[CamIsoEndpoint[epName]] = source;
	const packetStream = new ReadableStream(source).pipeThrough(
		new TransformStream(
			new CamIsoParser(CamIsoPacketFlag[epName], CamIsoPacketSize[epName]),
		),
	);
	return packetStream;
};
