interface MetadataRowsProps {
	rows: [string, string][];
	emptyLabel: string;
}

export function MetadataRows({ rows, emptyLabel }: MetadataRowsProps) {
	if (rows.length === 0) {
		return <div className="p-3 text-white/30 text-xs">No {emptyLabel}</div>;
	}

	return (
		<table className="w-full border-collapse font-mono text-xs">
			<tbody>
				{rows.map(([key, value]) => (
					<tr
						key={key}
						className="border-white/5 border-b transition-colors hover:bg-white/2"
					>
						<td className="w-1/3 min-w-[120px] border-white/5 border-r px-3 py-2 align-top text-white/40">
							{key}
						</td>
						<td className="whitespace-pre-wrap break-all px-3 py-2 align-top text-white/60">
							{value}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
