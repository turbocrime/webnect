import {
	CamFps,
	CamFmtDepth,
	CamFmtInfrared,
	CamFmtVisible,
	CamRes,
	CamType,
} from "./enum";

import { CamIsoEndpoint } from "../stream/enum";

export type CamMode = {
	stream: CamType;
	format: CamFmtDepth | CamFmtVisible | CamFmtInfrared;
	res: CamRes;
	fps: CamFps;
	flip: ON | OFF;
};

export type CamModeSet = Record<CamIsoEndpoint, CamMode>;

export const MODE_OFF = { stream: CamType.NONE } as CamMode;

export const DEFAULT_MODE_VISIBLE = {
	stream: CamType.VISIBLE,
	format: CamFmtVisible.BAYER_8B,
	res: CamRes.MED,
	flip: 0,
	fps: CamFps.F_30P,
};

export const DEFAULT_MODE_INFRARED = {
	stream: CamType.INFRARED,
	format: CamFmtInfrared.IR_10B,
	res: CamRes.MED,
	flip: 0,
	fps: CamFps.F_30P,
};

export const DEFAULT_MODE_DEPTH = {
	stream: CamType.DEPTH,
	format: CamFmtDepth.D_11B,
	res: CamRes.MED,
	flip: 0,
	fps: CamFps.F_30P,
};

export const Modes = Object.assign(
	(depthMode: false | Partial<CamMode>, videoMode: false | Partial<CamMode>) =>
		({
			[CamIsoEndpoint.DEPTH]: depthMode || MODE_OFF,
			[CamIsoEndpoint.VIDEO]: videoMode || MODE_OFF,
		}) as CamModeSet,
	{
		[CamType.VISIBLE]: DEFAULT_MODE_VISIBLE,
		VISIBLE: DEFAULT_MODE_VISIBLE,

		[CamType.INFRARED]: DEFAULT_MODE_INFRARED,
		INFRARED: DEFAULT_MODE_INFRARED,

		[CamType.DEPTH]: DEFAULT_MODE_DEPTH,
		DEPTH: DEFAULT_MODE_DEPTH,

		[CamType.NONE]: MODE_OFF,
		NONE: MODE_OFF,
		OFF: MODE_OFF,
	},
);
export default Modes;

export const parseModeOpts = (
	existing: CamModeSet,
	useDefaults = false as typeof Modes | boolean,
	modeOpt = {} as Record<CamIsoEndpoint, Partial<CamMode>>,
): Record<CamIsoEndpoint, CamMode> => {
	const defaults = useDefaults === true ? Modes : useDefaults;

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
