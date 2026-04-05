import { useCallback, useState } from "react";
import { TbSend } from "react-icons/tb";
import type { ConnectionStatus } from "../../hooks/useWebSocket";
import type { Language } from "../CodeMirror";
import { CodeEditor } from "../CodeMirror";
import { Tooltip } from "../ui/Tooltip";

type MessageContentType = "json" | "text";

interface WebSocketMessageComposerProps {
	status: ConnectionStatus;
	onSend: (message: string) => void;
}

export const WebSocketMessageComposer = ({
	status,
	onSend,
}: WebSocketMessageComposerProps) => {
	const [messageInput, setMessageInput] = useState("");
	const [messageContentType, setMessageContentType] =
		useState<MessageContentType>("json");

	const handleSend = useCallback(() => {
		onSend(messageInput);
		setMessageInput("");
	}, [messageInput, onSend]);

	const editorLanguage: Language =
		messageContentType === "json" ? "json" : "text";

	return (
		<div className="relative flex h-full min-h-0 w-full min-w-0 flex-col">
			<div className="flex items-center gap-2 px-2 py-2 border-b border-white/5">
				{(["json", "text"] as const).map((ct) => (
					<button
						key={ct}
						type="button"
						onClick={() => setMessageContentType(ct)}
						className={`px-2 py-0.5 text-[11px] cursor-pointer font-medium rounded transition-colors ${
							messageContentType === ct
								? "text-accent bg-accent/10"
								: "text-white/50 hover:text-white/70"
						}`}
					>
						{ct === "json" ? "JSON" : "Raw Text"}
					</button>
				))}
			</div>
			<div className="flex-1 overflow-auto">
				<CodeEditor
					code={messageInput}
					language={editorLanguage}
					onChange={setMessageInput}
					placeholder={
						messageContentType === "json"
							? '{ "message": "Hello" }'
							: "Type your message..."
					}
				/>
			</div>
			<div className="absolute right-4 bottom-4 z-20 inline-flex w-fit h-fit">
				<Tooltip
					content={
						status !== "connected"
							? "Connect to a WebSocket server first"
							: !messageInput.trim()
								? "Enter a message to send"
								: undefined
					}
					wrapperClassName="inline-flex w-fit h-fit"
				>
					<button
						type="button"
						onClick={handleSend}
						disabled={!messageInput.trim() || status !== "connected"}
						className="p-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-background transition-all cursor-pointer"
					>
						<TbSend size={16} />
					</button>
				</Tooltip>
			</div>
		</div>
	);
};
