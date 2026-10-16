import type React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, mono, sans, serif, TOTAL_STEPS } from "./theme";

export type StepProps = {
  readonly step: number;
  readonly title: string;
  readonly saidIn: string; // where you type it: "Say to Claude", "Claude Code", "Terminal"
  readonly say: string;
  readonly detail: string;
  readonly skill: string;
  readonly terminal?: boolean;
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// One step of the guide: the number and progress on the left; what to do on the right.
export const StepScene: React.FC<StepProps> = ({ step, title, saidIn, say, detail, skill, terminal }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // The prompt types itself out, so the viewer reads what to say at typing pace.
  const typed = Math.round(interpolate(frame, [0.6 * fps, 0.6 * fps + say.length * 0.9], [0, say.length], clamp));

  return (
    <AbsoluteFill style={{ backgroundColor: color.paper, fontFamily: sans, color: color.ink, flexDirection: "row" }}>
      <div style={{ width: 520, padding: "120px 0 110px 120px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div
          style={{
            fontFamily: serif, fontSize: 300, lineHeight: 0.85, color: color.signal, letterSpacing: "-0.04em",
            opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], { ...clamp, easing: ease }),
            translate: interpolate(frame, [0, 0.7 * fps], ["0px 40px", "0px 0px"], { ...clamp, easing: ease }),
          }}
        >
          {step}
        </div>
        <div>
          <div style={{ fontSize: 30, color: color.ink2, marginBottom: 18 }}>Step {step} of {TOTAL_STEPS}</div>
          <div style={{ display: "flex", gap: 10 }}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div key={i} style={{ width: 22, height: 6, borderRadius: 3, backgroundColor: i < step ? color.signal : color.rule }} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: "130px 140px 110px 60px", display: "flex", flexDirection: "column" }}>
        <h1
          style={{
            fontFamily: serif, fontWeight: 600, fontSize: 104, lineHeight: 1.04, letterSpacing: "-0.025em", margin: 0, maxWidth: 1100,
            opacity: interpolate(frame, [0.15 * fps, 0.75 * fps], [0, 1], { ...clamp, easing: ease }),
            translate: interpolate(frame, [0.15 * fps, 0.9 * fps], ["0px 36px", "0px 0px"], { ...clamp, easing: ease }),
          }}
        >
          {title}
        </h1>

        <div
          style={{
            marginTop: 56, maxWidth: 1080, borderRadius: 20, overflow: "hidden", border: `2px solid ${terminal ? color.codeBg : color.rule}`,
            backgroundColor: terminal ? color.codeBg : color.sheet,
            opacity: interpolate(frame, [0.4 * fps, 0.9 * fps], [0, 1], { ...clamp, easing: ease }),
          }}
        >
          <div style={{ padding: "16px 28px", fontSize: 28, color: terminal ? "#b4b3ab" : color.ink2, borderBottom: `2px solid ${terminal ? "#3a3a36" : color.rule}` }}>
            {saidIn}
          </div>
          <div style={{ padding: "26px 28px 30px", fontFamily: mono, fontSize: 44, lineHeight: 1.4, whiteSpace: "pre-wrap", color: terminal ? color.codeInk : color.ink, minHeight: 2 * 44 * 1.4 + 56 }}>
            {say.slice(0, typed)}
            <span style={{ display: "inline-block", width: 24, height: 46, marginLeft: 4, translate: "0px 8px", backgroundColor: terminal ? color.codeInk : color.signal, opacity: typed < say.length || Math.floor(frame / 15) % 2 === 0 ? 1 : 0 }} />
          </div>
        </div>

        <p
          style={{
            fontSize: 44, lineHeight: 1.4, color: color.ink2, margin: "48px 0 0", maxWidth: 1080,
            opacity: interpolate(frame, [1.6 * fps, 2.2 * fps], [0, 1], { ...clamp, easing: ease }),
          }}
        >
          {detail}
        </p>

        <div style={{ marginTop: "auto", fontFamily: mono, fontSize: 30, color: color.ink2, opacity: interpolate(frame, [2 * fps, 2.5 * fps], [0, 1], clamp) }}>
          Skill: {skill}
        </div>
      </div>
    </AbsoluteFill>
  );
};
