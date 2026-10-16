// ProofLoop explainer: the problem, what ProofLoop is, how the loop works, why
// the findings can be trusted, privacy, and how to start. Text-led so it works
// muted. Each scene is its own component and its own JSX node in the timeline.
import type React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { StepScene } from "./StepScene";
import { TitleCard } from "./TitleCard";
import { color, mono, sans, serif } from "./theme";

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
// Opacity and lift for something that enters at frame `at`.
const enter = (frame: number, at: number, len = 18): React.CSSProperties => ({
  opacity: interpolate(frame, [at, at + len], [0, 1], { ...clamp, easing: ease }),
  translate: interpolate(frame, [at, at + len + 6], ["0px 28px", "0px 0px"], { ...clamp, easing: ease }),
});
const page: React.CSSProperties = { backgroundColor: color.paper, color: color.ink, fontFamily: sans, padding: "120px 160px" };
const headline: React.CSSProperties = { fontFamily: serif, fontWeight: 600, fontSize: 112, lineHeight: 1.03, letterSpacing: "-0.03em", margin: 0, maxWidth: 1500 };
const support: React.CSSProperties = { fontSize: 50, lineHeight: 1.35, color: color.ink2, margin: 0, maxWidth: 1400 };

const Check: React.FC<{ ok: boolean; size?: number }> = ({ ok, size = 56 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill={ok ? "#146c2e" : "#b3261e"} />
    {ok ? <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      : <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />}
  </svg>
);

// 1. The problem
export const ProblemScene: React.FC = () => {
  const f = useCurrentFrame();
  const pains = ["Watching every recording again", "Quotes copied out of context", "Findings nobody can check"];
  return (
    <AbsoluteFill style={{ ...page, justifyContent: "center" }}>
      <h1 style={{ ...headline, ...enter(f, 0) }}>User tests give you hours of video.</h1>
      <h1 style={{ ...headline, color: color.signal, marginTop: 18, ...enter(f, 30) }}>Turning them into decisions takes days.</h1>
      <div style={{ display: "flex", gap: 56, marginTop: 80 }}>
        {pains.map((p, i) => (
          <div key={p} style={{ fontSize: 42, color: color.ink2, borderTop: `3px solid ${color.ink}`, paddingTop: 20, width: 440, ...enter(f, 70 + i * 14) }}>{p}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// 2. The loop: each stage lights up in turn and the ring closes back to the start.
const STAGES = [
  ["Plan", "Tasks and consent, drafted from your goal"],
  ["Run", "Moderated calls, or a test link"],
  ["Analyse", "Observations tied to evidence"],
  ["Synthesise", "An affinity map you finish"],
  ["Review", "You accept each finding"],
  ["Feed back", "Personas, journeys, the prototype"],
] as const;
export const LoopScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cx = 600; const cy = 470; const r = 320;
  const per = 1.1 * fps; const start = 0.8 * fps;
  const active = Math.floor((f - start) / per);
  return (
    <AbsoluteFill style={{ ...page, flexDirection: "row", alignItems: "center", gap: 40 }}>
      <svg width={1120} height={940} viewBox="0 0 1120 940" style={{ flex: "none", marginLeft: -150 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color.rule} strokeWidth={6} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color.signal} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={2 * Math.PI * r} transform={`rotate(-90 ${cx} ${cy})`}
          strokeDashoffset={interpolate(f, [start, start + STAGES.length * per], [2 * Math.PI * r, 0], clamp)} />
        {STAGES.map(([name], i) => {
          const a = (i / STAGES.length) * 2 * Math.PI - Math.PI / 2;
          const x = cx + r * Math.cos(a); const y = cy + r * Math.sin(a);
          const on = active >= i;
          const right = Math.cos(a) >= -0.01;
          return (
            <g key={name} opacity={interpolate(f, [i * 4, i * 4 + 14], [0, 1], clamp)}>
              <circle cx={x} cy={y} r={on ? 26 : 20} fill={on ? color.signal : color.sheet} stroke={on ? color.signal : color.ink2} strokeWidth={4} />
              <text x={x + (right ? 48 : -48)} y={y + 16} textAnchor={right ? "start" : "end"}
                style={{ fontFamily: serif, fontWeight: 600, fontSize: 52, fill: on ? color.ink : color.ink2 }}>{name}</text>
            </g>
          );
        })}
        <text x={cx} y={cy + 18} textAnchor="middle" style={{ fontFamily: serif, fontWeight: 600, fontSize: 64, fill: color.ink }}>ProofLoop</text>
      </svg>
      <div style={{ flex: 1 }}>
        <h1 style={{ ...headline, fontSize: 80, ...enter(f, 0) }}>One loop, inside Claude Code or Cursor.</h1>
        <p style={{ ...support, fontSize: 46, marginTop: 40, minHeight: 140, color: color.signalInk }}>
          {active >= 0 && active < STAGES.length ? STAGES[active][1] : active >= STAGES.length ? "Then test again, and see what changed." : ""}
        </p>
      </div>
    </AbsoluteFill>
  );
};

// 3. Evidence: a real quote passes, an invented one is dropped, counts come from code.
export const EvidenceScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = (quote: string, source: string, ok: boolean, at: number) => {
    const judged = f >= at + 1.2 * fps;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 32, background: color.sheet, border: `2px solid ${color.rule}`, borderRadius: 20, padding: "30px 36px", width: 1240, ...enter(f, at) }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: serif, fontSize: 52, lineHeight: 1.2, textDecoration: !ok && judged ? "line-through" : "none", color: !ok && judged ? color.ink2 : color.ink }}>“{quote}”</div>
          <div style={{ fontFamily: mono, fontSize: 30, color: color.ink2, marginTop: 10 }}>{source}</div>
        </div>
        <div style={{ opacity: interpolate(f, [at + 1 * fps, at + 1.3 * fps], [0, 1], clamp), scale: interpolate(f, [at + 1 * fps, at + 1.4 * fps], [0.6, 1], { ...clamp, easing: Easing.spring({ damping: 12 }) }) }}>
          <Check ok={ok} size={84} />
        </div>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ ...page, justifyContent: "center" }}>
      <h1 style={{ ...headline, ...enter(f, 0) }}>Every quote is checked word for word.</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 64 }}>
        {card("I expected the rate on the first screen", "P2 · matches transcript u0002", true, 20)}
        {card("This bank is terrible", "no participant said this · dropped", false, 50)}
      </div>
      <p style={{ ...support, marginTop: 56, ...enter(f, 4 * fps) }}>
        Counts like <span style={{ color: color.ink, fontWeight: 500 }}>“3 of 5 participants”</span> are computed in code, never written by the AI.
      </p>
    </AbsoluteFill>
  );
};

// 4. Privacy: the recording stays put; only redacted text reaches the AI.
export const PrivacyScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const swapped = f > 2.2 * fps;
  return (
    <AbsoluteFill style={{ ...page, justifyContent: "center" }}>
      <h1 style={{ ...headline, ...enter(f, 0) }}>Private by design.</h1>
      <div style={{ display: "flex", gap: 40, marginTop: 64, alignItems: "stretch" }}>
        <div style={{ width: 560, borderTop: `3px solid ${color.ink}`, paddingTop: 22, ...enter(f, 16) }}>
          <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 52 }}>Recordings stay put</div>
          <p style={{ ...support, fontSize: 40, marginTop: 12 }}>On your company laptop or drive. Never in git, chat or the AI.</p>
        </div>
        <div style={{ flex: 1, borderTop: `3px solid ${color.ink}`, paddingTop: 22, ...enter(f, 30) }}>
          <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 52 }}>The AI reads redacted text</div>
          <div style={{ fontFamily: mono, fontSize: 38, lineHeight: 1.45, marginTop: 18, padding: "22px 26px", borderRadius: 16, background: swapped ? color.signalSoft : color.sheet, border: `2px solid ${swapped ? color.signal : color.rule}`, color: swapped ? color.signalInk : color.ink }}>
            {swapped ? "Hi, I'm [NAME]. My email is [EMAIL]" : "Hi, I'm Priya. My email is priya@example.com"}
          </div>
        </div>
      </div>
      <p style={{ ...support, marginTop: 56, ...enter(f, 3.4 * fps) }}>No emotion recognition from faces. Feelings come only from people’s own words.</p>
    </AbsoluteFill>
  );
};

// 5. The researcher decides.
export const InChargeScene: React.FC = () => {
  const f = useCurrentFrame();
  const rows = [["Rate is hard to find", "4 of 5", true], ["Fees feel hidden", "2 of 5", true], ["People dislike the colour", "1 of 5", false]] as const;
  return (
    <AbsoluteFill style={{ ...page, justifyContent: "center" }}>
      <h1 style={{ ...headline, ...enter(f, 0) }}>You stay in charge.</h1>
      <p style={{ ...support, marginTop: 24, ...enter(f, 12) }}>You finish the grouping on the board, and accept or reject every finding. Only accepted ones reach the report.</p>
      <div style={{ marginTop: 56, width: 1240 }}>
        {rows.map(([t, n, ok], i) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 28, padding: "22px 0", borderBottom: `2px solid ${color.rule}`, ...enter(f, 40 + i * 16) }}>
            <div style={{ flex: 1, fontFamily: serif, fontSize: 50, color: ok ? color.ink : color.ink2 }}>{t}</div>
            <div style={{ fontFamily: mono, fontSize: 36, color: color.ink2, width: 180 }}>{n}</div>
            <div style={{ opacity: interpolate(f, [70 + i * 16, 82 + i * 16], [0, 1], clamp) }}><Check ok={ok} /></div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// 6. After setup, you just ask.
export const AskScene: React.FC = () => {
  const f = useCurrentFrame();
  const asks = ["Plan a test of this Figma prototype.", "Run a moderated session with P1.", "Import and analyse the sessions.", "Synthesise the study.", "Walk me through the findings."];
  return (
    <AbsoluteFill style={{ ...page, justifyContent: "center" }}>
      <h1 style={{ ...headline, ...enter(f, 0) }}>Then you just ask.</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 56, alignItems: "flex-start" }}>
        {asks.map((a, i) => (
          <div key={a} style={{ fontFamily: mono, fontSize: 42, background: color.sheet, border: `2px solid ${color.rule}`, borderRadius: 18, padding: "18px 28px", ...enter(f, 18 + i * 16) }}>{a}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const EXPLAINER_DURATION = 150 + 120 + 300 + 270 + 210 + 180 + 150 + 150 + 180 + 150 - 9 * 12;

export const Explainer: React.FC = () => {
  const { fps } = useVideoConfig();
  const t = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Problem" durationInFrames={150} premountFor={fps}><ProblemScene /></TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="Meet ProofLoop" durationInFrames={120} premountFor={fps}>
        <TitleCard title="Meet ProofLoop." line="A research copilot that plans, runs and synthesises user tests with you." foot="Claude Code · Cursor" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="Loop" durationInFrames={300} premountFor={fps}><LoopScene /></TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="Evidence" durationInFrames={270} premountFor={fps}><EvidenceScene /></TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="Privacy" durationInFrames={210} premountFor={fps}><PrivacyScene /></TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="In charge" durationInFrames={180} premountFor={fps}><InChargeScene /></TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="Install" durationInFrames={150} premountFor={fps}>
        <StepScene step={1} title="Install the plugin" saidIn="Claude Code" terminal say={"/plugin marketplace add\n  minhnguyenrenol/proofloop\n/plugin install proofloop@proofloop"} detail="Needs Node.js 20 and FFmpeg. In Cursor, add the same GitHub repo as a plugin." skill="(plugin install)" of={0} />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="Set up" durationInFrames={150} premountFor={fps}>
        <StepScene step={2} title="Set up your folder" saidIn="Say to Claude" say="Set up ProofLoop for this project." detail="A few questions: where recordings live, device and backup, and whether you'll test on a link." skill="research-setup" of={0} />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="Ask" durationInFrames={180} premountFor={fps}><AskScene /></TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="Closing" durationInFrames={150} premountFor={fps}>
        <TitleCard title="Test. Learn. Loop." line="Step-by-step guide, with every prompt to copy: docs/guide.html" foot="github.com/minhnguyenrenol/proofloop" />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
