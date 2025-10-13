export function hsvToRgb(h: number, s: number, v: number) {
	// Normalize to 0-6 range
	const hNorm6 = h * 6;
	const sector = Math.trunc(hNorm6);
	const frac = hNorm6 - sector;

	const p = v * (1 - s);
	const q = v * (1 - s * frac);
	const t = v * (1 - s * (1 - frac));

	switch ((sector % 6) as 0 | 1 | 2 | 3 | 4 | 5) {
		case 0:
			return [v, t, p] as [number, number, number];
		case 1:
			return [q, v, p] as [number, number, number];
		case 2:
			return [p, v, t] as [number, number, number];
		case 3:
			return [p, q, v] as [number, number, number];
		case 4:
			return [t, p, v] as [number, number, number];
		case 5:
			return [v, p, q] as [number, number, number];
	}
}
