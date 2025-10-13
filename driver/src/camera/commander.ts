import { usbInOk, usbOutOk } from "../util/usb-ok.js";
import { CamCommandBuffer } from "./command.js";
import { COMMAND_RESPONSE_POLL_MS } from "./constants.js";
import { CamUsbCommand, UsbControlCamera } from "./enum.js";

/** USB command interface for camera device */
export class CamCommander {
	private tag = (Math.random() * 0xff) & 0xff;

	private pending: Map<number, PromiseWithResolvers<CamCommandBuffer>> =
		new Map();

	private listening?: ReturnType<typeof setInterval>;

	/**
	 * @param dev USB device instance
	 */
	constructor(private dev: USBDevice) {}

	private nextTag() {
		this.tag += 1;
		this.tag &= 0xff;

		// don't send more than 255 commands at once
		if (this.pending.has(this.tag)) {
			const failure = new RangeError("Too many pending commands");
			this.pending.forEach(({ reject }) => void reject(failure));
			throw failure;
		}

		return this.tag;
	}

	/**
	 * Send command to camera device
	 * @param command Command type
	 * @param body Command data
	 * @returns Command response
	 */
	send(command: CamUsbCommand, body: Uint16Array): Promise<CamCommandBuffer> {
		console.debug("send", CamUsbCommand[command], body.join());

		const tag = this.nextTag();

		// register a response expectation
		const handle = Promise.withResolvers<CamCommandBuffer>();
		this.pending.set(tag, handle);

		void this.dev
			.controlTransferOut(
				{
					requestType: "vendor",
					recipient: "device",
					request: UsbControlCamera.CAMERA,
					value: 0,
					index: 0,
				},
				new CamCommandBuffer({ command, body, tag }),
			)
			.then(usbOutOk)
			.catch(handle.reject);

		this.pollResponses();

		return handle.promise.finally(() => this.pending.delete(tag));
	}

	private pollResponses() {
		this.listening ??= setInterval(() => {
			if (!this.pending.size) {
				clearInterval(this.listening);
				this.listening = undefined;
			} else {
				void this.transferResponse();
			}
		}, COMMAND_RESPONSE_POLL_MS);
	}

	private async transferResponse() {
		const usbResult = await this.dev.controlTransferIn(
			{
				requestType: "vendor",
				recipient: "device",
				request: UsbControlCamera.CAMERA,
				value: 0,
				index: 0,
			},
			512, // maximum response
		);

		let batch = usbInOk(usbResult);
		while (batch.byteLength) {
			const response = new CamCommandBuffer(batch);

			const handle = this.pending.get(response.header.tag);
			if (handle) {
				handle.resolve(response);
			} else {
				throw new ReferenceError(
					`Command response for unknown tag ${response.header.tag} ${CamUsbCommand[response.header.command]} ${response.body.join()}`,
					{ cause: response },
				);
			}
			batch = new DataView(
				batch.buffer,
				batch.byteOffset + response.byteLength,
				batch.byteLength - response.byteLength,
			);
		}
	}
}
