import {
	CamFps,
	CamFmtDepth,
	CamFmtInfrared,
	CamFmtVisible,
	CamRes,
	CamType,
} from "./enum";

import { CamIsoEndpoint } from "../stream/enum";

const Depth = CamIsoEndpoint.DEPTH;
const Video = CamIsoEndpoint.VIDEO;

export type CamMode = {
	stream: CamType;
	format: CamFmtDepth | CamFmtVisible | CamFmtInfrared;
	res: CamRes;
	fps: CamFps;
	flip: 1 | 0;
};

export type CamModeSet = Record<CamIsoEndpoint, CamMode>;

export const MODE_OFF = { stream: CamType.NONE } as CamMode;

export const VISIBLE_MODE = {
	stream: CamType.VISIBLE,
	format: CamFmtVisible.BAYER_8B,
	res: CamRes.MED,
	flip: 0,
	fps: CamFps.F_30P,
} as CamMode;

export const INFRARED_MODE = {
	stream: CamType.INFRARED,
	format: CamFmtInfrared.IR_10B,
	res: CamRes.MED,
	flip: 0,
	fps: CamFps.F_30P,
} as CamMode;

export const DEPTH_MODE = {
	stream: CamType.DEPTH,
	format: CamFmtDepth.D_11B,
	res: CamRes.MED,
	flip: 0,
	fps: CamFps.F_30P,
} as CamMode;

export const Modes = Object.assign(
	(
		depthMode: boolean | Partial<CamMode>,
		videoMode: boolean | Partial<CamMode>,
	) =>
		({
			[CamIsoEndpoint.DEPTH]: depthMode ?? MODE_OFF,
			[CamIsoEndpoint.VIDEO]: videoMode ?? MODE_OFF,
		}) as CamModeSet,
	{
		[CamType.VISIBLE]: VISIBLE_MODE,
		VISIBLE: VISIBLE_MODE,

		[CamType.INFRARED]: INFRARED_MODE,
		INFRARED: INFRARED_MODE,

		[CamType.DEPTH]: DEPTH_MODE,
		DEPTH: DEPTH_MODE,

		[CamType.NONE]: MODE_OFF,
		NONE: MODE_OFF,
		OFF: MODE_OFF,
	},
);
export default Modes;

export const parseModeOpts = (
	existing: CamModeSet,
	useDefaults = false as typeof Modes | boolean,
	modeOpt = {} as Record<CamIsoEndpoint, boolean | Partial<CamMode>>,
): Record<CamIsoEndpoint, CamMode> => {
	const defaults = useDefaults === true ? Modes : useDefaults;

	let depthMode = existing[Depth];
	let videoMode = existing[Video];

	if (defaults) {
		if (modeOpt[Depth] === true) depthMode = defaults[Depth];
		else if (modeOpt[Depth] === false) depthMode = MODE_OFF;
		else depthMode = MODE_OFF;

		if (modeOpt[Video] === true) videoMode = defaults[Video];
		else if (modeOpt[Video] === false) videoMode = MODE_OFF;
		else if (modeOpt[Video]?.stream)
			videoMode = defaults[modeOpt[Video].stream];
		else videoMode = MODE_OFF;
	}

	if (typeof modeOpt[Depth] === "object")
		depthMode = { ...depthMode, ...modeOpt[Depth] };
	if (typeof modeOpt[Video] === "object")
		videoMode = { ...videoMode, ...modeOpt[Video] };

	const r = {
		[Depth]: depthMode,
		[Video]: videoMode,
	};
	return r;
};
