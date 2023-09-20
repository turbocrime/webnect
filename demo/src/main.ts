import { ToRgbaBuffer } from "../../src/stream/format";
import "./style.css";

import k, { format } from "@webnect/webnect";

const d = document;
const usb = navigator.usb;

// canvas
const cWidth = 640;
const cHeight = 480;
const cAspect = cWidth / cHeight;
const fsAspect = screen.width / screen.height;

const videoCanvas = d.querySelector<HTMLCanvasElement>("#videoCanvas")!;
const videoCanvas2dCtx = videoCanvas.getContext("2d")!;

const motorDemo = d.querySelector<HTMLFieldSetElement>("#motorDemo")!;
const cameraDemo = d.querySelector<HTMLFieldSetElement>("#cameraDemo")!;

const el = Object.fromEntries(
	[
		"annoying",
		"plugItIn",
		"pairedDevices",
		"pairedDeviceList",
		"connectUsb",

		"videoFps",

		"angleDisplay",
		"servoDisplay",
		"accelDisplay",
	].map((s) => [s, d.querySelector(`#${s}`)!] as [string, HTMLElement]),
);

const ui = Object.fromEntries(
	[
		"cameraCb",
		"videoFlipCb",
		"videoFsBtn",
		"videoModeOpt",

		"motorCb",
		"ledInput",
		"tiltInput",
	].map((s) => [s, d.querySelector(`#${s}`)!] as [string, HTMLInputElement]),
);

const getUsb = () => navigator.usb.getDevices();

const customDepthRgba = (raw: ArrayBuffer, out?: ArrayBuffer) => {
	const rgbaFrame = out
		? new Uint8ClampedArray(out)
		: new Uint8ClampedArray(cWidth * cHeight * 4);
	// frame is 11bit packed gray, unpack to u16 gray
	const grayFrame = new Uint16Array(format.unpackGray(11, raw)!);

	// moving color ramps
	const colorMarch = window.performance.now() / 10;
	for (let i = 0; i < grayFrame.length && i * 4 < rgbaFrame.length; i++) {
		const grayPixel = grayFrame[i];

		// this counts as art
		rgbaFrame[i * 4 + 0] = ((grayPixel << 1) + colorMarch) & 0xff;
		rgbaFrame[i * 4 + 1] = ((grayPixel << 2) + colorMarch) & 0xff;
		rgbaFrame[i * 4 + 2] = ((grayPixel << 3) + colorMarch) & 0xff;
		rgbaFrame[i * 4 + 3] = grayPixel < 2047 ? 0xff : 0x00;
	}
	if (!out) return rgbaFrame.buffer;
};

async function listDevices(devices: USBDevice[]) {
	el.pairedDeviceList.innerHTML = "";
	devices.forEach((device) => {
		if (!device) return;
		const deviceLabel = Object.assign(d.createElement("label"), {
			className: "pairedDevice",
			textContent: `${device.productName} ${device?.serialNumber}`,
		});
		const checkbox = Object.assign(d.createElement("input"), {
			type: "checkbox",
			checked: true,
		});
		deviceLabel.prepend(checkbox);
		checkbox.addEventListener("change", () => {
			device.close();
			device.forget();
			checkbox.disabled = true;
			deviceLabel.classList.add("forgotten");
		});
		el.pairedDeviceList.appendChild(deviceLabel);
	});
}

async function setupDevices(devices: USBDevice[]) {
	devices.forEach((device) => {
		if (!device) return;
		el.plugItIn.hidden = true;
		el.pairedDevices.hidden = false;
		switch (device?.productId) {
			case k.ProductId.NUI_MOTOR:
				setupMotorDemo(device as USBDevice);
				break;
			case k.ProductId.NUI_CAMERA:
				setupCameraDemo(device as USBDevice);
				break;
		}
	});
}

function setupCameraDemo(cameraDevice: USBDevice) {
	cameraDevice.open();
	const camera = new k.Camera(cameraDevice, {
		deraw: { depth: customDepthRgba as ToRgbaBuffer },
	});
	cameraDemo.hidden = false;
	cameraDemo.disabled = false;
	cameraDemo.classList.remove("disabled");

	let frameCounter = 0;
	setInterval(() => {
		el.videoFps.innerText = `FPS: ${frameCounter}`;
		frameCounter = 0;
	}, 1000);

	// calculate fullscreen center crop
	const fsWidth = fsAspect > cAspect ? cWidth : fsAspect * cHeight;
	const fsHeight = fsAspect > cAspect ? cWidth / fsAspect : cHeight;
	const fsZeroX = -((cWidth - fsWidth) / 2);
	const fsZeroY = -((cHeight - fsHeight) / 2);

	ui.videoModeOpt.addEventListener("change", async () => {
		await endStream();
		console.log("ended stream");
		await runStream();
	});

	ui.videoFlipCb.addEventListener("change", async () => {
		const flip = ui.videoFlipCb.checked ? 1 : 0;
		camera.mode({ depth: { flip }, video: { flip } });
	});

	ui.videoFsBtn.addEventListener("click", () => {
		videoCanvas.requestFullscreen();
	});

	let wakeLock: WakeLockSentinel;
	d.addEventListener("fullscreenchange", async () => {
		if (d.fullscreenElement) {
			videoCanvas.width = fsWidth;
			videoCanvas.height = fsHeight;
			try {
				wakeLock = await navigator.wakeLock.request();
			} catch (e) {
				console.warn("wakeLock failed");
			}
		} else {
			videoCanvas.width = 640;
			videoCanvas.height = 480;
			wakeLock?.release();
		}
	});

	let reader: ReadableStreamDefaultReader;
	let camStream: ReadableStream;

	const runStream = async () => {
		try {
			await camera.ready;
			const flip = ui.videoFlipCb.checked ? 1 : 0;
			switch (ui.videoModeOpt.value) {
				case "depth": {
					camera.mode({
						depth: { ...k.Modes.DEPTH, flip },
						video: k.Modes.OFF,
					});
					//camera.deraw({ depth: customDepthRgba });
					camStream = camera.depth;
					break;
				}
				case "visible": {
					camera.mode({
						depth: k.Modes.OFF,
						video: { ...k.Modes.VISIBLE, flip },
					});
					camStream = camera.video;
					break;
				}
				case "ir": {
					camera.mode({
						depth: k.Modes.OFF,
						video: { ...k.Modes.INFRARED, flip },
					});
					camStream = camera.video;
					break;
				}
				default:
					camStream = camera.depth;
			}

			reader = camStream.getReader();
			const frameGenerator = async function* () {
				try {
					while (++frameCounter) {
						const frame = await reader.read();
						if (frame.done) break;
						yield frame.value;
					}
				} catch (e) {
					if (!String(e).startsWith("TypeError: Releasing Default reader"))
						throw e;
				} finally {
					if (camStream.locked) reader.releaseLock();
				}
			};
			for await (const drawFrame of frameGenerator())
				d.fullscreenElement
					? videoCanvas2dCtx.putImageData(drawFrame, fsZeroX, fsZeroY)
					: videoCanvas2dCtx.putImageData(drawFrame, 0, 0);
		} catch (e) {
			cameraDemo.disabled = true;
			cameraDemo.classList.add("disabled");
			throw e;
		}
	};

	const endStream = async () => {
		try {
			if (camStream.locked) reader.releaseLock();
		} catch (e) {
			if (!String(e).startsWith("TypeError: Releasing Default reader")) throw e;
		}
		camera.mode({ depth: k.Modes.OFF, video: k.Modes.OFF })
	};

	runStream();
}

function setupMotorDemo(motorDevice: USBDevice) {
	motorDevice.open();
	const motor = new k.Motor(motorDevice);
	motorDemo.hidden = false;
	motorDemo.disabled = false;

	const servoModes = ["off", "maximum", undefined, undefined, "moving"];
	const ledModes = [
		["black", "off"],
		["green", "green"],
		["red", "red"],
		["orange", "amber"],
	];

	let ledMode = 0;
	ui.ledInput.addEventListener("click", () => {
		ledMode = (ledMode + 1) % 4;
		motor?.setLed(ledMode);
		const [styleColor, nameColor] = ledModes[ledMode];
		ui.ledInput.textContent = `LED is ${nameColor}`;
		ui.ledInput.style.background = styleColor;
	});

	ui.tiltInput.addEventListener("change", () =>
		motor!.setTilt(parseInt(ui.tiltInput.value)),
	);

	setInterval(
		() =>
			motor
				.getState()
				.then(({ angle, servo, accel }) => {
					el.angleDisplay.textContent = String(angle);
					el.servoDisplay.textContent = String(servoModes[servo]);
					el.accelDisplay.textContent = String(accel);
				})
				.catch(() => {
					motorDemo.disabled = true;
				}),
		1000,
	);
}

(async () => {
	if (typeof usb?.getDevices === "function") el.annoying!.remove();

	el.connectUsb.addEventListener("click", async () => {
		await Promise.allSettled([
			ui.motorCb.checked && (await k.claimNuiMotor()),
			ui.cameraCb.checked && (await k.claimNuiCamera()),
		]);
		const extant = await getUsb();
		listDevices(extant);
		setupDevices(extant);
	});

	const extant = await getUsb();
	listDevices(extant);
	setupDevices(extant);
})();
