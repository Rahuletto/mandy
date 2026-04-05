import { useLayoutEffect, useRef, useState } from "react";

/** Measures a flex child for react-window `List` width/height (ResizeObserver). */
export function useListContainerSize() {
	const ref = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;

		const apply = (w: number, h: number) => {
			const nw = Math.max(0, Math.floor(w));
			const nh = Math.max(0, Math.floor(h));
			setSize((prev) =>
				prev.width === nw && prev.height === nh
					? prev
					: { width: nw, height: nh },
			);
		};

		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			apply(entry.contentRect.width, entry.contentRect.height);
		});

		ro.observe(el);
		apply(el.clientWidth, el.clientHeight);

		return () => ro.disconnect();
	}, []);

	return { ref, width: size.width, height: size.height };
}
