/** biome-ignore-all lint/style/noNonNullAssertion: element ids */
import {
	Camera,
	CamImageData,
	claimNuiCamera,
	claimNuiMotor,
	MODE_DEPTH,
	MODE_VISIBLE,
	Motor,
	MotorLed,
	MotorServoState,
	ProductId,
} from "@webnect/driver";
import "./style.css";
import { customDepthRgba } from "./custom-depth-deraw";

document.addEventListener("DOMContentLoaded", () => {
	if (typeof navigator.usb?.getDevices === "function") {
		document.querySelector<HTMLElement>("#no-usb")!.remove();
		document.querySelector<HTMLElement>("#yes-usb")!.hidden = false;

		// try to initialize pre-paired devices if webusb is available
		void initialize();
	}
});

const connectUsb = document.querySelector<HTMLButtonElement>("#connectUsb")!;

const videoCanvas = document.querySelector<HTMLCanvasElement>("#videoCanvas")!;
const depthCanvas = document.querySelector<HTMLCanvasElement>("#depthCanvas")!;
const cameraDemo = document.querySelector<HTMLFieldSetElement>("#cameraDemo")!;
const pairedDeviceList =
	document.querySelector<HTMLElement>("#pairedDeviceList")!;

const motorCb = document.querySelector<HTMLInputElement>("#motorCb")!;
const ledInput = document.querySelector<HTMLButtonElement>("#ledInput")!;
const tiltSlider = document.querySelector<HTMLInputElement>("#tiltSlider")!;
const tiltNumber = document.querySelector<HTMLInputElement>("#tiltNumber")!;
const rawAngleDisplay =
	document.querySelector<HTMLElement>("#rawAngleDisplay")!;
const angleDegreesDisplay = document.querySelector<HTMLElement>(
	"#angleDegreesDisplay",
)!;
const accelGDisplay = document.querySelector<HTMLElement>("#accelGDisplay")!;
const servoDisplay = document.querySelector<HTMLElement>("#servoDisplay")!;
const rawServoDisplay =
	document.querySelector<HTMLElement>("#rawServoDisplay")!;
const rawAccelDisplay =
	document.querySelector<HTMLElement>("#rawAccelDisplay")!;

const cameraCb = document.querySelector<HTMLInputElement>("#cameraCb")!;

type MotorLedSolid =
	| MotorLed.OFF
	| MotorLed.GREEN
	| MotorLed.RED
	| MotorLed.AMBER;

const ledModeStyles: Record<MotorLedSolid, string> = {
	[MotorLed.OFF]: "black",
	[MotorLed.GREEN]: "green",
	[MotorLed.RED]: "red",
	[MotorLed.AMBER]: "orange",
} as const;

function listDevices(devices: USBDevice[]) {
	pairedDeviceList.innerHTML = "";
	for (const device of devices) {
		const deviceLabel = document.createElement("label");
		deviceLabel.className = "pairedDevice";
		deviceLabel.textContent = `${device.productName} ${device?.serialNumber}`;

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = true;
		checkbox.addEventListener("change", () => {
			device.close();
			device.forget();
			checkbox.disabled = true;
			deviceLabel.classList.add("forgotten");
		});
		deviceLabel.prepend(checkbox);

		pairedDeviceList.appendChild(deviceLabel);
	}
}

function setupDevices(devices: USBDevice[]) {
	if (devices.length) {
		document.querySelector<HTMLElement>("#hello")!.remove();
		document.querySelector<HTMLElement>("#pairedDevices")!.hidden = false;
	}

	for (const device of devices) {
		switch (device.productId) {
			case ProductId.NUI_MOTOR:
				setupMotorDemo(device);
				break;
			case ProductId.NUI_CAMERA:
				setupCameraDemo(device);
				break;
			default:
				console.debug("unknown device", device.productId, device);
		}
	}
}

function setupCameraDemo(cameraDevice: USBDevice) {
	const camera = new Camera(cameraDevice, {
		depth: new CamImageData(MODE_DEPTH, customDepthRgba),
		video: MODE_VISIBLE,
	});
	cameraDemo.hidden = false;
	cameraDemo.disabled = false;

	let wakeLock: Promise<WakeLockSentinel> | null;
	document.addEventListener("fullscreenchange", () => {
		wakeLock?.then((wakeLock) => wakeLock.release());
		wakeLock = document.fullscreenElement && navigator.wakeLock.request();
	});

	const vCtx = videoCanvas.getContext("2d")!;
	const dCtx = depthCanvas.getContext("2d")!;

	const renderFrame = () => {
		if (camera.depth) {
			dCtx.clearRect(0, 0, depthCanvas.width, depthCanvas.height);
			dCtx.putImageData(camera.depth, 0, 0);
		}

		if (camera.video) {
			vCtx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
			vCtx.putImageData(camera.video, 0, 0);
		}

		requestAnimationFrame(renderFrame);
	};

	requestAnimationFrame(renderFrame);
}

function setupMotorDemo(motorDevice: USBDevice) {
	const motorDemo = document.querySelector<HTMLFieldSetElement>("#motorDemo")!;

	const motor = new Motor(motorDevice);
	motorDemo.hidden = false;
	motorDemo.disabled = false;

	let ledMode: MotorLed = MotorLed.OFF;
	ledInput.addEventListener("click", () => {
		ledMode = ((ledMode + 1) % 4) as MotorLedSolid;
		void motor.setLed(ledMode);
		ledInput.textContent = `LED is ${MotorLed[ledMode]}`;
		ledInput.style.background = ledModeStyles[ledMode];
	});

	tiltSlider.addEventListener("input", () => {
		tiltNumber.value = tiltSlider.value;
		void motor.setPosition(Number(tiltSlider.value));
	});
	tiltNumber.addEventListener("change", () => {
		tiltSlider.value = tiltNumber.value;
		void motor.setPosition(Number(tiltNumber.value));
	});

	setInterval(() => {
		void motor
			.getPosition()
			.then(({ angleDegrees, servo, accelG, rawAccel, rawAngle }) => {
				if (!Number.isNaN(angleDegrees)) {
					if (!tiltNumber.value && document.activeElement !== tiltNumber) {
						tiltNumber.value = String(angleDegrees);
					}
					if (!tiltSlider.value && document.activeElement !== tiltSlider) {
						tiltSlider.value = String(angleDegrees);
					}
				}

				servoDisplay.textContent = MotorServoState[servo];
				rawServoDisplay.textContent = String(servo);

				rawAngleDisplay.textContent = String(rawAngle);
				angleDegreesDisplay.textContent = String(angleDegrees);

				accelGDisplay.textContent = accelG.map((a) => a.toFixed(6)).join("\n");
				rawAccelDisplay.textContent = rawAccel.join("\n");
			});
	}, 1000);
}

connectUsb.addEventListener("click", async () => {
	if (motorCb?.checked) {
		await claimNuiMotor();
	}
	if (cameraCb?.checked) {
		await claimNuiCamera();
	}

	await initialize();
});

const initialize = async () => {
	const devices = await navigator.usb.getDevices();
	listDevices(devices);
	setupDevices(devices);
};
