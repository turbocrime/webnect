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

export const DEFAULT_MODE_VISIBLE = {
	stream: CamType.VISIBLE,
	format: CamFmtVisible.BAYER_8B,
	res: CamRes.MED,
	flip: OFF,
	fps: CamFps.F_30P,
};

export const DEFAULT_MODE_INFRARED = {
	stream: CamType.INFRARED,
	format: CamFmtInfrared.IR_10B,
	res: CamRes.MED,
	flip: OFF,
	fps: CamFps.F_30P,
};

export const DEFAULT_MODE_DEPTH = {
	stream: CamType.DEPTH,
	format: CamFmtDepth.D_11B,
	res: CamRes.MED,
	flip: OFF,
	fps: CamFps.F_30P,
};

export const ALL_OFF = {
	[CamIsoEndpoint.VIDEO]: { stream: OFF },
	[CamIsoEndpoint.DEPTH]: { stream: OFF },
} as Record<CamType, CamMode>;

type SingleMode = Partial<CamMode> & { stream: CamType | OFF };
type SomeModes = Partial<Record<CamIsoEndpoint, SingleMode>>;
export type CamModeOpt = SingleMode | SomeModes;

export const DEFAULT_MODES = {
	[CamType.VISIBLE]: DEFAULT_MODE_VISIBLE,
	[CamType.INFRARED]: DEFAULT_MODE_INFRARED,
	[CamType.DEPTH]: DEFAULT_MODE_DEPTH,
} as Record<CamType, CamMode>;

export const parseModeOpts = (
	existing: Record<CamIsoEndpoint, CamMode>,
	useDefaults = false as typeof DEFAULT_MODES | boolean,
	modeOpt = {} as CamModeOpt,
): Record<CamIsoEndpoint, CamMode> => {
	const defaults = useDefaults === true ? DEFAULT_MODES : useDefaults;

	const isSingleMode = (
		modeOpt: SingleMode | SomeModes,
	): modeOpt is SingleMode => "stream" in modeOpt;

	const isSomeModes = (modeOpt: SingleMode | SomeModes): modeOpt is SomeModes =>
		CamIsoEndpoint.DEPTH in modeOpt || CamIsoEndpoint.VIDEO in modeOpt;

	const getUpdatedMode = (
		endpoint: CamIsoEndpoint,
		mode?: SingleMode,
	): Partial<Record<CamIsoEndpoint, CamMode>> => ({
		[endpoint]: {
			...(defaults && mode?.stream
				? defaults[mode.stream]
				: existing[endpoint]),
			...mode,
		},
	});

	if (isSingleMode(modeOpt)) {
		if (modeOpt.stream === OFF)
			parseModeOpts(existing, defaults, {
				[CamIsoEndpoint.VIDEO]: { stream: OFF },
				[CamIsoEndpoint.DEPTH]: { stream: OFF },
			});
		else if (modeOpt.stream === CamType.DEPTH)
			parseModeOpts(existing, defaults, {
				[CamIsoEndpoint.VIDEO]: existing[CamIsoEndpoint.VIDEO],
				...getUpdatedMode(CamIsoEndpoint.DEPTH, modeOpt),
			});
		else if (
			modeOpt.stream === CamType.VISIBLE ||
			modeOpt.stream === CamType.INFRARED
		)
			parseModeOpts(existing, defaults, {
				[CamIsoEndpoint.DEPTH]: existing[CamIsoEndpoint.VIDEO],
				...getUpdatedMode(CamIsoEndpoint.VIDEO, modeOpt),
			});
	} else if (isSomeModes(modeOpt))
		return {
			...getUpdatedMode(CamIsoEndpoint.VIDEO, modeOpt[CamIsoEndpoint.VIDEO]),
			...getUpdatedMode(CamIsoEndpoint.DEPTH, modeOpt[CamIsoEndpoint.DEPTH]),
		} as Record<CamIsoEndpoint, CamMode>;

	// fallback
	return {
		[CamIsoEndpoint.VIDEO]: DEFAULT_MODE_INFRARED,
		[CamIsoEndpoint.DEPTH]: DEFAULT_MODE_DEPTH,
	} as Record<CamIsoEndpoint, CamMode>;
};
