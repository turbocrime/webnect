import {
	Cam,
	CamFmtDepth,
	CamFmtInfrared,
	CamFmtVisible,
	CamRes,
} from "../enum.js";
import type { CamMode } from "../mode.js";

const visibleRes = {
	[CamRes.QVGA]: [320, 240],
	[CamRes.VGA]: [640, 480],
	[CamRes.SXGA]: [1280, 1024],
} as const;

const depthRes = {
	[CamRes.QVGA]: [320, 240],
	[CamRes.VGA]: [640, 480],
	[CamRes.SXGA]: [1280, 1024],
} as const;

const irRes = {
	[CamRes.QVGA]: [320, 240],
	[CamRes.VGA]: [640, 488],
	[CamRes.SXGA]: [1280, 1024],
} as const;

const visibleBpp = {
	[CamFmtVisible.BAYER_8B]: 8,
	[CamFmtVisible.YUV_16B]: 16,
} as const;

const depthBpp = {
	[CamFmtDepth.D_10B]: 10,
	[CamFmtDepth.D_11B]: 11,
} as const;

const irBpp = {
	[CamFmtInfrared.IR_10B]: 10,
} as const;

export const selectRes = <M extends CamMode>(mode: M) => {
	switch (mode?.stream) {
		case undefined:
			throw new RangeError("Invalid mode", { cause: mode });
		case Cam.VISIBLE:
			return visibleRes[mode.res] as M extends CamMode<Cam.VISIBLE>
				? (typeof visibleRes)[M["res"]]
				: never;
		case Cam.DEPTH:
			return depthRes[mode.res] as M extends CamMode<Cam.DEPTH>
				? (typeof depthRes)[M["res"]]
				: never;
		case Cam.INFRARED:
			return irRes[mode.res] as M extends CamMode<Cam.INFRARED>
				? (typeof irRes)[M["res"]]
				: never;
	}
};

export const selectBpp = <M extends CamMode>(mode: M) => {
	switch (mode?.stream) {
		case undefined:
			throw new RangeError("Invalid mode", { cause: mode });
		case Cam.VISIBLE:
			return visibleBpp[mode.format] as M extends CamMode<Cam.VISIBLE>
				? (typeof visibleBpp)[M["format"]]
				: never;
		case Cam.DEPTH:
			return depthBpp[mode.format] as M extends CamMode<Cam.DEPTH>
				? (typeof depthBpp)[M["format"]]
				: never;
		case Cam.INFRARED:
			return irBpp[mode.format] as M extends CamMode<Cam.INFRARED>
				? (typeof irBpp)[M["format"]]
				: never;
	}
};

export const selectFrameSize = (mode: CamMode) => {
	switch (mode?.stream) {
		case undefined:
			throw new RangeError("Invalid mode", { cause: mode });
		case Cam.VISIBLE: {
			const [width, height] = visibleRes[mode.res];
			const bpp = visibleBpp[mode.format];
			return width * height * (bpp / 8);
		}
		case Cam.DEPTH: {
			const [width, height] = depthRes[mode.res];
			const bpp = depthBpp[mode.format];
			return width * height * (bpp / 8);
		}
		case Cam.INFRARED: {
			const [width, height] = irRes[mode.res];
			const bpp = irBpp[mode.format];
			return width * height * (bpp / 8);
		}
	}
};
