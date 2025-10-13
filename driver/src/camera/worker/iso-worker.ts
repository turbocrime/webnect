import { WORKER_REPLY_TIMEOUT_MS } from "../constants.js";
import type {
	IsoWorkerRequest,
	IsoWorkerResponse,
	IsoWorkerType,
} from "./iso-worker-message.js";
import { isWorkerMessage } from "./worker-message.js";

export class IsoWorker {
	private worker = new Worker(new URL("./worker.js", import.meta.url), {
		type: "module",
	});

	// biome-ignore lint/suspicious/noExplicitAny: may be any response
	private pending: Map<string, PromiseWithResolvers<IsoWorkerResponse<any>>> =
		new Map();

	private listener(event: MessageEvent<unknown>) {
		if (isWorkerMessage(event)) {
			this.pending.get(event.data.id)?.resolve(event.data);
		}
	}

	constructor() {
		this.worker.addEventListener("message", this.listener.bind(this));
	}

	private async workerMessage<T extends IsoWorkerType>(
		request: Omit<IsoWorkerRequest<T>, "id">,
		timeout = WORKER_REPLY_TIMEOUT_MS,
	): Promise<IsoWorkerResponse<T>> {
		const id = crypto.randomUUID();

		const handlers = Promise.withResolvers<IsoWorkerResponse<T>>();

		this.pending.set(id, handlers);
		void handlers.promise.finally(() => this.pending.delete(id));

		setTimeout(
			() => handlers.reject(new Error("Worker timeout", { cause: request })),
			timeout,
		);

		this.worker.postMessage(Object.assign(request, { id }));
		return handlers.promise;
	}

	public activate(activate: IsoWorkerRequest<"activate">["activate"]) {
		return this.workerMessage<"activate">({
			activate,
		}).then(({ activate }) => activate);
	}

	[Symbol.dispose]() {
		this.worker.terminate();
	}
}
