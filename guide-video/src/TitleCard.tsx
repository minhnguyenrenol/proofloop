import type React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, mono, sans, serif } from "./theme";

export type TitleCardProps = {
  readonly title: string;
  readonly line: string;
  readonly foot: string;
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Opening and closing card: one big line, one supporting line, one reference.
export const TitleCard: React.FC<TitleCardProps> = ({ title, line, foot }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: color.paper, color: color.ink, fontFamily: sans, padding: "0 160px", justifyContent: "center" }}>
      <h1
        style={{
          fontFamily: serif, fontWeight: 600, fontSize: 168, lineHeight: 0.98, letterSpacing: "-0.035em", margin: 0, maxWidth: 1400,
          opacity: interpolate(frame, [0, 0.7 * fps], [0, 1], { ...clamp, easing: ease }),
          translate: interpolate(frame, [0, 0.9 * fps], ["0px 50px", "0px 0px"], { ...clamp, easing: ease }),
        }}
      >
        {title}
      </h1>
      <div style={{ width: interpolate(frame, [0.5 * fps, 1.3 * fps], [0, 220], { ...clamp, easing: ease }), height: 8, backgroundColor: color.signal, margin: "56px 0 44px", borderRadius: 4 }} />
      <p style={{ fontSize: 54, lineHeight: 1.35, color: color.ink2, margin: 0, maxWidth: 1300, opacity: interpolate(frame, [0.7 * fps, 1.3 * fps], [0, 1], { ...clamp, easing: ease }) }}>
        {line}
      </p>
      <p style={{ fontFamily: mono, fontSize: 36, color: color.signalInk, margin: "56px 0 0", opacity: interpolate(frame, [1.2 * fps, 1.8 * fps], [0, 1], clamp) }}>
        {foot}
      </p>
    </AbsoluteFill>
  );
};
