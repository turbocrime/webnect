import "./style.css";

import {
	KinectDevice,
	KinectCamera,
	KinectProductId,
	usbSupport,
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
	const activateDemos = (k: KinectDevice) => {
		if (k.motor) setupMotorDemo(k);
		if (k.camera) setupDepthDemo(k);
	};

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
		new KinectDevice(devicesArg).ready.then(activateDemos);
	}

	requestUsbBtn.addEventListener("click", () => {
		const { motor, camera, audio } = {
			motor: document.querySelector<HTMLInputElement>("#motorCb")!.checked,
			camera: document.querySelector<HTMLInputElement>("#cameraCb")!.checked,
			audio: document.querySelector<HTMLInputElement>("#audioCb")!.checked,
		};
		if (!(motor || camera || audio))
			return alert("Select at least one device.");
		new KinectDevice({ motor, camera, audio }).ready
			.then(activateDemos)
			.then(updateExistingUsb);
	});
}

setupKinect(document.querySelector<HTMLButtonElement>("#connectUsb")!);

function setupDepthDemo(kinect: KinectDevice) {
	const cameraDemo =
		document.querySelector<HTMLFieldSetElement>("#cameraDemo")!;
	cameraDemo.hidden = false;
	cameraDemo.disabled = false;
	cameraDemo.classList.remove("disabled");

	const depthStreamCb =
		document.querySelector<HTMLInputElement>("#depthStream")!;
	const depthCanvas =
		document.querySelector<HTMLCanvasElement>("#depthCanvas")!;
	const depthCtx = depthCanvas.getContext("2d")!;

	// calculate fullscreen center crop
	const canvasAspect = 640 / 480;
	const screenAspect = screen.width / screen.height;
	const fsWidth = screenAspect > canvasAspect ? 640 : screenAspect * 480;
	const fsHeight = screenAspect > canvasAspect ? 640 / screenAspect : 480;
	const fsZeroX = -((640 - fsWidth) / 2);
	const fsZeroY = -((480 - fsHeight) / 2);

	const fsDepth = document.querySelector<HTMLButtonElement>("#fsDepth")!;
	fsDepth.addEventListener("click", () => {
		depthCanvas.requestFullscreen();
	});

	let wakeLock: WakeLockSentinel;
	document.addEventListener("fullscreenchange", async () => {
		if (document.fullscreenElement) {
			depthCanvas.width = fsWidth;
			depthCanvas.height = fsHeight;
			try {
				wakeLock = await navigator.wakeLock.request();
			} catch (e) {
				console.warn("wakeLock failed");
			}
		} else {
			depthCanvas.width = 640;
			depthCanvas.height = 480;
			wakeLock?.release();
		}
	});

	const runStream = async () => {
		try {
			depthStreamCb.checked = true;

			const rgbaFrame = new Uint8ClampedArray(640 * 480 * 4);

			// rome-ignore lint/style/useConst: <explanation>
			let mode = "ir";

			if (mode === "depth") {
				const depthStream = await kinect.camera!.initDepthStream();
				for await (const frame of kinect.camera!.depthFrames()) {
					// frame is 11bit/u16gray, expand for canvas rgba
					const grayFrame = KinectCamera.unpack10bitGray(frame);

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
						rgbaFrame[i * 4 + 3] = grayPixel < 1023 ? 0xff : 0;
					}
					const drawFrame = new ImageData(rgbaFrame, 640, 480);
					if (document.fullscreenElement)
						depthCtx.putImageData(drawFrame, fsZeroX, fsZeroY);
					else depthCtx.putImageData(drawFrame, 0, 0);
				}
			}

			if (mode === "video") {
				const bayerStream = await kinect.camera!.initVisibleStream();
				const [height, width] = [480, 640];
				const p = (x: number, y: number) => {
					const p = y * width + x;
					if (p < 0) return 0;
					if (p > 640 * 480) return 640 * 480;
					return p;
				};
				for await (const f of kinect.camera!.videoFrames()) {
					const bayer = new Uint8Array(f);
					for (let y = 0; y < height; y++) {
						for (let x = 0; x < width; x++) {
							let i = p(x, y);
							if ((x + y) % 2 === 0) {
								// Green pixel (even row, even column)
								const [r, g] = i % 2 ? [2, 0] : [0, 2];
								rgbaFrame[i * 4 + r] =
									(bayer[p(x - 1, y)] + bayer[p(x + 1, y)]) / 2; // R
								rgbaFrame[i * 4 + 1] = bayer[i]; // G
								rgbaFrame[i * 4 + g] =
									(bayer[p(x, y - 1)] + bayer[p(x, y + 1)]) / 2; // B
							} else if (y % 2) {
								// Blue pixel
								rgbaFrame[i * 4 + 0] =
									(bayer[p(x - 1, y - 1)] +
										bayer[p(x + 1, y + 1)] +
										bayer[p(x + 1, y - 1)] +
										bayer[p(x - 1, y + 1)]) /
									4; // R
								rgbaFrame[i * 4 + 1] =
									(bayer[p(x - 1, y)] +
										bayer[p(x + 1, y)] +
										bayer[p(x, y - 1)] +
										bayer[p(x, y + 1)]) /
									4; // G
								rgbaFrame[i * 4 + 2] = bayer[i]; // B
							} else {
								// Red pixel
								rgbaFrame[i * 4 + 0] = bayer[i]; // R
								rgbaFrame[i * 4 + 1] =
									(bayer[p(x - 1, y)] +
										bayer[p(x + 1, y)] +
										bayer[p(x, y - 1)] +
										bayer[p(x, y + 1)]) /
									4; // G
								rgbaFrame[i * 4 + 2] =
									(bayer[p(x - 1, y - 1)] +
										bayer[p(x + 1, y + 1)] +
										bayer[p(x + 1, y - 1)] +
										bayer[p(x - 1, y + 1)]) /
									4; // R
							}
							rgbaFrame[i * 4 + 3] = 255; // Alpha channel, fully opaque
						}
					}

					const drawFrame = new ImageData(rgbaFrame, 640, 480);
					if (document.fullscreenElement)
						depthCtx.putImageData(drawFrame, fsZeroX, fsZeroY);
					else depthCtx.putImageData(drawFrame, 0, 0);
				}
			}

			if (mode === "ir") {
				const videoStream = await kinect.camera!.initIRStream();
				for await (const f of kinect.camera!.videoFrames()) {
					const frame = KinectCamera.unpack10bitGray(f);
					const rgbaFrame = new Uint8ClampedArray(640 * 480 * 4);
					for (let i = 0; i < frame.length; i++) {
						const pixel = frame[i];
						rgbaFrame[i * 4 + 0] = pixel;
						rgbaFrame[i * 4 + 1] = pixel;
						rgbaFrame[i * 4 + 2] = pixel;
						rgbaFrame[i * 4 + 3] = 0xff;
					}
					const drawFrame = new ImageData(rgbaFrame, 640, 480);
					if (document.fullscreenElement)
						depthCtx.putImageData(drawFrame, fsZeroX, fsZeroY);
					else depthCtx.putImageData(drawFrame, 0, 0);
				}
			}
		} catch (e) {
			console.error("depthStream failed", e);
			cameraDemo.disabled = true;
			cameraDemo.classList.add("disabled");
			throw e;
		}
	};

	const endStream = async () => {
		depthStreamCb.checked = false;
		await kinect.camera?.endDepthStream();
		depthCtx.clearRect(0, 0, 640, 480);
	};

	depthStreamCb.addEventListener("change", () =>
		depthStreamCb.checked ? runStream() : endStream(),
	);

	runStream();
}

function setupMotorDemo(kinect: KinectDevice) {
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
		kinect.motor?.cmdSetLed(ledMode);
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
		kinect.motor!.cmdSetTilt(angle);
	});

	setInterval(() => {
		kinect
			.motor!.cmdGetState()
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
