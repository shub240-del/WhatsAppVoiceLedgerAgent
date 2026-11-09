import { useState } from "react";
import { CircleCheck, CircleX, FlaskConical, LoaderCircle } from "lucide-react";
import { api } from "../lib/api";

type Result = { id: number; label: string; transcript: string; expected: string; got: string; pass: boolean; error?: string };
type Batch = { total: number; batches: number; model?: string; results: Result[]; problem?: string };

/** Runs the 16-case accuracy test against the live AI (Gemini) through the server's own validation. */
export function ParserEval() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [meta, setMeta] = useState<{ total: number; model?: string } | null>(null);
  const [problem, setProblem] = useState("");

  async function run() {
    setRunning(true);
    setResults([]);
    setProblem("");
    try {
      let batches = 1;
      for (let b = 0; b < batches; b++) {
        const r = await api<Batch>("/api/integrations/gemini/eval", { batch: b });
        if (r.problem) {
          setProblem(r.problem);
          break;
        }
        batches = r.batches;
        setMeta({ total: r.total, model: r.model });
        setResults((prev) => [...prev, ...r.results]);
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The test could not run.");
    } finally {
      setRunning(false);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const target = meta ? Math.ceil((13 / 15) * meta.total) : 0;
  return (
    <section className="panel settings-card">
      <h2>AI accuracy test</h2>
      <p>
        Runs {meta?.total ?? 16} sample notes (Hinglish, Marathi, Gujarati, missing amount, two Rameshes…) through the
        live AI and the same safety checks your entries go through. Nothing is saved.
      </p>
      <button className="button secondary small" onClick={() => void run()} disabled={running}>
        {running ? <LoaderCircle size={14} className="spin" /> : <FlaskConical size={14} />}
        {running ? `Running… ${results.length}/${meta?.total ?? 16}` : "Run AI accuracy test"}
      </button>
      {problem && <p className="form-error" role="alert">{problem}</p>}
      {results.length > 0 && (
        <>
          <p className={passed >= target && !running ? "form-success" : "form-note"} role="status">
            Score: <strong>{passed}/{results.length}</strong>
            {meta?.model ? ` · model ${meta.model}` : ""}
            {!running && meta ? (passed >= target ? ` · meets the target (≥${target})` : ` · below the target (≥${target})`) : ""}
          </p>
          <ul className="eval-list">
            {results.map((r) => (
              <li key={r.id} className={r.pass ? "pass" : "fail"}>
                {r.pass ? <CircleCheck size={15} /> : <CircleX size={15} />}
                <div>
                  <strong>{r.id}. {r.label}</strong>
                  <small>“{r.transcript}”</small>
                  {!r.pass && <small>Expected {r.expected} · got {r.got}{r.error ? ` (${r.error})` : ""}</small>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
