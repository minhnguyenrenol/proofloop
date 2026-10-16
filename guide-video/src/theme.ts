// ProofLoop's own palette and type, matching docs/guide.html and the plugin's pages.
import { loadFont as loadSerif } from "@remotion/google-fonts/Newsreader";
import { loadFont as loadSans } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";

export const serif = loadSerif("normal", { weights: ["600"], subsets: ["latin"] }).fontFamily;
export const sans = loadSans("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;

export const color = {
  paper: "#f7f6f2",
  sheet: "#fffefb",
  ink: "#1d1d1b",
  ink2: "#4b4b45",
  rule: "#dcdad2",
  signal: "#0b57d0",
  signalSoft: "#e6eefb",
  signalInk: "#0a3f96",
  codeBg: "#1d1d1b",
  codeInk: "#f2f1ec",
};

export const TOTAL_STEPS = 11;
