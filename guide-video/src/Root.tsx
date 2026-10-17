import { Composition, Folder } from "remotion";
import { Explainer, EXPLAINER_DURATION } from "./Explainer";
import { ExplainerV2, explainerDuration } from "./ExplainerV2";
import { HowToV2, howtoDuration } from "./HowToV2";
import { GuideVideo, GUIDE_DURATION } from "./GuideVideo";
import { StepScene } from "./StepScene";
import { Synthesis, synthDuration } from "./Synthesis";
import { Unmoderated, unmodDuration } from "./Unmoderated";
import { TitleCard } from "./TitleCard";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Explainer"
        component={ExplainerV2}
        durationInFrames={explainerDuration(30)}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="HowTo"
        component={HowToV2}
        durationInFrames={howtoDuration(30)}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Unmoderated"
        component={Unmoderated}
        durationInFrames={unmodDuration(30)}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Synthesis"
        component={Synthesis}
        durationInFrames={synthDuration(30)}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ProofLoopExplainer"
        component={Explainer}
        durationInFrames={EXPLAINER_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ProofLoopGuide"
        component={GuideVideo}
        durationInFrames={GUIDE_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Folder name="Scenes">
        <Composition
          id="Step"
          component={StepScene}
          durationInFrames={165}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            step: 2,
            title: "Set up your folder",
            saidIn: "Say to Claude",
            say: "Set up ProofLoop for this project.",
            detail:
              "Answer a few questions: where recordings live, device and backup, and whether you'll test on a link.",
            skill: "research-setup",
          }}
        />
        <Composition
          id="Title"
          component={TitleCard}
          durationInFrames={120}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            title: "How to use ProofLoop",
            line: "Run user tests from inside Claude Code or Cursor, in 11 steps.",
            foot: "github.com/minhnguyenrenol/proofloop",
          }}
        />
      </Folder>
    </>
  );
};
