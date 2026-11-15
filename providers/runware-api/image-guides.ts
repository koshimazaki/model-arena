/**
 * Per image model: the Runware prompting guide it follows and short tips for a
 * prompt box. Each entry was read from runware.ai/docs/models/<slug>/guides/…
 * on 13 Nov 2026; the tips are written in our own words. Models with no
 * published guide (FLUX.2 [klein] 9B, Kling IMAGE 3.0) get neutral tips and say so.
 * The `dialect` picks how composeImagePrompt (image-compose.ts) writes for it.
 */
const DOCS = "https://runware.ai/docs/models";
const READ = "13 Nov 2026";

export type PromptDialect = "gpt" | "h3" | "seedream" | "flux3" | "klein3" | "neutral";

export interface ImageGuide {
  key: string;
  guide: {
    /** The main prompting guide, or null when the model has none. */
    url: string | null;
    read: string;
    /** Other guide pages the composer follows (references, optimiser, quality). */
    related: string[];
    note?: string;
  };
  tips: string[];
  dialect: PromptDialect;
}

const g = (slug: string, page: string) => `${DOCS}/${slug}/guides/${page}`;

const GPT_TIPS = [
  "Say first what the image is for, then describe it one area of the frame at a time.",
  "Give every count as a number and every position against the frame.",
  "Put any words to render in double quotes, and finish with no text or no other text.",
  "With references, say what each image is before anything else, then list what must stay the same.",
];
const H3_TIPS = [
  "Open with the task and where the image will be used, then the arrangement, then details and light.",
  "Write counts as numbers and place things against the frame, not against each other.",
  "Call references image 1, image 2 in the order sent, one job each, and say what may change.",
  "Always send a size or 1K/2K: with no size the model returns 4K at about four times the cost.",
];

export const IMAGE_GUIDES: ImageGuide[] = [
  {
    key: "klein-9b",
    guide: { url: null, read: READ, related: [], note: "no model guide published" },
    tips: [
      "Describe the subject, the setting, the framing and the light in plain sentences.",
      "Name what each reference image is for.",
      "Keep sizes on its grid of 16 px; the reference sets the default size.",
    ],
    dialect: "neutral",
  },
  {
    key: "flux-3-image",
    guide: { url: g("bfl-flux-3-image", "prompting"), read: READ, related: [g("bfl-flux-3-image", "multi-reference-composition")] },
    tips: [
      "Write the subject, the action, the place, the composition and the style, in that order.",
      "There is no negative prompt: describe what is there instead of what is missing.",
      "Give the light a direction and a hardness.",
      "Refer to references as image 1, image 2, give each a job and say whose light wins.",
    ],
    dialect: "flux3",
  },
  {
    key: "flux-3-image-klein",
    guide: { url: g("bfl-flux-3-image-klein", "prompting"), read: READ, related: [g("bfl-flux-3-image-klein", "multi-reference-composition")] },
    tips: [
      "Write a full caption: framing, subject, background and light, then a style line.",
      "Nothing rewrites the prompt here, so every clause you leave out is the model's choice.",
      "State absences as what is there, such as a plain blank wall.",
      "Up to four references; name each by number and restate its key details.",
    ],
    dialect: "klein3",
  },
  {
    key: "gpt-image-2.6-flare",
    guide: {
      url: g("openai-gpt-image-2-6-flare", "prompting"),
      read: READ,
      related: [g("openai-gpt-image-2-6-flare", "editing-images"), g("openai-gpt-image-2-6-flare", "quality-and-thinking-level")],
    },
    tips: [...GPT_TIPS.slice(0, 3), "Try quality low for drafts; quality and size decide how many output tokens you pay for."],
    dialect: "gpt",
  },
  {
    key: "gpt-image-2.6-sunburst",
    guide: {
      url: g("openai-gpt-image-2-6-sunburst", "detailed-editing"),
      read: READ,
      related: [g("openai-gpt-image-2-6-flare", "prompting"), g("openai-gpt-image-2-6-flare", "editing-images")],
      note: "Sunburst takes the same request as Flare; its own guide covers detailed edits, and the Flare guides cover prompting",
    },
    tips: [GPT_TIPS[0]!, GPT_TIPS[3]!, "Change one thing per edit and list everything else to keep.", "Check every quoted string in the result; one wrong character is the usual miss."],
    dialect: "gpt",
  },
  {
    key: "h3-image",
    guide: {
      url: g("minimax-h3-image", "prompting"),
      read: READ,
      related: [g("minimax-h3-image", "multi-reference-composition"), g("minimax-h3-image", "prompt-optimizer")],
    },
    tips: H3_TIPS,
    dialect: "h3",
  },
  {
    key: "h3-image-highspeed",
    guide: {
      url: g("minimax-h3-image", "prompting"),
      read: READ,
      related: [g("minimax-h3-image", "multi-reference-composition"), g("minimax-h3-image", "prompt-optimizer")],
      note: "no separate guide; the MiniMax H3 Image guide says Highspeed takes the same requests",
    },
    tips: H3_TIPS,
    dialect: "h3",
  },
  {
    key: "seedream-5.5",
    guide: { url: g("bytedance-seedream-5-5", "prompting"), read: READ, related: [g("bytedance-seedream-5-5", "multi-reference-composition")] },
    tips: [
      "Write it as a brief: what it is for, then subject, setting, light, lens and framing, one clause each.",
      "Describe materials and parts, not only colours, and finish with what to leave out.",
      "Keep it under about 600 words.",
      "Call references image 1, image 2 in the order sent; keep the character as image 1 across a set.",
    ],
    dialect: "seedream",
  },
  {
    key: "kling-image-3",
    guide: { url: null, read: READ, related: [], note: "no model guide published" },
    tips: [
      "Describe the subject, the setting, the framing and the light in plain sentences.",
      "It takes one reference; say what it is for.",
      "Prompts are limited to 2,500 characters.",
    ],
    dialect: "neutral",
  },
];

export function imageGuide(key: string): ImageGuide | undefined {
  return IMAGE_GUIDES.find((x) => x.key === key);
}

/** Copies for hosts: guide link, related pages and tips per model key. */
export function imageGuides(): Omit<ImageGuide, "dialect">[] {
  return IMAGE_GUIDES.map(({ key, guide, tips }) => ({ key, guide: { ...guide, related: [...guide.related] }, tips: [...tips] }));
}
