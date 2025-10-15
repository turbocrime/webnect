export type WorkerMessage<T, Id extends string = string> = { id: Id } & T;

export const isWorkerMessage = <T = unknown>(
	evt: MessageEvent<unknown>,
	id?: string,
): evt is MessageEvent<WorkerMessage<T>> =>
	evt.data != null &&
	typeof evt.data === "object" &&
	Object.keys(evt.data).length <= 2 &&
	"id" in evt.data &&
	typeof evt.data.id === "string" &&
	(!id || evt.data.id === id);
