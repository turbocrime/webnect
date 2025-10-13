import type { CamIsoEndpoint, CamIsoInterface } from "../stream/enum.js";
import type { CamIsoPacket } from "../stream/iso-parser.js";
import { isWorkerMessage, type WorkerMessage } from "./worker-message.js";

export type IsoWorkerType =
	| keyof IsoWorkerRequestMap
	| keyof IsoWorkerResponseMap;

export type IsoWorkerRequestMap = {
	activate: {
		serialNumber: string;
		usbInterface: CamIsoInterface;
		usbEndpoint: CamIsoEndpoint;
	};
	deactivate: {
		serialNumber: string;
		usbInterface: CamIsoInterface;
		usbEndpoint: CamIsoEndpoint;
	};
};

export type IsoWorkerResponseMap = {
	activate: { stream: ReadableStream<CamIsoPacket> };
	deactivate: { remaining: number };
};

export type IsoWorkerRequest<T extends IsoWorkerType> = WorkerMessage<
	Record<T, IsoWorkerRequestMap[T]>
>;

export type IsoWorkerResponse<T extends IsoWorkerType> = WorkerMessage<
	Record<T, IsoWorkerResponseMap[T]>
>;

export const isIsoWorkerRequest = <T extends IsoWorkerType>(
	evt: MessageEvent<unknown>,
	expectType?: T,
): evt is MessageEvent<IsoWorkerRequest<T>> =>
	isWorkerMessage(evt) &&
	(expectType ? expectType in evt.data : Object.keys(evt.data).length === 2);

export const isIsoWorkerResponse = <T extends IsoWorkerType>(
	evt: MessageEvent<unknown>,
	expectType?: T,
): evt is MessageEvent<IsoWorkerResponse<T> | { error: unknown }> =>
	isWorkerMessage(evt) &&
	(expectType ? expectType in evt.data : Object.keys(evt.data).length === 2);

export async function sendIsoWorkerMessage<K extends IsoWorkerType>(
	worker: Worker,
	msgType: K,
	data: IsoWorkerRequestMap[K],
): Promise<IsoWorkerResponseMap[K]> {
	const id = crypto.randomUUID();

	const message: IsoWorkerRequest<K> = Object.assign(
		{ [msgType]: data } as Record<typeof msgType, typeof data>,
		{ id },
	);

	const handlers = Promise.withResolvers<IsoWorkerResponse<K>>();

	const listener = (evt: MessageEvent<unknown>) => {
		if (isWorkerMessage<IsoWorkerResponse<K>>(evt, id)) {
			if ("error" in evt.data) {
				handlers.reject(evt.data.error);
			} else {
				handlers.resolve(evt.data);
			}
		}
	};

	handlers.promise.finally(() =>
		worker.removeEventListener("message", listener),
	);
	worker.addEventListener("message", listener);
	worker.postMessage(message);

	return handlers.promise.then(
		(response: Record<K, IsoWorkerResponseMap[K]>) => response[msgType],
	);
}
