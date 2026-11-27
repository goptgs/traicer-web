export type FaqLink = { href: string; label: string };

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  links?: readonly FaqLink[];
};

export const faqs: readonly FaqItem[] = [
  {
    id: "what",
    question: "What does TrAIcer do?",
    answer:
      "TrAIcer draws a ball-flight line over a golf video you already have. The line is computed from gravity, drag and spin, then placed on the clip so it reads like a broadcast tracer.",
  },
  {
    id: "settings",
    question: "What will I have to set?",
    answer:
      "Where the ball landed, how long it was in the air, and the shape of the shot: high, mid or low, and draw, straight or fade. Then a preview, and an export in 4K. The uploader is not open yet.",
  },
  {
    id: "clips",
    question: "Which cameras and clips work?",
    answer:
      "A clip that shows the ball from the strike through the landing, from a camera that mostly stays put. A phone, an action camera, or a side-on practice view are the general idea. Very dark, heavily cropped, or badly shaken clips are harder. We’ll name tested cameras when the uploader opens — not before we’ve tried them.",
  },
  {
    id: "privacy",
    question: "What happens to an upload?",
    answer:
      "This site does not take video. When the web app opens, a clip will be used to draw the tracer and then deleted on a schedule. We won’t sell footage. The privacy note says what we can stand behind today, and it is marked as a draft.",
    links: [{ href: "/privacy", label: "Read the draft privacy note" }],
  },
  {
    id: "skill",
    question: "What is the AI Skill?",
    answer:
      "A real product, still on its way: the TrAIcer AI Skill for Grok, Claude and ChatGPT. It is the brains behind the web app — the same tracer, asked for in the assistant you already use. It is not available to install today. The early-access list is how we tell you when it is. That form asks for an email, which assistant you use, and Mac or PC. It does not ask about price.",
    links: [{ href: "/skill", label: "Join early access" }],
  },
  {
    id: "pay",
    question: "Can I pay now?",
    answer:
      "No. The figures on the pricing page are an early draft. There is no checkout.",
    links: [{ href: "/pricing", label: "See the early pricing" }],
  },
  {
    id: "who",
    question: "Who publishes TrAIcer?",
    answer: "PTGS LLC.",
  },
];
