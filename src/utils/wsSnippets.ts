import type { Language } from "../components/CodeMirror";

export type WsSnippetLang =
	| "JavaScript"
	| "Python"
	| "Go"
	| "Rust"
	| "Java"
	| "PHP"
	| "Shell wscat";

export function generateWsSnippet(
	url: string,
	lang: WsSnippetLang,
): { code: string; language: Language } {
	const u = url || "wss://echo.websocket.org";
	switch (lang) {
		case "JavaScript":
			return {
				language: "javascript",
				code: `const ws = new WebSocket("${u}");

ws.onopen = () => {
  console.log("Connected");
  ws.send(JSON.stringify({ message: "Hello" }));
};

ws.onmessage = (event) => {
  console.log("Received:", event.data);
};

ws.onerror = (error) => {
  console.error("Error:", error);
};

ws.onclose = (event) => {
  console.log("Disconnected:", event.code, event.reason);
};`,
			};
		case "Python":
			return {
				language: "python",
				code: `import asyncio
import websockets

async def connect():
    async with websockets.connect("${u}") as ws:
        await ws.send('{"message": "Hello"}')
        response = await ws.recv()
        print(f"Received: {response}")

asyncio.run(connect())`,
			};
		case "Go":
			return {
				language: "go",
				code: `package main

import (
\t"fmt"
\t"log"
\t"github.com/gorilla/websocket"
)

func main() {
\tc, _, err := websocket.DefaultDialer.Dial("${u}", nil)
\tif err != nil {
\t\tlog.Fatal("dial:", err)
\t}
\tdefer c.Close()

\terr = c.WriteMessage(websocket.TextMessage, []byte("Hello"))
\tif err != nil {
\t\tlog.Fatal("write:", err)
\t}

\t_, msg, err := c.ReadMessage()
\tif err != nil {
\t\tlog.Fatal("read:", err)
\t}
\tfmt.Printf("Received: %s\\n", msg)
}`,
			};
		case "Rust":
			return {
				language: "rust",
				code: `use tungstenite::connect;
use url::Url;

fn main() {
    let (mut socket, _response) =
        connect(Url::parse("${u}").expect("Failed to parse URL"))
            .expect("Can't connect");

    socket.send("Hello".into()).expect("Error sending");

    let msg = socket.read().expect("Error reading");
    println!("Received: {}", msg);
}`,
			};
		case "Java":
			return {
				language: "java",
				code: `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CompletionStage;

public class WsClient {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        WebSocket ws = client.newWebSocketBuilder()
            .buildAsync(URI.create("${u}"),
                new WebSocket.Listener() {
                    @Override
                    public CompletionStage<?> onText(
                            WebSocket webSocket,
                            CharSequence data,
                            boolean last) {
                        System.out.println("Received: " + data);
                        return WebSocket.Listener.super
                            .onText(webSocket, data, last);
                    }
                })
            .join();

        ws.sendText("Hello", true);
        Thread.sleep(2000);
    }
}`,
			};
		case "PHP":
			return {
				language: "php",
				code: `<?php
require 'vendor/autoload.php';

use Ratchet\\Client\\connect;

connect("${u}")->then(function($conn) {
    $conn->on('message', function($msg) use ($conn) {
        echo "Received: {$msg}\\n";
        $conn->close();
    });

    $conn->send('Hello');
}, function ($e) {
    echo "Could not connect: {$e->getMessage()}\\n";
});`,
			};
		case "Shell wscat":
			return {
				language: "shell",
				code: `# Install: npm install -g wscat
wscat -c "${u}"

# Then type messages in the interactive prompt
# > Hello`,
			};
	}
}

export const WS_SNIPPET_LANGS: { label: string; lang: WsSnippetLang }[] = [
	{ label: "JavaScript", lang: "JavaScript" },
	{ label: "Python", lang: "Python" },
	{ label: "Go Native", lang: "Go" },
	{ label: "Rust Tungstenite", lang: "Rust" },
	{ label: "Java HttpClient", lang: "Java" },
	{ label: "PHP Ratchet", lang: "PHP" },
	{ label: "Shell wscat", lang: "Shell wscat" },
];
