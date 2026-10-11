/** Example prompts: drive the visual cards and the typewriter placeholder. */
export interface Example {
  id: string;
  emoji: string;
  title: string;
  prompt: string;
  budget: string;
  time: string;
  /** Gradient for the emoji tile; built from the brand stops. */
  tile: string;
}

export const EXAMPLES: Example[] = [
  {
    id: "relaxing-solo",
    emoji: "🧘",
    title: "Relaxing solo",
    prompt: "I have ₹500 and 3 hours, alone, want something relaxing nearby",
    budget: "₹500",
    time: "3 h",
    tile: "linear-gradient(135deg, var(--brand-indigo), var(--brand-violet))",
  },
  {
    id: "rainy-date",
    emoji: "🌧️",
    title: "Rainy date",
    prompt: "Rainy evening date under ₹1500, good food and a short walk",
    budget: "₹1,500",
    time: "Evening",
    tile: "linear-gradient(135deg, var(--brand-violet), var(--brand-pink))",
  },
  {
    id: "family-fun",
    emoji: "🦒",
    title: "Family fun",
    prompt: "Family of four, 4 hours, kids love animals, budget ₹2000",
    budget: "₹2,000",
    time: "4 h",
    tile: "linear-gradient(135deg, var(--brand-pink), var(--brand-amber))",
  },
  {
    id: "photo-walk",
    emoji: "📸",
    title: "Photo walk",
    prompt: "Solo photo walk this morning, free or cheap, no long travel",
    budget: "Free",
    time: "Morning",
    tile: "linear-gradient(135deg, var(--brand-amber), var(--brand-indigo))",
  },
];

export const EXAMPLE_PROMPTS = EXAMPLES.map((e) => e.prompt);
