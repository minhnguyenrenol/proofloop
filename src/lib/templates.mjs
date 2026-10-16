// Starting files for a new study. The plan-study skill fills them in.

export const TEMPLATES = {
  study: `apiVersion: proofloop/v1
kind: Study
metadata:
  name: __NAME__
  slug: __SLUG__
  version: 1
spec:
  mode: __MODE__
  goal: Describe what decision this study informs and what you need to learn.
  researchQuestions:
    - Write a question the study must answer.
  targetMinutes: 20
  participants:
    type: internal        # internal | customer | mixed
    target: 5
  moderators: []          # moderated studies: names as they appear in the call transcript
  prototype:
    figma: https://www.figma.com/proto/FILE_KEY/Name   # or url: https://... (code prototype)
  recording:
    screen: true
    microphone: true
    camera: false
  consent:
    version: "1.0"
    file: consent/consent.md
  storage:
    location: __LOCATION__
    path: __PATH__
  retention:
    mediaDays: 90__RELAY__
  model:
    research: claude-opus-5-5
    economyMode: false__ACCOUNT__
  blocks:
    - id: intro
      type: instructions
      text: Please think aloud as you go. Say what you're looking at, what you expect to happen, and anything that surprises you.
    - id: t1
      type: task
      scenario: Describe a realistic situation that gives the task a reason.
      instruction: Describe the goal in the participant's words, without naming buttons or menus.
      answers: [0]          # research questions this task answers (0 = the first)
      tests: []             # ctx- ids from context.md this task checks
      success:
        selfReport: true
      maxSeconds: 300
      followUps:
        - { id: t1_seq, type: seq }
        - { id: t1_why, type: open_text, text: "What, if anything, was unclear?" }
    - id: sus
      type: question
      questionType: sus
`,
  consent: `# Taking part in "__NAME__"

**What we're doing.** We're testing an early design and want to see where it works and where it doesn't. We're testing the design, not you.

**What we record.** Your voice, your screen while you use the design (only the study tab, or the call window in a moderated session), and where you click. We don't use your camera. We don't analyse faces or emotions.

**Who sees it.** Only the research and design team working on this product. Recordings stay inside the company.

**How we use AI.** We use an AI tool approved by the company to help summarise sessions. Names and personal details are removed from transcripts before the AI reads them. People check every finding before it's shared.

**How long we keep it.** Recordings are deleted after 90 days. Findings without your name may be kept longer.

**Your choices.** Taking part is voluntary. You can stop at any time, skip any task, or ask us to delete your recording by contacting the researcher who invited you.

**Please don't** enter real personal or banking details into the design. Use made-up details if asked.
`,
  guide: `# Discussion guide: __NAME__

Each "##" section below becomes a marker you can select in the Studio.

## Welcome and consent
- Introduce yourself and the note-taker (if any).
- Read the recording notice shown in the Studio.
- "We're testing the design, not you. There are no wrong answers."

## Warm-up
- Tell me a little about the last time you … (relevant behaviour).

## Task 1
- Scenario: …
- Task: …
- Follow-ups: "What did you expect to happen?" "What would you do next?"

## Wrap-up
- "If you could change one thing, what would it be?"
- Thank them and explain what happens next.
`,
};
