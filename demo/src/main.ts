import "./style.css";

import k from "@webnect/webnect";

const customDepthRgba = (raw: ArrayBuffer, rgba?: Uint8ClampedArray) => {
	const rgbaFrame = rgba ?? new Uint8ClampedArray(640 * 480 * 4);
	// frame is 11bit packed gray, unpack to u16 gray
	const grayFrame = k.format.unpackGray(11, raw);

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
	return rgbaFrame;
};

if (typeof navigator?.usb?.getDevices === "function")
	document.getElementById("annoying")!.remove();

let existingUsb = await navigator.usb.getDevices();
const forgottenUsb = new Array();
const plugItIn = document.querySelector<HTMLDivElement>("#plugItIn")!;
const pairedDeviceDisplay =
	document.querySelector<HTMLDivElement>("#pairedDevices")!;

function renderExistingUsb() {
	const pairedDeviceList =
		document.querySelector<HTMLDivElement>("#pairedDeviceList")!;
	pairedDeviceList.innerHTML = "";
	existingUsb.forEach((device) => {
		const idStr = [device.productName!, device?.serialNumber].join(" ");

		const option = Object.assign(document.createElement("label"), {
			className: "pairedDevice",
			textContent: idStr,
		});
		const checkbox = Object.assign(document.createElement("input"), {
			type: "checkbox",
			checked: true,
			value: idStr,
		});

		option.prepend(checkbox);
		checkbox.addEventListener("change", async () => {
			await device.close();
			await device.forget();
			forgottenUsb.push(idStr);
			updateExistingUsb();
		});
		pairedDeviceList.appendChild(option);
	});
	forgottenUsb.forEach((forgottenStr) => {
		const forgottenOption = Object.assign(document.createElement("label"), {
			className: "pairedDevice forgotten",
			textContent: forgottenStr,
		});
		const disabledCheckBox = Object.assign(document.createElement("input"), {
			type: "checkbox",
			checked: false,
			disabled: true,
		});
		forgottenOption.prepend(disabledCheckBox);
		pairedDeviceList.appendChild(forgottenOption);
	});
}

const updateExistingUsb = async () => {
	existingUsb = await navigator.usb.getDevices();
	renderExistingUsb();
};

async function setupDevice() {
	await updateExistingUsb();
	if (existingUsb.length) {
		plugItIn.hidden = true;
		pairedDeviceDisplay.hidden = false;
		const devicesArg: {
			motor: boolean | USBDevice;
			camera: boolean | USBDevice;
			audio: boolean | USBDevice;
		} = { motor: false, camera: false, audio: false };
		existingUsb.forEach((device) => {
			switch (device.productId) {
				case k.ProductId.NUI_MOTOR:
					devicesArg.motor = device;
					break;
				case k.ProductId.NUI_CAMERA:
					devicesArg.camera = device;
					break;
			}
		});
		if (devicesArg.camera) setupCameraDemo(devicesArg.camera as USBDevice);
		if (devicesArg.motor) setupMotorDemo(devicesArg.motor as USBDevice);
	}
}
setupDevice();

document
	.querySelector<HTMLButtonElement>("#connectUsb")!
	.addEventListener("click", async () => {
		const { motor, camera, audio } = {
			motor: document.querySelector<HTMLInputElement>("#motorCb")!.checked
				? await k.claimNuiMotor()
				: undefined,
			camera: document.querySelector<HTMLInputElement>("#cameraCb")!.checked
				? await k.claimNuiCamera()
				: undefined,
			audio: document.querySelector<HTMLInputElement>("#audioCb")!.checked,
		};
		if (!(motor || camera || audio))
			return alert("Select at least one device.");
		setupDevice();
	});

function setupCameraDemo(cameraDevice: USBDevice) {
	cameraDevice.open();
	const camera = new k.Camera(cameraDevice);
	const cameraDemo =
		document.querySelector<HTMLFieldSetElement>("#cameraDemo")!;
	cameraDemo.hidden = false;
	cameraDemo.disabled = false;
	cameraDemo.classList.remove("disabled");

	const frameCounter = Array();
	const videoFps = document.getElementById("videoFps")!;
	setInterval(() => {
		videoFps.innerText = `${frameCounter.length}`;
		frameCounter.splice(0, frameCounter.length);
	}, 1000);

	const videoCanvas =
		document.querySelector<HTMLCanvasElement>("#videoCanvas")!;
	const videoCanvas2dCtx = videoCanvas.getContext("2d")!;

	// calculate fullscreen center crop
	const canvasAspect = 640 / 480;
	const screenAspect = screen.width / screen.height;
	const fsWidth = screenAspect > canvasAspect ? 640 : screenAspect * 480;
	const fsHeight = screenAspect > canvasAspect ? 640 / screenAspect : 480;
	const fsZeroX = -((640 - fsWidth) / 2);
	const fsZeroY = -((480 - fsHeight) / 2);

	const videoModeOption =
		document.querySelector<HTMLOptionElement>("#videoMode")!;
	videoModeOption.addEventListener("change", async () => {
		await endStream();
		console.log("ended stream");
		await runStream();
	});

	const videoFlipCb = document.querySelector<HTMLInputElement>("#flipCb")!;
	videoFlipCb.addEventListener("change", async () => {
		camera.mode(
			{ flip: videoFlipCb.checked ? 1 : 0 },
			{ flip: videoFlipCb.checked ? 1 : 0 },
		);
	});

	const videoFsBtn = document.querySelector<HTMLButtonElement>("#videoFsBtn")!;
	videoFsBtn.addEventListener("click", () => {
		videoCanvas.requestFullscreen();
	});

	let wakeLock: WakeLockSentinel;
	document.addEventListener("fullscreenchange", async () => {
		if (document.fullscreenElement) {
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
	let camStream: ReadableStream<ImageData>;
	const runStream = async () => {
		try {
			await camera.ready;
			switch (videoModeOption.value) {
				case "depth": {
					await camera.mode(
						{
							...k.Modes.DEPTH,
							flip: videoFlipCb.checked ? 1 : 0,
						},
						k.Modes.OFF,
					);

					if (camera.depth.rawDeveloper)
						camera.depth.rawDeveloper.customFn = customDepthRgba;
					else console.error("failed to set custom deraw");
					camStream = camera.depth.readable as ReadableStream<ImageData>;
					break;
				}
				case "visible": {
					await camera.mode(k.Modes.OFF, {
						...k.Modes.VISIBLE,
						flip: videoFlipCb.checked ? 1 : 0,
					});
					camStream = camera.video.readable as ReadableStream<ImageData>;
					break;
				}
				case "ir": {
					await camera.mode(k.Modes.OFF, {
						...k.Modes.INFRARED,
						flip: videoFlipCb.checked ? 1 : 0,
					});
					camStream = camera.video.readable as ReadableStream<ImageData>;
					break;
				}
				default:
					camStream = camera.video.readable as ReadableStream<ImageData>;
			}

			reader = camStream.getReader();
			const frameGenerator = async function* () {
				try {
					while (true) {
						const frame = await reader.read();
						if (frame.done) break;
						yield frame.value;
					}
				} catch {
				} finally {
					if (camStream.locked) reader.releaseLock();
					console.log("AM I DONE");
				}
			};
			for await (const drawFrame of frameGenerator()) {
				if (document.fullscreenElement)
					videoCanvas2dCtx.putImageData(drawFrame, fsZeroX, fsZeroY);
				else videoCanvas2dCtx.putImageData(drawFrame, 0, 0);
				frameCounter.push(true);
			}
		} catch (e) {
			cameraDemo.disabled = true;
			cameraDemo.classList.add("disabled");
			throw e;
		}
	};

	const endStream = async () => {
		if (camStream.locked) reader.releaseLock();
		await camera.mode(k.Modes.OFF, k.Modes.OFF);
	};

	runStream();
}

function setupMotorDemo(motorDevice: USBDevice) {
	motorDevice.open();
	const motor = new k.Motor(motorDevice);
	const motorDemo = document.querySelector<HTMLFieldSetElement>("#motorDemo")!;
	motorDemo.hidden = false;
	motorDemo.disabled = false;

	const ledModes = [
		["black", "off"],
		["green", "green"],
		["red", "red"],
		["orange", "amber"],
	];
	let ledMode = 0;
	const ledInput = document.querySelector<HTMLInputElement>("#ledInput")!;
	ledInput.addEventListener("click", () => {
		ledMode = (ledMode + 1) % 4;
		motor?.setLed(ledMode);
		const [styleColor, nameColor] = ledModes[ledMode];
		ledInput.textContent = `LED is ${nameColor}`;
		ledInput.style.background = styleColor;
	});

	const servoModes = ["off", "maximum", undefined, undefined, "moving"];
	const angleDisplay = document.querySelector<HTMLDivElement>("#angleDisplay")!;
	const servoDisplay = document.querySelector<HTMLDivElement>("#servoDisplay")!;
	const accelDisplay = document.querySelector<HTMLDivElement>("#accelDisplay")!;

	const tiltInput = document.querySelector<HTMLInputElement>("#tiltInput")!;
	tiltInput.addEventListener("change", () => {
		const angle = parseInt(tiltInput.value);
		motor!.setTilt(angle);
	});

	setInterval(() => {
		motor!
			.getState()
			.then(
				(motorState: {
					angle?: number;
					servo: number;
					accel: [number, number, number];
				}) => {
					const { angle, servo, accel } = motorState;
					angleDisplay.textContent = String(angle);
					servoDisplay.textContent = String(servoModes[servo]);
					accelDisplay.textContent = String(accel);
				},
			)
			.catch(() => {
				motorDemo.disabled = true;
			});
	}, 1000);
}
