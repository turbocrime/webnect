import {
	CamIsoEndpoint,
	CamIsoPacketFlag,
	CamIsoPacketSize,
} from "../CamEnums";
import { CamIsoParser, CamIsoPacket } from "../stream/CamIsoParser";
import { UnderlyingIsochronousSource } from "../stream/UnderlyingIsochronousSource";

export type CamIsoWorkerOpts = {
	dev: number;
	batchSize?: number;
	devconf?: number;
	iface?: number;
	altiface?: number;
};

export type CamIsoWorkerInitMsg = {
	type: "init";
	config: CamIsoWorkerOpts;
};

export type CamIsoWorkerToggleMsg = {
	type: "toggle";
	depth: "stop" | "go";
	video: "stop" | "go";
};

export type CamIsoWorkerMsg = CamIsoWorkerInitMsg | CamIsoWorkerToggleMsg;

export type CamIsoWorkerInitReply = {
	type: "init";
	depth: ReadableStream<CamIsoPacket>;
	video: ReadableStream<CamIsoPacket>;
};

declare const navigator: Navigator & {
	usb: USB;
};

declare const self: Worker & {
	postMessage: (msg: CamIsoWorkerInitReply, transfer?: Transferable[]) => void;
};

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
			await initUsb(event.data.config);
			const depth = initStream("DEPTH");
			const video = initStream("VIDEO");
			self.postMessage(
				{ type: "init", depth, video } as CamIsoWorkerInitReply,
				[depth, video] as Transferable[],
			);
			break;
		}
		case "toggle": {
			const { depth, video } = event.data;
			sources[CamIsoEndpoint.DEPTH].toggle(depth);
			sources[CamIsoEndpoint.VIDEO].toggle(video);
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
