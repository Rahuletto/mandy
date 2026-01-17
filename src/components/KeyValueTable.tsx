import { useState, KeyboardEvent } from "react";
import { Checkbox, EnvInput } from "./ui";

export interface KeyValueItem {
  id: string;
  key: string;
  value: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
  onValueClick?: () => void;
  valueClassName?: string;
}

interface KeyValueTableProps {
  title?: string;
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  availableVariables?: string[];
  showDescription?: boolean;
  readOnly?: boolean;
  placeholder?: {
    key: string;
    value: string;
    description?: string;
  };
}

export function KeyValueTable({
  title,
  items,
  onChange,
  availableVariables,
  placeholder,
  showDescription = true,
  readOnly = false
}: KeyValueTableProps) {
  function generateId() {
    return Math.random().toString(36).substring(2, 9);
  }

  function updateItem(id: string, field: keyof KeyValueItem, value: string | boolean) {
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  }

  function deleteItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDesc, setNewDesc] = useState("");

  function handleCommit() {
    if (newKey.trim() && newValue.trim()) {
      const newItem: KeyValueItem = {
        id: generateId(),
        key: newKey.trim(),
        value: newValue.trim(),
        description: newDesc.trim(),
        enabled: true,
      };
      onChange([...items, newItem]);
      setNewKey("");
      setNewValue("");
      setNewDesc("");
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCommit();
    }
  };

  return (
    <div className="flex flex-col h-full">


      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-white/10">
              {!readOnly && <th className="w-10 px-3 py-2.5 border-r border-white/10"></th>}
              <th className="text-left px-3 py-2.5 font-medium text-white/40 min-w-[150px] border-r border-white/10">Key</th>
              <th className={`text-left px-3 py-2.5 font-medium text-white/40 min-w-[200px] ${showDescription ? 'border-r border-white/10' : ''}`}>Value</th>
              {showDescription && (
                <th className="text-left px-3 py-2.5 font-medium text-white/40 min-w-[150px]">Description</th>
              )}
              {!readOnly && <th className="w-10 px-3 py-2.5"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={`
                  border-b border-white/5 transition-colors group
                  ${!item.enabled ? 'opacity-40' : ''}
                  ${item.locked ? 'bg-white/10' : 'hover:bg-white/[0.02]'}
                `}
              >

                {!readOnly && (
                  <td className="px-3 py-2 border-r border-white/5">
                    {item.key !== undefined && !item.locked && (
                      <Checkbox
                        checked={item.enabled}
                        onChange={(checked) => updateItem(item.id, "enabled", checked)}
                      />
                    )}
                  </td>
                )}


                <td className="px-3 py-2 border-r border-white/5">
                  {readOnly || item.locked ? (
                    <span className={`text-white/80 ${!item.enabled ? 'line-through opacity-40' : ''}`}>{item.key}</span>
                  ) : (
                    <input
                      type="text"
                      value={item.key}
                      onChange={(e) => updateItem(item.id, "key", e.target.value)}
                      placeholder={placeholder?.key || "Key"}
                      className={`
                        w-full bg-transparent text-white/80
                        placeholder:text-white/20 focus:outline-none
                        ${!item.enabled ? 'line-through' : ''}
                      `}
                    />
                  )}
                </td>


                <td className={`px-3 py-2 ${showDescription ? 'border-r border-white/5' : ''}`}>
                  {readOnly || item.locked ? (
                    <div className="flex items-center gap-2">
                      <span
                        onClick={item.onValueClick}
                        className={`
                          text-white/60
                          ${item.onValueClick ? 'cursor-pointer hover:text-accent hover:underline decoration-accent/30' : ''}
                          ${item.valueClassName || ''}
                        `}
                      >
                        {item.value}
                      </span>
                    </div>
                  ) : (
                    <EnvInput
                      value={item.value}
                      onChange={(v) => updateItem(item.id, "value", v)}
                      placeholder={placeholder?.value || "Value"}
                      availableVariables={availableVariables}
                      className="w-full"
                    />
                  )}
                </td>


                {showDescription && (
                  <td className="px-3 py-2">
                    {readOnly ? (
                      <span className="text-white/40 italic">{item.description}</span>
                    ) : (
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, "description", e.target.value)}
                        placeholder={placeholder?.description || "Description"}
                        className="w-full bg-transparent text-white/40 placeholder:text-white/10 focus:outline-none italic"
                      />
                    )}
                  </td>
                )}


                {!readOnly && (
                  <td className="px-3 py-2 text-center">
                    {item.key !== undefined && !item.locked && (
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-all mx-auto"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}

            {!readOnly && (
              <tr className="border-b border-white/5 transition-colors hover:bg-white/[0.02]">
                <td className="px-3 py-2 border-r border-white/5"></td>
                <td className="px-3 py-2 border-r border-white/5">
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder?.key || "Key"}
                    className="w-full bg-transparent text-white/80 placeholder:text-white/20 focus:outline-none"
                  />
                </td>
                <td className={`px-3 py-2 ${showDescription ? 'border-r border-white/5' : ''}`}>
                  <EnvInput
                    value={newValue}
                    onChange={(v) => setNewValue(v)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder?.value || "Value"}
                    availableVariables={availableVariables}
                    className="w-full"
                  />
                </td>
                {showDescription && (
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={placeholder?.description || "Description"}
                      className="w-full bg-transparent text-white/40 placeholder:text-white/10 focus:outline-none italic"
                    />
                  </td>
                )}
                <td className="px-3 py-2 text-center"></td>
              </tr>
            )}
          </tbody>
        </table >
      </div >
    </div >
  );
}
