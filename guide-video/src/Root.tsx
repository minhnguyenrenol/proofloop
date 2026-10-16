import { Composition, Folder } from "remotion";
import { GuideVideo, GUIDE_DURATION } from "./GuideVideo";
import { StepScene } from "./StepScene";
import { TitleCard } from "./TitleCard";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="ProofLoopGuide" component={GuideVideo} durationInFrames={GUIDE_DURATION} fps={30} width={1920} height={1080} />
      <Folder name="Scenes">
        <Composition
          id="Step"
          component={StepScene}
          durationInFrames={165}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ step: 2, title: "Set up your folder", saidIn: "Say to Claude", say: "Set up ProofLoop for this project.", detail: "Answer a few questions: where recordings live, device and backup, and whether you'll test on a link.", skill: "research-setup" }}
        />
        <Composition
          id="Title"
          component={TitleCard}
          durationInFrames={120}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ title: "How to use ProofLoop", line: "Run user tests from inside Claude Code or Cursor, in 11 steps.", foot: "github.com/minhnguyenrenol/proofloop" }}
        />
      </Folder>
    </>
  );
};
