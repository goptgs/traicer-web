import { demoClips } from "@/config/demo-clips";

export function DemoClips() {
  return (
    <section className="section" id="demos" aria-labelledby="demos-title">
      <div className="wrap">
        <p className="kicker">On a real clip</p>
        <h2 id="demos-title">The line, over the shot</h2>
        <p className="lede">
          These frames are stand-ins. Each slot is a poster plus a video element, so a finished
          tracer clip can drop in without a new layout.
        </p>
        <ul className="clip-grid">
          {demoClips.map((clip) => (
            <li key={clip.id}>
              <figure className="player">
                <div className="player-bar">
                  <span className="player-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>{clip.fileLabel}</span>
                </div>
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
                <figcaption>
                  <h3>{clip.title}</h3>
                  <p>{clip.caption}</p>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
