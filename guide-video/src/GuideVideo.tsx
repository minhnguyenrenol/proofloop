import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { useVideoConfig } from "remotion";
import { StepScene } from "./StepScene";
import { TitleCard } from "./TitleCard";

// 11 steps, the same as docs/guide.html. Each scene is its own JSX node so its
// text and timing can be edited in Remotion Studio.
export const GUIDE_DURATION = 120 + 11 * 165 + 150 - 12 * 12;

export const GuideVideo: React.FC = () => {
  const { fps } = useVideoConfig();
  const t = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Opening" durationInFrames={120} premountFor={fps}>
        <TitleCard title="How to use ProofLoop" line="Run user tests from inside Claude Code or Cursor, in 11 steps." foot="github.com/minhnguyenrenol/proofloop" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="1 Install" durationInFrames={165} premountFor={fps}>
        <StepScene step={1} title="Install the plugin" saidIn="Claude Code" terminal say={"/plugin marketplace add\n  minhnguyenrenol/proofloop\n/plugin install proofloop@proofloop"} detail="Needs Node.js 20 and FFmpeg. In Cursor, add the same GitHub repo as a plugin." skill="(plugin install)" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="2 Set up" durationInFrames={165} premountFor={fps}>
        <StepScene step={2} title="Set up your folder" saidIn="Say to Claude" say="Set up ProofLoop for this project." detail="Answer a few questions: where recordings live, device and backup, and whether you'll test on a link." skill="research-setup" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="3 Context" durationInFrames={165} premountFor={fps}>
        <StepScene step={3} title="Add product context" saidIn="Say to Claude" say="Add product context from the docs in ./product-docs." detail="Vision, problem, personas and journeys on one page, every line sourced." skill="add-context" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="4 Plan" durationInFrames={165} premountFor={fps}>
        <StepScene step={4} title="Plan the study" saidIn="Say to Claude" say="Plan an unmoderated test of this Figma prototype." detail="You get study.yaml, consent text and a guide. Leading wording is flagged." skill="plan-study" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="5 Run" durationInFrames={165} premountFor={fps}>
        <StepScene step={5} title="Run the sessions" saidIn="Say to Claude" say="Run a moderated session with P1." detail="The Studio records your Zoom, Meet or Teams call. Or send each person their own test link." skill="run-session · build-runner" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="6 Import" durationInFrames={165} premountFor={fps}>
        <StepScene step={6} title="Import sessions" saidIn="Say to Claude" say="Import the finished sessions." detail="Link sessions come down from the relay, then are deleted there." skill="import-sessions" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="7 Analyse" durationInFrames={165} premountFor={fps}>
        <StepScene step={7} title="Analyse sessions" saidIn="Say to Claude" say="Analyse the sessions." detail="Redacted first. Every quote must match the transcript word for word." skill="analyse-sessions" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="8 Synthesise" durationInFrames={165} premountFor={fps}>
        <StepScene step={8} title="Group on the board" saidIn="Say to Claude" say="Synthesise the study." detail="Finish the affinity map on the drag-and-drop board, then mark it done." skill="synthesise-study" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="9 Review" durationInFrames={165} premountFor={fps}>
        <StepScene step={9} title="Review findings" saidIn="Say to Claude" say="Walk me through the findings." detail="Accept, edit or reject each one. Only accepted findings reach the report." skill="review-findings" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="10 Feed back" durationInFrames={165} premountFor={fps}>
        <StepScene step={10} title="Feed back, re-test" saidIn="Say to Claude" say="Update the product context and plan a re-test." detail="Before-and-after changes to personas and journeys, each linked to evidence." skill="update-context · plan-retest" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="11 Clean up" durationInFrames={165} premountFor={fps}>
        <StepScene step={11} title="Clean up" saidIn="Say to Claude" say="Run retention cleanup for this study." detail="Recordings go after 90 days. You see what will be deleted first." skill="cleanup" />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence name="Closing" durationInFrames={150} premountFor={fps}>
        <TitleCard title="That's one study." line="The full written guide, with every prompt to copy, is in docs/guide.html." foot="github.com/minhnguyenrenol/proofloop" />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
