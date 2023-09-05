import "./style.css";

import {
	claimNuiCamera,
	claimNuiMotor,
	KinectCamera,
	KinectMotor,
	KinectProductId,
	usbSupport,
	readAsGenerator,
	unpackGray,
	unpackGrayToRgba,
	bayerToRgba,
	DEFAULTS,
	CamIsoEndpoint,
} from "@webnect/webnect";

if (usbSupport) document.getElementById("annoying")!.remove();

let existingUsb = await navigator.usb.getDevices();
const forgottenUsb = ["Reload page to reconnect to forgotten devices"];

function renderExistingUsb() {
	const plugItIn = document.querySelector<HTMLDivElement>("#plugItIn")!;
	const pairedDeviceDisplay =
		document.querySelector<HTMLDivElement>("#pairedDevices")!;
	if (!existingUsb.length && forgottenUsb.length < 2) {
		plugItIn.hidden = false;
		pairedDeviceDisplay.hidden = true;
	} else {
		plugItIn.hidden = true;
		pairedDeviceDisplay.hidden = false;
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
}

const updateExistingUsb = async () => {
	existingUsb = await navigator.usb.getDevices();
	renderExistingUsb();
};

function setupKinect(requestUsbBtn: HTMLButtonElement) {
	if (existingUsb.length) {
		renderExistingUsb();
		const devicesArg: {
			motor: boolean | USBDevice;
			camera: boolean | USBDevice;
			audio: boolean | USBDevice;
		} = { motor: false, camera: false, audio: false };
		existingUsb.forEach((device) => {
			switch (device.productId) {
				case KinectProductId.NUI_MOTOR:
					devicesArg.motor = device;
					break;
				case KinectProductId.NUI_CAMERA:
					devicesArg.camera = device;
					break;
				case KinectProductId.NUI_AUDIO:
					devicesArg.audio = device;
					break;
			}
		});
		console.log("existing setup");
		if (devicesArg.camera) setupCameraDemo(devicesArg.camera as USBDevice);
		if (devicesArg.motor) setupMotorDemo(devicesArg.motor as USBDevice);
	}

	requestUsbBtn.addEventListener("click", () => {
		const { motor, camera, audio } = {
			motor: document.querySelector<HTMLInputElement>("#motorCb")!.checked,
			camera: document.querySelector<HTMLInputElement>("#cameraCb")!.checked,
			audio: document.querySelector<HTMLInputElement>("#audioCb")!.checked,
		};
		if (!(motor || camera || audio))
			return alert("Select at least one device.");
		console.log("button setup");
		if (motor) claimNuiMotor().then(setupMotorDemo);
		if (camera) claimNuiCamera().then(setupCameraDemo);
	});
}

setupKinect(document.querySelector<HTMLButtonElement>("#connectUsb")!);

function setupCameraDemo(cameraDevice: USBDevice) {
	cameraDevice.open();
	const camera = new KinectCamera(cameraDevice);
	const cameraDemo =
		document.querySelector<HTMLFieldSetElement>("#cameraDemo")!;
	cameraDemo.hidden = false;
	cameraDemo.disabled = false;
	cameraDemo.classList.remove("disabled");

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
		await new Promise((r) => setTimeout(r, 200));
		await runStream();
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

	let breakLoop;
	const runStream = async () => {
		const frameCounter = Array();
		const videoFps = document.getElementById("videoFps")!;
		setInterval(() => {
			videoFps.innerText = `${frameCounter.length}`;
			frameCounter.splice(0, frameCounter.length);
		}, 1000);
		breakLoop = false;
		try {
			await camera.ready;
			let camStream: ReadableStream<ImageData>;
			switch (videoModeOption.value) {
				case "depth": {
					await camera.setMode({
						[CamIsoEndpoint.DEPTH]: DEFAULTS.DEPTH,
						[CamIsoEndpoint.VIDEO]: DEFAULTS.OFF,
					});
					const customDepthRgba = (frame: ArrayBuffer) => {
						const rgbaFrame = new Uint8ClampedArray(640 * 480 * 4);
						// frame is 11bit/u16gray, expand for canvas rgba
						const grayFrame = unpackGray(11, frame);

						// moving color ramps
						const colorMarch = window.performance.now() / 10;
						for (
							let i = 0;
							i < grayFrame.length && i * 4 < rgbaFrame.length;
							i++
						) {
							const grayPixel = grayFrame[i];

							// this counts as art
							rgbaFrame[i * 4 + 0] = ((grayPixel << 1) + colorMarch) & 0xff;
							rgbaFrame[i * 4 + 1] = ((grayPixel << 2) + colorMarch) & 0xff;
							rgbaFrame[i * 4 + 2] = ((grayPixel << 3) + colorMarch) & 0xff;
							rgbaFrame[i * 4 + 3] = grayPixel < 2047 ? 0xff : 0x00;
						}
						return rgbaFrame;
					};
					if (camera.depth.rawDeveloper)
						camera.depth.rawDeveloper.customFn = customDepthRgba;
					camStream = camera.depth.readable as ReadableStream<ImageData>;
					break;
				}
				case "visible": {
					await camera.setMode({
						[CamIsoEndpoint.DEPTH]: DEFAULTS.OFF,
						[CamIsoEndpoint.VIDEO]: DEFAULTS.VISIBLE,
					});
					camStream = camera.video.readable as ReadableStream<ImageData>;
					break;
				}
				case "ir": {
					await camera.setMode({
						[CamIsoEndpoint.DEPTH]: DEFAULTS.OFF,
						[CamIsoEndpoint.VIDEO]: DEFAULTS.INFRARED,
					});
					camStream = camera.video.readable as ReadableStream<ImageData>;
					break;
				}
				default:
					camStream = camera.video.readable as ReadableStream<ImageData>;
			}
			for await (const drawFrame of readAsGenerator(camStream)) {
				if (breakLoop) break;
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
		breakLoop = true;
		await camera.setMode({
			[CamIsoEndpoint.DEPTH]: DEFAULTS.OFF,
			[CamIsoEndpoint.VIDEO]: DEFAULTS.OFF,
		});
		videoCanvas2dCtx.clearRect(0, 0, 640, 480);
	};

	runStream();
}

function setupMotorDemo(motorDevice: USBDevice) {
	motorDevice.open();
	const motor = new KinectMotor(motorDevice);
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
		motor?.cmdSetLed(ledMode);
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
		motor!.cmdSetTilt(angle);
	});

	setInterval(() => {
		motor!
			.cmdGetState()
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
