import { demoClips } from "@/config/demo-clips";
import { TracerVideo } from "@/components/TracerVideo";

/** Quiet strip of the same slots used in the examples window. */
export function DemoClips() {
  return (
    <ul className="clip-grid">
      {demoClips.map((clip) => (
        <li key={clip.id}>
          <figure>
            <TracerVideo clip={clip} />
            <figcaption>
              <h3>{clip.title}</h3>
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
