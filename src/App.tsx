import { ApiResponse, commands, Methods } from "./bindings";
import "./App.css";
import ReactJson from "@microlink/react-json-view";
import { useState } from "react";

function App() {
  const [method, setMethod] = useState<Methods>("GET");
  const [url, setUrl] = useState("");
  const [response, setResponse] = useState<ApiResponse | null>(null);

  async function handleRequest() {
    const resp = await commands.restRequest({
      method: method,
      url: url,
      body: "",
      headers: {},
    });
    setResponse(resp);
  }

  return (
    <main className="flex w-full">
      <div className="flex w-full flex-col gap-3 items-center justify-center">
        <div className="flex flex-row gap-4">
          <select
            value={method}
            onChange={(e) => setMethod(e.currentTarget.value)}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input
            type="text"
            value={url}
            onInput={(e) => setUrl(e.currentTarget.value)}
            placeholder="Enter your request"
          />
        </div>
        <button type="submit" onClick={handleRequest}>
          Send Request
        </button>

        {response && (
          <ReactJson
            src={response.data}
            collapsed={1}
            enableClipboard={false}
            displayDataTypes={false}
            sortKeys={false}
          />
        )}
      </div>
    </main>
  );
}

export default App;
