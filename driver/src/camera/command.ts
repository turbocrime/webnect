import { COMMAND_HEADER_BYTES } from "./constants.js";
import { CamCmdMagic, type CamUsbCommand } from "./enum.js";

/**
 * Command header is 8 bytes of little endian u16 values.
 *
 * | index | field       | value                                |
 * |-------|-------------|--------------------------------------|
 * | 0     | magic       | {@link CamCmdMagic}                  |
 * | 2     | body size   | count u16 values in body             |
 * | 4     | command     | {@link CamUsbCommand}                |
 * | 6     | tag         | request-response identifier 0 to 255 |
 *
 */
export class CamCommandHeader<C extends CamCommandBuffer> extends DataView<C> {
	public get magic(): number {
		return this.getUint16(0, true);
	}

	public get bodySize(): number {
		return this.getUint16(2, true);
	}

	public get command(): CamUsbCommand {
		return this.getUint16(4, true);
	}

	public get tag(): number {
		return this.getUint16(6, true);
	}

	constructor(
		buffer: C,
		init?: readonly [
			magic: number,
			bodySize: number,
			command: number,
			tag: number,
		],
	) {
		super(buffer, 0, COMMAND_HEADER_BYTES);

		if (init) {
			const [magic, bodySize, command, tag] = init;
			this.setUint16(0, magic, true);
			this.setUint16(2, bodySize, true);
			this.setUint16(4, command, true);
			this.setUint16(6, tag, true);
		}
	}
}

/**
 * Command body is a big endian u16 array containing the command payload.
 *
 * | command                              | request format  | response format |
 * |--------------------------------------|-----------------|-----------------|
 * | {@link CamUsbCommand.READ_REGISTER}  | `[addr]`        | `[ok, value]`   |
 * | {@link CamUsbCommand.WRITE_REGISTER} | `[addr, value]` | `[ok]`          |
 * | {@link CamUsbCommand.ZEROPLANE} .    | *unimplemented* | *unimplemented* |
 * | {@link CamUsbCommand.REGISTRATION}   | *unimplemented* | *unimplemented* |
 * | {@link CamUsbCommand.CMOS}           | *unimplemented* | *unimplemented* |
 *
 */
export class CamCommandBody<C extends CamCommandBuffer> extends Uint16Array<C> {
	constructor(buffer: C, sizeOrInit?: Uint16Array | number) {
		if (sizeOrInit instanceof Uint16Array) {
			const init = sizeOrInit;
			super(buffer, COMMAND_HEADER_BYTES, init.length);
			this.set(init);
		} else {
			const bodySize = sizeOrInit;
			super(buffer, COMMAND_HEADER_BYTES, bodySize);
		}
	}
}

/**
 * Creates a buffer suitable as a parameter to `controlTransferOut`, or parses a
 * 0-index item in a batch from `controlTransferIn`.
 */
export class CamCommandBuffer extends ArrayBuffer {
	public readonly header: CamCommandHeader<this>;
	public readonly body: CamCommandBody<this>;

	constructor(
		optsOrRaw:
			| ArrayBuffer
			| DataView<ArrayBuffer>
			| {
					magic?: CamCmdMagic;
					command: CamUsbCommand;
					tag: number;
					body: Uint16Array;
			  },
	) {
		if (optsOrRaw instanceof ArrayBuffer) {
			// premade buffer
			const premade = optsOrRaw;

			// allocate own buffer
			super(premade.byteLength);

			// copy all
			new Uint16Array(this).set(new Uint16Array(premade));

			this.header = new CamCommandHeader(this);
			this.body = new CamCommandBody(this);
		} else if (optsOrRaw instanceof DataView) {
			// parse response batch
			const batch = optsOrRaw;

			if (
				CamCmdMagic.COMMAND_IN !== batch.getUint16(0, true) // magic
			) {
				throw new RangeError(`Bad command magic ${batch.getUint16(0, true)}`, {
					cause: batch,
				});
			}

			const bodyInit = new Uint16Array(
				batch.buffer,
				batch.byteOffset + COMMAND_HEADER_BYTES,
				batch.getUint16(2, true), // body size
			);

			const headerInit = [
				CamCmdMagic.COMMAND_IN, // checked magic
				bodyInit.length, // checked body size
				batch.getUint16(4, true), // command
				batch.getUint16(6, true), // tag
			] as const;

			// allocate own buffer
			super(COMMAND_HEADER_BYTES + bodyInit.byteLength);

			this.header = new CamCommandHeader(this, headerInit);
			this.body = new CamCommandBody(this, bodyInit);
		} else {
			// create a request buffer
			const { command, tag, body: bodyInit } = optsOrRaw;

			const headerInit = [
				CamCmdMagic.COMMAND_OUT,
				bodyInit.length,
				command,
				tag,
			] as const;

			super(COMMAND_HEADER_BYTES + bodyInit.byteLength);

			this.header = new CamCommandHeader(this, headerInit);
			this.body = new CamCommandBody(this, bodyInit);
		}
	}
}
