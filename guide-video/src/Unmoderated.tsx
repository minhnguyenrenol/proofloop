// How to run an unmoderated test: relay, plan, links, the participant's side,
// upload in pieces, import. Same look and builder as the how-to video.
import type React from "react";
import { useTimeline } from "./kit";
import { Bars, fill, Head, headIn, INK, panel } from "./HowToV2";
import { Arrow, Ask, askIn, chip, type Fx, narrated, Title } from "./narrated";
import { UNMOD } from "./script";
import { color, mono, sans, serif } from "./theme";

const GREEN = "#146c2e";
const RED = "#c2262e";
const card = (
  title: string,
  sub: React.ReactNode,
  cls = "node",
  w = 400,
  hi = false,
) => (
  <div
    className={cls}
    style={{
      ...panel,
      width: w,
      padding: "34px 36px",
      borderColor: hi ? color.signal : color.rule,
      flex: "none",
    }}
  >
    <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 46 }}>
      {title}
    </div>
    <div
      style={{
        fontFamily: sans,
        fontSize: 30,
        color: color.ink2,
        marginTop: 12,
        lineHeight: 1.4,
      }}
    >
      {sub}
    </div>
  </div>
);
const row: React.CSSProperties = {
  position: "absolute",
  left: 140,
  right: 140,
  display: "flex",
  alignItems: "center",
  gap: 30,
};

const Intro = () => (
  <Title
    big="Unmoderated tests."
    size={190}
    lines={["Run a study on a link, with ProofLoop."]}
  />
);

const Relay: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".node", { y: 60, opacity: 0, stagger: 0.25, duration: 0.7 }, 0.3)
      .from(
        ".arrow",
        { scaleX: 0, stagger: 0.3, duration: 0.6, ease: "power3.out" },
        1.1,
      )
      .from(".ttl", { y: 30, opacity: 0, duration: 0.6 }, 4.4)
      .fromTo(
        ".ring",
        { strokeDashoffset: 0 },
        { strokeDashoffset: 314, duration: 3, ease: "power1.inOut" },
        4.6,
      )
      .from(
        ".once",
        { scale: 0.7, opacity: 0, duration: 0.5, ease: "back.out(3)" },
        1.8,
      );
  });
  return (
    <div ref={ref} style={fill}>
      <Head n={1} title="Set up the relay, once" />
      <div style={{ ...row, top: 360 }}>
        {card("Participant", "their browser")}
        <Arrow w={140} />
        {card("Relay", "your company's cloud", "node", 400, true)}
        <Arrow w={140} />
        {card("You", "your laptop")}
      </div>
      <div
        className="once"
        style={{ ...chip, position: "absolute", left: 770, top: 570 }}
      >
        relay/ · sam deploy
      </div>
      <div
        className="ttl"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 680,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 28,
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke={color.rule}
            strokeWidth="12"
          />
          <circle
            className="ring"
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke={color.signal}
            strokeWidth="12"
            strokeDasharray="314"
            strokeLinecap="round"
          />
        </svg>
        <span style={{ fontFamily: serif, fontWeight: 600, fontSize: 52 }}>
          Deletes everything after 24 hours
        </span>
      </div>
    </div>
  );
};

const Plan: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl);
    askIn(tl, 0.5).from(
      ".file",
      {
        y: 120,
        opacity: 0,
        rotate: (i: number) => [-6, 0, 6][i],
        stagger: 0.25,
        duration: 0.8,
        ease: "back.out(1.4)",
      },
      3.6,
    );
  });
  const files: [string, string[]][] = [
    ["Tasks", ["1  Find the savings rate", "2  Open an account"]],
    ["Success", ["Reaches the confirm screen", "Time limit per task"]],
    ["Consent", ["Screen and voice recorded", "Kept for 90 days"]],
  ];
  return (
    <div ref={ref} style={fill}>
      <Head n={2} title="Plan the test" />
      <Ask
        text="Plan an unmoderated test of this prototype."
        style={{ position: "absolute", left: 140, top: 330 }}
      />
      <div style={{ ...row, top: 480, gap: 70 }}>
        {files.map(([t, ls]) =>
          card(
            t,
            ls.map((l) => <div key={l}>{l}</div>),
            "file",
            500,
          ),
        )}
      </div>
    </div>
  );
};

const Build: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".node", { y: 60, opacity: 0, stagger: 0.7, duration: 0.7 }, 0.3)
      .from(".arrow", { scaleX: 0, stagger: 0.7, duration: 0.5 }, 0.8)
      .from(".lnk", { x: -30, opacity: 0, stagger: 0.18, duration: 0.4 }, 3.4);
  });
  return (
    <div ref={ref} style={fill}>
      <Head n={3} title="Build, host, share" />
      <div style={{ ...row, top: 360, alignItems: "flex-start" }}>
        {card("Build", "the participant page", "node", 440)}
        <div style={{ marginTop: 90 }}>
          <Arrow w={100} />
        </div>
        {card(
          "Host",
          <span style={{ fontFamily: mono, fontSize: 28 }}>
            research.yourco.com
            <br />
            /savings
          </span>,
          "node",
          440,
        )}
        <div style={{ marginTop: 90 }}>
          <Arrow w={100} />
        </div>
        {card(
          "Share",
          ["P1", "P2", "P3", "P4"].map((p, i) => (
            <div
              key={p}
              className="lnk"
              style={{
                fontFamily: mono,
                fontSize: 25,
                marginTop: 8,
                whiteSpace: "nowrap",
              }}
            >
              {p}{" "}
              <span style={{ color: color.signalInk }}>
                …/savings?t={["7f3a", "c91e", "04bd", "e5a2"][i]}…
              </span>
            </div>
          )),
          "node",
          440,
        )}
      </div>
    </div>
  );
};

const Link: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(
        ".pill",
        { scale: 0.8, opacity: 0, duration: 0.5, ease: "back.out(2)" },
        0.3,
      )
      .from(".devA", { x: -120, opacity: 0, duration: 0.7 }, 0.8)
      .from(".devB", { x: 120, opacity: 0, duration: 0.7 }, 1.6)
      .from(
        ".no",
        { scale: 0.8, opacity: 0, duration: 0.4, ease: "back.out(3)" },
        2.2,
      )
      .to(
        ".devB",
        { x: 14, duration: 0.07, repeat: 5, yoyo: true, ease: "sine.inOut" },
        2.3,
      )
      .from(".exp", { y: 30, opacity: 0, duration: 0.6 }, 3.0);
  });
  return (
    <div ref={ref} style={fill}>
      <Head n={4} title="One link, one person" />
      <div
        className="pill"
        style={{
          ...chip,
          fontSize: 36,
          position: "absolute",
          left: 140,
          top: 320,
          padding: "12px 26px",
          borderRadius: 999,
        }}
      >
        research.yourco.com/savings?t=04bd… · P3
      </div>
      <div
        className="devA"
        style={{
          position: "absolute",
          left: 220,
          top: 430,
          width: 360,
          height: 450,
          background: INK,
          borderRadius: 52,
          padding: 16,
        }}
      >
        <div
          style={{
            background: color.sheet,
            borderRadius: 38,
            height: "100%",
            padding: "44px 28px",
            fontFamily: sans,
          }}
        >
          <div style={{ fontSize: 26, color: color.ink2 }}>Task 1 of 2</div>
          <div
            style={{
              fontFamily: serif,
              fontWeight: 600,
              fontSize: 40,
              marginTop: 10,
            }}
          >
            Find the savings rate
          </div>
          <div
            style={{
              marginTop: 40,
              color: GREEN,
              fontSize: 30,
              fontWeight: 500,
            }}
          >
            ✓ Works on this phone
          </div>
        </div>
      </div>
      <div
        className="devB"
        style={{
          ...panel,
          position: "absolute",
          left: 760,
          top: 450,
          width: 1000,
          padding: "36px 40px",
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 26, color: color.ink2 }}>
          Same link, a second device
        </div>
        <div
          className="no"
          style={{
            marginTop: 24,
            background: "#fdecec",
            color: RED,
            borderRadius: 16,
            padding: "24px 28px",
            fontFamily: sans,
            fontSize: 36,
            lineHeight: 1.35,
          }}
        >
          This link is already being used on another device, and it only works
          on one.
        </div>
      </div>
      <div
        className="exp"
        style={{
          position: "absolute",
          left: 760,
          top: 760,
          fontFamily: serif,
          fontWeight: 600,
          fontSize: 52,
        }}
      >
        Expires after <span style={{ color: color.signal }}>7 days</span>
      </div>
    </div>
  );
};

const Take: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".win", { y: 80, opacity: 0, duration: 0.8 }, 0.2)
      .from(".m", { opacity: 0.25, stagger: 1.6, duration: 0.5 }, 0.7)
      .from(".arrow", { scaleX: 0, stagger: 1.6, duration: 0.5 }, 1.9)
      .from(".tick", { scale: 0, duration: 0.4, ease: "back.out(3)" }, 1.3)
      .from(".perm", { x: -20, opacity: 0, stagger: 0.3, duration: 0.4 }, 2.5)
      .to(
        ".recdot",
        {
          opacity: 0.25,
          duration: 0.5,
          repeat: 5,
          yoyo: true,
          ease: "sine.inOut",
        },
        3.9,
      );
  });
  const mini: React.CSSProperties = {
    width: 450,
    height: 380,
    flex: "none",
    background: color.paper,
    borderRadius: 18,
    padding: "30px 30px",
    fontFamily: sans,
    fontSize: 32,
  };
  const h = (t: string) => (
    <div
      style={{
        fontFamily: serif,
        fontWeight: 600,
        fontSize: 40,
        marginBottom: 22,
      }}
    >
      {t}
    </div>
  );
  return (
    <div ref={ref} style={fill}>
      <Head n={5} title="They take the test" />
      <div
        className="win"
        style={{
          ...panel,
          position: "absolute",
          left: 140,
          top: 320,
          width: 1640,
          padding: "26px 34px 34px",
        }}
      >
        <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
          {["#e5484d", "#f5a623", "#30a46c"].map((c) => (
            <div
              key={c}
              style={{ width: 18, height: 18, borderRadius: 9, background: c }}
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div className="m" style={mini}>
            {h("Before you start")}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  border: `3px solid ${color.signal}`,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <span
                  className="tick"
                  style={{ color: color.signal, fontSize: 30, fontWeight: 600 }}
                >
                  ✓
                </span>
              </div>
              I agree to take part
            </div>
            <div
              style={{
                marginTop: 30,
                border: `2px solid ${color.rule}`,
                borderRadius: 12,
                padding: "14px 18px",
                color: color.ink2,
                fontSize: 28,
              }}
            >
              Your name (optional)
            </div>
          </div>
          <Arrow w={60} />
          <div className="m" style={mini}>
            {h("Share")}
            {["Screen", "Microphone"].map((p) => (
              <div
                key={p}
                className="perm"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "14px 0",
                  borderTop: `2px solid ${color.rule}`,
                }}
              >
                {p}
                <span style={{ color: GREEN, fontWeight: 500 }}>✓ Allowed</span>
              </div>
            ))}
          </div>
          <Arrow w={60} />
          <div className="m" style={mini}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: "#e5484d",
                fontSize: 26,
                fontWeight: 500,
                marginBottom: 12,
              }}
            >
              <span
                className="recdot"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: "#e5484d",
                }}
              />
              Recording
            </div>
            {h("Task 1 of 2")}
            <div style={{ color: color.ink2, marginBottom: 20 }}>
              Find the savings rate
            </div>
            <div style={{ width: 390, overflow: "hidden" }}>
              <Bars seed="t" tint={color.signal} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Scale: React.FC<{
  n: number;
  pick: number;
  cls: string;
  size: number;
}> = ({ n, pick, cls, size }) => (
  <div style={{ display: "flex", gap: 14, margin: "26px 0 12px" }}>
    {Array.from({ length: n }, (_, i) => (
      <div
        key={i}
        className={i + 1 === pick ? cls : ""}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          border: `3px solid ${color.rule}`,
          display: "grid",
          placeItems: "center",
          fontFamily: sans,
          fontSize: 32,
          color: color.ink2,
          background: color.sheet,
        }}
      >
        {i + 1}
      </div>
    ))}
  </div>
);
const Rate: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".q", { y: 60, opacity: 0, stagger: 0.25, duration: 0.7 }, 0.2)
      .to(
        ".pick",
        {
          backgroundColor: color.signal,
          borderColor: color.signal,
          color: "#fff",
          scale: 1.15,
          duration: 0.35,
          ease: "back.out(3)",
        },
        1.3,
      )
      .to(
        ".pick2",
        {
          backgroundColor: color.signal,
          borderColor: color.signal,
          color: "#fff",
          scale: 1.15,
          duration: 0.35,
          ease: "back.out(3)",
        },
        3.6,
      );
  });
  const ends = (a: string, b: string) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontFamily: sans,
        fontSize: 26,
        color: color.ink2,
      }}
    >
      <span>{a}</span>
      <span>{b}</span>
    </div>
  );
  return (
    <div ref={ref} style={fill}>
      <Head n={6} title="Rate and answer" />
      <div style={{ ...row, top: 330, alignItems: "stretch", gap: 40 }}>
        <div
          className="q"
          style={{ ...panel, padding: "36px 40px", width: 860 }}
        >
          <div style={{ ...chip, width: "fit-content" }}>after each task</div>
          <div
            style={{
              fontFamily: serif,
              fontWeight: 600,
              fontSize: 44,
              marginTop: 20,
            }}
          >
            Overall, how difficult or easy was that task?
          </div>
          <Scale n={7} pick={6} cls="pick" size={88} />
          {ends("1 = Very difficult", "7 = Very easy")}
        </div>
        <div className="q" style={{ ...panel, padding: "36px 40px", flex: 1 }}>
          <div style={{ ...chip, width: "fit-content" }}>
            at the end · 3 of 10
          </div>
          <div
            style={{
              fontFamily: serif,
              fontWeight: 600,
              fontSize: 44,
              marginTop: 20,
            }}
          >
            I thought the app was easy to use.
          </div>
          <Scale n={5} pick={4} cls="pick2" size={88} />
          {ends("Strongly disagree", "Strongly agree")}
        </div>
      </div>
    </div>
  );
};

const Pieces: React.FC = () => {
  const fly = {
    x: (i: number) => 880 - i * 96,
    opacity: 0,
    scale: 0.6,
    ease: "power2.in",
  };
  const ref = useTimeline((tl) => {
    headIn(tl)
      .from(".end", { y: 60, opacity: 0, stagger: 0.2, duration: 0.7 }, 0.2)
      .from(
        ".a",
        { scale: 0, stagger: 0.12, duration: 0.3, ease: "back.out(3)" },
        0.6,
      )
      .to(".a", { ...fly, stagger: 0.3, duration: 0.7 }, 1.0)
      .to(".on1", { opacity: 0, duration: 0.3 }, 2.2)
      .to(".off", { opacity: 1, duration: 0.3 }, 2.2)
      .to(
        ".wire",
        { backgroundColor: "#e5484d", opacity: 0.35, duration: 0.3 },
        2.2,
      )
      .to(".b", { opacity: 1, stagger: 0.25, duration: 0.3 }, 2.4)
      .to(".off", { opacity: 0, duration: 0.3 }, 3.8)
      .to(".on2", { opacity: 1, duration: 0.3 }, 3.8)
      .to(
        ".wire",
        { backgroundColor: color.rule, opacity: 1, duration: 0.3 },
        3.8,
      )
      .to(".b", { ...fly, stagger: 0.15, duration: 0.6 }, 3.9);
  });
  const tile = (cls: string, k: number) => (
    <div
      key={cls + k}
      className={cls}
      style={{
        position: "absolute",
        left: 600 + k * 96,
        top: 488,
        width: 84,
        height: 84,
        borderRadius: 14,
        background: color.signal,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontFamily: mono,
        fontSize: 26,
        opacity: cls === "b" ? 0 : 1,
      }}
    >
      5 s
    </div>
  );
  const pill = (
    cls: string,
    t: string,
    fg: string,
    bg: string,
    hidden = true,
  ) => (
    <div
      className={cls}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 700,
        display: "flex",
        justifyContent: "center",
        opacity: hidden ? 0 : 1,
      }}
    >
      <span
        style={{
          fontFamily: sans,
          fontSize: 38,
          fontWeight: 500,
          color: fg,
          background: bg,
          borderRadius: 999,
          padding: "12px 30px",
        }}
      >
        {t}
      </span>
    </div>
  );
  return (
    <div ref={ref} style={fill}>
      <Head n={7} title="Saved as they go" />
      <div
        className="wire"
        style={{
          position: "absolute",
          left: 560,
          width: 800,
          top: 528,
          height: 4,
          background: color.rule,
        }}
      />
      <div style={{ ...row, top: 380, justifyContent: "space-between" }}>
        {card(
          "Their browser",
          <>
            <span className="recdot" style={{ color: "#e5484d" }}>
              ●{" "}
            </span>
            recording
          </>,
          "end",
          420,
        )}
        {card("Relay", "pieces arrive in order", "end", 420, true)}
      </div>
      {[0, 1, 2].map((k) => tile("a", k))}
      {[0, 1, 2].map((k) => tile("b", k))}
      {pill("on1", "Online", GREEN, "#e3f3e6", false)}
      {pill(
        "off",
        "Offline · 3 pieces waiting on the device",
        "#8a4b00",
        "#fff4e0",
      )}
      {pill("on2", "Back online · sending", GREEN, "#e3f3e6")}
    </div>
  );
};

const Import: React.FC = () => {
  const ref = useTimeline((tl) => {
    headIn(tl);
    askIn(tl, 0.4)
      .from(".box", { y: 60, opacity: 0, stagger: 0.2, duration: 0.7 }, 0.8)
      .to(
        ".sess",
        { x: 880, stagger: 0.25, duration: 0.9, ease: "power3.inOut" },
        2.6,
      )
      .from(".gone", { opacity: 0, y: 20, duration: 0.5 }, 3.8);
  });
  return (
    <div ref={ref} style={fill}>
      <Head n={8} title="Import the sessions" />
      <Ask
        text="Import the finished sessions."
        style={{ position: "absolute", left: 140, top: 330 }}
      />
      <div
        className="box"
        style={{
          ...panel,
          position: "absolute",
          left: 140,
          top: 470,
          width: 560,
          height: 400,
          padding: "30px 36px",
          borderColor: color.signal,
        }}
      >
        <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 44 }}>
          Relay
        </div>
        <div
          className="gone"
          style={{
            position: "absolute",
            left: 36,
            bottom: 34,
            fontFamily: sans,
            fontSize: 32,
            color: color.ink2,
          }}
        >
          Empty: deleted after import
        </div>
      </div>
      <div
        className="box"
        style={{
          ...panel,
          position: "absolute",
          left: 1020,
          top: 470,
          width: 760,
          height: 400,
          padding: "30px 36px",
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 38, color: color.signalInk }}>
          savings-v1/sessions/
        </div>
      </div>
      {["P1 · 14 min", "P2 · 11 min", "P3 · 16 min"].map((s, i) => (
        <div
          key={s}
          className="sess"
          style={{
            position: "absolute",
            left: 176,
            top: 560 + i * 88,
            width: 480,
            background: color.signalSoft,
            borderRadius: 12,
            padding: "14px 22px",
            fontFamily: sans,
            fontSize: 32,
          }}
        >
          {s}{" "}
          <span style={{ color: color.ink2, fontSize: 26 }}>
            · screen, voice, clicks
          </span>
        </div>
      ))}
    </div>
  );
};

const Outro = () => (
  <Title
    big="Then analyse and synthesise."
    size={150}
    lines={[
      "Your unmoderated test is done.",
      "Next: the synthesis video · docs/guide.html",
    ]}
  />
);

const pops = (from: number, n: number, gap: number, v = 0.35): Fx =>
  Array.from({ length: n }, (_, k) => ["pop", from + k * gap, v]);
export const { Video: Unmoderated, duration: unmodDuration } = narrated(
  [
    {
      line: UNMOD[0],
      C: Intro,
      dark: true,
      min: 3.4,
      sfx: [["impact", 0, 0.5]],
    },
    {
      line: UNMOD[1],
      C: Relay,
      min: 7.6,
      sfx: [
        ["whoosh", 0.3, 0.35],
        ...pops(0.3, 3, 0.25),
        ["whoosh", 1.1, 0.3],
        ["click", 1.8, 0.45],
        ["chime", 4.4, 0.35],
      ],
    },
    {
      line: UNMOD[2],
      C: Plan,
      min: 6,
      sfx: [
        ["pop", 0.5, 0.45],
        ["whoosh", 3.6, 0.35],
        ...pops(3.6, 3, 0.25, 0.3),
      ],
    },
    {
      line: UNMOD[3],
      C: Build,
      min: 5,
      sfx: [
        ...pops(0.3, 3, 0.7),
        ["whoosh", 0.8, 0.3],
        ["whoosh", 1.5, 0.3],
        ...pops(3.4, 4, 0.18, 0.25),
      ],
    },
    {
      line: UNMOD[4],
      C: Link,
      min: 5.2,
      sfx: [
        ["pop", 0.3, 0.4],
        ["whoosh", 0.8, 0.3],
        ["whoosh", 1.6, 0.3],
        ["impact", 2.2, 0.35],
        ["chime", 3.0, 0.35],
      ],
    },
    {
      line: UNMOD[5],
      C: Take,
      min: 5.6,
      sfx: [
        ["whoosh", 0.2, 0.35],
        ["click", 1.3, 0.5],
        ["pop", 2.5, 0.35],
        ["pop", 2.8, 0.35],
        ["pop", 3.9, 0.35],
      ],
    },
    {
      line: UNMOD[6],
      C: Rate,
      min: 5,
      sfx: [
        ["whoosh", 0.2, 0.35],
        ["click", 1.3, 0.5],
        ["click", 3.6, 0.5],
      ],
    },
    {
      line: UNMOD[7],
      C: Pieces,
      min: 5.4,
      sfx: [
        ...pops(1.0, 3, 0.3, 0.3),
        ["click", 2.2, 0.45],
        ["chime", 3.8, 0.35],
        ...pops(3.9, 3, 0.15, 0.25),
      ],
    },
    {
      line: UNMOD[8],
      C: Import,
      min: 5.4,
      sfx: [
        ["pop", 0.4, 0.45],
        ["whoosh", 0.8, 0.3],
        ["whoosh", 2.6, 0.4],
        ["chime", 3.8, 0.35],
      ],
    },
    { line: UNMOD[9], C: Outro, dark: true, min: 4, sfx: [["impact", 0, 0.5]] },
  ],
  "unmoderated",
);
