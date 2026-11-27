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
      "It draws a ball-flight line on a golf video you already have. The line comes from gravity, drag and spin.",
  },
  {
    id: "settings",
    question: "What will I set?",
    answer:
      "Landing spot, hang time, and shape: high, mid or low, and draw, straight or fade. Then a preview and a 4K export. The uploader isn’t open yet.",
  },
  {
    id: "clips",
    question: "Which clips work?",
    answer:
      "One that shows the ball from the hit to the landing, camera mostly still. A phone or an action camera is the idea. We’ll name tested cameras after we’ve tried them.",
  },
  {
    id: "privacy",
    question: "What happens to an upload?",
    answer:
      "This site doesn’t take video. When it does, a clip is used to draw the tracer, then deleted. We won’t sell it.",
    links: [{ href: "/privacy", label: "Privacy note" }],
  },
  {
    id: "skill",
    question: "What is the AI Skill?",
    answer:
      "The same tracer, inside Grok, Claude and ChatGPT. Not installable yet. The list asks for an email, which assistant, and Mac or PC.",
    links: [{ href: "/skill", label: "Join the list" }],
  },
  {
    id: "pay",
    question: "Can I pay now?",
    answer: "No. The prices are a draft. There is no checkout.",
    links: [{ href: "/pricing", label: "Early pricing" }],
  },
  {
    id: "who",
    question: "Who publishes TrAIcer?",
    answer: "PTGS LLC.",
  },
];
