// How ProofLoop synthesises, in detail: prepare, observe, verify, group
// bottom-up, finish the board, write insights, count, compare, review.
import type React from "react";
import { random } from "remotion";
import { useTimeline, Words } from "./kit";
import { fill, Head, headIn, panel } from "./HowToV2";
import { chip, type Fx, narrated, Title } from "./narrated";
import { SYNTH } from "./script";
import { color, mono, sans, serif } from "./theme";

const GREEN = "#146c2e";
const RED = "#c2262e";
const AMBER = "#8a4b00";
const tag = (t: string, fg: string, bg: string, cls = ""): React.ReactNode => (
  <span
    className={cls}
    style={{
      fontFamily: sans,
      fontWeight: 500,
      fontSize: 28,
      color: fg,
      background: bg,
      borderRadius: 999,
      padding: "6px 18px",
      whiteSpace: "nowrap",
    }}
  >
    {t}
  </span>
);
const hl: React.CSSProperties = {
  backgroundImage: `linear-gradient(${color.signalSoft}, ${color.signalSoft})`,
  backgroundRepeat: "no-repeat",
  backgroundSize: "0% 100%",
  borderRadius: 6,
};
const sweep = (tl: gsap.core.Timeline, sel: string, at: number) =>
  tl.to(
    sel,
    { backgroundSize: "100% 100%", duration: 0.8, ease: "power2.inOut" },
    at,
  );
const serifT = (size: number): React.CSSProperties => ({
  fontFamily: serif,
  fontWeight: 600,
  fontSize: size,
  lineHeight: 1.2,
});

const Intro = () => (
  <Title
    big="From sessions to insights."
    size={160}
    lines={["Synthesis with ProofLoop, in detail."]}
  />
);

const Secret: React.FC<{ raw: string; as: string }> = ({ raw, as }) => (
  <span style={{ position: "relative", display: "inline-block" }}>
    {raw}
    <span
      className="bar"
      style={{
        position: "absolute",
        inset: "-2px -4px",
        background: "#1d1d1b",
        borderRadius: 6,
        transformOrigin: "left center",
        display: "grid",
        placeItems: "center",
      }}
    >
      <span
        className="ph"
        style={{ fontFamily: mono, fontSize: 24, color: "#f2f1ec" }}
      >
        {as}
      </span>
    </span>
  </span>
);
const Prepare: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".tr", { y: 60, opacity: 0, duration: 0.7 }, 0.2)
      .from(
        ".bar",
        { scaleX: 0, stagger: 0.4, duration: 0.5, ease: "power3.inOut" },
        2.3,
      )
      .from(".ph", { opacity: 0, stagger: 0.4, duration: 0.3 }, 2.7)
      .from(
        ".kf",
        {
          x: 80,
          opacity: 0,
          stagger: 0.35,
          duration: 0.6,
          ease: "back.out(1.4)",
        },
        4.4,
      );
  });
  return (
    <div ref={ref} style={fill}>
      <Head n={1} title="Prepare each session" />
      <div
        className="tr"
        style={{
          ...panel,
          position: "absolute",
          left: 140,
          top: 330,
          width: 1000,
          padding: "34px 40px",
          fontFamily: sans,
          fontSize: 38,
          lineHeight: 1.8,
        }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 26,
            color: color.ink2,
            marginBottom: 10,
          }}
        >
          transcript · P3
        </div>
        <div>
          <span style={{ fontFamily: mono, fontSize: 28, color: color.ink2 }}>
            00:41{" "}
          </span>{" "}
          Hi, I'm <Secret raw="Sarah" as="[NAME]" />, I mostly save for travel.
        </div>
        <div>
          <span style={{ fontFamily: mono, fontSize: 28, color: color.ink2 }}>
            00:52{" "}
          </span>{" "}
          You can email me at <Secret raw="sarah@mail.com" as="[EMAIL]" />.
        </div>
        <div>
          <span style={{ fontFamily: mono, fontSize: 28, color: color.ink2 }}>
            01:12{" "}
          </span>{" "}
          I thought the rate would be right here.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1200,
          top: 330,
          width: 580,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        {["00:41", "01:12", "02:05"].map((t, i) => (
          <div
            key={t}
            className="kf"
            style={{
              ...panel,
              height: 136,
              padding: 16,
              display: "flex",
              gap: 18,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 170,
                height: 104,
                borderRadius: 10,
                background: color.paper,
                border: `2px solid ${color.rule}`,
                padding: 12,
              }}
            >
              <div
                style={{
                  height: 14,
                  width: "70%",
                  background: color.rule,
                  borderRadius: 4,
                }}
              />
              <div
                style={{
                  height: 30,
                  width: ["60%", "85%", "45%"][i],
                  background: color.signal,
                  opacity: 0.6,
                  borderRadius: 6,
                  marginTop: 12,
                }}
              />
            </div>
            <div style={{ fontFamily: sans, fontSize: 30 }}>
              Key moment
              <div style={{ ...chip, width: "fit-content", marginTop: 6 }}>
                {t}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Observe: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".o1", { x: -80, opacity: 0, duration: 0.7 }, 0.4)
      .from(".q1", { y: 20, opacity: 0, duration: 0.5 }, 1.4);
    sweep(tl, ".h1", 3.0)
      .from(".k1", { scale: 0, duration: 0.4, ease: "back.out(3)" }, 3.8)
      .from(".o2", { x: -80, opacity: 0, duration: 0.7 }, 5.0)
      .from(
        ".e2",
        {
          scale: 0,
          opacity: 0,
          stagger: 0.3,
          duration: 0.4,
          ease: "back.out(3)",
        },
        5.8,
      )
      .from(".k2", { scale: 0, duration: 0.4, ease: "back.out(3)" }, 7.4);
  });
  const obs = (
    cls: string,
    title: string,
    who: string,
    body: React.ReactNode,
  ) => (
    <div
      className={cls}
      style={{ ...panel, width: 1640, padding: "30px 40px" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={serifT(50)}>{title}</span>
        <span style={chip}>{who}</span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          marginTop: 20,
          fontFamily: sans,
          fontSize: 34,
        }}
      >
        {body}
      </div>
    </div>
  );
  return (
    <div ref={ref} style={fill}>
      <Head n={2} title="Write observations" />
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 330,
          display: "flex",
          flexDirection: "column",
          gap: 30,
        }}
      >
        {obs(
          "o1",
          "Expected the rate on the first screen",
          "P3 · 01:12",
          <>
            <span className="q1">
              <span
                className="h1"
                style={{ ...hl, fontStyle: "italic", padding: "2px 6px" }}
              >
                “I thought the rate would be right here.”
              </span>
            </span>
            {tag("✓ word for word in the transcript", GREEN, "#e3f3e6", "k1")}
          </>,
        )}
        {obs(
          "o2",
          "Clicked the summary card three times",
          "P3 · 01:30",
          <>
            <span className="e2" style={chip}>
              click · e00004
            </span>
            <span className="e2" style={chip}>
              screenshot · f03
            </span>
            {tag("✓ click found", GREEN, "#e3f3e6", "k2")}
          </>,
        )}
      </div>
    </div>
  );
};

const Drop: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".dc", { y: 60, opacity: 0, duration: 0.6 }, 0.2)
      .from(".tx", { y: 40, opacity: 0, duration: 0.6 }, 0.6)
      .to(".bad", { backgroundColor: "#fdd8d8", duration: 0.3 }, 1.1)
      .from(
        ".stamp",
        { scale: 2.2, opacity: 0, duration: 0.35, ease: "power4.in" },
        1.5,
      )
      .to(
        ".dc",
        { y: 520, rotate: 12, opacity: 0, duration: 0.8, ease: "power2.in" },
        2.6,
      );
  });
  return (
    <div ref={ref} style={fill}>
      <Head n={3} title="Dropped, not patched" />
      <div
        className="dc"
        style={{
          ...panel,
          position: "absolute",
          left: 360,
          top: 330,
          width: 1200,
          padding: "34px 44px",
        }}
      >
        <div style={serifT(52)}>Says they'd never use the app</div>
        <div
          style={{
            fontFamily: sans,
            fontSize: 38,
            fontStyle: "italic",
            marginTop: 16,
          }}
        >
          “I'd{" "}
          <span className="bad" style={{ borderRadius: 6, padding: "0 6px" }}>
            never
          </span>{" "}
          use this.”
        </div>
        <div
          className="stamp"
          style={{
            position: "absolute",
            right: 40,
            top: 40,
            transform: "rotate(-8deg)",
            border: `5px solid ${RED}`,
            color: RED,
            borderRadius: 14,
            padding: "8px 22px",
            fontFamily: sans,
            fontWeight: 600,
            fontSize: 40,
          }}
        >
          Doesn't match
        </div>
      </div>
      <div
        className="tx"
        style={{
          position: "absolute",
          left: 360,
          top: 640,
          width: 1200,
          padding: "26px 44px",
          background: "#efede6",
          borderRadius: 20,
          fontFamily: sans,
          fontSize: 38,
        }}
      >
        <span style={{ fontFamily: mono, fontSize: 26, color: color.ink2 }}>
          transcript 03:20{" "}
        </span>{" "}
        “I'd{" "}
        <span className="bad" style={{ borderRadius: 6, padding: "0 6px" }}>
          probably
        </span>{" "}
        use this, once it shows the rate.”
      </div>
    </div>
  );
};

const TINT = ["#fff8c5", "#ffe1e1", "#dff3e4", "#e1ecff", "#f0e4ff"]; // P1..P5, like the board's participant colours
const GROUPS: [string, [number, string][]][] = [
  [
    "People look for the rate first",
    [
      [1, "where's the rate?"],
      [3, "scrolled for the rate"],
      [4, "rate before anything"],
      [5, "rate on first screen"],
    ],
  ],
  [
    "Fees feel hidden",
    [
      [2, "surprise fee"],
      [1, "is the fee monthly?"],
      [4, "fee only at the end"],
      [5, "what's this charge?"],
    ],
  ],
  [
    "The form asks too much",
    [
      [2, "why my income?"],
      [3, "too many steps"],
      [5, "gave up at step 4"],
      [1, "asked for ID twice"],
    ],
  ],
];
const NOTES = GROUPS.flatMap(([, ns], g) =>
  ns.map(([p, t], k) => ({
    p,
    t,
    tx: 140 + g * 560 + (k % 2) * 265,
    ty: 430 + Math.floor(k / 2) * 120,
  })),
);
const SCAT = NOTES.map((_, i) => ({
  x: 170 + random(`sx${i}`) * 1300,
  y: 340 + random(`sy${i}`) * 400,
  r: (random(`sr${i}`) - 0.5) * 16,
}));
const Group: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(
        ".nt",
        {
          scale: 0,
          opacity: 0,
          stagger: 0.05,
          duration: 0.4,
          ease: "back.out(2)",
        },
        0.3,
      )
      .to(
        ".nt",
        {
          x: (i: number) => NOTES[i].tx - SCAT[i].x,
          y: (i: number) => NOTES[i].ty - SCAT[i].y,
          rotate: 0,
          stagger: 0.03,
          duration: 1.3,
          ease: "power3.inOut",
        },
        1.6,
      )
      .from(".zone", { opacity: 0, duration: 0.6 }, 2.6)
      .from(".lab", { y: 20, opacity: 0, stagger: 0.2, duration: 0.6 }, 3.0)
      .from(
        ".strike",
        { scaleX: 0, stagger: 1.0, duration: 0.4, ease: "power3.out" },
        4.7,
      );
  });
  return (
    <div ref={ref} style={fill}>
      <Head n={4} title="Group bottom up" />
      <div
        style={{
          position: "absolute",
          right: 140,
          top: 150,
          display: "flex",
          gap: 20,
        }}
      >
        {["by task", "by assumption"].map((t) => (
          <span
            key={t}
            style={{
              position: "relative",
              fontFamily: sans,
              fontSize: 36,
              color: color.ink2,
              border: `3px solid ${color.rule}`,
              borderRadius: 999,
              padding: "8px 26px",
            }}
          >
            {t}
            <span
              className="strike"
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                top: "50%",
                height: 5,
                background: RED,
                borderRadius: 3,
                transformOrigin: "left center",
              }}
            />
          </span>
        ))}
      </div>
      {GROUPS.map(([g], i) => (
        <div
          key={g}
          className="zone"
          style={{
            position: "absolute",
            left: 120 + i * 560,
            top: 320,
            width: 550,
            height: 400,
            background: "#efede6",
            borderRadius: 22,
          }}
        >
          <div className="lab" style={{ ...serifT(34), padding: "18px 22px" }}>
            {g}
          </div>
        </div>
      ))}
      {NOTES.map((n, i) => (
        <div
          key={i}
          className="nt"
          style={{
            position: "absolute",
            left: SCAT[i].x,
            top: SCAT[i].y,
            rotate: `${SCAT[i].r}deg`,
            width: 255,
            background: TINT[n.p - 1],
            borderRadius: 10,
            padding: "12px 14px",
            fontFamily: sans,
            fontSize: 24,
            boxShadow: "0 10px 20px -12px rgba(0,0,0,0.35)",
          }}
        >
          <b style={{ fontWeight: 500 }}>P{n.p}</b> · {n.t}
        </div>
      ))}
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
        0.6,
      )
      .to(
        ".mv",
        { x: -1120, y: 156, rotate: -3, duration: 1.0, ease: "power3.inOut" },
        1.5,
      )
      .to(".mv", { rotate: 0, duration: 0.3 }, 2.5)
      .from(".tip", { y: 20, opacity: 0, duration: 0.4 }, 2.6)
      .to(".old", { opacity: 0, duration: 0.3 }, 3.8)
      .to(".tip", { opacity: 0, duration: 0.3 }, 3.8)
      .from(".w", { opacity: 0, y: 10, stagger: 0.05, duration: 0.25 }, 3.9)
      .from(
        ".done",
        { scale: 0.7, opacity: 0, duration: 0.5, ease: "back.out(3)" },
        5.0,
      )
      .to(".done", { backgroundColor: GREEN, duration: 0.3 }, 5.5);
  });
  const note = (p: number, t: string, cls = "") => (
    <div
      key={t}
      className={`note ${cls}`}
      style={{
        background: TINT[p - 1],
        borderRadius: 10,
        padding: "14px 18px",
        fontFamily: sans,
        fontSize: 28,
        boxShadow: "0 10px 20px -12px rgba(0,0,0,0.3)",
      }}
    >
      P{p} · {t}
    </div>
  );
  const label = (body: React.ReactNode) => (
    <div style={{ position: "relative", minHeight: 100, ...serifT(34) }}>
      {body}
    </div>
  );
  return (
    <div ref={ref} style={fill}>
      <Head n={5} title="Finish it on the board" />
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 320,
          display: "flex",
          gap: 40,
        }}
      >
        {[
          [
            label("People look for the rate first"),
            [note(1, "where's the rate?"), note(3, "scrolled for the rate")],
          ],
          [
            label(
              <>
                <span className="old" style={{ position: "absolute" }}>
                  Fees
                </span>
                <span style={{ position: "absolute" }}>
                  <Words text="People can't tell if the fee is monthly or yearly" />
                </span>
              </>,
            ),
            [note(2, "surprise fee"), note(1, "is the fee monthly?")],
          ],
          [label("Unsorted"), [note(5, "looked for the rate too", "mv")]],
        ].map(([l, ns], ci) => (
          <div
            key={ci}
            className="col"
            style={{
              width: 520,
              background: "#efede6",
              borderRadius: 20,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minHeight: 440,
            }}
          >
            {l}
            {ns}
          </div>
        ))}
      </div>
      <div
        className="tip"
        style={{ position: "absolute", left: 700, top: 790 }}
      >
        {tag("Too short: say what people experienced", RED, "#fdecec")}
      </div>
      <div
        className="done"
        style={{
          position: "absolute",
          right: 140,
          top: 790,
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

const Insights: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".ic", { y: 80, opacity: 0, stagger: 3.2, duration: 0.8 }, 0.4)
      .from(".sev", { scale: 0, duration: 0.4, ease: "back.out(3)" }, 2.6);
    sweep(tl, ".hmw", 4.8);
  });
  const ic = (
    eyebrow: React.ReactNode,
    body: React.ReactNode,
    foot: string,
  ) => (
    <div
      className="ic"
      style={{
        ...panel,
        width: 800,
        padding: "36px 42px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div style={{ display: "flex", gap: 14 }}>{eyebrow}</div>
      <div style={serifT(54)}>{body}</div>
      <div style={{ fontFamily: sans, fontSize: 28, color: color.ink2 }}>
        {foot}
      </div>
    </div>
  );
  return (
    <div ref={ref} style={fill}>
      <Head n={6} title="Write insights" />
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 340,
          display: "flex",
          gap: 40,
          alignItems: "stretch",
        }}
      >
        {ic(
          <>
            {tag("Pain point", RED, "#fdecec")}
            {tag("major", "#fff", RED, "sev")}
          </>,
          "People can't tell if the fee is monthly or yearly.",
          "From 2 groups · 9 notes",
        )}
        {ic(
          tag("Opportunity", GREEN, "#e3f3e6"),
          <>
            <span className="hmw" style={{ ...hl, padding: "0 6px" }}>
              How might we
            </span>{" "}
            show the full fee before people start?
          </>,
          "Answers pain point 1",
        )}
      </div>
    </div>
  );
};

const Counts: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".cp", { y: 60, opacity: 0, duration: 0.7 }, 0.2)
      .to(
        ".hit",
        {
          backgroundColor: color.signal,
          borderColor: color.signal,
          color: "#fff",
          stagger: 0.25,
          duration: 0.3,
          ease: "back.out(3)",
        },
        0.7,
      )
      .from(".big", { y: 30, opacity: 0, duration: 0.6 }, 1.8)
      .from(".conf", { scale: 0, duration: 0.4, ease: "back.out(3)" }, 2.5)
      .from(".rp", { y: 60, opacity: 0, duration: 0.7 }, 3.0)
      .from(".r2", { x: 40, opacity: 0, stagger: 0.15, duration: 0.5 }, 3.6)
      .from(".lk", { scaleX: 0, stagger: 0.2, duration: 0.4 }, 4.6)
      .from(
        ".st",
        {
          scale: 0,
          opacity: 0,
          stagger: 0.2,
          duration: 0.4,
          ease: "back.out(3)",
        },
        5.0,
      );
  });
  const run1 = ["Rate hard to find", "Fee unclear", "Form too long"];
  const run2 = ["Rate hard to find", "Fee unclear", "Wants dark mode"];
  const bar = (t: string, cls = "") => (
    <div
      className={cls}
      style={{
        width: 270,
        background: color.signalSoft,
        borderRadius: 12,
        padding: "14px 18px",
        fontFamily: sans,
        fontSize: 28,
      }}
    >
      {t}
    </div>
  );
  return (
    <div ref={ref} style={fill}>
      <Head n={7} title="Counted in code" />
      <div
        className="cp"
        style={{
          ...panel,
          position: "absolute",
          left: 140,
          top: 330,
          width: 760,
          padding: "34px 40px",
        }}
      >
        <div style={{ display: "flex", gap: 18 }}>
          {[1, 2, 3, 4, 5].map((p) => (
            <div
              key={p}
              className={p === 4 ? "" : "hit"}
              style={{
                width: 104,
                height: 104,
                borderRadius: 52,
                border: `4px solid ${color.rule}`,
                display: "grid",
                placeItems: "center",
                fontFamily: sans,
                fontSize: 34,
                color: color.ink2,
              }}
            >
              P{p}
            </div>
          ))}
        </div>
        <div className="big" style={{ ...serifT(96), marginTop: 26 }}>
          4 of 5 people
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            marginTop: 18,
            alignItems: "center",
          }}
        >
          <span className="conf">
            {tag("high confidence", GREEN, "#e3f3e6")}
          </span>
          <span style={{ ...chip, fontSize: 24 }}>
            computed, not written by the AI
          </span>
        </div>
      </div>
      <div
        className="rp"
        style={{
          ...panel,
          position: "absolute",
          left: 960,
          top: 330,
          width: 820,
          padding: "34px 40px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: mono,
            fontSize: 28,
            color: color.ink2,
            marginBottom: 18,
          }}
        >
          <span>run 1</span>
          <span>run 2 · independent</span>
        </div>
        {run1.map((t, i) => (
          <div
            key={t}
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 18,
              position: "relative",
            }}
          >
            {bar(t)}
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              {i < 2 ? (
                <div
                  className="lk"
                  style={{
                    width: "80%",
                    height: 5,
                    background: GREEN,
                    borderRadius: 3,
                  }}
                />
              ) : null}
            </div>
            {bar(run2[i], "r2")}
          </div>
        ))}
        <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
          <span className="st">{tag("2 stable", GREEN, "#e3f3e6")}</span>
          <span className="st">
            {tag("1 can't be rated high", AMBER, "#fff4e0")}
          </span>
        </div>
      </div>
    </div>
  );
};

const Compare: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".ctx", { x: -80, opacity: 0, duration: 0.7 }, 0.2)
      .from(".ins", { x: 80, opacity: 0, stagger: 0.2, duration: 0.6 }, 0.9)
      .from(
        ".rel",
        {
          scale: 0,
          opacity: 0,
          stagger: 0.95,
          duration: 0.4,
          ease: "back.out(3)",
        },
        3.6,
      );
  });
  const rows: [string, string, string, string][] = [
    ["People look for the rate first", "Confirms", GREEN, "#e3f3e6"],
    ["The form isn't why people quit", "Contradicts", RED, "#fdecec"],
    [
      "Fees matter at the compare step",
      "Extends",
      color.signalInk,
      color.signalSoft,
    ],
    ["People want a savings goal", "New", AMBER, "#fff4e0"],
  ];
  return (
    <div ref={ref} style={fill}>
      <Head n={8} title="Compare with context" />
      <div
        className="ctx"
        style={{
          ...panel,
          position: "absolute",
          left: 140,
          top: 330,
          width: 640,
          padding: "34px 40px",
        }}
      >
        <div style={{ ...serifT(46), marginBottom: 16 }}>Product context</div>
        {[
          ["Vision", "Saving made simple"],
          ["Persona", "Sam checks rates monthly"],
          ["Journey", "Compare, then open"],
        ].map(([k, v]) => (
          <div
            key={k}
            style={{
              padding: "16px 0",
              borderTop: `2px solid ${color.rule}`,
              fontFamily: sans,
              fontSize: 32,
            }}
          >
            <span style={{ ...chip, fontSize: 24, marginRight: 14 }}>{k}</span>
            {v}
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 840,
          top: 330,
          width: 940,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {rows.map(([t, r, fg, bg]) => (
          <div
            key={t}
            className="ins"
            style={{
              ...panel,
              padding: "24px 30px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontFamily: sans, fontSize: 34 }}>{t}</span>
            {tag(r, fg, bg, "rel")}
          </div>
        ))}
      </div>
    </div>
  );
};

const Review: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".rv", { y: 60, opacity: 0, duration: 0.7 }, 0.2)
      .to(
        ".acc",
        {
          backgroundColor: GREEN,
          color: "#fff",
          scale: 1.08,
          duration: 0.3,
          ease: "back.out(3)",
        },
        1.4,
      )
      .to(".acc", { scale: 1, duration: 0.2 }, 1.7)
      .from(".rep", { x: 80, opacity: 0, duration: 0.7 }, 2.2)
      .from(".ri", { x: -20, opacity: 0, stagger: 0.2, duration: 0.4 }, 2.7)
      .from(".per", { x: 80, opacity: 0, duration: 0.7 }, 4.0)
      .from(".cut", { scaleX: 0, duration: 0.4, ease: "power3.out" }, 4.7)
      .from(".nw", { y: 20, opacity: 0, duration: 0.5 }, 5.1);
  });
  const btn = (t: string, cls = "") => (
    <span
      className={cls}
      style={{
        fontFamily: sans,
        fontWeight: 500,
        fontSize: 32,
        border: `3px solid ${color.rule}`,
        borderRadius: 14,
        padding: "12px 30px",
        background: color.sheet,
      }}
    >
      {t}
    </span>
  );
  return (
    <div ref={ref} style={fill}>
      <Head n={9} title="Review, then apply" />
      <div
        className="rv"
        style={{
          ...panel,
          position: "absolute",
          left: 140,
          top: 330,
          width: 800,
          padding: "34px 40px",
        }}
      >
        <span style={chip}>insight 3 of 8 · 4 of 5 people</span>
        <div style={{ ...serifT(50), margin: "22px 0 30px" }}>
          People can't tell if the fee is monthly or yearly.
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          {btn("Accept", "acc")}
          {btn("Edit")}
          {btn("Reject")}
        </div>
      </div>
      <div
        className="rep"
        style={{
          ...panel,
          position: "absolute",
          left: 1000,
          top: 330,
          width: 780,
          padding: "28px 36px",
        }}
      >
        <div style={serifT(42)}>Report</div>
        {["1  Rate hard to find · critical", "2  Fees feel hidden · major"].map(
          (t) => (
            <div
              key={t}
              className="ri"
              style={{
                fontFamily: sans,
                fontSize: 30,
                color: color.ink2,
                marginTop: 10,
              }}
            >
              {t}
            </div>
          ),
        )}
      </div>
      <div
        className="per"
        style={{
          ...panel,
          position: "absolute",
          left: 1000,
          top: 590,
          width: 780,
          padding: "28px 36px",
        }}
      >
        <div style={serifT(42)}>Persona · Sam</div>
        <div
          style={{
            position: "relative",
            width: "fit-content",
            fontFamily: sans,
            fontSize: 30,
            color: color.ink2,
            marginTop: 12,
          }}
        >
          Quits because the form is long
          <span
            className="cut"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "52%",
              height: 4,
              background: RED,
              transformOrigin: "left center",
            }}
          />
        </div>
        <div
          className="nw"
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <span
            style={{
              fontFamily: sans,
              fontSize: 30,
              background: color.signalSoft,
              padding: "6px 12px",
              borderRadius: 8,
            }}
          >
            Can't tell what the fee costs
          </span>
          <span style={{ ...chip, fontSize: 24 }}>insight 3</span>
        </div>
      </div>
    </div>
  );
};

const Outro = () => (
  <Title
    big="Evidence you can check."
    size={150}
    lines={[
      "Decisions you make.",
      "docs/guide.html · github.com/minhnguyenrenol/proofloop",
    ]}
  />
);

const pops = (from: number, n: number, gap: number, v = 0.3): Fx =>
  Array.from({ length: n }, (_, k) => ["pop", from + k * gap, v]);
export const { Video: Synthesis, duration: synthDuration } = narrated(
  [
    {
      line: SYNTH[0],
      C: Intro,
      dark: true,
      min: 3.4,
      sfx: [["impact", 0, 0.5]],
    },
    {
      line: SYNTH[1],
      C: Prepare,
      min: 6.4,
      sfx: [
        ["whoosh", 0.2, 0.35],
        ["click", 2.3, 0.45],
        ["click", 2.7, 0.45],
        ...pops(4.4, 3, 0.35),
      ],
    },
    {
      line: SYNTH[2],
      C: Observe,
      min: 8.4,
      sfx: [
        ["whoosh", 0.4, 0.35],
        ["chime", 3.8, 0.35],
        ["whoosh", 5.0, 0.35],
        ...pops(5.8, 2, 0.3),
        ["chime", 7.4, 0.35],
      ],
    },
    {
      line: SYNTH[3],
      C: Drop,
      min: 4.6,
      sfx: [
        ["pop", 0.2, 0.35],
        ["impact", 1.5, 0.4],
        ["whoosh", 2.6, 0.4],
      ],
    },
    {
      line: SYNTH[4],
      C: Group,
      min: 6.6,
      sfx: [
        ...pops(0.3, 6, 0.1, 0.22),
        ["whoosh", 1.6, 0.4],
        ["chime", 3.0, 0.3],
        ["click", 4.7, 0.45],
        ["click", 5.7, 0.45],
      ],
    },
    {
      line: SYNTH[5],
      C: Board,
      min: 6,
      sfx: [
        ["pop", 0.6, 0.35],
        ["whoosh", 1.5, 0.4],
        ["click", 2.6, 0.4],
        ["click", 5.0, 0.5],
        ["chime", 5.5, 0.35],
      ],
    },
    {
      line: SYNTH[6],
      C: Insights,
      min: 5.8,
      sfx: [
        ["whoosh", 0.4, 0.35],
        ["pop", 2.6, 0.45],
        ["whoosh", 3.6, 0.35],
        ["chime", 4.8, 0.3],
      ],
    },
    {
      line: SYNTH[7],
      C: Counts,
      min: 6,
      sfx: [
        ...pops(0.7, 4, 0.25),
        ["chime", 2.5, 0.3],
        ["whoosh", 3.0, 0.35],
        ["pop", 5.0, 0.35],
        ["pop", 5.2, 0.35],
      ],
    },
    {
      line: SYNTH[8],
      C: Compare,
      min: 7,
      sfx: [["whoosh", 0.2, 0.35], ...pops(3.6, 4, 0.95, 0.4)],
    },
    {
      line: SYNTH[9],
      C: Review,
      min: 6.6,
      sfx: [
        ["whoosh", 0.2, 0.35],
        ["click", 1.4, 0.5],
        ["whoosh", 2.2, 0.3],
        ["whoosh", 4.0, 0.3],
        ["chime", 5.1, 0.35],
      ],
    },
    {
      line: SYNTH[10],
      C: Outro,
      dark: true,
      min: 4,
      sfx: [["impact", 0, 0.5]],
    },
  ],
  "synthesis",
);
