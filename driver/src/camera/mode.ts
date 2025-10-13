import {
	Cam,
	CamFmtDepth,
	CamFmtInfrared,
	CamFmtVisible,
	CamRes,
} from "./enum.js";

export type CamMode<T extends Cam = Cam> = T extends Cam.OFF
	? undefined
	: {
			stream: T;
			format: CamFmtMap[T];
			res: CamRes;
			fps: 15 | 30;
			flip?: boolean;
		};

export function isCamMode<T extends Cam>(
	stream: T,
	mode: unknown,
): mode is CamMode<T> {
	if (stream === Cam.OFF) {
		return mode === undefined;
	}
	return (
		mode != null &&
		typeof mode === "object" &&
		"stream" in mode &&
		mode.stream === stream
	);
}

type CamFmtMap = {
	[Cam.VISIBLE]: CamFmtVisible;
	[Cam.INFRARED]: CamFmtInfrared;
	[Cam.DEPTH]: CamFmtDepth;
	[Cam.OFF]: never;
};

export const MODE_VISIBLE_BAYER: CamMode<Cam.VISIBLE> = {
	stream: Cam.VISIBLE,
	format: CamFmtVisible.BAYER_8B,
	res: CamRes.VGA,
	fps: 30,
};

export const MODE_VISIBLE_YUV: CamMode<Cam.VISIBLE> = {
	stream: Cam.VISIBLE,
	format: CamFmtVisible.YUV_16B,
	res: CamRes.VGA,
	fps: 15,
};

export const MODE_VISIBLE = MODE_VISIBLE_YUV;

export const MODE_INFRARED: CamMode<Cam.INFRARED> = {
	stream: Cam.INFRARED,
	format: CamFmtInfrared.IR_10B,
	res: CamRes.VGA,
	fps: 30,
};

export const MODE_DEPTH: CamMode<Cam.DEPTH> = {
	stream: Cam.DEPTH,
	format: CamFmtDepth.D_11B,
	res: CamRes.VGA,
	fps: 30,
};
