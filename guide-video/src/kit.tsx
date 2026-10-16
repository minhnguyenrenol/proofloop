// Shared building blocks for the explainer and how-to videos.
// GSAP drives the motion: each scene builds one paused timeline, and Remotion
// seeks it to the current frame, so every render is frame-exact.
import type React from "react";
import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { lightLeak } from "@remotion/effects/light-leak";
import {
  AbsoluteFill,
  interpolate,
  random,
  Sequence,
  Solid,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio } from "@remotion/media";
import { color, sans, serif } from "./theme";

export { gsap };

// Build a paused GSAP timeline scoped to the returned ref, seeked to the current frame.
export function useTimeline<T extends HTMLElement = HTMLDivElement>(
  build: (tl: gsap.core.Timeline) => void,
) {
  const scope = useRef<T>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const t = gsap.timeline({
        paused: true,
        defaults: { ease: "expo.out", duration: 0.9 },
      });
      build(t);
      tl.current = t;
    }, scope);
    return () => ctx.revert();
    // The timeline is built once per mount; the frame seek below drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    tl.current?.seek(frame / fps, false);
  }, [frame, fps]);
  return scope;
}

// Split text into words wrapped for staggered reveals (class "w").
export const Words: React.FC<{ text: string; style?: React.CSSProperties }> = ({
  text,
  style,
}) => (
  <span style={style}>
    {text.split(" ").map((w, i) => (
      <span
        key={i}
        style={{
          display: "inline-block",
          overflow: "hidden",
          verticalAlign: "top",
          paddingBottom: "0.08em",
        }}
      >
        <span className="w" style={{ display: "inline-block" }}>
          {w}&nbsp;
        </span>
      </span>
    ))}
  </span>
);

// Fine film grain over everything, so flat colour reads as filmed rather than flat.
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.06 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{ pointerEvents: "none", mixBlendMode: "multiply", opacity }}
    >
      <svg width="100%" height="100%">
        <filter id="grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            seed={Math.floor(random(`g${frame % 8}`) * 1000)}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};

// A light leak that blooms and fades over its own duration, for scene cuts.
export const Leak: React.FC<{ seed?: number; hueShift?: number }> = ({
  seed = 0,
  hueShift = 210,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, height, width, fps } = useVideoConfig();
  return (
    <Solid
      width={width}
      height={height}
      premountFor={fps}
      effects={[
        lightLeak({
          seed,
          hueShift,
          progress: interpolate(frame, [0, durationInFrames - 1], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }),
      ]}
    />
  );
};

// Narration caption: the current line, bottom centre, readable with the sound off.
export const Caption: React.FC<{ text: string; dark?: boolean }> = ({
  text,
  dark,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 56,
        display: "flex",
        justifyContent: "center",
        opacity: interpolate(frame, [0.2 * fps, 0.5 * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      <div
        style={{
          maxWidth: 1500,
          textAlign: "center",
          fontFamily: sans,
          fontSize: 34,
          lineHeight: 1.35,
          padding: "10px 22px",
          borderRadius: 12,
          color: dark ? "#f2f1ec" : color.ink,
          background: dark ? "rgba(0,0,0,0.45)" : "rgba(255,254,251,0.86)",
        }}
      >
        {text}
      </div>
    </div>
  );
};

// Big serif headline style shared by both videos.
export const display = (
  size: number,
  tint = color.ink,
): React.CSSProperties => ({
  fontFamily: serif,
  fontWeight: 600,
  fontSize: size,
  lineHeight: 1.02,
  letterSpacing: "-0.035em",
  margin: 0,
  color: tint,
});

// Scene length from narration: audio length plus breathing room, in frames.
export const sceneFrames = (seconds: number, fps: number, tail = 0.7) =>
  Math.ceil((seconds + tail) * fps);

// A sound effect that plays `at` frames into its scene.
export const Sfx: React.FC<{
  name: "whoosh" | "pop" | "click" | "type" | "impact" | "chime";
  at: number;
  volume?: number;
}> = ({ name, at, volume = 0.5 }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence
      from={Math.round(at)}
      durationInFrames={Math.round(1.5 * fps)}
      premountFor={fps}
    >
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
};

// Music level that dips under the narration: `voiced` lists [start, end] frames where someone speaks.
export const duck =
  (voiced: [number, number][], total: number, full = 0.34, under = 0.11) =>
  (f: number) => {
    const fadeIO = Math.min(1, f / 20, (total - f) / 45);
    // Down while someone speaks (with a short lead-in and release), back up in the gaps.
    // Frames outside the nearest spoken span; inside it the distance is 0.
    const dist = voiced.reduce(
      (m, [a, b]) => Math.min(m, f < a ? a - f : f > b ? f - b : 0),
      999,
    );
    const k = Math.min(1, Math.max(0, (dist - 2) / 8)); // 8-frame ramp
    return Math.max(0, (under + (full - under) * k) * fadeIO);
  };
