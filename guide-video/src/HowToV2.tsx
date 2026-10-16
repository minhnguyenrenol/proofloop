// ProofLoop how-to (v2): your first study, narrated, scored, GSAP-animated,
// with a small UI mock for each step.
import type React from "react";
import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import {
  AbsoluteFill,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Caption,
  display,
  duck,
  Grain,
  sceneFrames,
  Sfx,
  useTimeline,
  Words,
} from "./kit";
import { HOWTO, hasVoice, type Line, voSeconds } from "./script";
import { color, mono, sans, serif } from "./theme";

const INK = "#111110";
const fill: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  background: color.paper,
};
const panel: React.CSSProperties = {
  background: color.sheet,
  border: `3px solid ${color.rule}`,
  borderRadius: 24,
  boxShadow: "0 40px 80px -40px rgba(0,0,0,0.3)",
};

// Step number and heading shared by every step scene.
const Head: React.FC<{ n: number; title: string }> = ({ n, title }) => (
  <div
    className="head"
    style={{
      position: "absolute",
      left: 140,
      top: 110,
      display: "flex",
      alignItems: "baseline",
      gap: 30,
    }}
  >
    <div style={{ ...display(150, color.signal), lineHeight: 0.8 }}>{n}</div>
    <h2 style={display(84)}>{title}</h2>
  </div>
);
const headIn = (tl: gsap.core.Timeline) =>
  tl.from(".head", { x: -60, opacity: 0, duration: 0.8 }, 0);

// Typed line: a clip reveal stepped per character, so it reads as typing.
const typed = (
  tl: gsap.core.Timeline,
  sel: string,
  chars: number,
  at: number,
  cps = 26,
) =>
  tl.fromTo(
    sel,
    { clipPath: "inset(0 100% 0 0)" },
    {
      clipPath: "inset(0 0% 0 0)",
      duration: chars / cps,
      ease: `steps(${chars})`,
    },
    at,
  );

const Intro: React.FC = () => {
  const ref = useTimeline((tl) => {
    tl.from(".w", { yPercent: 110, stagger: 0.08, duration: 0.9 }, 0.1).from(
      ".sub",
      { y: 30, opacity: 0, duration: 0.7 },
      0.9,
    );
  });
  return (
    <div
      ref={ref}
      style={{
        ...fill,
        background: INK,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 160px",
      }}
    >
      <h1 style={display(190, "#f2f1ec")}>
        <Words text="Your first study." />
      </h1>
      <p
        className="sub"
        style={{
          fontFamily: sans,
          fontSize: 58,
          color: "#b4b3ab",
          margin: "36px 0 0",
        }}
      >
        ProofLoop, step by step.
      </p>
    </div>
  );
};

const Install: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl).from(".term", { y: 80, opacity: 0, duration: 0.8 }, 0.2);
    typed(tl, ".c1", 50, 0.9);
    typed(tl, ".c2", 36, 3.0);
    tl.from(".ok", { opacity: 0, x: -20, duration: 0.4 }, 4.6);
  });
  return (
    <div ref={ref} style={fill}>
      <Head n={1} title="Install the plugin" />
      <div
        className="term"
        style={{
          position: "absolute",
          left: 140,
          right: 140,
          top: 330,
          background: INK,
          borderRadius: 24,
          padding: "30px 40px 44px",
          fontFamily: mono,
          fontSize: 46,
          lineHeight: 1.7,
          color: "#f2f1ec",
        }}
      >
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          {["#e5484d", "#f5a623", "#30a46c"].map((c) => (
            <div
              key={c}
              style={{ width: 20, height: 20, borderRadius: 10, background: c }}
            />
          ))}
        </div>
        <div className="c1" style={{ whiteSpace: "nowrap" }}>
          <span style={{ color: "#8ab4f8" }}>›</span> /plugin marketplace add
          minhnguyenrenol/proofloop
        </div>
        <div className="c2" style={{ whiteSpace: "nowrap" }}>
          <span style={{ color: "#8ab4f8" }}>›</span> /plugin install
          proofloop@proofloop
        </div>
        <div className="ok" style={{ color: "#30a46c" }}>
          ✓ Installed proofloop 0.3.0
        </div>
      </div>
    </div>
  );
};

const Setup: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".chat", { y: 80, opacity: 0, duration: 0.8 }, 0.2)
      .from(
        ".you",
        {
          scale: 0.8,
          opacity: 0,
          transformOrigin: "right center",
          duration: 0.5,
          ease: "back.out(2)",
        },
        0.8,
      )
      .from(".reply", { y: 20, opacity: 0, duration: 0.6 }, 1.5)
      .from(".row", { x: -30, opacity: 0, stagger: 0.18, duration: 0.5 }, 1.8)
      .from(".nogit", { scale: 0, duration: 0.5, ease: "back.out(3)" }, 3.2);
  });
  const rows = [
    ["research/", 0],
    ["savings-v1/", 1],
    ["study.yaml", 2],
    ["sessions/", 2],
    [".gitignore", 0],
  ] as const;
  return (
    <div ref={ref} style={fill}>
      <Head n={2} title="Set up your folder" />
      <div
        className="chat"
        style={{
          ...panel,
          position: "absolute",
          left: 140,
          top: 330,
          width: 1640,
          padding: "40px 48px",
          display: "flex",
          gap: 60,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            className="you"
            style={{
              marginLeft: "auto",
              width: "fit-content",
              background: color.signal,
              color: "#fff",
              fontFamily: sans,
              fontSize: 46,
              padding: "20px 32px",
              borderRadius: "28px 28px 6px 28px",
            }}
          >
            Set up ProofLoop for this project.
          </div>
          <div
            className="reply"
            style={{
              fontFamily: sans,
              fontSize: 38,
              color: color.ink2,
              marginTop: 34,
              lineHeight: 1.4,
            }}
          >
            Created a private research folder. Participant data is kept out of
            git.
          </div>
        </div>
        <div
          style={{
            width: 560,
            fontFamily: mono,
            fontSize: 40,
            lineHeight: 1.65,
          }}
        >
          {rows.map(([name, depth]) => (
            <div
              key={name}
              className="row"
              style={{
                paddingLeft: depth * 44,
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              {name}
              {name === "sessions/" && (
                <span
                  className="nogit"
                  style={{
                    fontFamily: sans,
                    fontSize: 26,
                    color: "#fff",
                    background: "#e5484d",
                    borderRadius: 999,
                    padding: "2px 14px",
                  }}
                >
                  not in git
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Context: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(
        ".doc",
        {
          y: -200,
          opacity: 0,
          rotate: (i: number) => [-18, 10, -6][i],
          stagger: 0.15,
          duration: 0.7,
          ease: "back.out(1.6)",
        },
        0.3,
      )
      .to(
        ".doc",
        {
          x: 420,
          scale: 0.4,
          opacity: 0,
          stagger: 0.12,
          duration: 0.6,
          ease: "power3.in",
        },
        1.6,
      )
      .from(".page", { x: 120, opacity: 0, duration: 0.8 }, 2.0)
      .from(".sec", { opacity: 0, y: 20, stagger: 0.2, duration: 0.5 }, 2.4);
  });
  return (
    <div ref={ref} style={fill}>
      <Head n={3} title="Add product context" />
      <div
        style={{
          position: "absolute",
          left: 160,
          top: 420,
          display: "flex",
          gap: 30,
        }}
      >
        {[
          ["PDF", "#e5484d"],
          ["DOCX", color.signal],
          ["PPTX", "#f5a623"],
        ].map(([t, c]) => (
          <div
            key={t}
            className="doc"
            style={{
              width: 170,
              height: 220,
              background: color.sheet,
              border: `3px solid ${color.rule}`,
              borderRadius: 16,
              display: "grid",
              placeItems: "end center",
              paddingBottom: 18,
            }}
          >
            <span
              style={{
                fontFamily: sans,
                fontWeight: 600,
                fontSize: 30,
                color: "#fff",
                background: c,
                borderRadius: 8,
                padding: "4px 12px",
              }}
            >
              {t}
            </span>
          </div>
        ))}
      </div>
      <div
        className="page"
        style={{
          ...panel,
          position: "absolute",
          left: 860,
          top: 330,
          width: 920,
          padding: "36px 44px",
        }}
      >
        <div
          style={{
            fontFamily: serif,
            fontWeight: 600,
            fontSize: 52,
            marginBottom: 20,
          }}
        >
          Product context
        </div>
        {[
          ["Vision", "doc:strategy.pdf#p2"],
          ["Personas", "doc:research.docx#p5"],
          ["Journeys", "doc:journeys.pptx#s3"],
        ].map(([s, src]) => (
          <div
            key={s}
            className="sec"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "18px 0",
              borderTop: `2px solid ${color.rule}`,
            }}
          >
            <span style={{ fontFamily: sans, fontSize: 42 }}>{s}</span>
            <span
              style={{
                fontFamily: mono,
                fontSize: 26,
                color: color.signalInk,
                background: color.signalSoft,
                padding: "4px 12px",
                borderRadius: 8,
              }}
            >
              {src}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const Plan: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(
        ".link",
        { scale: 0.8, opacity: 0, duration: 0.6, ease: "back.out(2)" },
        0.4,
      )
      .from(
        ".file",
        {
          y: 120,
          opacity: 0,
          rotate: (i: number) => [-8, 0, 8][i],
          stagger: 0.18,
          duration: 0.8,
          ease: "back.out(1.4)",
        },
        1.4,
      )
      .from(".lint", { x: 60, opacity: 0, duration: 0.6 }, 3.0);
  });
  return (
    <div ref={ref} style={fill}>
      <Head n={4} title="Plan the study" />
      <div
        className="link"
        style={{
          position: "absolute",
          left: 140,
          top: 330,
          fontFamily: mono,
          fontSize: 38,
          background: color.sheet,
          border: `3px solid ${color.rule}`,
          borderRadius: 999,
          padding: "16px 34px",
        }}
      >
        figma.com/proto/savings · goal: open an account
      </div>
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 480,
          display: "flex",
          gap: 40,
        }}
      >
        {[
          ["study.yaml", "tasks · success · consent"],
          ["consent.md", "what people agree to"],
          ["guide.md", "your discussion guide"],
        ].map(([f, d]) => (
          <div
            key={f}
            className="file"
            style={{ ...panel, width: 500, padding: "34px 36px" }}
          >
            <div
              style={{ fontFamily: mono, fontSize: 42, color: color.signalInk }}
            >
              {f}
            </div>
            <div
              style={{
                fontFamily: sans,
                fontSize: 34,
                color: color.ink2,
                marginTop: 12,
              }}
            >
              {d}
            </div>
          </div>
        ))}
      </div>
      <div
        className="lint"
        style={{
          position: "absolute",
          left: 140,
          top: 800,
          fontFamily: sans,
          fontSize: 38,
          color: "#8a4b00",
          background: "#fff4e0",
          borderRadius: 14,
          padding: "14px 26px",
        }}
      >
        Leading wording flagged in task 2
      </div>
    </div>
  );
};

// Audio bars driven by the frame, for the Studio's two tracks.
const Bars: React.FC<{ seed: string; tint: string }> = ({ seed, tint }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", height: 80 }}>
      {Array.from({ length: 34 }, (_, i) => (
        <div
          key={i}
          style={{
            width: 10,
            borderRadius: 5,
            background: tint,
            height:
              10 +
              70 * Math.abs(random(`${seed}${i}${Math.floor(f / 3)}`) - 0.3),
          }}
        />
      ))}
    </div>
  );
};
const Run: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".studio", { x: -100, opacity: 0, duration: 0.8 }, 0.3)
      .from(
        ".phone",
        { y: 160, opacity: 0, duration: 0.9, ease: "back.out(1.4)" },
        1.8,
      )
      .to(
        ".recdot",
        {
          opacity: 0.25,
          duration: 0.5,
          repeat: 9,
          yoyo: true,
          ease: "sine.inOut",
        },
        0.8,
      );
  });
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = Math.floor(754 + f / fps);
  return (
    <div ref={ref} style={fill}>
      <Head n={5} title="Run the sessions" />
      <div
        className="studio"
        style={{
          ...panel,
          position: "absolute",
          left: 140,
          top: 330,
          width: 1060,
          padding: "34px 40px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: sans,
            fontSize: 38,
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              color: "#e5484d",
              fontWeight: 600,
            }}
          >
            <span
              className="recdot"
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                background: "#e5484d",
              }}
            />
            Recording · Zoom
          </span>
          <span
            style={{ fontFamily: mono }}
          >{`00:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`}</span>
        </div>
        <div
          style={{
            marginTop: 28,
            fontFamily: sans,
            fontSize: 30,
            color: color.ink2,
          }}
        >
          Participant (call audio)
        </div>
        <Bars seed="a" tint={color.signal} />
        <div
          style={{
            marginTop: 14,
            fontFamily: sans,
            fontSize: 30,
            color: color.ink2,
          }}
        >
          You (microphone)
        </div>
        <Bars seed="b" tint={color.ink2} />
      </div>
      <div
        className="phone"
        style={{
          position: "absolute",
          right: 170,
          top: 300,
          width: 400,
          height: 560,
          background: INK,
          borderRadius: 56,
          padding: 18,
        }}
      >
        <div
          style={{
            background: color.sheet,
            borderRadius: 40,
            height: "100%",
            padding: "50px 30px",
            fontFamily: sans,
          }}
        >
          <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 44 }}>
            Savings test
          </div>
          <div style={{ fontSize: 28, color: color.ink2, marginTop: 16 }}>
            Your own link · works on this device
          </div>
          <div
            style={{
              marginTop: 50,
              background: color.signal,
              color: "#fff",
              borderRadius: 16,
              padding: "18px 0",
              textAlign: "center",
              fontSize: 32,
            }}
          >
            Start task
          </div>
        </div>
      </div>
    </div>
  );
};

const Analyse: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".obs", { x: -80, opacity: 0, stagger: 0.35, duration: 0.7 }, 0.4)
      .from(
        ".ev",
        {
          scale: 0,
          opacity: 0,
          stagger: 0.35,
          duration: 0.5,
          ease: "back.out(3)",
        },
        0.9,
      );
  });
  const obs = [
    ["Expected the rate on the first screen", "quote · u0002"],
    ["Clicked the summary card three times", "click · e00004"],
    ["Gave up on the fee page", "screenshot · f03"],
  ];
  return (
    <div ref={ref} style={fill}>
      <Head n={6} title="Analyse every session" />
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 340,
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        {obs.map(([t, ev]) => (
          <div
            key={t}
            className="obs"
            style={{
              ...panel,
              width: 1640,
              padding: "28px 38px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontFamily: serif, fontSize: 50 }}>{t}</span>
            <span
              className="ev"
              style={{
                fontFamily: mono,
                fontSize: 32,
                color: color.signalInk,
                background: color.signalSoft,
                padding: "8px 18px",
                borderRadius: 10,
              }}
            >
              {ev}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const Board: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".col", { y: 60, opacity: 0, stagger: 0.15, duration: 0.6 }, 0.3)
      .from(
        ".note",
        {
          scale: 0.6,
          opacity: 0,
          stagger: 0.06,
          duration: 0.4,
          ease: "back.out(2)",
        },
        0.7,
      )
      .to(
        ".mv",
        { x: -1120, y: 150, rotate: -3, duration: 1.1, ease: "power3.inOut" },
        2.0,
      )
      .to(".mv", { rotate: 0, duration: 0.3 }, 3.1)
      .from(
        ".done",
        { scale: 0.7, opacity: 0, duration: 0.5, ease: "back.out(3)" },
        3.4,
      )
      .to(".done", { backgroundColor: "#146c2e", duration: 0.3 }, 4.0);
  });
  const note = (t: string, cls = "") => (
    <div
      key={t}
      className={`note ${cls}`}
      style={{
        background: "#fff8c5",
        borderRadius: 10,
        padding: "14px 18px",
        fontFamily: sans,
        fontSize: 28,
        boxShadow: "0 10px 20px -12px rgba(0,0,0,0.3)",
      }}
    >
      {t}
    </div>
  );
  const cols: [string, string[]][] = [
    [
      "People look for the rate first",
      ["P1: rate on first screen", "P3: scrolled for the rate"],
    ],
    ["Fees feel hidden", ["P2: where are the fees?", "P4: surprise fee"]],
    ["Unsorted", ["P5: looked for the rate too"]],
  ];
  return (
    <div ref={ref} style={fill}>
      <Head n={7} title="Finish the board" />
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 320,
          display: "flex",
          gap: 40,
        }}
      >
        {cols.map(([g, ns], ci) => (
          <div
            key={g}
            className="col"
            style={{
              width: 520,
              background: "#efede6",
              borderRadius: 20,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minHeight: 420,
            }}
          >
            <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 36 }}>
              {g}
            </div>
            {ns.map((n) => note(n, ci === 2 ? "mv" : ""))}
          </div>
        ))}
      </div>
      <div
        className="done"
        style={{
          position: "absolute",
          right: 140,
          top: 800,
          fontFamily: sans,
          fontWeight: 500,
          fontSize: 38,
          color: "#fff",
          background: color.signal,
          borderRadius: 14,
          padding: "16px 34px",
        }}
      >
        Mark board done
      </div>
    </div>
  );
};

const Report: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".rep", { y: 80, opacity: 0, duration: 0.8 }, 0.2)
      .from(
        ".bar",
        {
          scaleX: 0,
          transformOrigin: "left center",
          stagger: 0.2,
          duration: 1,
          ease: "power3.out",
        },
        1.0,
      )
      .from(".chg", { x: 60, opacity: 0, duration: 0.6 }, 2.4);
  });
  return (
    <div ref={ref} style={fill}>
      <Head n={8} title="Get the report" />
      <div
        className="rep"
        style={{
          ...panel,
          position: "absolute",
          left: 140,
          top: 330,
          width: 1640,
          padding: "40px 48px",
          display: "flex",
          gap: 60,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: serif,
              fontWeight: 600,
              fontSize: 46,
              marginBottom: 24,
            }}
          >
            Task success
          </div>
          {(
            [
              ["Find the rate", 0.4],
              ["Open an account", 0.8],
            ] as const
          ).map(([t, v]) => (
            <div key={t} style={{ marginBottom: 26 }}>
              <div
                style={{ fontFamily: sans, fontSize: 32, color: color.ink2 }}
              >
                {t} · {Math.round(v * 100)}%
              </div>
              <div
                style={{
                  height: 26,
                  background: color.rule,
                  borderRadius: 13,
                  marginTop: 10,
                }}
              >
                <div
                  className="bar"
                  style={{
                    width: `${v * 100}%`,
                    height: "100%",
                    background: color.signal,
                    borderRadius: 13,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="chg" style={{ width: 640 }}>
          <div
            style={{
              fontFamily: serif,
              fontWeight: 600,
              fontSize: 46,
              marginBottom: 24,
            }}
          >
            What changed
          </div>
          <div
            style={{
              fontFamily: sans,
              fontSize: 32,
              color: color.ink2,
              textDecoration: "line-through",
            }}
          >
            Customers quit because the form is long
          </div>
          <div
            style={{
              fontFamily: sans,
              fontSize: 32,
              color: color.ink,
              marginTop: 14,
              background: color.signalSoft,
              padding: "8px 12px",
              borderRadius: 8,
            }}
          >
            Customers can't find the rate before they start
          </div>
        </div>
      </div>
    </div>
  );
};

const Outro: React.FC = () => {
  const ref = useTimeline((tl) => {
    tl.from(".w", { yPercent: 110, stagger: 0.08, duration: 0.8 }, 0.1).from(
      ".l",
      { y: 30, opacity: 0, stagger: 0.15, duration: 0.6 },
      0.9,
    );
  });
  return (
    <div
      ref={ref}
      style={{
        ...fill,
        background: INK,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 160px",
      }}
    >
      <h1 style={display(170, "#f2f1ec")}>
        <Words text="That's your first study." />
      </h1>
      <div
        className="l"
        style={{
          fontFamily: mono,
          fontSize: 44,
          color: "#8ab4f8",
          marginTop: 40,
        }}
      >
        docs/guide.html
      </div>
      <div
        className="l"
        style={{
          fontFamily: mono,
          fontSize: 40,
          color: "#b4b3ab",
          marginTop: 12,
        }}
      >
        github.com/minhnguyenrenol/proofloop
      </div>
    </div>
  );
};

const SCENES: { line: Line; C: React.FC; dark?: boolean; min: number }[] = [
  { line: HOWTO[0], C: Intro, dark: true, min: 3 },
  { line: HOWTO[1], C: Install, min: 5.4 },
  { line: HOWTO[2], C: Setup, min: 5 },
  { line: HOWTO[3], C: Context, min: 5 },
  { line: HOWTO[4], C: Plan, min: 4.6 },
  { line: HOWTO[5], C: Run, min: 5 },
  { line: HOWTO[6], C: Analyse, min: 4.4 },
  { line: HOWTO[7], C: Board, min: 5 },
  { line: HOWTO[8], C: Report, min: 4.4 },
  { line: HOWTO[9], C: Outro, dark: true, min: 4 },
];
type Fx = [Parameters<typeof Sfx>[0]["name"], number, number?][];
// Key taps while each command types out (50 then 36 characters at 26 per second).
const taps = (from: number, chars: number): Fx =>
  Array.from({ length: Math.floor(chars / 3) }, (_, k) => [
    "type",
    from + (k * 3) / 26,
    0.25,
  ]);
const SFX: Fx[] = [
  [["impact", 0, 0.5]],
  [
    ["whoosh", 0.2, 0.35],
    ...taps(0.9, 50),
    ...taps(3.0, 36),
    ["chime", 4.6, 0.35],
  ],
  [
    ["pop", 0.8, 0.45],
    ["pop", 1.8, 0.3],
    ["pop", 2.16, 0.3],
    ["pop", 2.52, 0.3],
    ["click", 3.2, 0.5],
  ],
  [
    ["whoosh", 0.3, 0.35],
    ["whoosh", 1.6, 0.35],
    ["pop", 2.0, 0.4],
  ],
  [
    ["pop", 0.4, 0.4],
    ["whoosh", 1.4, 0.35],
    ["click", 3.0, 0.5],
  ],
  [
    ["whoosh", 0.3, 0.35],
    ["whoosh", 1.8, 0.35],
  ],
  [
    ["pop", 0.9, 0.4],
    ["pop", 1.25, 0.4],
    ["pop", 1.6, 0.4],
  ],
  [
    ["pop", 0.7, 0.35],
    ["whoosh", 2.0, 0.4],
    ["click", 3.4, 0.5],
    ["chime", 4.0, 0.35],
  ],
  [
    ["whoosh", 0.2, 0.35],
    ["chime", 2.4, 0.35],
  ],
  [["impact", 0, 0.5]],
];
const T = 15;
const framesOf = (i: number, fps: number) =>
  sceneFrames(Math.max(voSeconds(SCENES[i].line), SCENES[i].min), fps);
export const howtoDuration = (fps: number) =>
  SCENES.reduce((n, _, i) => n + framesOf(i, fps), 0) - T * (SCENES.length - 1);

const voicedSpans = (fps: number): [number, number][] => {
  let st = 0;
  return SCENES.map((sc, i) => {
    const span: [number, number] = [
      st,
      st + Math.ceil(voSeconds(sc.line) * fps),
    ];
    st += framesOf(i, fps) - T;
    return span;
  });
};

export const HowToV2: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: INK }}>
      <TransitionSeries>
        {SCENES.flatMap(({ line, C, dark }, i) => {
          const seq = (
            <TransitionSeries.Sequence
              key={line.id}
              name={line.id}
              durationInFrames={framesOf(i, fps)}
              premountFor={fps}
            >
              <C />
              {hasVoice(line) && (
                <Audio
                  src={staticFile(`vo/${line.id}.mp3`)}
                  premountFor={fps}
                />
              )}
              <Caption text={line.text} dark={dark} />
              {SFX[i].map(([n, at, v], k) => (
                <Sfx key={k} name={n} at={at * fps} volume={v ?? 0.5} />
              ))}
            </TransitionSeries.Sequence>
          );
          return i === 0
            ? [seq]
            : [
                <TransitionSeries.Transition
                  key={`t${i}`}
                  presentation={slide({ direction: "from-right" })}
                  timing={linearTiming({ durationInFrames: T })}
                />,
                seq,
              ];
        })}
      </TransitionSeries>
      <Audio
        src={staticFile("music/howto.wav")}
        volume={duck(voicedSpans(fps), durationInFrames, 0.3, 0.1)}
      />
      <Grain />
    </AbsoluteFill>
  );
};
