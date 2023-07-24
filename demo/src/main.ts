import "./style.css";

import { KinectDevice, KinectCamera, ProductId, usbSupport } from "webnect";

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
				case ProductId.NUI_MOTOR:
					devicesArg.motor = device;
					break;
				case ProductId.NUI_CAMERA:
					devicesArg.camera = device;
					break;
				case ProductId.NUI_AUDIO:
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

	const fsDepth = document.querySelector<HTMLButtonElement>("#fsDepth")!;
	fsDepth.addEventListener("click", () => {
		depthCanvas.requestFullscreen();
	});

	const runStream = async () => {
		try {
			depthStreamCb.checked = true;
			const depthStream = await kinect.camera!.streamDepthFrames();
			for await (const frame of depthStream) {
				const colorMarch = window.performance.now() / 10;
				const grayFrame = KinectCamera.unpackDepthFrame(frame!.buffer);

				// frame is 11bit/u16gray, expand for canvas rgba
				const rgbaFrame = new Uint8ClampedArray(640 * 480 * 4);
				for (let i = 0; i < grayFrame.length; i++) {
					const pixel16 = grayFrame[i];

					// this counts as art
					rgbaFrame[i * 4 + 0] = ((pixel16 << 1) + colorMarch) & 0xff;
					rgbaFrame[i * 4 + 1] = ((pixel16 << 2) + colorMarch) & 0xff;
					rgbaFrame[i * 4 + 2] = ((pixel16 << 3) + colorMarch) & 0xff;

					rgbaFrame[i * 4 + 3] = pixel16 < 2047 ? 0xff : 0;
				}
				depthCtx.putImageData(new ImageData(rgbaFrame, 640, 480), 0, 0);
			}
		} catch (e) {
			cameraDemo.disabled = true;
			cameraDemo.classList.add("disabled");
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
					accelDisplay.textContent = String(accel); //.join(", ");
				},
			)
			.catch(() => {
				motorDemo.disabled = true;
			});
	}, 1000);
}
