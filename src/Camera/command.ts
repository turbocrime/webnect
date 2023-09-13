import { CamUsbCommand, CamUsbControl, CamMagic } from "./enum";

const COMMAND_HEADER_SIZE = 8; // bytes
const COMMAND_RESPONSE_TIMEOUT_MS = 300;
const COMMAND_RESPONSE_RETRY_MS = 15;

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
	private reject?: (reason?: unknown) => void;

	get magic() {
		return this.header.getUint16(0, true);
	}
	get cmdLength() {
		// size in two-byte i16 elements, sans header
		return this.header.getUint16(2, true);
	}
	get cmdId() {
		return this.header.getUint16(4, true);
	}
	get cmdTag() {
		return this.header.getUint16(6, true);
	}
	get cmdContent() {
		return new Uint16Array(this.buffer, COMMAND_HEADER_SIZE);
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
						COMMAND_HEADER_SIZE +
							// TODO: validate size before yeet
							new DataView(cmdBufferOrOpts).getUint16(2, true) * 2,
				  )
				: new ArrayBuffer(
						COMMAND_HEADER_SIZE + cmdBufferOrOpts.content.byteLength,
				  );

		super(superBuffer);

		if (cmdBufferOrOpts instanceof ArrayBuffer) {
			// no remaining buffer init
		} else {
			const { cmdId, tag, content } = cmdBufferOrOpts;
			this.set([CamMagic.COMMAND_OUT, content.length, cmdId, tag]);
			this.set(content, COMMAND_HEADER_SIZE / content.BYTES_PER_ELEMENT);
		}

		this.header = new DataView(this.buffer, 0, COMMAND_HEADER_SIZE);

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

	listening?: ReturnType<typeof setInterval>;

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
		if (!this.pending.size)
			this.listening = clearInterval(this.listening) as undefined;
		if (this.listening)
			return this.dev
				.controlTransferIn(
					{
						requestType: "vendor",
						recipient: "device",
						request: CamUsbControl.CAMERA,
						value: 0,
						index: 0,
					},
					512, // TODO: really?
				)
				.then((usbResult) => {
					if (usbResult.status !== "ok") throw usbResult;
					if (!usbResult.data?.byteLength) return;

					let responseIndex = 0;
					do {
						const res = new CamCommand(
							usbResult.data.buffer.slice(responseIndex),
						) as CamCommandIn;
						const pend = this.pending.get(res.cmdTag);
						if (pend) {
							pend.response = res;
							this.pending.delete(res.cmdTag);
						} else console.warn("Command response unexpected", usbResult);
						responseIndex +=
							COMMAND_HEADER_SIZE + res.cmdLength * res.BYTES_PER_ELEMENT;
					} while (responseIndex < usbResult.data.byteLength);
				});
	}

	async sendCmd(cmd: CamCommandOut): Promise<CamCommandIn> {
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

		if (usbResult.status !== "ok" || usbResult.bytesWritten !== cmd.byteLength)
			throw usbResult;

		this.pending.set(cmd.cmdTag, cmd);
		this.listening ??= setInterval(
			() => this.pullResponse(),
			COMMAND_RESPONSE_RETRY_MS,
		);

		return Promise.race([
			cmd.response,
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`Command response timeout ${cmd.cmdTag}`)),
					COMMAND_RESPONSE_TIMEOUT_MS,
				),
			),
		]).finally(() => {
			this.pending.delete(cmd.cmdTag);
		});
	}
}
