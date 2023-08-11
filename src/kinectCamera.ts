import { KinectStream } from "./kinectStream";

const MAGIC_OUT = 0x4d47;
const MAGIC_IN = 0x4252;
const HDR_SIZE = 8;

const OFF = 0;

enum CamUsbControl {
	ANY_COMMAND = 0x00,
}

// usb endpoint id, not an array index
enum CamUsbEndpoint {
	VIDEO = 0x01,
	DEPTH = 0x02,
}

enum CamUsbCommand {
	READ_REGISTER = 0x02,
	WRITE_REGISTER = 0x03,
	ZEROPLANE = 0x04,
	REGISTRATION = 0x16,
	CMOS = 0x95,
}

enum CamRegAddr {
	PROJECTOR = 0x105,

	VIDEO_ACTIVE = 0x05, // CamModeActive  VISIBLE | IR
	DEPTH_ACTIVE = 0x06, // CamModeActive  DEPTH

	VIDEO_MODE = 0x0c,
	VIDEO_RES = 0x0d,
	VIDEO_FPS = 0x0e,

	DEPTH_BPP = 0x12, // 0b11 11bit, 0b10 10bit
	DEPTH_RES = 0x13,
	DEPTH_FPS = 0x14,
	IR_BRIGHTNESS = 0x15,

	IR_MODE = 0x19,
	IR_RES = 0x1a,
	IR_FPS = 0x1b,

	DEPTH_FLIP = 0x17,
	VIDEO_FLIP = 0x47,
	IR_FLIP = 0x48,
}

enum CamModeFps {
	F_15P = 15,
	F_30P = 30,
}

enum CamModeDepth {
	D_11B = 0b11,
	D_10B = 0b10,
}

/*
enum CamBitflag {
	WHITEBALANCE_MANUAL = 1 << 15,
	EXPOSURE_AUTO = 1 << 14, // important
	DEFECT_CORRECTION = 1 << 13,

	LENS_SHADING = 1 << 10,

	ANTIFLICKER = 1 << 7, // important

	COLOR_RAW = 1 << 4, // important
	EXPOSURE_WEIGHTED = 1 << 3,
	EXPOSURE_WINDOW = 1 << 2,
	WHITEBALANCE_AUTO = 1 << 1, // important
}

enum CamModeVisible {
	BAYER = 0x00,
	YUV = 0x05,
}

enum CamModeIR {
	IR = 0x00, // called "luminance"???
}
*/

enum CamModeActive {
	VISIBLE = 0b001,
	DEPTH = 0b010,
	IR = 0b100,
}

// Some res/video combos are incompatible, actual output res may vary.
// For instance, MEDIUM is 640x488 for IR.
enum CamModeRes {
	LOW = 0, // QVGA - 320x240
	MED = 1, // VGA  - 640x480
	HIGH = 2, // SXGA - 1280x1024
}

type CamMode = {
	fps: CamModeFps;
	res: CamModeRes;
	depth?: CamModeDepth;
	//visible?: CamModeVisible;
	//ir?: CamModeIR;
};

export class KinectCamera {
	dev: USBDevice;

	tag: number;

	//visibleStream?: KinectStream;
	//irStream?: KinectStream;
	depthStream?: KinectStream;
	mode: CamMode;

	constructor(device: USBDevice) {
		this.dev = device;
		this.tag = 1;
		this.mode = {
			// arbitrary default
			depth: CamModeDepth.D_11B,
			fps: CamModeFps.F_30P,
			res: CamModeRes.MED,
		};
	}

	async endDepthStream() {
		this.mode.depth = undefined;
		await this.writeRegister(CamRegAddr.DEPTH_ACTIVE, OFF);
		this.depthStream?.abort();
	}

	async initDepthStream() {
		await this.writeRegister(CamRegAddr.PROJECTOR, OFF); // disable projector autocycle. TODO: why? position?
		await this.writeRegister(CamRegAddr.DEPTH_ACTIVE, OFF); // in case it was on

		// TODO: more modes
		this.mode.depth = CamModeDepth.D_11B;
		await this.writeRegister(CamRegAddr.DEPTH_BPP, 0b11 as CamModeDepth);
		await this.writeRegister(CamRegAddr.DEPTH_RES, CamModeRes.MED);
		await this.writeRegister(CamRegAddr.DEPTH_FPS, 30 as CamModeFps);

		await this.writeRegister(CamRegAddr.DEPTH_ACTIVE, CamModeActive.DEPTH);
		await this.writeRegister(CamRegAddr.DEPTH_FLIP, OFF); // disable depth hflip. TODO: position?
	}

	async streamDepthFrames() {
		console.log("called streamDepthFrames");
		await this.initDepthStream();

		const endpoint =
			this.dev.configuration!.interfaces[0].alternate.endpoints.find(
				(e) => e.endpointNumber === CamUsbEndpoint.DEPTH,
			)!;

		const iface = this.dev.configuration!.interfaces[0];
		console.log("interface", iface, "endpoint", endpoint);
		console.log(
			"creating KinectStream",
			this.dev,
			0,
			endpoint.endpointNumber - 1,
		);
		const devIdx = await navigator.usb
			.getDevices()
			.then((devs) => devs.indexOf(this.dev));
		this.depthStream = new KinectStream(
			devIdx,
			iface.interfaceNumber,
			endpoint.endpointNumber - 1,
		);
		return await this.depthStream.frames();
	}

	static unpackDepthFrame(frame: ArrayBuffer) {
		const src = new Uint8Array(frame);
		const dest = new Uint16Array(640 * 480);
		let window = 0;
		let bits = 0;
		let s = 0;
		let d = 0;
		while (s < src.length) {
			while (bits < 11 && s < src.length) {
				window = (window << 8) | src[s++];
				bits += 8;
			}
			if (bits < 11) break;
			bits -= 11;
			dest[d++] = window >> bits;
			window &= (1 << bits) - 1;
		}
		return dest;
	}

	async command(cmdId: CamUsbCommand, body: Uint16Array) {
		const cmdBuffer = new ArrayBuffer(HDR_SIZE + body.byteLength);
		if (cmdBuffer.byteLength > 1024) throw Error("command exceeds 1024 bytes");

		const cmdHeader = new Uint16Array(cmdBuffer, 0, HDR_SIZE / 2);
		cmdHeader.set([MAGIC_OUT, body.length, cmdId, this.tag]);

		const cmdBody = new Uint16Array(
			cmdBuffer,
			cmdHeader.byteLength,
			body.length,
		);
		cmdBody.set(body);

		const usbResponse = await this.dev.controlTransferOut(
			{
				requestType: "vendor",
				recipient: "device",
				request: CamUsbControl.ANY_COMMAND,
				value: 0,
				index: 0,
			},
			cmdBuffer,
		);

		if (usbResponse.status !== "ok")
			throw new Error(`command failed ${usbResponse}`);

		let cmdResponse: USBInTransferResult;
		do {
			cmdResponse = await this.dev.controlTransferIn(
				{
					requestType: "vendor",
					recipient: "device",
					request: CamUsbControl.ANY_COMMAND,
					value: 0,
					index: 0,
				},
				512,
			);
			await new Promise((resolve) => setTimeout(resolve, 10));
		} while (!cmdResponse!.data?.byteLength);

		const rHeader = new Uint16Array(cmdResponse.data!.buffer, 0, HDR_SIZE / 2);
		const rBody = new Uint16Array(cmdResponse.data!.buffer, HDR_SIZE);

		const [rMagic, rLength, rCmdId, rTag] = rHeader;
		console.info(
			"response ",
			CamUsbCommand[rCmdId],
			"seq",
			rTag,
			"body",
			...rBody,
		);

		if (rMagic !== MAGIC_IN) return console.error(`bad magic ${rMagic}`);
		if (rLength !== rBody.length)
			return console.error(`bad length ${rLength} expected ${rBody.length}`);
		if (rCmdId !== cmdId)
			return console.error(`bad command ${rCmdId} expected ${cmdId}`);
		if (rTag !== this.tag)
			return console.error(`bad tag ${rTag} expected ${this.tag}`);

		this.tag++;
		return rBody;
	}

	async writeRegister(register: CamRegAddr, value: number) {
		console.log("writeRegister", CamRegAddr[register], value);
		const write = await this.command(
			CamUsbCommand.WRITE_REGISTER,
			new Uint16Array([register, value]),
		);
		if (write?.length !== 1 || write[0] !== 0)
			return console.warn(`bad write ${write}`);
		return write;
	}

	async readRegister(register: number) {
		console.log("readRegister", CamRegAddr[register]);
		const read = await this.command(
			CamUsbCommand.READ_REGISTER,
			new Uint16Array([register]),
		);
		if (read!.length !== 2) return console.warn(`bad read ${read}`);
		return read;
	}
}
