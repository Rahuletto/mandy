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
					<h3 className="mb-2 font-semibold text-sm text-white/70">Endpoint</h3>
					<div className="flex min-w-0 items-center gap-2 py-2">
						<span className="shrink-0 rounded bg-fuchsia-500/20 px-1.5 py-0.5 font-bold font-mono text-[10px] text-fuchsia-400">
							POST
						</span>
						<span className="min-w-0 truncate font-mono text-white/60 text-xs">
							{gql.url}
						</span>
					</div>
				</div>
			)}

			{gql.query && gql.query.trim() !== "query {\n  \n}" && (
				<div>
					<h3 className="mb-2 font-semibold text-sm text-white/70">Query</h3>
					<pre className="max-h-48 min-w-0 max-w-full overflow-auto rounded-lg bg-white/5 p-3 font-mono text-white/50 text-xs">
						{gql.query}
					</pre>
				</div>
			)}

			{headerCount > 0 && (
				<div>
					<h3 className="mb-2 font-semibold text-sm text-white/70">Headers</h3>
					<div className="space-y-1">
						{(gql.headerItems || [])
							.filter((h) => h.enabled && h.key)
							.map((h) => (
								<div
									key={h.id}
									className="border-white/5 border-b py-2 last:border-0"
								>
									<div className="flex items-center gap-3">
										<span className="font-medium font-mono text-white text-xs">
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
			<pre className="box-border min-w-0 max-w-full whitespace-pre-wrap break-words p-4 font-mono text-white/60 text-xs">
				{gql.query || "# Write your GraphQL query..."}
			</pre>
			{gql.variables && gql.variables !== "{}" && (
				<div className="border-white/5 border-t px-4 pt-4 pb-4">
					<span className="text-[10px] text-white/30 uppercase tracking-wider">
						Variables
					</span>
					<pre className="mt-2 min-w-0 max-w-full whitespace-pre-wrap break-words font-mono text-white/50 text-xs">
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
					className="absolute right-4 bottom-4 z-20 flex cursor-pointer items-center gap-2 rounded-full bg-accent px-4 py-1.5 font-semibold text-background text-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
				>
					Run Query
				</button>
			}
		/>
	);
};
