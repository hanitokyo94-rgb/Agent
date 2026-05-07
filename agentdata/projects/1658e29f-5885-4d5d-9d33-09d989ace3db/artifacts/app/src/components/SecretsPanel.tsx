import { useState, useEffect } from "react";

interface SecretsPanelProps {
  projectId: string;
  onClose: () => void;
}

export function SecretsPanel({ projectId, onClose }: SecretsPanelProps) {
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState<Set<string>>(new Set());

  useEffect(() => { loadSecrets(); }, [projectId]);

  async function loadSecrets() {
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/projects/${projectId}/secrets`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setSecrets(data.secrets ?? {});
    }
  }

  async function saveSecrets(updated: Record<string, string>) {
    setSaving(true);
    const token = localStorage.getItem("token");
    await fetch(`/api/projects/${projectId}/secrets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ secrets: updated }),
    });
    setSaving(false);
  }

  function addSecret() {
    if (!newKey.trim()) return;
    const updated = { ...secrets, [newKey.trim()]: newVal };
    setSecrets(updated);
    saveSecrets(updated);
    setNewKey("");
    setNewVal("");
  }

  function removeSecret(key: string) {
    const updated = { ...secrets };
    delete updated[key];
    setSecrets(updated);
    saveSecrets(updated);
  }

  function toggleVisible(key: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background w-full sm:max-w-md max-h-[80dvh] rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔐</span>
            <div>
              <p className="font-semibold text-sm">Project Secrets</p>
              <p className="text-xs text-muted-foreground">Environment variables for this project</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Add new */}
          <div className="flex gap-2 mb-5">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="KEY_NAME"
              className="flex-1 min-w-0 px-3 py-2 bg-muted rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-primary/30 uppercase"
              onKeyDown={(e) => e.key === "Enter" && addSecret()}
            />
            <input
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              placeholder="value"
              type="password"
              className="flex-1 min-w-0 px-3 py-2 bg-muted rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-primary/30"
              onKeyDown={(e) => e.key === "Enter" && addSecret()}
            />
            <button
              onClick={addSecret}
              disabled={!newKey.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
            >
              Add
            </button>
          </div>

          {/* Existing secrets */}
          {Object.keys(secrets).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-2xl mb-2">🔒</p>
              <p className="text-sm">No secrets yet</p>
              <p className="text-xs mt-1 opacity-60">Add API keys and environment variables above</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(secrets).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2.5">
                  <span className="text-xs font-mono font-medium text-primary flex-1 min-w-0 truncate">
                    {key}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground flex-1 min-w-0 truncate">
                    {visible.has(key) ? val : "•".repeat(Math.min(val.length, 20))}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleVisible(key)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {visible.has(key) ? (
                          <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
                        ) : (
                          <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                        )}
                      </svg>
                    </button>
                    <button
                      onClick={() => removeSecret(key)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-5 leading-relaxed">
            Secrets are stored locally in the project workspace and injected as environment variables when running code.
          </p>
        </div>

        {saving && (
          <div className="px-5 py-2.5 border-t border-border text-xs text-muted-foreground flex items-center gap-2">
            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Saving...
          </div>
        )}
      </div>
    </div>
  );
}
