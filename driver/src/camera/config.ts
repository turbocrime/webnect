import { Cam } from "./enum.js";
import type { CamMode } from "./mode.js";
import { CamImageData, isCamImageData } from "./stream/image-data.js";

export function resolveConfig<C extends CameraConfig>({
	depth: depthConfig,
	video: videoConfig,
}: C): CameraConfigResult<C> {
	let depth: CamImageData<CamMode<Cam.DEPTH>> | undefined;
	if (isCamImageData(depthConfig, Cam.DEPTH)) {
		depth = depthConfig;
	} else if (depthConfig?.stream === Cam.DEPTH) {
		depth = new CamImageData(depthConfig);
	} else if (depthConfig) {
		throw new RangeError(`Invalid depth config`, { cause: depthConfig });
	}

	let video:
		| CamImageData<CamMode<Cam.VISIBLE>>
		| CamImageData<CamMode<Cam.INFRARED>>
		| undefined;
	if (isCamImageData(videoConfig, Cam.VISIBLE)) {
		video = videoConfig;
	} else if (isCamImageData(videoConfig, Cam.INFRARED)) {
		video = videoConfig;
	} else if (videoConfig?.stream === Cam.VISIBLE) {
		video = new CamImageData(videoConfig);
	} else if (videoConfig?.stream === Cam.INFRARED) {
		video = new CamImageData(videoConfig);
	} else if (videoConfig) {
		throw new RangeError("Invalid video config", { cause: videoConfig });
	}

	return { depth, video } as CameraConfigResult<C>;
}

export interface CameraConfig {
	depth?: CamMode<Cam.DEPTH> | CamImageData<CamMode<Cam.DEPTH>>;
	video?:
		| CamMode<Cam.VISIBLE>
		| CamMode<Cam.INFRARED>
		| CamImageData<CamMode<Cam.VISIBLE>>
		| CamImageData<CamMode<Cam.INFRARED>>;
}

type CameraConfigImage<CF extends CameraConfig[keyof CameraConfig]> =
	CF extends NonNullable<CamMode>
		? CamImageData<CF>
		: CF extends CamImageData<CamMode>
			? CF
			: undefined;

type CameraConfigResult<C extends CameraConfig> = {
	depth: CameraConfigImage<C["depth"]>;
	video: CameraConfigImage<C["video"]>;
};
