// Build-time dataset loader.
// Reads every per-paper JSON file under src/data/questions/ and
// src/data/solutions/ and exports the unified shape the client
// scripts (topic-normalizer.js, practice-app.js) expect.
//
// Used by practice.astro (and any other page that needs the full
// bank) to emit inline window.QUESTION_DATA / window.SOLUTION_DATA
// at build time. Per-page bundles can be added later if perf demands.

import papersData from "../data/papers.json";
import topicsData from "../data/topics.json";

// Vite/Astro build-time JSON globs. `eager: true` means the
// JSON is inlined into the bundle, not lazy-imported.
const paperFiles = import.meta.glob("../data/questions/*.json", { eager: true });
const solutionFiles = import.meta.glob("../data/solutions/*.json", { eager: true });

function flattenQuestions() {
  const all = [];
  for (const mod of Object.values(paperFiles)) {
    const paper = mod.default || mod;
    if (!paper || !Array.isArray(paper.questions)) continue;
    for (const q of paper.questions) {
      all.push({
        id: q.id,
        bank: q.bank,
        paper: paper.paper,
        paper_slug: paper.paperSlug,
        question: q.q,
        marks: q.marks,
        topic: q.topic,
        unit: q.unit,
        topic_order: q.topicOrder,
        image: q.image,
        filename: q.filename,
        question_text: q.text,
        modular_force_unit: q.modularForceUnit,
        is_modular_paper: paper.isModular,
      });
    }
  }
  return all;
}

function flattenSolutions() {
  const out = {};
  for (const mod of Object.values(solutionFiles)) {
    const block = mod.default || mod;
    if (!block || !block.solutions) continue;
    Object.assign(out, block.solutions);
  }
  return out;
}

export const questions = flattenQuestions();
export const solutions = flattenSolutions();
export const papers = papersData;
export const topics = topicsData.topics;
export const siteMeta = {
  generatedAt: new Date().toISOString().slice(0, 19),
  questionCount: questions.length,
  paperCount: papers.length,
  topics: topicsData.topics,
};

export const banks = {
  all: {
    title: "All Classified Questions",
    count: questions.filter((q) => q.bank === "all").length,
    description: "Every classified past-paper question across all sessions.",
  },
  expertise: {
    title: "Expertise Q20+",
    count: questions.filter((q) => q.bank === "expertise").length,
    description: "Harder questions starting from question 20 onwards.",
  },
};
