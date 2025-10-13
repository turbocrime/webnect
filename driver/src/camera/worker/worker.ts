/// <reference lib="webworker" />

import {
	CamIsoEndpoint,
	type CamIsoInterface,
	CamIsoPacketSize,
	CamIsoStreamFlag,
} from "../stream/enum.js";
import { CamIsoStream } from "../stream/iso-parser.js";
import { UnderlyingIsochronousTransferSource } from "../stream/transfer-source.js";
import { ISOCHRONOUS_BATCH_SIZE } from "./constants.js";
import {
	type IsoWorkerRequest,
	type IsoWorkerResponse,
	type IsoWorkerType,
	isIsoWorkerRequest,
} from "./iso-worker-message.js";

const endpointStreamFlag = {
	[CamIsoEndpoint.VIDEO]: CamIsoStreamFlag.VIDEO,
	[CamIsoEndpoint.DEPTH]: CamIsoStreamFlag.DEPTH,
} as const;

const endpointPacketSize = {
	[CamIsoEndpoint.VIDEO]: CamIsoPacketSize.VIDEO,
	[CamIsoEndpoint.DEPTH]: CamIsoPacketSize.DEPTH,
} as const;

let activeDevice: Promise<USBDevice> | undefined;
const activeEndpoints = new Map<CamIsoEndpoint, AbortController>();

const getDevice = async (
	serialNumber: string,
	usbInterface: CamIsoInterface,
) => {
	activeDevice ??= navigator.usb.getDevices().then(async (devices) => {
		const dev = devices.find((d) => d.serialNumber === serialNumber);
		if (!dev) {
			throw new ReferenceError(
				`Device with serial number ${serialNumber} not found`,
			);
		}

		if (!dev.opened) {
			await dev.open();
		}

		const iface = dev.configuration?.interfaces.find(
			(iface) => iface.interfaceNumber === usbInterface,
		);

		if (!iface) {
			throw new ReferenceError(`Interface ${usbInterface} not found`);
		}

		if (!iface.claimed) {
			await dev.claimInterface(usbInterface);
		}

		return dev;
	});

	return activeDevice;
};

const handlers: {
	[R in IsoWorkerType]: (
		requestData: Omit<IsoWorkerRequest<R>, "id">,
	) => Promise<[Omit<IsoWorkerResponse<R>, "id">, Transferable[]]>;
} = {
	activate: async ({
		activate: { usbInterface, usbEndpoint, serialNumber },
	}) => {
		console.debug("activate", usbEndpoint, usbInterface, serialNumber);

		const device = await getDevice(serialNumber, usbInterface);

		if (activeEndpoints.has(usbEndpoint)) {
			throw new Error(`Stream for endpoint ${usbEndpoint} already active`);
		}

		const ac = new AbortController();
		activeEndpoints.set(usbEndpoint, ac);

		const batch = new Array<number>(ISOCHRONOUS_BATCH_SIZE).fill(
			endpointPacketSize[usbEndpoint],
		);
		const streamFlag = endpointStreamFlag[usbEndpoint];
		const source = new UnderlyingIsochronousTransferSource(
			device,
			usbEndpoint,
			batch,
		);

		ac.signal.addEventListener("abort", () =>
			activeEndpoints.delete(usbEndpoint),
		);

		const stream = new ReadableStream(source).pipeThrough(
			new TransformStream(new CamIsoStream(streamFlag)),
			{ signal: ac.signal },
		);

		return [{ activate: { stream } }, [stream]];
	},

	deactivate: async ({
		deactivate: { usbInterface, usbEndpoint, serialNumber },
	}) => {
		console.debug("deactivate", usbEndpoint, usbInterface, serialNumber);

		activeEndpoints.get(usbEndpoint)?.abort(`deactivate ${usbEndpoint}`);
		activeEndpoints.delete(usbEndpoint);

		return [{ deactivate: { remaining: activeEndpoints.size } }, []];
	},
} as const;

function handleRequest<T extends IsoWorkerType>(
	req: Omit<IsoWorkerRequest<T>, "id">,
): Promise<[Omit<IsoWorkerResponse<T>, "id">, Transferable[]]> {
	return handlers[Object.keys(req)[0] as T](req);
}

self.addEventListener("message", async (event: MessageEvent<unknown>) => {
	if (isIsoWorkerRequest(event)) {
		const { id, ...request } = event.data;
		const [response, transfers] = await handleRequest(request).catch(
			(error) => {
				console.debug("worker handler failed", error);
				return [{ error }, [] as Transferable[]] as const;
			},
		);
		self.postMessage(Object.assign(response, { id }), transfers);
	}
});
