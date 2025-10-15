export const usbOutOk = (
	xfer: {
		status: USBTransferStatus;
		bytesWritten: number;
	},
	size?: number,
): number => {
	if (xfer.status !== "ok") {
		throw new RangeError(`Transfer status ${xfer.status}`, { cause: xfer });
	}

	if (size != null && xfer.bytesWritten !== size) {
		throw new RangeError(`Transfer size ${xfer.bytesWritten}`, {
			cause: xfer,
		});
	}

	return xfer.bytesWritten;
};

export const usbInOk = (
	xfer: {
		status?: USBTransferStatus;
		data?: DataView;
	},
	size?: number,
): DataView<ArrayBuffer> => {
	if (xfer.status !== "ok") {
		throw new RangeError(`Transfer status ${xfer.status}`, { cause: xfer });
	}
	if (
		(size !== 0 && !xfer.data) ||
		(size != null && xfer.data?.byteLength !== size)
	) {
		throw new RangeError(`Transfer size ${xfer.data?.byteLength}`, {
			cause: xfer,
		});
	}
	return xfer.data as DataView<ArrayBuffer>;
};
