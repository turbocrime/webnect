import { CamUsbCommand, CamUsbControl, CamMagic } from "Camera/enum";

const CMD_HEADER_SIZE = 8; // bytes
const RESPONSE_TIMEOUT_MS = 200;
const RESPONSE_RETRY_MS = 15;

export type CamCommandOut = CamCommand & {
	magic: CamMagic.COMMAND_OUT;
	response: Promise<CamCommandIn>;
};
export type CamCommandIn = CamCommand & {
	magic: CamMagic.COMMAND_IN;
	response: false;
};

export class CamCommand extends Uint16Array {
	header: DataView;

	private _response?: Promise<CamCommandIn>;
	private resolve?: (value: CamCommandIn) => void;
	// biome-ignore lint/suspicious/noExplicitAny: reject for any reason
	private reject?: (reason?: any) => void;

	get magic() {
		return this.header.getUint16(0, true);
	}
	get cmdLength() {
		// size in i16 elements, sans header
		return this.header.getUint16(2, true);
	}
	get cmdId() {
		return this.header.getUint16(4, true);
	}
	get cmdTag() {
		return this.header.getUint16(6, true);
	}
	get cmdContent() {
		return new Uint16Array(this.buffer, CMD_HEADER_SIZE);
	}

	set cmdTag(tag: number) {
		this.header.setUint16(2, tag);
	}

	set response(response: CamCommandIn | Error) {
		if (response instanceof CamCommand) this.resolve!(response);
		else this.reject!(response);
	}

	get response(): Promise<CamCommandIn> | false {
		return this.magic === CamMagic.COMMAND_OUT && this._response!;
	}

	constructor(
		cmdBufferOrOpts:
			| ArrayBuffer
			| { cmdId: CamUsbCommand; tag: number; content: Uint16Array },
	) {
		const superBuffer =
			cmdBufferOrOpts instanceof ArrayBuffer
				? cmdBufferOrOpts.slice(
						0,
						CMD_HEADER_SIZE +
							// TODO: validate size before yeet
							new DataView(cmdBufferOrOpts).getUint16(2, true) * 2,
				  )
				: new ArrayBuffer(CMD_HEADER_SIZE + cmdBufferOrOpts.content.byteLength);

		super(superBuffer);

		if (cmdBufferOrOpts instanceof ArrayBuffer) {
			// no remaining buffer init
		} else {
			const { cmdId, tag, content } = cmdBufferOrOpts;
			this.set([CamMagic.COMMAND_OUT, content.length, cmdId, tag]);
			this.set(content, CMD_HEADER_SIZE / content.BYTES_PER_ELEMENT);
		}

		this.header = new DataView(this.buffer, 0, CMD_HEADER_SIZE);

		if (this.magic === CamMagic.COMMAND_OUT)
			this._response = new Promise<CamCommandIn>((resolve, reject) => {
				this.resolve = resolve;
				this.reject = reject;
			});
	}
}

export class CamCommandIO {
	private dev: USBDevice;
	private pending: Map<number, CamCommand> = new Map();

	listening = false;

	constructor(dev: USBDevice) {
		this.dev = dev;
	}

	async transform(
		chunk: CamCommandOut,
		cont: TransformStreamDefaultController<CamCommand>,
	) {
		cont.enqueue(await this.sendCmd(chunk));
	}

	async pullResponse() {
		this.listening = Boolean(this.pending.size);
		if (!this.listening) return;

		const transfer = this.dev.controlTransferIn(
			{
				requestType: "vendor",
				recipient: "device",
				request: CamUsbControl.CAMERA,
				value: 0,
				index: 0,
			},
			512, // TODO: really?
		);

		await transfer.then((usbResult) => {
			if (usbResult.status !== "ok")
				return console.warn("Command response bad", usbResult);
			if (!usbResult.data?.byteLength)
				return console.debug("Command response empty");

			let multiResponse = 0;
			do {
				const res = new CamCommand(
					usbResult.data.buffer.slice(multiResponse),
				) as CamCommandIn;
				const pend = this.pending.get(res.cmdTag);
				if (pend) {
					pend.response = res;
					this.pending.delete(res.cmdTag);
				} else console.warn("Command response unexpected", usbResult);
				multiResponse +=
					CMD_HEADER_SIZE + res.cmdLength * res.BYTES_PER_ELEMENT;
			} while (multiResponse < usbResult.data.byteLength);
		});

		// TODO: better rate limit
		setTimeout(() => this.pullResponse(), RESPONSE_RETRY_MS);
	}

	async sendCmd(cmd: CamCommandOut): Promise<CamCommandIn> {
		this.pending.set(cmd.cmdTag, cmd);

		const usbResult = await this.dev.controlTransferOut(
			{
				requestType: "vendor",
				recipient: "device",
				request: CamUsbControl.CAMERA,
				value: 0,
				index: 0,
			},
			cmd.buffer,
		);

		if (usbResult.status !== "ok")
			throw new Error(`Command failed ${usbResult}`);

		if (!this.listening) this.pullResponse();

		return Promise.race([
			cmd.response,
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`Command response timeout ${cmd.cmdTag}`)),
					RESPONSE_TIMEOUT_MS,
				),
			),
		]).finally(() => {
			this.pending.delete(cmd.cmdTag);
		});
	}
}
