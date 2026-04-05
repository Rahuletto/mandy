import type { GraphQLFile } from "../../types/project";
import { OverviewLayout } from "./OverviewLayout";

interface GraphQLOverviewProps {
	gql: GraphQLFile;
	onUpdate: (updater: (gql: GraphQLFile) => GraphQLFile) => void;
	onRun: () => void;
}

export const GraphQLOverview = ({
	gql,
	onUpdate,
	onRun,
}: GraphQLOverviewProps) => {
	const headerCount = (gql.headerItems || []).filter(
		(h) => h.enabled && h.key,
	).length;

	const leftFooter = (
		<>
			{gql.url && (
				<div className="min-w-0">
					<h3 className="text-sm font-semibold text-white/70 mb-2">Endpoint</h3>
					<div className="flex min-w-0 items-center gap-2 py-2">
						<span className="shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-400">
							POST
						</span>
						<span className="min-w-0 truncate text-xs font-mono text-white/60">
							{gql.url}
						</span>
					</div>
				</div>
			)}

			{gql.query && gql.query.trim() !== "query {\n  \n}" && (
				<div>
					<h3 className="text-sm font-semibold text-white/70 mb-2">Query</h3>
					<pre className="max-h-48 min-w-0 max-w-full overflow-auto rounded-lg bg-white/5 p-3 text-xs font-mono text-white/50">
						{gql.query}
					</pre>
				</div>
			)}

			{headerCount > 0 && (
				<div>
					<h3 className="text-sm font-semibold text-white/70 mb-2">Headers</h3>
					<div className="space-y-1">
						{(gql.headerItems || [])
							.filter((h) => h.enabled && h.key)
							.map((h) => (
								<div
									key={h.id}
									className="py-2 border-b border-white/5 last:border-0"
								>
									<div className="flex items-center gap-3">
										<span className="text-xs font-mono text-white font-medium">
											{h.key}
										</span>
									</div>
								</div>
							))}
					</div>
				</div>
			)}
		</>
	);

	const snippetPanelBody = (
		<>
			<pre className="box-border max-w-full min-w-0 whitespace-pre-wrap break-words p-4 text-xs font-mono text-white/60">
				{gql.query || "# Write your GraphQL query..."}
			</pre>
			{gql.variables && gql.variables !== "{}" && (
				<div className="border-t border-white/5 px-4 pb-4 pt-4">
					<span className="text-[10px] uppercase tracking-wider text-white/30">
						Variables
					</span>
					<pre className="mt-2 max-w-full min-w-0 whitespace-pre-wrap break-words text-xs font-mono text-white/50">
						{gql.variables}
					</pre>
				</div>
			)}
		</>
	);

	return (
		<OverviewLayout
			name={gql.name}
			description={gql.description || ""}
			onCommitName={(next) => onUpdate((prev) => ({ ...prev, name: next }))}
			onDescriptionChange={(desc) =>
				onUpdate((prev) => ({ ...prev, description: desc }))
			}
			leftFooter={leftFooter}
			panelBadge="GQL"
			panelBadgeClassName="bg-fuchsia-500/20 text-fuchsia-400"
			panelSubtitle={gql.url || "No URL set"}
			snippetDropdownLabel=""
			snippetDropdownOpen={false}
			onSnippetDropdownOpenChange={() => {}}
			snippetDropdownItems={[]}
			snippetPanelBody={snippetPanelBody}
			action={
				<button
					type="button"
					onClick={onRun}
					disabled={!gql.url}
					className="absolute bottom-4 right-4 z-20 flex cursor-pointer items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-background transition-colors hover:bg-accent/90 disabled:opacity-50"
				>
					Run Query
				</button>
			}
		/>
	);
};
