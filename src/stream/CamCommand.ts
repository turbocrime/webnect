import { CamUsbCommand, CamUsbControl, CamMagic } from "../CamEnums";

const CMD_HEADER_SIZE = 8; // bytes

export class CamCommand extends Uint16Array {
	header: DataView;

	_response: Promise<CamCommand> = new Promise((resolve, reject) => {
		this.resolve = resolve;
		//this._rejectResponse = reject;
	});
	private resolve?: (value: CamCommand) => void;
	//_rejectResponse: (reason?: any) => void;

	get magic() {
		return this.header.getUint16(0);
	}
	get tag() {
		return this.header.getUint16(2);
	}
	get length() {
		return this.header.getUint16(4);
	}
	get cmdId() {
		return this.header.getUint16(6);
	}

	set tag(tag: number) {
		this.header.setUint16(2, tag);
	}

	set response(response: CamCommand) {
		this.resolve!(response);
	}
	get response(): Promise<CamCommand> | false {
		if (this.magic !== CamMagic.COMMAND_IN) return false;
		else return this._response;
	}

	constructor(
		cmdBufferOrOpts:
			| ArrayBuffer
			| { cmdId: CamUsbCommand; tag?: number; content: Uint16Array },
	) {
		super(
			cmdBufferOrOpts instanceof ArrayBuffer
				? cmdBufferOrOpts
				: new ArrayBuffer(CMD_HEADER_SIZE + cmdBufferOrOpts.content.byteLength),
		);
		if (!(cmdBufferOrOpts instanceof ArrayBuffer)) {
			const { cmdId, tag, content } = cmdBufferOrOpts;
			this.set([CamMagic.COMMAND_OUT, content.length, cmdId, tag ?? 0]);
			this.set(content, CMD_HEADER_SIZE / content.BYTES_PER_ELEMENT);
		}
		this.header = new DataView(this.buffer, 0, CMD_HEADER_SIZE);
	}
}

export class CamCommandIO implements Transformer<CamCommand, CamCommand> {
	private dev: USBDevice;
	private tag: number;
	private pending: Map<number, CamCommand> = new Map();

	constructor(dev: USBDevice) {
		this.dev = dev;
		this.tag = 0;
	}

	start(cont: TransformStreamDefaultController<CamCommand>) {
		navigator.usb.addEventListener("disconnect", () => {
			cont.error(Error("Camera disconnected"));
		});
	}

	pullResponse() {
		if (this.pending.entries.length === 0) return;
		this.dev
			.controlTransferIn(
				{
					requestType: "vendor",
					recipient: "device",
					request: CamUsbControl.CAMERA,
					value: 0,
					index: 0,
				},
				512,
			)
			.then((usbResult) => {
				if (usbResult.status === "ok" && usbResult.data) {
					const res = new CamCommand(usbResult.data.buffer);
					const cmd = this.pending.get(res.tag);
					if (cmd) {
						cmd.response = res;
						this.pending.delete(res.tag);
					}
				}
			});
		this.pullResponse();
	}

	async transform(
		chunk: CamCommand,
		cont: TransformStreamDefaultController<CamCommand>,
	) {
		if (chunk.tag) this.tag = chunk.tag;
		else chunk.tag = this.tag++;

		this.pending.set(chunk.tag, chunk);

		const usbResult = await this.dev.controlTransferOut(
			{
				requestType: "vendor",
				recipient: "device",
				request: CamUsbControl.CAMERA,
				value: 0,
				index: 0,
			},
			chunk.buffer,
		);
		if (usbResult.status !== "ok") return Promise.reject();

		this.pullResponse();
		const response = chunk.response as Promise<CamCommand>;
		cont.enqueue(await response);
	}
}
