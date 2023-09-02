const DEFAULT_USB_DEV = 0;
const DEFAULT_USB_IFACE = 0;

import {
	CamPacket,
	CameraPacketTransformer,
} from "../streams/CameraPacketTransformer";

import { UnderlyingIsochronousSource } from "../streams/UnderlyingIsochronousSource";

import {
	CamUsbEndpoint,
	CamIsoPacketFlag,
	CamIsoPacketSize,
} from "../kinect/enums";

export type KinectCameraWorkerOpts = {
	dev: number;
	batchSize?: number;
	devconf?: number;
	iface?: number;
	altiface?: number;
};

export type KinectCameraWorkerInitConfig = {
	type: "init";
	config: KinectCameraWorkerOpts;
};

export type KinectCameraWorkerInitReply = {
	type: "init";
	streams: Record<CamUsbEndpoint, ReadableStream<CamPacket>>;
};

let dev: USBDevice;
let iface: USBInterface;
let devconf: USBConfiguration;
let altiface: USBAlternateInterface;
let batchSize: number | undefined;

let streams: Record<CamUsbEndpoint, ReadableStream<CamPacket>>;

self.addEventListener(
	"message",
	async (event: { data: KinectCameraWorkerInitConfig }) => {
		switch (event.data?.type) {
			case "init": {
				await initUsb(event.data.config);
				streams = {
					[CamUsbEndpoint.DEPTH]: launchStream(CamUsbEndpoint.DEPTH),
					[CamUsbEndpoint.VIDEO]: launchStream(CamUsbEndpoint.VIDEO),
				};
				postMessage({ type: "init", streams } as KinectCameraWorkerInitReply, [
					streams[CamUsbEndpoint.DEPTH],
					streams[CamUsbEndpoint.VIDEO],
				]);
				break;
			}
			default: {
				console.error("Unknown message", event);
				throw TypeError("Unknown message");
			}
		}
	},
);

async function initUsb(opt: KinectCameraWorkerOpts) {
	opt.dev ??= DEFAULT_USB_DEV;
	opt.iface ??= DEFAULT_USB_IFACE;

	const d = await navigator.usb.getDevices();
	dev = d[opt.dev];

	await dev.open();

	if (opt.devconf != null) await dev.selectConfiguration(opt.devconf);
	devconf = dev.configuration!;

	iface = dev.configuration?.interfaces.find(
		({ interfaceNumber }) => interfaceNumber === opt.iface,
	)!;
	await dev.claimInterface(iface.interfaceNumber);

	if (opt.altiface != null)
		await dev.selectAlternateInterface(iface.interfaceNumber, opt.altiface);
	altiface = iface.alternate;

	batchSize = opt.batchSize;
}

function launchStream(streamType: CamUsbEndpoint) {
	const endpointKey = CamUsbEndpoint[streamType] as keyof typeof CamUsbEndpoint;

	return new ReadableStream(
		new UnderlyingIsochronousSource(
			dev,
			CamUsbEndpoint[endpointKey],
			CamIsoPacketSize[endpointKey],
			{ batchSize },
		),
	).pipeThrough(
		new TransformStream(
			new CameraPacketTransformer(
				CamIsoPacketFlag[endpointKey],
				CamIsoPacketSize[endpointKey],
			),
		),
	);
}
