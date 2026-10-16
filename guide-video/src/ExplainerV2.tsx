// ProofLoop explainer (v2): narrated, scored, GSAP-animated. One scene per
// narration line; each scene's length follows its voice line.
import type React from "react";
import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, staticFile, useVideoConfig } from "remotion";
import {
  Caption,
  display,
  duck,
  Grain,
  Leak,
  sceneFrames,
  Sfx,
  useTimeline,
  Words,
} from "./kit";
import { EXPLAINER, hasVoice, type Line, voSeconds } from "./script";
import { color, mono, sans, serif } from "./theme";

const INK = "#111110";
const fill: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
};

// 1. Hours of recordings: a wall of session tiles rushes in, the camera pushes.
const ColdOpen: React.FC = () => {
  const ref = useTimeline((tl) => {
    tl.from(
      ".tile",
      {
        scale: 0.3,
        opacity: 0,
        y: 120,
        stagger: { each: 0.05, from: "center" },
        duration: 1.1,
      },
      0,
    )
      .fromTo(
        ".wall",
        { scale: 1.25, rotate: -4 },
        { scale: 1, rotate: -2, duration: 4, ease: "power2.out" },
        0,
      )
      .from(".w", { yPercent: 110, stagger: 0.07, duration: 0.8 }, 1.1)
      .to(
        ".wall",
        {
          filter: "blur(6px)",
          opacity: 0.35,
          duration: 1.2,
          ease: "power2.inOut",
        },
        1,
      );
  });
  return (
    <div
      ref={ref}
      style={{
        ...fill,
        background: INK,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        className="wall"
        style={{
          position: "absolute",
          display: "grid",
          gridTemplateColumns: "repeat(6, 340px)",
          gap: 24,
        }}
      >
        {Array.from({ length: 24 }, (_, i) => (
          <div
            key={i}
            className="tile"
            style={{
              height: 200,
              borderRadius: 16,
              background: "#232321",
              border: "2px solid #34332f",
              position: "relative",
            }}
          >
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              style={{ position: "absolute", left: 18, top: 18 }}
            >
              <path d="M8 5v14l11-7z" fill="#8ab4f8" />
            </svg>
            <div
              style={{
                position: "absolute",
                right: 16,
                bottom: 12,
                fontFamily: mono,
                fontSize: 26,
                color: "#b4b3ab",
              }}
            >{`${i % 3}:${String(17 + ((i * 13) % 42)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`}</div>
          </div>
        ))}
      </div>
      <h1
        style={{
          ...display(150, "#f2f1ec"),
          position: "relative",
          textAlign: "center",
          maxWidth: 1500,
        }}
      >
        <Words text="Hours of recordings." />
      </h1>
    </div>
  );
};

// 2. The pain, three hits.
const Pain: React.FC = () => {
  const ref = useTimeline((tl) => {
    tl.from(
      ".p",
      {
        xPercent: -12,
        opacity: 0,
        stagger: 1.15,
        duration: 0.7,
        ease: "back.out(2)",
      },
      0.1,
    ).from(
      ".bar",
      {
        scaleX: 0,
        transformOrigin: "left center",
        stagger: 1.15,
        duration: 0.6,
        ease: "power3.inOut",
      },
      0.45,
    );
  });
  return (
    <div
      ref={ref}
      style={{
        ...fill,
        background: INK,
        padding: "0 180px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 40,
      }}
    >
      {[
        "Days of rewatching.",
        "Quotes out of context.",
        "Findings nobody can check.",
      ].map((t) => (
        <div
          key={t}
          className="p"
          style={{ position: "relative", alignSelf: "flex-start" }}
        >
          <div style={display(118, "#f2f1ec")}>{t}</div>
          <div
            className="bar"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "56%",
              height: 10,
              background: "#e5484d",
              borderRadius: 5,
            }}
          />
        </div>
      ))}
    </div>
  );
};

// The ProofLoop mark: a ring that draws itself, with a travelling dot.
const Mark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <circle
      className="ring"
      cx="50"
      cy="50"
      r="40"
      fill="none"
      stroke={color.signal}
      strokeWidth="9"
      strokeLinecap="round"
      strokeDasharray="252"
      strokeDashoffset="252"
      transform="rotate(-90 50 50)"
    />
    <circle className="dot" cx="50" cy="10" r="9" fill={color.ink} />
  </svg>
);

// 3. Reveal.
const Reveal: React.FC = () => {
  const ref = useTimeline((tl) => {
    tl.to(
      ".ring",
      { strokeDashoffset: 0, duration: 1.2, ease: "power3.inOut" },
      0,
    )
      .from(
        ".dot",
        {
          scale: 0,
          transformOrigin: "50px 10px",
          duration: 0.5,
          ease: "back.out(3)",
        },
        0.9,
      )
      .from(".brand", { y: 80, opacity: 0, duration: 1 }, 0.5)
      .from(".w", { yPercent: 110, stagger: 0.05, duration: 0.7 }, 1.4)
      .from(".chip", { y: 30, opacity: 0, stagger: 0.12, duration: 0.6 }, 2.2);
  });
  return (
    <div
      ref={ref}
      style={{
        ...fill,
        background: color.paper,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <Mark size={190} />
        <div className="brand" style={display(200)}>
          ProofLoop
        </div>
      </div>
      <p
        style={{
          fontFamily: sans,
          fontSize: 54,
          color: color.ink2,
          margin: "40px 0 0",
        }}
      >
        <Words text="Your research copilot, inside the tools you already use." />
      </p>
      <div style={{ display: "flex", gap: 20, marginTop: 44 }}>
        {["Claude Code", "Cursor"].map((c) => (
          <div
            key={c}
            className="chip"
            style={{
              fontFamily: mono,
              fontSize: 36,
              padding: "12px 26px",
              borderRadius: 999,
              border: `2px solid ${color.ink}`,
            }}
          >
            {c}
          </div>
        ))}
      </div>
    </div>
  );
};

// 4. The loop: six stages light up as a dot travels the ring.
const STAGES = ["Plan", "Run", "Analyse", "Synthesise", "Review", "Feed back"];
const Loop: React.FC<{ seconds: number }> = ({ seconds }) => {
  const ref = useTimeline((tl) => {
    const per = Math.max(0.6, (seconds - 1.2) / STAGES.length);
    tl.from(
      ".node",
      {
        scale: 0,
        opacity: 0,
        stagger: 0.08,
        duration: 0.5,
        ease: "back.out(2.5)",
      },
      0,
    )
      .to(
        ".ring",
        { strokeDashoffset: 0, duration: per * STAGES.length, ease: "none" },
        0.6,
      )
      .to(
        ".orbit",
        {
          rotate: 360,
          duration: per * STAGES.length,
          ease: "none",
          svgOrigin: "960 470",
        },
        0.6,
      );
    STAGES.forEach((_, i) => {
      tl.to(
        `.n${i} circle`,
        {
          attr: { r: 30 },
          fill: color.signal,
          stroke: color.signal,
          duration: 0.35,
          ease: "back.out(3)",
        },
        0.6 + i * per,
      ).to(`.n${i} text`, { fill: color.ink, duration: 0.3 }, "<");
    });
  });
  const cx = 960;
  const cy = 470;
  const r = 320;
  return (
    <div ref={ref} style={{ ...fill, background: color.paper }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color.rule}
          strokeWidth={8}
        />
        <circle
          className="ring"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color.signal}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * r}
          strokeDashoffset={2 * Math.PI * r}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <g className="orbit">
          <circle cx={cx} cy={cy - r} r={16} fill={color.ink} />
        </g>
        <text
          x={cx}
          y={cy + 24}
          textAnchor="middle"
          style={{
            fontFamily: serif,
            fontWeight: 600,
            fontSize: 84,
            fill: color.ink,
          }}
        >
          One loop
        </text>
        {STAGES.map((s, i) => {
          const a = (i / STAGES.length) * 2 * Math.PI - Math.PI / 2;
          const x = cx + r * Math.cos(a);
          const y = cy + r * Math.sin(a);
          const right = Math.cos(a) > 0.01;
          const left = Math.cos(a) < -0.01;
          return (
            <g
              key={s}
              className={`node n${i}`}
              style={{
                transformOrigin: `${x}px ${y}px`,
                transformBox: "view-box",
              }}
            >
              <circle
                cx={x}
                cy={y}
                r={22}
                fill={color.sheet}
                stroke={color.ink2}
                strokeWidth={5}
              />
              <text
                x={x + (right ? 54 : left ? -54 : 0)}
                y={y + (right || left ? 20 : i === 0 ? -48 : 76)}
                textAnchor={right ? "start" : left ? "end" : "middle"}
                style={{
                  fontFamily: serif,
                  fontWeight: 600,
                  fontSize: 60,
                  fill: color.ink2,
                }}
              >
                {s}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// 5. Evidence: the real quote is highlighted in the transcript and verified; the invented one is rejected.
const Evidence: React.FC = () => {
  const ref = useTimeline((tl) => {
    tl.from(".tx", { x: -80, opacity: 0, duration: 0.8 }, 0)
      .from(".line", { opacity: 0, y: 20, stagger: 0.12, duration: 0.5 }, 0.2)
      .fromTo(
        ".hl",
        { scaleX: 0 },
        {
          scaleX: 1,
          transformOrigin: "left center",
          duration: 0.9,
          ease: "power2.inOut",
        },
        1.2,
      )
      .from(".good", { x: 120, opacity: 0, duration: 0.7 }, 1.9)
      .from(
        ".good .tick",
        { scale: 0, rotate: -90, duration: 0.6, ease: "back.out(3)" },
        2.4,
      )
      .from(".bad", { x: 120, opacity: 0, duration: 0.7 }, 3.0)
      .to(
        ".bad",
        { x: "+=14", duration: 0.06, repeat: 5, yoyo: true, ease: "none" },
        3.7,
      )
      .from(".bad .tick", { scale: 0, duration: 0.4, ease: "back.out(3)" }, 3.7)
      .to(
        ".bad",
        { x: 900, rotate: 8, opacity: 0, duration: 0.9, ease: "power3.in" },
        4.4,
      );
  });
  const lines = [
    "Moderator: What did you expect to see?",
    "P2: Honestly, I expected the rate on the first screen.",
    "Moderator: And when it wasn't there?",
    "P2: I kept scrolling, then I gave up.",
  ];
  const card = (cls: string, q: string, src: string, ok: boolean) => (
    <div
      className={cls}
      style={{
        background: color.sheet,
        border: `3px solid ${ok ? "#146c2e" : "#e5484d"}`,
        borderRadius: 22,
        padding: "28px 34px",
        display: "flex",
        gap: 24,
        alignItems: "center",
        width: 760,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: serif, fontSize: 46, lineHeight: 1.15 }}>
          “{q}”
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 26,
            color: color.ink2,
            marginTop: 10,
          }}
        >
          {src}
        </div>
      </div>
      <svg className="tick" width="80" height="80" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="11" fill={ok ? "#146c2e" : "#e5484d"} />
        {ok ? (
          <path
            d="M7 12.5l3.2 3.2L17 9"
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M8.5 8.5l7 7M15.5 8.5l-7 7"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        )}
      </svg>
    </div>
  );
  return (
    <div
      ref={ref}
      style={{
        ...fill,
        background: color.paper,
        padding: "130px 140px",
        display: "flex",
        gap: 70,
        alignItems: "center",
      }}
    >
      <div
        className="tx"
        style={{
          width: 820,
          background: INK,
          borderRadius: 24,
          padding: "36px 40px",
          fontFamily: mono,
          fontSize: 31,
          lineHeight: 1.7,
          color: "#b4b3ab",
        }}
      >
        <div style={{ color: "#8ab4f8", fontSize: 26, marginBottom: 14 }}>
          transcript · P2
        </div>
        {lines.map((l, i) => (
          <div
            key={l}
            className="line"
            style={{
              position: "relative",
              color: i === 1 ? "#f2f1ec" : undefined,
            }}
          >
            {i === 1 && (
              <span
                className="hl"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 4,
                  bottom: 4,
                  background: "rgba(138,180,248,0.28)",
                  borderRadius: 6,
                }}
              />
            )}
            <span style={{ position: "relative" }}>{l}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
        <h2 style={{ ...display(76), marginBottom: 10 }}>
          Checked word for word.
        </h2>
        {card(
          "good",
          "I expected the rate on the first screen",
          "matches P2 · u0002",
          true,
        )}
        {card(
          "bad",
          "This bank is terrible",
          "nobody said this · dropped",
          false,
        )}
      </div>
    </div>
  );
};

// 6. Counts come from code: four of five people light up and the counter ticks.
const Counts: React.FC = () => {
  const ref = useTimeline((tl) => {
    tl.from(".person", { y: 60, opacity: 0, stagger: 0.1, duration: 0.6 }, 0);
    [0, 1, 2, 3].forEach((i) =>
      tl.to(
        `.pp${i}`,
        { fill: color.signal, duration: 0.25, ease: "power2.out" },
        0.9 + i * 0.35,
      ),
    );
    tl.fromTo(
      ".count",
      { textContent: 0 },
      { textContent: 4, duration: 1.4, snap: { textContent: 1 }, ease: "none" },
      0.9,
    ).from(".code", { y: 40, opacity: 0, duration: 0.7 }, 2.6);
  });
  return (
    <div
      ref={ref}
      style={{
        ...fill,
        background: color.paper,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", gap: 48 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <svg
            key={i}
            className="person"
            width="150"
            height="220"
            viewBox="0 0 30 44"
          >
            <g className={`pp${i}`} fill={color.rule}>
              <circle cx="15" cy="9" r="8" />
              <path d="M2 44c0-12 6-19 13-19s13 7 13 19z" />
            </g>
          </svg>
        ))}
      </div>
      <div style={{ ...display(180), marginTop: 50 }}>
        <span className="count">4</span> of 5 people
      </div>
      <div
        className="code"
        style={{
          fontFamily: mono,
          fontSize: 40,
          color: color.signalInk,
          marginTop: 30,
          padding: "12px 26px",
          background: color.signalSoft,
          borderRadius: 12,
        }}
      >
        computed in code · never guessed
      </div>
    </div>
  );
};

// 7. Privacy: the recording stays on the laptop; the text is redacted before the AI reads it.
const Privacy: React.FC = () => {
  const ref = useTimeline((tl) => {
    tl.from(".laptop", { y: 60, opacity: 0, duration: 0.8 }, 0)
      .from(
        ".lock",
        { scale: 0, duration: 0.6, ease: "back.out(3)", svgOrigin: "28 21" },
        0.6,
      )
      .from(".say", { x: 80, opacity: 0, duration: 0.7 }, 1.0)
      .to(".pii", { filter: "blur(10px)", opacity: 0, duration: 0.35 }, 2.4)
      .from(
        ".tag",
        {
          scale: 0.4,
          opacity: 0,
          duration: 0.5,
          ease: "back.out(3)",
          stagger: 0.15,
        },
        2.6,
      )
      .from(".ai", { y: 30, opacity: 0, duration: 0.6 }, 3.3);
  });
  const piece = (pii: string, tag: string) => (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span className="pii">{pii}</span>
      <span
        className="tag"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          whiteSpace: "nowrap",
          color: color.signalInk,
          background: color.signalSoft,
          borderRadius: 8,
          padding: "0 6px",
        }}
      >
        {tag}
      </span>
    </span>
  );
  return (
    <div
      ref={ref}
      style={{
        ...fill,
        background: color.paper,
        display: "flex",
        alignItems: "center",
        gap: 90,
        padding: "0 150px",
      }}
    >
      <svg
        className="laptop"
        width="560"
        height="420"
        viewBox="0 0 56 42"
        style={{ flex: "none" }}
      >
        <rect x="6" y="4" width="44" height="28" rx="2" fill={INK} />
        <path d="M1 36h54l-3 5H4z" fill={color.ink2} />
        <g className="lock">
          <rect x="22" y="16" width="12" height="10" rx="1.5" fill="#8ab4f8" />
          <path
            d="M24.5 16v-3a3.5 3.5 0 0 1 7 0v3"
            fill="none"
            stroke="#8ab4f8"
            strokeWidth="1.8"
          />
        </g>
      </svg>
      <div style={{ flex: 1 }}>
        <h2 style={display(96)}>Stays on your laptop.</h2>
        <div
          className="say"
          style={{
            fontFamily: mono,
            fontSize: 44,
            lineHeight: 1.5,
            marginTop: 40,
            background: color.sheet,
            border: `3px solid ${color.rule}`,
            borderRadius: 20,
            padding: "26px 32px",
          }}
        >
          “Hi, I'm {piece("Priya", "[NAME]")}. My email is{" "}
          {piece("priya@mail.com", "[EMAIL]")}”
        </div>
        <div
          className="ai"
          style={{
            fontFamily: sans,
            fontSize: 44,
            color: color.ink2,
            marginTop: 30,
          }}
        >
          Only redacted text reaches the AI.
        </div>
      </div>
    </div>
  );
};

// 8. You decide, then evidence flows back into the product.
const Decide: React.FC = () => {
  const ref = useTimeline((tl) => {
    tl.from(".f", { y: 80, opacity: 0, stagger: 0.15, duration: 0.6 }, 0)
      .to(
        ".f0",
        { x: 700, rotate: 6, opacity: 0, duration: 0.7, ease: "power3.in" },
        1.3,
      )
      .to(
        ".f1",
        { x: -700, rotate: -6, opacity: 0, duration: 0.7, ease: "power3.in" },
        1.8,
      )
      .to(
        ".f2",
        { x: 700, rotate: 6, opacity: 0, duration: 0.7, ease: "power3.in" },
        2.3,
      )
      .from(
        ".dest",
        {
          scale: 0.6,
          opacity: 0,
          stagger: 0.2,
          duration: 0.7,
          ease: "back.out(2)",
        },
        3.2,
      )
      .from(
        ".flow",
        {
          scaleX: 0,
          transformOrigin: "left center",
          stagger: 0.2,
          duration: 0.6,
        },
        3.4,
      );
  });
  const finding = (i: number, t: string, ok: boolean) => (
    <div
      className={`f f${i}`}
      style={{
        position: "absolute",
        width: 1160,
        left: 380,
        top: 320 + i * 22,
        background: color.sheet,
        border: `3px solid ${color.rule}`,
        borderRadius: 24,
        padding: "34px 40px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxShadow: "0 30px 60px -30px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ fontFamily: serif, fontSize: 54 }}>{t}</div>
      <div
        style={{
          fontFamily: sans,
          fontSize: 36,
          fontWeight: 500,
          color: ok ? "#146c2e" : "#e5484d",
        }}
      >
        {ok ? "Approve" : "Reject"}
      </div>
    </div>
  );
  return (
    <div ref={ref} style={{ ...fill, background: color.paper }}>
      <h2 style={{ ...display(96), position: "absolute", left: 160, top: 120 }}>
        You decide.
      </h2>
      {finding(2, "Fees feel hidden · 3 of 5", true)}
      {finding(1, "People dislike the colour · 1 of 5", false)}
      {finding(0, "The rate is hard to find · 4 of 5", true)}
      <div
        style={{
          position: "absolute",
          left: 160,
          right: 160,
          bottom: 220,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {["Personas", "Journeys", "Next prototype"].map((d) => (
          <div
            key={d}
            style={{ display: "flex", alignItems: "center", gap: 24 }}
          >
            <div
              className="flow"
              style={{
                width: 90,
                height: 8,
                background: color.signal,
                borderRadius: 4,
              }}
            />
            <div
              className="dest"
              style={{
                fontFamily: serif,
                fontWeight: 600,
                fontSize: 64,
                padding: "18px 36px",
                borderRadius: 999,
                background: color.signalSoft,
                color: color.signalInk,
              }}
            >
              {d}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 9. End card.
const End: React.FC = () => {
  const ref = useTimeline((tl) => {
    tl.from(
      ".beat",
      {
        scale: 1.6,
        opacity: 0,
        stagger: 0.45,
        duration: 0.5,
        ease: "power4.out",
      },
      0,
    )
      .to(
        ".ring",
        { strokeDashoffset: 0, duration: 1, ease: "power3.inOut" },
        1.4,
      )
      .from(
        ".dot",
        { scale: 0, svgOrigin: "50 10", duration: 0.4, ease: "back.out(3)" },
        2.2,
      )
      .from(
        ".brand, .url",
        { y: 40, opacity: 0, stagger: 0.15, duration: 0.8 },
        1.8,
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
        alignItems: "center",
        justifyContent: "center",
        gap: 50,
      }}
    >
      <div style={{ display: "flex", gap: 50 }}>
        {["Test.", "Learn.", "Loop."].map((w, i) => (
          <div
            key={w}
            className="beat"
            style={display(170, i === 2 ? "#8ab4f8" : "#f2f1ec")}
          >
            {w}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        <svg width="96" height="96" viewBox="0 0 100 100">
          <circle
            className="ring"
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#8ab4f8"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray="252"
            strokeDashoffset="252"
            transform="rotate(-90 50 50)"
          />
          <circle className="dot" cx="50" cy="10" r="9" fill="#f2f1ec" />
        </svg>
        <div className="brand" style={display(96, "#f2f1ec")}>
          ProofLoop
        </div>
      </div>
      <div
        className="url"
        style={{ fontFamily: mono, fontSize: 40, color: "#b4b3ab" }}
      >
        github.com/minhnguyenrenol/proofloop
      </div>
    </div>
  );
};

const SCENES: {
  line: Line;
  C: React.FC<{ seconds: number }>;
  dark?: boolean;
}[] = [
  { line: EXPLAINER[0], C: ColdOpen, dark: true },
  { line: EXPLAINER[1], C: Pain, dark: true },
  { line: EXPLAINER[2], C: Reveal },
  { line: EXPLAINER[3], C: Loop },
  { line: EXPLAINER[4], C: Evidence },
  { line: EXPLAINER[5], C: Counts },
  { line: EXPLAINER[6], C: Privacy },
  { line: EXPLAINER[7], C: Decide },
  { line: EXPLAINER[8], C: End, dark: true },
];
type Fx = [Parameters<typeof Sfx>[0]["name"], number, number?][];
const loopPer = (sec: number) => Math.max(0.6, (sec - 1.2) / 6);
const SFX: ((sec: number) => Fx)[] = [
  () => [
    ["whoosh", 0, 0.4],
    ["impact", 1.1, 0.5],
  ],
  () => [
    ["whoosh", 0.1],
    ["pop", 0.45],
    ["whoosh", 1.25],
    ["pop", 1.6],
    ["whoosh", 2.4],
    ["pop", 2.75],
  ],
  () => [
    ["impact", 0, 0.7],
    ["chime", 0.9, 0.35],
  ],
  (sec) =>
    [0, 1, 2, 3, 4, 5].map(
      (i) => ["pop", 0.6 + i * loopPer(sec), 0.4] as Fx[number],
    ),
  () => [
    ["whoosh", 0, 0.35],
    ["chime", 2.4, 0.4],
    ["click", 3.7, 0.6],
    ["whoosh", 4.4, 0.45],
  ],
  () => [
    ["pop", 0.9, 0.4],
    ["pop", 1.25, 0.4],
    ["pop", 1.6, 0.4],
    ["pop", 1.95, 0.4],
    ["chime", 2.6, 0.35],
  ],
  () => [
    ["whoosh", 0, 0.35],
    ["click", 0.6, 0.6],
    ["pop", 2.6, 0.45],
    ["pop", 2.75, 0.45],
  ],
  () => [
    ["whoosh", 1.3],
    ["whoosh", 1.8],
    ["whoosh", 2.3],
    ["chime", 3.2, 0.4],
  ],
  () => [
    ["impact", 0, 0.6],
    ["pop", 0.45],
    ["pop", 0.9],
    ["chime", 2.2, 0.4],
  ],
];
const T = 12; // cross-fade frames
const LEAK_BEFORE = new Set([2, 8]); // light-leak overlays (they don't shorten the timeline)
const MIN = [3.4, 3.8, 3.6, 7, 6, 4.4, 4.8, 5.6, 4];
const framesOf = (i: number, fps: number) =>
  sceneFrames(Math.max(voSeconds(SCENES[i].line), MIN[i]), fps);
const fades = SCENES.length - 1 - LEAK_BEFORE.size;
export const explainerDuration = (fps: number) =>
  SCENES.reduce((n, _, i) => n + framesOf(i, fps), 0) - T * fades;
// When the reveal lands, for the music's riser.
export const explainerRevealSeconds = (fps: number) =>
  (framesOf(0, fps) + framesOf(1, fps) - T) / fps;

// Where each scene starts on the final timeline, and where its voice line plays.
const starts = (fps: number) =>
  SCENES.reduce<number[]>(
    (acc, _, i) => [
      ...acc,
      i === 0
        ? 0
        : acc[i - 1] + framesOf(i - 1, fps) - (LEAK_BEFORE.has(i) ? 0 : T),
    ],
    [],
  );
const voicedSpans = (fps: number): [number, number][] =>
  starts(fps).map((st, i) => [
    st,
    st + Math.ceil(voSeconds(SCENES[i].line) * fps),
  ]);

export const ExplainerV2: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: INK }}>
      <TransitionSeries>
        {SCENES.flatMap(({ line, C, dark }, i) => {
          const frames = framesOf(i, fps);
          const seq = (
            <TransitionSeries.Sequence
              key={line.id}
              name={line.id}
              durationInFrames={frames}
              premountFor={fps}
            >
              <C seconds={frames / fps} />
              {hasVoice(line) && (
                <Audio
                  src={staticFile(`vo/${line.id}.mp3`)}
                  premountFor={fps}
                />
              )}
              <Caption text={line.text} dark={dark} />
              {SFX[i](frames / fps).map(([n, at, v], k) => (
                <Sfx key={k} name={n} at={at * fps} volume={v ?? 0.5} />
              ))}
            </TransitionSeries.Sequence>
          );
          if (i === 0) return [seq];
          const cut = LEAK_BEFORE.has(i) ? (
            <TransitionSeries.Overlay
              key={`o${i}`}
              durationInFrames={30}
              premountFor={fps}
            >
              <Leak seed={i} />
            </TransitionSeries.Overlay>
          ) : (
            <TransitionSeries.Transition
              key={`t${i}`}
              presentation={fade()}
              timing={linearTiming({ durationInFrames: T })}
            />
          );
          return [cut, seq];
        })}
      </TransitionSeries>
      <Audio
        src={staticFile("music/explainer.wav")}
        volume={duck(voicedSpans(fps), durationInFrames)}
      />
      <Grain />
    </AbsoluteFill>
  );
};
