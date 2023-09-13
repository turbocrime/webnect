import type { CamIsoPacket } from "../stream";

export type CamIsoWorkerOpts = {
	dev: number;
	batchSize?: number;
	//devconf?: number;
	iface?: number;
	//altiface?: number;
};

export type CamIsoWorkerMsg = CamIsoWorkerInitMsg | CamIsoWorkerActiveMsg;

export type CamIsoWorkerReply<M> = M extends CamIsoWorkerInitMsg
	? CamIsoWorkerInitReply
	: M extends CamIsoWorkerActiveMsg
	? CamIsoWorkerActiveReply
	: never;

export type CamIsoWorkerInitMsg = {
	type: "init";
	config: CamIsoWorkerOpts;
};

export type CamIsoWorkerActiveMsg = {
	type: "active";
	depth: 1 | 0;
	video: 1 | 0;
};

export type CamIsoWorkerInitReply = {
	type: "init";
	depth: ReadableStream<CamIsoPacket>;
	video: ReadableStream<CamIsoPacket>;
};

export type CamIsoWorkerActiveReply = CamIsoWorkerActiveMsg;
