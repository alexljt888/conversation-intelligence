import { useState, type FormEvent } from "react";

type FollowUpItem = {
  task: string;
  owner: string | null;
  deadline: string | null;
};

type ReviewItem = FollowUpItem & {
  id: string;
  completed: boolean;
  evidence: string | null;
  commitment_type: "explicit" | "suggestion" | "manual";
  needs_review: boolean;
  edited: boolean;
};

type ExtractedItem = FollowUpItem & {
  evidence: string;
  commitment_type: "explicit" | "suggestion";
  needs_review: boolean;
};

type ItemDraft = {
  task: string;
  owner: string;
  deadline: string;
};

export default function App() {
  const [transcript, setTranscript] = useState("");
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  function closeEditor() {
    setDraft(null);
    setEditingId(null);
    setDraftError("");
  }

  function startEditing(item: ReviewItem) {
    setEditingId(item.id);
    setDraft({ task: item.task, owner: item.owner ?? "", deadline: item.deadline ?? "" });
    setDraftError("");
  }

  function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.task.trim()) {
      setDraftError("Enter a task before saving.");
      return;
    }

    const savedFields: FollowUpItem = {
      task: draft.task.trim(),
      owner: draft.owner.trim() || null,
      deadline: draft.deadline.trim() || null,
    };
    if (editingId !== null) {
      setItems((current) => current?.map((item) =>
        item.id === editingId ? {
          ...item,
          ...savedFields,
          edited: item.edited || item.task !== savedFields.task ||
            item.owner !== savedFields.owner || item.deadline !== savedFields.deadline,
        } : item
      ) ?? null);
    } else {
      const newItem: ReviewItem = {
        ...savedFields, id: crypto.randomUUID(), completed: false,
        evidence: null, commitment_type: "manual", needs_review: false, edited: false,
      };
      setItems((current) => [...(current ?? []), newItem]);
    }
    closeEditor();
  }

  function deleteItem(id: string) {
    setItems((current) => current?.filter((item) => item.id !== id) ?? null);
    if (editingId === id) closeEditor();
  }

  function toggleComplete(id: string) {
    setItems((current) => current?.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item
    ) ?? null);
  }

  async function analyzeTranscript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setItems(null);
    closeEditor();

    if (!transcript.trim()) {
      setError("Paste a transcript before analyzing.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcript.trim() }),
        signal: AbortSignal.timeout(60000),
      });
      // A stopped backend can produce a non-JSON proxy error.
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof data?.detail === "string"
          ? data.detail
          : "Analysis failed. Check that the backend is running and try again.";
        throw new Error(message);
      }
      if (!data || !Array.isArray(data.items)) {
        throw new Error("The backend returned an unexpected response.");
      }
      // IDs, completion, and edit tracking are local; AI metadata stays intact.
      setItems(data.items.map((item: ExtractedItem): ReviewItem => ({
        ...item,
        id: crypto.randomUUID(),
        completed: false,
        edited: false,
      })));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis failed. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main>
      <h1>Conversation Intelligence</h1>
      <p>Turn a conversation into follow-up tasks, owners, and deadlines.</p>
      <form onSubmit={analyzeTranscript}>
        <label htmlFor="transcript">Conversation transcript</label>
        <textarea
          id="transcript"
          value={transcript}
          onChange={(event) => {
            setTranscript(event.target.value);
            setItems(null);
            closeEditor();
            setError("");
          }}
          disabled={isLoading}
          maxLength={20000}
          rows={10}
          placeholder={"Alex: I'll send Sarah the revised proposal tomorrow.\nSarah: I'll review it and get back to you by Friday."}
          aria-describedby="transcript-help"
        />
        <small id="transcript-help">Include speaker labels. Maximum 20,000 characters.</small>
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Analyzing…" : "Analyze"}
        </button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}
      <section aria-live="polite" aria-busy={isLoading}>
        {isLoading && <p>Extracting follow-up items…</p>}
        {items !== null && (
          <>
            <h2>Follow-up items ({items.length})</h2>
            <button type="button" disabled={draft !== null} onClick={() => {
              setEditingId(null);
              setDraft({ task: "", owner: "", deadline: "" });
              setDraftError("");
            }}>Add follow-up</button>
            {draft !== null && (
              <form className="item-editor" onSubmit={saveItem}>
                <h3>{editingId === null ? "Add follow-up" : "Edit follow-up"}</h3>
                <label htmlFor="item-task">Task (required)</label>
                <input id="item-task" autoFocus value={draft.task}
                  aria-invalid={Boolean(draftError)} aria-describedby={draftError ? "draft-error" : undefined}
                  onChange={(event) => {
                    setDraft({ ...draft, task: event.target.value });
                    setDraftError("");
                  }} />
                <label htmlFor="item-owner">Owner (optional)</label>
                <input id="item-owner" value={draft.owner}
                  onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
                <label htmlFor="item-deadline">Deadline (optional)</label>
                <input id="item-deadline" value={draft.deadline}
                  onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} />
                {draftError && <p id="draft-error" className="error" role="alert">{draftError}</p>}
                <div className="actions">
                  <button type="submit">Save</button>
                  <button type="button" className="secondary" onClick={closeEditor}>Cancel</button>
                </div>
              </form>
            )}
            {items.length === 0 ? <p>No follow-up items found.</p> : (
              <ul className="items">
                {items.map((item) => (
                  <li key={item.id} className={item.completed ? "completed" : undefined}>
                    <h3>{item.task}</h3>
                    <p className="item-status">{item.completed ? "Completed" : "Open"}</p>
                    <p><strong>Owner:</strong> {item.owner ?? "Not specified"}</p>
                    <p><strong>Deadline:</strong> {item.deadline ?? "Not specified"}</p>
                    <div className="trust-labels">
                      <span>{item.commitment_type === "manual" ? "Manual" :
                        item.commitment_type === "explicit" ? "AI: Explicit commitment" : "AI: Suggestion"}</span>
                      {item.needs_review && <span className="needs-review">Needs review</span>}
                    </div>
                    {item.evidence !== null ? (
                      <div>
                        <p><strong>Evidence from original extraction</strong></p>
                        <blockquote>{item.evidence}</blockquote>
                      </div>
                    ) : <p>Manually added — no AI evidence.</p>}
                    {item.edited && item.commitment_type !== "manual" && (
                      <p className="edit-note">Edited by you. Evidence, classification, and review flag refer to the original AI extraction; they have not been reassessed.</p>
                    )}
                    <div className="actions">
                      <button type="button" className="secondary" disabled={draft !== null}
                        onClick={() => startEditing(item)}>Edit</button>
                      <button type="button" className="secondary" onClick={() => deleteItem(item.id)}>Delete</button>
                      <button type="button" className="secondary" onClick={() => toggleComplete(item.id)}>
                        {item.completed ? "Reopen" : "Mark complete"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </main>
  );
}
