import type {
	GraphQLArgument,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLType,
} from "graphql";
import {
	isEnumType,
	isInputObjectType,
	isInterfaceType,
	isListType,
	isNonNullType,
	isObjectType,
	isScalarType,
	isUnionType,
} from "graphql";
import { useMemo, useState } from "react";
import { TbChevronDown, TbChevronRight } from "react-icons/tb";

interface SchemaExplorerProps {
	schema: GraphQLSchema;
	filter?: string;
}

function unwrapType(type: GraphQLType): { name: string; wrapper: string } {
	if (isNonNullType(type)) {
		const inner = unwrapType(type.ofType);
		return { name: inner.name, wrapper: `${inner.wrapper}!` };
	}
	if (isListType(type)) {
		const inner = unwrapType(type.ofType);
		return { name: inner.name, wrapper: `[${inner.wrapper}]` };
	}
	return {
		name: (type as any).name || "Unknown",
		wrapper: (type as any).name || "Unknown",
	};
}

function isExpandableType(schema: GraphQLSchema, typeName: string): boolean {
	const type = schema.getType(typeName);
	if (!type) return false;
	return (
		isObjectType(type) ||
		isInterfaceType(type) ||
		isInputObjectType(type) ||
		isEnumType(type) ||
		isUnionType(type)
	);
}

function TypeName({
	type,
	schema,
}: {
	type: GraphQLType;
	schema: GraphQLSchema;
}) {
	const { wrapper, name } = unwrapType(type);
	const expandable = isExpandableType(schema, name);
	const display = wrapper;

	const parts: { text: string; highlight: boolean; id: number }[] = [];
	let current = "";
	let depth = 0;
	let partId = 0;

	for (const ch of display) {
		if (ch === "[" || ch === "]" || ch === "!") {
			if (current) {
				parts.push({
					text: current,
					highlight: depth === 0 || expandable,
					id: partId++,
				});
				current = "";
			}
			parts.push({ text: ch, highlight: false, id: partId++ });
		} else {
			current += ch;
		}
		if (ch === "[") depth++;
		if (ch === "]") depth--;
	}
	if (current) {
		parts.push({ text: current, highlight: expandable, id: partId++ });
	}

	return (
		<span className="ml-1.5 font-mono text-xs">
			{parts.map((p) =>
				p.highlight ? (
					<span key={p.id} className="text-amber-300/70">
						{p.text}
					</span>
				) : (
					<span key={p.id} className="text-white/25">
						{p.text}
					</span>
				),
			)}
		</span>
	);
}

function ArgBadge() {
	return (
		<span className="ml-1.5 rounded bg-rose-500/20 px-1.5 py-0 font-bold text-[9px] text-rose-400 uppercase leading-relaxed tracking-wider">
			arg
		</span>
	);
}

function DeprecatedBadge({ reason }: { reason?: string | null }) {
	return (
		<span
			className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0 font-bold text-[9px] text-amber-400 uppercase leading-relaxed tracking-wider"
			title={reason || "Deprecated"}
		>
			deprecated
		</span>
	);
}

function FieldRow({
	name,
	type,
	description,
	args,
	schema,
	depth,
	isDeprecated,
	deprecationReason,
	isArg,
	defaultValue,
}: {
	name: string;
	type: GraphQLType;
	description?: string | null;
	args?: readonly GraphQLArgument[];
	schema: GraphQLSchema;
	depth: number;
	isDeprecated?: boolean;
	deprecationReason?: string | null;
	isArg?: boolean;
	defaultValue?: string | null;
}) {
	const [expanded, setExpanded] = useState(false);
	const { name: typeName } = unwrapType(type);
	const expandable = isExpandableType(schema, typeName);
	const hasArgs = args && args.length > 0;
	const canExpand = expandable || hasArgs;

	return (
		<div>
			<div
				className={`group flex items-start gap-0 py-1.5 ${canExpand ? "cursor-pointer" : ""}`}
				style={{ paddingLeft: `${depth * 20 + 8}px` }}
				onClick={canExpand ? () => setExpanded(!expanded) : undefined}
			>
				<div className="flex h-5 w-4 shrink-0 items-center justify-center">
					{canExpand &&
						(expanded ? (
							<TbChevronDown size={12} className="text-white/30" />
						) : (
							<TbChevronRight size={12} className="text-white/30" />
						))}
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center">
						<span
							className={`font-medium font-mono text-[13px] ${isDeprecated ? "text-white/30 line-through" : "text-white/80"}`}
						>
							{name}
						</span>
						<TypeName type={type} schema={schema} />
						{isArg && <ArgBadge />}
						{isDeprecated && <DeprecatedBadge reason={deprecationReason} />}
						{defaultValue != null && (
							<span className="ml-1.5 font-mono text-[10px] text-white/20">
								= {defaultValue}
							</span>
						)}
					</div>
					{description && (
						<div className="mt-0.5 text-[11px] text-white/30 leading-relaxed">
							{description}
						</div>
					)}
				</div>
			</div>

			{expanded && hasArgs && (
				<div>
					{args.map((arg) => (
						<FieldRow
							key={`arg-${arg.name}`}
							name={arg.name}
							type={arg.type}
							description={arg.description}
							schema={schema}
							depth={depth + 1}
							isArg
							defaultValue={
								arg.defaultValue !== undefined
									? String(arg.defaultValue)
									: undefined
							}
						/>
					))}
				</div>
			)}

			{expanded && expandable && (
				<TypeFields typeName={typeName} schema={schema} depth={depth + 1} />
			)}
		</div>
	);
}

function TypeFields({
	typeName,
	schema,
	depth,
}: {
	typeName: string;
	schema: GraphQLSchema;
	depth: number;
}) {
	const type = schema.getType(typeName);
	if (!type) return null;

	if (isObjectType(type) || isInterfaceType(type)) {
		const fields = Object.values(type.getFields());
		return (
			<div>
				{fields.map((field) => (
					<FieldRow
						key={field.name}
						name={field.name}
						type={field.type}
						description={field.description}
						args={field.args}
						schema={schema}
						depth={depth}
						isDeprecated={field.deprecationReason != null}
						deprecationReason={field.deprecationReason}
					/>
				))}
			</div>
		);
	}

	if (isInputObjectType(type)) {
		const fields = Object.values(type.getFields());
		return (
			<div>
				{fields.map((field) => (
					<FieldRow
						key={field.name}
						name={field.name}
						type={field.type}
						description={field.description}
						schema={schema}
						depth={depth}
						defaultValue={
							field.defaultValue !== undefined
								? JSON.stringify(field.defaultValue)
								: undefined
						}
					/>
				))}
			</div>
		);
	}

	if (isEnumType(type)) {
		const values = type.getValues();
		return (
			<div>
				{values.map((val) => (
					<div
						key={val.name}
						className="py-1.5"
						style={{ paddingLeft: `${depth * 20 + 28}px` }}
					>
						<div className="flex items-center">
							<span
								className={`font-medium font-mono text-[13px] ${val.deprecationReason != null ? "text-white/30 line-through" : "text-emerald-400/70"}`}
							>
								{val.name}
							</span>
							{val.deprecationReason != null && (
								<DeprecatedBadge reason={val.deprecationReason} />
							)}
						</div>
						{val.description && (
							<div className="mt-0.5 text-[11px] text-white/30 leading-relaxed">
								{val.description}
							</div>
						)}
					</div>
				))}
			</div>
		);
	}

	if (isUnionType(type)) {
		const members = type.getTypes();
		return (
			<div>
				{members.map((member) => (
					<FieldRow
						key={member.name}
						name={member.name}
						type={member}
						description={member.description}
						schema={schema}
						depth={depth}
					/>
				))}
			</div>
		);
	}

	return null;
}

function RootTypeSection({
	label,
	type,
	schema,
}: {
	label: string;
	type: GraphQLObjectType;
	schema: GraphQLSchema;
}) {
	const [expanded, setExpanded] = useState(true);
	const fields = Object.values(type.getFields());

	return (
		<div className="mb-1">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-1 px-2 py-2 text-left transition-colors hover:bg-white/2"
			>
				{expanded ? (
					<TbChevronDown size={14} className="text-white/40" />
				) : (
					<TbChevronRight size={14} className="text-white/40" />
				)}
				<span className="font-semibold text-[13px] text-white/70">{label}</span>
				<span className="ml-1 font-mono text-[11px] text-white/20">
					{type.name}
				</span>
			</button>

			{expanded && (
				<div>
					{fields.map((field) => (
						<FieldRow
							key={field.name}
							name={field.name}
							type={field.type}
							description={field.description}
							args={field.args}
							schema={schema}
							depth={1}
							isDeprecated={field.deprecationReason != null}
							deprecationReason={field.deprecationReason}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function AllTypesSection({ schema }: { schema: GraphQLSchema }) {
	const [expanded, setExpanded] = useState(false);

	const types = useMemo(() => {
		const typeMap = schema.getTypeMap();
		const queryName = schema.getQueryType()?.name;
		const mutationName = schema.getMutationType()?.name;
		const subscriptionName = schema.getSubscriptionType()?.name;

		return Object.values(typeMap)
			.filter(
				(t) =>
					!t.name.startsWith("__") &&
					!isScalarType(t) &&
					t.name !== queryName &&
					t.name !== mutationName &&
					t.name !== subscriptionName,
			)
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [schema]);

	return (
		<div className="mb-1 border-white/5 border-t">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-1 px-2 py-2 text-left transition-colors hover:bg-white/2"
			>
				{expanded ? (
					<TbChevronDown size={14} className="text-white/40" />
				) : (
					<TbChevronRight size={14} className="text-white/40" />
				)}
				<span className="font-semibold text-[13px] text-white/70">Types</span>
				<span className="ml-1 text-[11px] text-white/20">{types.length}</span>
			</button>

			{expanded && (
				<div>
					{types.map((type) => (
						<TypeRow key={type.name} type={type} schema={schema} />
					))}
				</div>
			)}
		</div>
	);
}

function TypeRow({
	type,
	schema,
}: {
	type: GraphQLType & { name: string; description?: string | null };
	schema: GraphQLSchema;
}) {
	const [expanded, setExpanded] = useState(false);

	const kindLabel = isObjectType(type)
		? "type"
		: isInterfaceType(type)
			? "interface"
			: isInputObjectType(type)
				? "input"
				: isEnumType(type)
					? "enum"
					: isUnionType(type)
						? "union"
						: "";

	const kindColor = isEnumType(type)
		? "text-emerald-400/50"
		: isInputObjectType(type)
			? "text-sky-400/50"
			: isUnionType(type)
				? "text-purple-400/50"
				: isInterfaceType(type)
					? "text-amber-400/50"
					: "text-white/25";

	return (
		<div>
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-0 py-1.5 text-left transition-colors hover:bg-white/2"
				style={{ paddingLeft: "28px" }}
			>
				<div className="flex h-5 w-4 shrink-0 items-center justify-center">
					{expanded ? (
						<TbChevronDown size={12} className="text-white/30" />
					) : (
						<TbChevronRight size={12} className="text-white/30" />
					)}
				</div>
				<span className={`mr-1.5 font-mono text-[10px] ${kindColor}`}>
					{kindLabel}
				</span>
				<span className="font-medium font-mono text-[13px] text-white/70">
					{type.name}
				</span>
			</button>

			{expanded && type.description && (
				<div
					className="pb-1 text-[11px] text-white/30 leading-relaxed"
					style={{ paddingLeft: "52px" }}
				>
					{type.description}
				</div>
			)}

			{expanded && (
				<TypeFields typeName={type.name} schema={schema} depth={2} />
			)}
		</div>
	);
}

export function SchemaExplorer({ schema, filter = "" }: SchemaExplorerProps) {
	const queryType = schema.getQueryType();
	const mutationType = schema.getMutationType();
	const subscriptionType = schema.getSubscriptionType();

	const filteredSchema = useMemo(() => {
		if (!filter.trim()) return null;
		const lower = filter.toLowerCase();
		const typeMap = schema.getTypeMap();
		const matches: Array<{
			type: GraphQLType & { name: string };
			fields: string[];
		}> = [];

		for (const type of Object.values(typeMap)) {
			if (type.name.startsWith("__")) continue;
			if (isScalarType(type)) continue;

			const typeMatches = type.name.toLowerCase().includes(lower);
			const fieldMatches: string[] = [];

			if (
				isObjectType(type) ||
				isInterfaceType(type) ||
				isInputObjectType(type)
			) {
				const fields = type.getFields();
				for (const field of Object.values(fields)) {
					if (field.name.toLowerCase().includes(lower)) {
						fieldMatches.push(field.name);
					}
				}
			}

			if (typeMatches || fieldMatches.length > 0) {
				matches.push({ type, fields: fieldMatches });
			}
		}

		return matches;
	}, [schema, filter]);

	return (
		<div>
			{filteredSchema ? (
				<div>
					{filteredSchema.length === 0 ? (
						<div className="p-4 text-center text-white/20 text-xs">
							No matches for "{filter}"
						</div>
					) : (
						filteredSchema.map(({ type }) => (
							<TypeRow key={type.name} type={type} schema={schema} />
						))
					)}
				</div>
			) : (
				<>
					{queryType && (
						<RootTypeSection label="Query" type={queryType} schema={schema} />
					)}
					{mutationType && (
						<RootTypeSection
							label="Mutation"
							type={mutationType}
							schema={schema}
						/>
					)}
					{subscriptionType && (
						<RootTypeSection
							label="Subscription"
							type={subscriptionType}
							schema={schema}
						/>
					)}
					<AllTypesSection schema={schema} />
				</>
			)}
		</div>
	);
}
