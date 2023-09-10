import type { CamIsoPacket } from "../stream/CamIsoParser";

export { camIsoWorkerUrl } from "./CamIsoWorker";

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

export type CamIsoWorkerActiveMsg = {
	type: "active";
	depth: "stop" | "go";
	video: "stop" | "go";
};

export type CamIsoWorkerMsg = CamIsoWorkerInitMsg | CamIsoWorkerActiveMsg;
export type CamIsoWorkerReply = CamIsoWorkerInitReply | CamIsoWorkerActiveReply;

export type CamIsoWorkerInitReply = {
	type: "init";
	depth: ReadableStream<CamIsoPacket>;
	video: ReadableStream<CamIsoPacket>;
};

export type CamIsoWorkerActiveReply = CamIsoWorkerActiveMsg;
