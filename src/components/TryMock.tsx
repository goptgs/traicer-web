"use client";

import { useState, type DragEvent, type MouseEvent } from "react";

const rows = ["High", "Mid", "Low"] as const;
const cols = ["Draw", "Straight", "Fade"] as const;

type Shape = { row: (typeof rows)[number]; col: (typeof cols)[number] };

export function TryMock() {
  const [clips, setClips] = useState<string[]>(["sunday-swing.mp4"]);
  const [hang, setHang] = useState(5.5);
  const [shape, setShape] = useState<Shape>({ row: "Mid", col: "Straight" });
  const [landing, setLanding] = useState({ x: 84, y: 70 });
  const ball = { x: 16, y: 70 };

  function addNames(names: string[]) {
    const clean = names.map((name) => name.trim()).filter(Boolean);
    if (clean.length === 0) return;
    setClips((current) => [...current, ...clean]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    addNames([...event.dataTransfer.files].map((file) => file.name));
  }

  function placeLanding(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setLanding({
      x: Math.min(96, Math.max(4, x)),
      y: Math.min(94, Math.max(6, y)),
    });
  }

  return (
    <div className="wrap try-page">
      <p className="draft-banner try-banner" role="note">
        <strong>Preview.</strong> This is the upcoming editor. Nothing is uploaded or processed.
      </p>
      <h1>Try it Free!</h1>
      <p className="lede">Drop a clip, or a few. Mark the shot. Preview. Export.</p>

      <div className="editor">
        <div
          className="drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <strong>Drop clips here</strong>
          <p>One swing, or a batch. Names only — the files stay on your machine.</p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() => addNames([`clip-${clips.length + 1}.mp4`])}
          >
            Add a clip
          </button>
          <ul className="clip-chips">
            {clips.map((name, index) => (
              <li key={`${name}-${index}`}>{name}</li>
            ))}
          </ul>
        </div>

        <div>
          <div
            className="frame"
            onClick={placeLanding}
            role="img"
            aria-label="Clip preview. The ball is marked. Click to place the landing spot."
          >
            <img src="/media/tracer-sample.svg" alt="" />
            <span className="marker is-ball" style={{ left: `${ball.x}%`, top: `${ball.y}%` }}>
              <span>Ball</span>
            </span>
            <span className="marker is-landing" style={{ left: `${landing.x}%`, top: `${landing.y}%` }}>
              <span>Landing</span>
            </span>
          </div>
          <p className="export-note" style={{ marginTop: 8 }}>
            Ball found. Tap the frame to move the landing spot.
          </p>
        </div>

        <div className="editor-controls">
          <label className="hang">
            Hang time (seconds)
            <input
              type="number"
              min={0.5}
              max={12}
              step={0.1}
              value={hang}
              onChange={(event) => setHang(Number(event.target.value))}
            />
          </label>

          <div>
            <p className="mock-label">Shot shape</p>
            <table className="nine-box">
              <caption className="visually-hidden">
                Shot shape. High draw is the top left. Low fade is the bottom right.
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Height</span>
                  </th>
                  {cols.map((col) => (
                    <th key={col} scope="col">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row}>
                    <th scope="row">{row}</th>
                    {cols.map((col) => {
                      const pressed = shape.row === row && shape.col === col;
                      return (
                        <td key={col}>
                          <button
                            type="button"
                            aria-pressed={pressed}
                            aria-label={`${row} ${col}`}
                            onClick={() => setShape({ row, col })}
                          >
                            {pressed ? <span className="visually-hidden">Selected</span> : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="preview-row">
            <img src="/media/tracer-sample.svg" alt="" />
            <p>
              <strong>Low-res preview</strong>
              <br />
              <span className="export-note">
                {hang.toFixed(1)}s · {shape.row} {shape.col}. Change a setting to iterate. This frame
                does not render.
              </span>
            </p>
          </div>

          <div>
            <button type="button" className="btn btn-primary btn-lg">
              Export 4K
            </button>
            <p className="export-note" style={{ marginTop: 8 }}>
              A quick email sign-in — save your work — happens at export. Not open yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
