import { Cam, CamFmtVisible } from "../enum.js";
import type { CamMode } from "../mode.js";
import { selectBpp, selectRes } from "../stream/dimensions.js";
import {
	bayerToRgbaFloat16,
	unpackGrayToRgbaFloat16,
	uyvyToRgbaFloat16,
} from "./formats.js";
import type { RawToRgba } from "./raw-to-rgba.js";

export const selectRawToRgba = (mode: CamMode): RawToRgba => {
	switch (mode?.stream) {
		case undefined:
			throw new RangeError("Invalid mode", { cause: mode });
		case Cam.DEPTH:
			return unpackGrayToRgbaFloat16.bind(null, selectBpp(mode));
		case Cam.INFRARED:
			return unpackGrayToRgbaFloat16.bind(null, selectBpp(mode));
		case Cam.VISIBLE:
			switch (mode.format) {
				case CamFmtVisible.BAYER_8B:
					return bayerToRgbaFloat16.bind(null, selectRes(mode)[0]);
				case CamFmtVisible.YUV_16B:
					return uyvyToRgbaFloat16.bind(null);
			}
	}
};
