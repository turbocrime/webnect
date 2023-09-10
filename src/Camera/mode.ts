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
} from "../enum";

export type CamMode = {
	stream: CamType;
	format: CamFmtDepth | CamFmtVisible | CamFmtInfrared;
	res: CamRes;
	fps: CamFps;
	flip: ON | OFF;
};

export type CamModeSet = Record<CamIsoEndpoint, CamMode>;

export const STREAM_OFF = { stream: CamType.NONE } as CamMode;

const DEFAULT_MODE_VISIBLE = {
	stream: CamType.VISIBLE,
	format: CamFmtVisible.BAYER_8B,
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

export const RESOLUTION = {
	[CamRes.LOW]: [320, 240, 320 * 240],
	[CamRes.MED]: [640, 480, 640 * 480],
	[CamRes.HIGH]: [1280, 1024, 1280 * 1024],
} as Record<CamRes, [number, number, number]>;

export const selectPacketSize = (mode: CamMode) =>
	mode.stream === CamType.DEPTH
		? CamIsoPacketSize.DEPTH
		: CamIsoPacketSize.VIDEO;

export const selectPacketFlag = (mode: CamMode) =>
	mode.stream === CamType.DEPTH
		? CamIsoPacketFlag.DEPTH
		: CamIsoPacketFlag.VIDEO;

export const Mode = (
	depthMode?: Partial<CamMode>,
	videoMode?: Partial<CamMode>,
) =>
	({
		[CamIsoEndpoint.DEPTH]: depthMode ?? STREAM_OFF,
		[CamIsoEndpoint.VIDEO]: videoMode ?? STREAM_OFF,
	}) as CamModeSet;

export const DefaultMode = {
	[CamType.VISIBLE]: DEFAULT_MODE_VISIBLE,
	VISIBLE: DEFAULT_MODE_VISIBLE,

	[CamType.INFRARED]: DEFAULT_MODE_INFRARED,
	INFRARED: DEFAULT_MODE_INFRARED,

	[CamType.DEPTH]: DEFAULT_MODE_DEPTH,
	DEPTH: DEFAULT_MODE_DEPTH,

	[CamType.NONE]: STREAM_OFF,
	NONE: STREAM_OFF,
	OFF: STREAM_OFF,
};

export const parseModeOpts = (
	existing: CamModeSet,
	useDefaults = false as typeof DefaultMode | boolean,
	modeOpt = {} as Record<CamIsoEndpoint, Partial<CamMode>>,
): Record<CamIsoEndpoint, CamMode> => {
	const defaults = useDefaults === true ? DefaultMode : useDefaults;

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

	const fullMode = {
		...getUpdatedMode(CamIsoEndpoint.VIDEO, modeOpt[CamIsoEndpoint.VIDEO]),
		...getUpdatedMode(CamIsoEndpoint.DEPTH, modeOpt[CamIsoEndpoint.DEPTH]),
	} as Record<CamIsoEndpoint, CamMode>;
	return fullMode;
};
