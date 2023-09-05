import {
	CamFps,
	CamFmtDepth,
	CamFmtInfrared,
	CamFmtVisible,
	CamRes,
	CamType,
	CamIsoEndpoint,
	CamIsoPacketFlag,
	CamIsoPacketSize,
	OFF,
	ON,
} from "../CamEnums";

export type CamMode = {
	stream: CamType | OFF;
	format: CamFmtDepth | CamFmtVisible | CamFmtInfrared;
	res: CamRes;
	fps: CamFps;
	flip: ON | OFF;
};

export type CamModeSet = Record<CamIsoEndpoint, CamMode>;

// TODO: throw invalid modes
export const selectFrameSize = ({
	stream,
	format,
	res,
}: Pick<CamMode, "stream" | "format" | "res">) => {
	const frameDimension = {
		[CamRes.LOW]: 320 * 240,
		[CamRes.MED]: 640 * 480,
		[CamRes.HIGH]: 1280 * 1024,
	};

	const irFrameDimension = {
		...frameDimension,
		[CamRes.MED]: 640 * 488,
		// TODO: other wierd ones?
	};

	const bitsPerPixel = {
		[(CamType.VISIBLE << 4) | CamFmtVisible.BAYER_8B]: 8,
		[(CamType.VISIBLE << 4) | CamFmtVisible.YUV_16B]: 16,
		[(CamType.DEPTH << 4) | CamFmtDepth.D_10B]: 10,
		[(CamType.DEPTH << 4) | CamFmtDepth.D_11B]: 11,
		[(CamType.INFRARED << 4) | CamFmtInfrared.IR_10B]: 10,
	};

	switch (stream) {
		case CamType.VISIBLE:
			return (frameDimension[res] * bitsPerPixel[(stream << 4) | format]) / 8;
		case CamType.DEPTH:
			return (frameDimension[res] * bitsPerPixel[(stream << 4) | format]) / 8;
		case CamType.INFRARED:
			return (irFrameDimension[res] * bitsPerPixel[(stream << 4) | format]) / 8;
		case OFF:
			return 0;
		default:
			throw new TypeError("Invalid stream type");
	}
};

export const selectPacketSize = (mode: CamMode) =>
	mode.stream === CamType.DEPTH
		? CamIsoPacketSize.DEPTH
		: CamIsoPacketSize.VIDEO;

export const selectPacketFlag = (mode: CamMode) =>
	mode.stream === CamType.DEPTH
		? CamIsoPacketFlag.DEPTH
		: CamIsoPacketFlag.VIDEO;

const DEFAULT_MODE_VISIBLE = {
	stream: CamType.VISIBLE,
	format: CamFmtVisible.BAYER_8B,
	//format: CamFmtVisible.YUV_16B,
	res: CamRes.MED,
	flip: OFF,
	fps: CamFps.F_30P,
};

const DEFAULT_MODE_INFRARED = {
	stream: CamType.INFRARED,
	format: CamFmtInfrared.IR_10B,
	res: CamRes.MED,
	flip: OFF,
	fps: CamFps.F_30P,
};

const DEFAULT_MODE_DEPTH = {
	stream: CamType.DEPTH,
	format: CamFmtDepth.D_11B,
	res: CamRes.MED,
	flip: OFF,
	fps: CamFps.F_30P,
};

export const STREAM_OFF = { stream: OFF } as CamMode;

export const modes = (depthMode = STREAM_OFF, videoMode = STREAM_OFF) =>
	({
		[CamIsoEndpoint.DEPTH]: depthMode,
		[CamIsoEndpoint.VIDEO]: videoMode,
	}) as CamModeSet;

export const DEFAULTS = {
	[CamType.VISIBLE]: DEFAULT_MODE_VISIBLE,
	VISIBLE: DEFAULT_MODE_VISIBLE,
	[CamType.INFRARED]: DEFAULT_MODE_INFRARED,
	INFRARED: DEFAULT_MODE_INFRARED,
	[CamType.DEPTH]: DEFAULT_MODE_DEPTH,
	DEPTH: DEFAULT_MODE_DEPTH,
	[OFF]: STREAM_OFF,
	OFF: STREAM_OFF,
};

export const parseModeOpts = (
	existing: CamModeSet,
	useDefaults = false as typeof DEFAULTS | boolean,
	modeOpt = {} as Record<CamIsoEndpoint, Partial<CamMode>>,
): Record<CamIsoEndpoint, CamMode> => {
	const defaults = useDefaults === true ? DEFAULTS : useDefaults;

	const getUpdatedMode = (
		endpoint: CamIsoEndpoint,
		mode?: Partial<CamMode>,
	): Partial<CamModeSet> => ({
		[endpoint]: {
			...(defaults && mode?.stream
				? defaults[mode.stream]
				: existing[endpoint]),
			...mode,
		},
	});

	console.log("resolving mode options", modeOpt);
	const fullMode = {
		...getUpdatedMode(CamIsoEndpoint.VIDEO, modeOpt[CamIsoEndpoint.VIDEO]),
		...getUpdatedMode(CamIsoEndpoint.DEPTH, modeOpt[CamIsoEndpoint.DEPTH]),
	} as Record<CamIsoEndpoint, CamMode>;
	console.log("resolved to", fullMode);
	return fullMode;
};
