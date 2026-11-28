import Link from "next/link";

const rows = ["High", "Mid", "Low"] as const;
const cols = ["Draw", "Straight", "Fade"] as const;

export function TryItTeaser() {
  return (
    <section className="section" id="try" aria-labelledby="try-title">
      <div className="wrap">
        <p className="kicker">Try it</p>
        <h2 id="try-title">The web app, when it opens</h2>
        <p className="lede">
          You’ll bring a golf clip, mark the landing, set the hang time, and pick the shot shape.
          Then a preview, and a 4K export. Nothing on this page uploads a file.
        </p>
        <div className="try-grid">
          <div>
            <ol className="steps">
              <li>Bring one swing. The ball should stay visible from the strike through the landing.</li>
              <li>Mark the landing spot on the frame.</li>
              <li>Set the hang time — how long the ball is in the air.</li>
              <li>Pick the shape. High, mid or low. Draw, straight or fade.</li>
              <li>Preview the line, then export it in 4K.</li>
            </ol>
            <p className="try-note">
              The uploader isn’t switched on.{" "}
              <Link href="/help">What the clip needs</Link>
              {" · "}
              <Link href="/pricing">Early pricing</Link>
            </p>
          </div>
          <div className="mock" aria-hidden="false">
            <p className="mock-kicker">Preview of the step</p>
            <div className="drop-preview">
              <span>Your clip goes here</span>
              <span className="fine">Not open yet</span>
            </div>
            <div className="mock-fields">
              <div>
                <span className="mock-label">Landing spot</span>
                <span className="mock-value">Marked on the frame</span>
              </div>
              <div>
                <span className="mock-label">Hang time</span>
                <span className="mock-value">Seconds in the air</span>
              </div>
            </div>
            <table className="shape-table">
              <caption>Shot shape. An example marks mid and straight. This grid is not a control yet.</caption>
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
                      const example = row === "Mid" && col === "Straight";
                      return (
                        <td key={col} className={example ? "is-example" : undefined}>
                          {example ? <span className="example-mark">Example</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
