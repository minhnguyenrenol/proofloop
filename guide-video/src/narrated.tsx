// Builds a narrated video from scenes: each scene lasts as long as its voice
// line (or its minimum), with captions, synced sound effects, slide
// transitions, and music that dips under the voice.
import type React from "react";
import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, staticFile, useVideoConfig } from "remotion";
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
import { fill, INK } from "./HowToV2";
import { hasVoice, type Line, voSeconds } from "./script";
import { color, mono, sans } from "./theme";

export type Fx = [Parameters<typeof Sfx>[0]["name"], number, number?][];
export type Scene = {
  line: Line;
  C: React.FC;
  dark?: boolean;
  min: number;
  sfx?: Fx;
};

const T = 15; // slide transition frames

// Small shared pieces for the step scenes.
export const chip: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 28,
  color: color.signalInk,
  background: color.signalSoft,
  padding: "6px 14px",
  borderRadius: 10,
  whiteSpace: "nowrap",
};
export const Ask: React.FC<{ text: string; style?: React.CSSProperties }> = ({
  text,
  style,
}) => (
  <div
    className="ask"
    style={{
      width: "fit-content",
      background: color.signal,
      color: "#fff",
      fontFamily: sans,
      fontSize: 44,
      padding: "18px 32px",
      borderRadius: "28px 28px 6px 28px",
      ...style,
    }}
  >
    {text}
  </div>
);
export const askIn = (tl: gsap.core.Timeline, at: number) =>
  tl.from(
    ".ask",
    {
      scale: 0.8,
      opacity: 0,
      transformOrigin: "right center",
      duration: 0.5,
      ease: "back.out(2)",
    },
    at,
  );
// Arrow drawn left to right (class "arrow"), for flows laid out in a row.
export const Arrow: React.FC<{ w?: number }> = ({ w = 90 }) => (
  <div
    className="arrow"
    style={{
      position: "relative",
      width: w,
      height: 6,
      flex: "none",
      background: color.ink2,
      borderRadius: 3,
      transformOrigin: "left center",
    }}
  >
    <div
      style={{
        position: "absolute",
        right: -6,
        top: -9,
        borderLeft: `18px solid ${color.ink2}`,
        borderTop: "12px solid transparent",
        borderBottom: "12px solid transparent",
      }}
    />
  </div>
);

// Dark opening and closing card: a big line, then supporting lines.
export const Title: React.FC<{
  big: string;
  lines: string[];
  size?: number;
}> = ({ big, lines, size = 170 }) => {
  const ref = useTimeline((tl) => {
    tl.from(".w", { yPercent: 110, stagger: 0.08, duration: 0.9 }, 0.1).from(
      ".l",
      { y: 30, opacity: 0, stagger: 0.15, duration: 0.7 },
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
      <h1 style={display(size, "#f2f1ec")}>
        <Words text={big} />
      </h1>
      {lines.map((l, i) => (
        <div
          key={l}
          className="l"
          style={{
            fontFamily: i ? mono : sans,
            fontSize: i ? 40 : 58,
            color: i ? "#8ab4f8" : "#b4b3ab",
            marginTop: i ? 14 : 36,
          }}
        >
          {l}
        </div>
      ))}
    </div>
  );
};

export function narrated(scenes: Scene[], music: string) {
  const framesOf = (i: number, fps: number) =>
    sceneFrames(Math.max(voSeconds(scenes[i].line), scenes[i].min), fps);
  const duration = (fps: number) =>
    scenes.reduce((n, _, i) => n + framesOf(i, fps), 0) -
    T * (scenes.length - 1);
  const voiced = (fps: number): [number, number][] => {
    let st = 0;
    return scenes.map((sc, i) => {
      const span: [number, number] = [
        st,
        st + Math.ceil(voSeconds(sc.line) * fps),
      ];
      st += framesOf(i, fps) - T;
      return span;
    });
  };
  const Video: React.FC = () => {
    const { fps, durationInFrames } = useVideoConfig();
    return (
      <AbsoluteFill style={{ background: "#111110" }}>
        <TransitionSeries>
          {scenes.flatMap(({ line, C, dark, sfx = [] }, i) => {
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
                {sfx.map(([n, at, v], k) => (
                  <Sfx key={k} name={n} at={at * fps} volume={v ?? 0.45} />
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
          src={staticFile(`music/${music}.wav`)}
          volume={duck(voiced(fps), durationInFrames, 0.3, 0.1)}
        />
        <Grain />
      </AbsoluteFill>
    );
  };
  return { Video, duration };
}
