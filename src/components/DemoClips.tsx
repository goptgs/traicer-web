import { demoClips } from "@/config/demo-clips";

export function DemoClips() {
  return (
    <section className="section" id="examples" aria-labelledby="examples-title">
      <div className="wrap">
        <h2 id="examples-title">Examples</h2>
        <ul className="clip-grid">
          {demoClips.map((clip) => (
            <li key={clip.id}>
              <figure>
                <div className="player">
                  <div className="player-frame">
                    <video
                      className="clip-video"
                      poster={clip.poster}
                      controls={Boolean(clip.videoSrc)}
                      preload="none"
                      playsInline
                      width={1280}
                      height={720}
                      aria-label={clip.title}
                      style={{ backgroundImage: `url("${clip.poster}")` }}
                    >
                      {clip.videoSrc ? <source src={clip.videoSrc} type="video/mp4" /> : null}
                    </video>
                  </div>
                </div>
                <figcaption>
                  <h3>{clip.title}</h3>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
