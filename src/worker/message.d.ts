declare type CamIsoWorkerOpts = {
	dev: number;
	batchSize?: number;
	//devconf?: number;
	iface?: number;
	//altiface?: number;
};

declare type CamIsoWorkerMsg = CamIsoWorkerInitMsg | CamIsoWorkerActiveMsg;

declare type CamIsoWorkerReply<M> = M extends CamIsoWorkerInitMsg
	? CamIsoWorkerInitReply
	: M extends CamIsoWorkerActiveMsg
	? CamIsoWorkerActiveReply
	: never;

declare type CamIsoWorkerInitMsg = {
	type: "init";
	config: CamIsoWorkerOpts;
};

declare type CamIsoWorkerActiveMsg = {
	type: "active";
	depth: ON | OFF;
	video: ON | OFF;
};

declare type CamIsoWorkerInitReply = {
	type: "init";
	depth: ReadableStream<CamIsoPacket>;
	video: ReadableStream<CamIsoPacket>;
};

declare type CamIsoWorkerActiveReply = CamIsoWorkerActiveMsg;
