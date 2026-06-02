export interface GrpcStatusMeta {
	code: number;
	id: string;
	title: string;
	description: string;
	docsUrl: string;
}

const GRPC_STATUS_DOCS_URL = "https://grpc.io/docs/guides/status-codes/";

export const GRPC_STATUS_META: Record<number, GrpcStatusMeta> = {
	0: {
		code: 0,
		id: "OK",
		title: "OK",
		description: "Not an error; returned on success.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	1: {
		code: 1,
		id: "CANCELLED",
		title: "Cancelled",
		description: "The operation was cancelled, typically by the caller.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	2: {
		code: 2,
		id: "UNKNOWN",
		title: "Unknown",
		description:
			"Unknown error. Often used when an error space is not known or lacks enough detail.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	3: {
		code: 3,
		id: "INVALID_ARGUMENT",
		title: "Invalid Argument",
		description:
			"The client specified an invalid argument regardless of system state.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	4: {
		code: 4,
		id: "DEADLINE_EXCEEDED",
		title: "Deadline Exceeded",
		description: "The deadline expired before the operation could complete.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	5: {
		code: 5,
		id: "NOT_FOUND",
		title: "Not Found",
		description:
			"Some requested entity (for example file or directory) was not found.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	6: {
		code: 6,
		id: "ALREADY_EXISTS",
		title: "Already Exists",
		description: "The entity a client attempted to create already exists.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	7: {
		code: 7,
		id: "PERMISSION_DENIED",
		title: "Permission Denied",
		description:
			"The caller does not have permission to execute the specified operation.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	8: {
		code: 8,
		id: "RESOURCE_EXHAUSTED",
		title: "Resource Exhausted",
		description:
			"A resource has been exhausted, for example quota or disk space.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	9: {
		code: 9,
		id: "FAILED_PRECONDITION",
		title: "Failed Precondition",
		description:
			"The operation was rejected because the system is not in a required state.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	10: {
		code: 10,
		id: "ABORTED",
		title: "Aborted",
		description:
			"The operation was aborted, typically due to a concurrency issue.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	11: {
		code: 11,
		id: "OUT_OF_RANGE",
		title: "Out of Range",
		description: "The operation was attempted past the valid range.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	12: {
		code: 12,
		id: "UNIMPLEMENTED",
		title: "Unimplemented",
		description:
			"The operation is not implemented or not supported in this service.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	13: {
		code: 13,
		id: "INTERNAL",
		title: "Internal",
		description:
			"Internal error: expected invariants in the underlying system were broken.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	14: {
		code: 14,
		id: "UNAVAILABLE",
		title: "Unavailable",
		description:
			"The service is currently unavailable, typically a transient condition.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	15: {
		code: 15,
		id: "DATA_LOSS",
		title: "Data Loss",
		description: "Unrecoverable data loss or corruption.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
	16: {
		code: 16,
		id: "UNAUTHENTICATED",
		title: "Unauthenticated",
		description:
			"The request does not have valid authentication credentials for the operation.",
		docsUrl: GRPC_STATUS_DOCS_URL,
	},
};

export const getGrpcStatusMeta = (code: number) => GRPC_STATUS_META[code];
