(function () {
  const LINEAR_CHAPTERS = [
    {
      unit: "Chapter 1: Numbers & the Number System",
      topics: [
        "Number Toolkit",
        "Prime Factors, HCF & LCM",
        "Fractions",
        "Fractions, Decimals & Percentages",
        "Recurring Decimals",
        "Percentages",
        "Compound Interest & Depreciation",
        "Reverse Percentages",
        "Rounding, Estimation & Bounds",
        "Powers & Roots",
        "Standard Form",
        "Surds",
        "Using a Calculator",
        "Ratio Toolkit",
        "Standard & Compound Units",
      ],
    },
    {
      unit: "Chapter 2: Equations, Formulae & Identities",
      topics: [
        "Algebra Toolkit",
        "Expanding Brackets",
        "Factorising",
        "Algebraic Fractions",
        "Algebraic Roots & Indices",
        "Linear Equations",
        "Forming & Solving Equations",
        "Rearranging Formulae",
        "Simultaneous Equations",
        "Inequalities (Solving & Graphing)",
        "Completing the Square",
        "Quadratic Formula",
        "Quadratic Equations",
        "Algebraic Proof",
      ],
    },
    {
      unit: "Chapter 3: Sequences, Functions & Graphs",
      topics: [
        "Sequences",
        "Direct & Inverse Proportion",
        "Linear Graphs",
        "Graphs of Functions",
        "Functions",
        "Differentiation & Turning Points",
        "Transformations of Graphs",
        "Kinematic Graphs",
      ],
    },
    {
      unit: "Chapter 4: Geometry & Trigonometry",
      topics: [
        "Angles in Polygons & Parallel Lines",
        "Constructions & Loci",
        "Perimeter & Area",
        "Circles, Arcs & Sectors",
        "Volume & Surface Area",
        "Right-Angled Triangles - Pythagoras & Trigonometry",
        "3D Pythagoras & Trigonometry",
        "Sine & Cosine Rules",
        "Congruent Shapes",
        "Similar Shapes",
        "Area & Volume of Similar Shapes",
        "Circle Theorems",
        "Bearings",
      ],
    },
    {
      unit: "Chapter 5: Vectors & Transformation Geometry",
      topics: ["Transformations", "Vectors"],
    },
    {
      unit: "Chapter 6: Statistics & Probability",
      topics: [
        "Statistics Toolkit",
        "Averages from Frequency Tables",
        "Histograms",
        "Cumulative Frequency Diagrams",
        "Probability Toolkit",
        "Tree Diagrams & Conditional Probability",
        "Set Notation & Venn Diagrams",
      ],
    },
  ];

  const MODULAR_UNITS = {
    "Unit 1": [
      "Number Toolkit",
      "Fractions",
      "Fractions, Decimals & Percentages",
      "Recurring Decimals",
      "Rounding, Estimation & Bounds",
      "Powers & Roots",
      "Surds",
      "Using a Calculator",
      "Standard & Compound Units",
      "Algebra Toolkit",
      "Expanding Brackets",
      "Factorising",
      "Algebraic Fractions",
      "Algebraic Roots & Indices",
      "Completing the Square",
      "Quadratic Formula",
      "Quadratic Equations",
      "Linear Graphs",
      "Linear Equations",
      "Graphs of Functions",
      "Kinematic Graphs",
      "Perimeter & Area",
      "Circles, Arcs & Sectors",
      "Right-Angled Triangles - Pythagoras & Trigonometry",
      "3D Pythagoras & Trigonometry",
      "Sine & Cosine Rules",
      "Histograms",
      "Probability Toolkit",
      "Tree Diagrams & Conditional Probability",
      "Set Notation & Venn Diagrams",
    ],
    "Unit 2": [
      "Prime Factors, HCF & LCM",
      "Percentages",
      "Compound Interest & Depreciation",
      "Reverse Percentages",
      "Standard Form",
      "Ratio Toolkit",
      "Forming & Solving Equations",
      "Rearranging Formulae",
      "Simultaneous Equations",
      "Inequalities (Solving & Graphing)",
      "Algebraic Proof",
      "Sequences",
      "Direct & Inverse Proportion",
      "Functions",
      "Differentiation & Turning Points",
      "Transformations of Graphs",
      "Angles in Polygons & Parallel Lines",
      "Constructions & Loci",
      "Volume & Surface Area",
      "Congruent Shapes",
      "Similar Shapes",
      "Area & Volume of Similar Shapes",
      "Circle Theorems",
      "Bearings",
      "Transformations",
      "Vectors",
      "Statistics Toolkit",
      "Averages from Frequency Tables",
      "Cumulative Frequency Diagrams",
    ],
  };

  const LINEAR_CATALOG = LINEAR_CHAPTERS.flatMap((chapter, chapterIndex) =>
    chapter.topics.map((topic, topicIndex) => ({
      topic,
      unit: chapter.unit,
      order: chapterIndex * 100 + topicIndex + 1,
    }))
  );

  const MODULAR_CATALOG = Object.entries(MODULAR_UNITS).flatMap(([unit, topics], unitIndex) =>
    topics.map((topic, topicIndex) => ({
      topic,
      unit,
      order: unitIndex * 100 + topicIndex + 1,
    }))
  );

  const LINEAR_UNIT = new Map(LINEAR_CATALOG.map((entry) => [entry.topic, entry.unit]));
  const LINEAR_ORDER = new Map(LINEAR_CATALOG.map((entry) => [entry.topic, entry.order]));
  const MODULAR_UNIT = new Map(MODULAR_CATALOG.map((entry) => [entry.topic, entry.unit]));
  const MODULAR_ORDER = new Map(MODULAR_CATALOG.map((entry) => [entry.topic, entry.order]));

  function activePathway() {
    return window.ELITE_PATHWAY?.mode === "modular" ? "modular" : "linear";
  }

  function activeCatalog() {
    return activePathway() === "modular" ? MODULAR_CATALOG : LINEAR_CATALOG;
  }

  function lower(value) {
    return String(value ?? "").toLowerCase();
  }

  function matches(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
  }

  function hasInequalitySignal(text) {
    return matches(text, [
      /\binequalit(?:y|ies)\b/,
      /\bgraphing inequalities?\b/,
      /\blinear programming\b/,
      /\bshaded?\s+region\b/,
      /\bshade(?:d| the)?\b/,
      /\binteger values?\b/,
      /\brange of possible values\b/,
      /\bvalues? of [xyztn] that satisfy\b/,
      /\bsolve the inequality\b/,
      /\brepresent the inequality\b/,
      /\bat least\b/,
      /\bat most\b/,
      /\bgreater than\b/,
      /\bless than\b/,
      /\bno more than\b/,
      /\bno less than\b/,
      /\bregion\b/,
      /\bbound(?:ed|ary)\b/,
      /\bshading\b/,
      /\bgraph the inequalit\b/,
      /\by\s*[<>]=?/,
      /\bx\s*[<>]=?/,
      /\bn\s*[<>]=?/,
      /\bt\s*[<>]=?/,
      /\bp\s*[<>]=?/,
    ]);
  }

  function hasLinearGraphSignal(text) {
    return matches(text, [
      /\bgraph(?:s|ing)?\b/,
      /\bplot\b/,
      /\bgradient\b/,
      /\by\s*=\s*m\s*x\b/,
      /\bstraight line\b/,
      /\bline\s+[a-z]\b/,
      /\bperpendicular\b/,
      /\bparallel\b/,
      /\bintersect(?:s|ion)?\b/,
      /\bequation of (?:a|the) line\b/,
      /\bfind an equation\b/,
      /\bwrite down an equation\b/,
      /\bdraw the graph\b/,
      /\bline l\b/,
    ]);
  }

  function splitPowerTopic(question) {
    const body = lower(question.question_text || "");
    const text = `${body} ${question.source_id || ""}`;
    if (matches(text, [
      /standard form/,
      /scientific notation/,
      /\b\d+(?:\.\d+)?\s*(?:x|×|\\times)\s*10\b/,
      /\b10\s*(?:\^|\*\*)\s*[-+]?\d+/,
      /\bpower(?:s)? of 10\b/,
    ])) return "Standard Form";
    if (matches(text, [
      /\bprime number\b/,
      /\bodd\b/,
      /\beven\b/,
      /\binteger\b/,
      /\bwhole number\b/,
      /\bsquare number\b/,
      /\bcube number\b/,
      /\brational\b/,
      /\birrational\b/,
      /types? of numbers?/,
    ])) return "Number Toolkit";
    return "Powers & Roots";
  }

  function canonicalTopic(question) {
    const current = String(question.topic || "");
    const body = lower(question.question_text || "");
    const text = `${body} ${question.source_id || ""}`.toLowerCase();

    const override = localStorage.getItem(`elite_topic_override_${question.id || question.source_id}`);
    if (override) {
        try {
            const parsed = JSON.parse(override);
            if (parsed.topic) return parsed.topic;
        } catch(e) {}
    }

    if (current === "Rearranging Formulas") return "Rearranging Formulae";

    // Global inequality catch
    if (matches(current.toLowerCase(), [/inequalit/, /programming/]) || hasInequalitySignal(text)) {
      return "Inequalities (Solving & Graphing)";
    }

    switch (current) {
      case "Number Toolkit":
      case "Types of Numbers":
        return "Number Toolkit";
      case "Ratio Problem Solving":
      case "Exchange Rates & Best Buys":
        return "Ratio Toolkit";
      case "Solving Linear Equations":
        return hasInequalitySignal(text) ? "Inequalities (Solving & Graphing)" : "Linear Equations";
      case "Coordinate Geometry":
        return hasLinearGraphSignal(text) ? "Linear Graphs" : "Linear Equations";
      case "Linear Graphs (y = mx + c)":
        return "Linear Graphs";
      case "Solving Inequalities":
      case "Graphing Inequalities":
      case "Graphing Inequalities and Regions":
      case "Inequalities":
      case "Linear Inequalities":
      case "Linear Programming":
        return "Inequalities (Solving & Graphing)";
      case "Solving Quadratic Equations":
        return matches(text, [/quadratic\s+formula/, /\bformula\b/]) ? "Quadratic Formula" : "Quadratic Equations";
      case "Estimating Gradients":
        return "Graphs of Functions";
      case "Differentiation":
        return "Differentiation & Turning Points";
      case "Area & Perimeter":
        return "Perimeter & Area";
      case "Sine, Cosine Rule & Area of Triangles":
        return "Sine & Cosine Rules";
      case "Combined & Conditional Probability":
        return "Tree Diagrams & Conditional Probability";
      case "Probability Diagrams - Venn & Tree Diagrams":
        return matches(body, [/\bvenn\b/, /set notation/, /\bunion\b/, /\bintersection\b/, /\bsubset\b/])
          ? "Set Notation & Venn Diagrams"
          : "Tree Diagrams & Conditional Probability";
      case "Congruence, Similarity & Geometrical Proof":
        if (matches(body, [/area of similar/, /volume of similar/])) return "Area & Volume of Similar Shapes";
        if (matches(body, [/similar/, /scale factor/, /enlarg/])) return "Similar Shapes";
        if (matches(body, [/congruent/, /proof/])) return "Congruent Shapes";
        return "Similar Shapes";
      case "Bearings, Scale Drawing & Constructions":
        if (matches(body, [/loci/, /locus/, /construction/, /construct/, /compasses/, /bisector/, /perpendicular/, /scale drawing/, /scale diagram/])) {
          return "Constructions & Loci";
        }
        if (matches(body, [/\bbear(?:ing|ings)?\b/, /\bnorth\b/, /\bclockwise\b/, /\banticlockwise\b/, /\beast\b/, /\bwest\b/, /\bnorth-east\b/, /\bnorth-west\b/, /\bsouth-east\b/, /\bsouth-west\b/])) {
          return "Bearings";
        }
        return "Bearings";
      case "Percentages":
        if (matches(text, [/\breduced\b/, /\bdiscount\b/, /\bsale\b/, /\bincrease\b/, /\bdecrease\b/, /\bprofit\b/, /\bloss\b/, /original price/, /\bmore than\b/, /\bless than\b/, /after/, /before/])) {
          return "Reverse Percentages";
        }
        return "Percentages";
      case "Fractions, Decimals & Percentages":
        if (matches(text, [/recurring/, /repeating/])) return "Recurring Decimals";
        return "Fractions, Decimals & Percentages";
      case "Statistics Toolkit":
        if (matches(text, [/frequency table/, /grouped/, /estimate the mean/, /average from/, /\bmean\b.*\bfrequency\b/])) {
          return "Averages from Frequency Tables";
        }
        return "Statistics Toolkit";
      case "Powers, Roots & Standard Form":
        return splitPowerTopic(question);
      case "Prime Factors, HCF & LCM":
        if (matches(text, [/hcf/, /lcm/, /highest common factor/, /lowest common multiple/, /\bprime factor\b/, /\bfactor\b/, /\bmultiple\b/])) {
          return "Prime Factors, HCF & LCM";
        }
        return "Number Toolkit";
      case "Graphs of Functions":
      case "Real-Life Graphs":
        if (matches(text, [/\bspeed\b/, /\bdistance\b/, /\btime\b/, /\bjourney\b/, /\btravel\b/, /\bvelocity\b/, /\bacceleration\b/, /\bmotion\b/])) {
          return "Kinematic Graphs";
        }
        return "Graphs of Functions";
      case "Transformations":
        return "Transformations";
      case "Fractions":
        if (matches(text, [/recurring/, /repeating/])) return "Recurring Decimals";
        return "Fractions";
      case "Using a Calculator":
        return "Using a Calculator";
      default:
        return current;
    }
  }

  function normalizeQuestion(question) {
    const originalTopic = question.topic || "";
    const originalUnit = question.unit || "";
    const canonical = canonicalTopic(question);
    const mode = activePathway();

    // Modular-paper questions (4WM1H/4WM1HR -> Unit 1, 4WM2H/4WM2HR -> Unit 2)
    // carry an explicit override that beats the topic-based mapping, since
    // the Edexcel paper code is a stronger signal than the question text.
    const forcedModular = question.modular_force_unit;

    const modularUnit = forcedModular || MODULAR_UNIT.get(canonical) || "Unit 2";
    const displayUnit = mode === "modular"
      ? modularUnit
      : LINEAR_UNIT.get(canonical) || originalUnit || "";
    const displayOrder = mode === "modular"
      ? MODULAR_ORDER.get(canonical) || Number(question.topic_order || 999)
      : LINEAR_ORDER.get(canonical) || Number(question.topic_order || 999);

    question.original_topic = question.original_topic || originalTopic;
    question.original_unit = question.original_unit || originalUnit;
    question.linear_topic = canonical;
    question.linear_unit = LINEAR_UNIT.get(canonical) || originalUnit || "";
    question.modular_topic = canonical;
    question.modular_unit = modularUnit;
    question.canonical_topic = canonical;
    question.canonical_topic_order = LINEAR_ORDER.get(canonical) || Number(question.topic_order || 999);
    question.topic = canonical;
    question.unit = displayUnit;
    question.topic_order = displayOrder;
    question.pathway = mode;
    return question;
  }

  function normalizeMeta(meta) {
    const catalog = activeCatalog();
    const topics = catalog.map((entry) => entry.topic);
    const unitLabel = window.ELITE_PATHWAY?.label?.("unit") || "Chapter";
    const subtitle = `${unitLabel}-aware practice with filters, worksheets, progress tracking, and private teacher support.`;
    return {
      ...meta,
      topics,
      pathway: activePathway(),
      banks: {
        ...(meta.banks || {}),
        all: {
          ...(meta.banks?.all || {}),
          title: activePathway() === "modular" ? "Modular Classified Questions" : "All Classified Questions",
          subtitle,
          topics,
        },
        expertise: {
          ...(meta.banks?.expertise || {}),
          title: activePathway() === "modular" ? "Modular Q20+ Expertise Questions" : "Expertise Q20+ Questions",
          subtitle,
          topics,
        },
      },
    };
  }

  window.normalizeEliteQuestion = normalizeQuestion;
  window.normalizeEliteMeta = normalizeMeta;

  if (Array.isArray(window.QUESTION_DATA)) {
    window.QUESTION_DATA.forEach(normalizeQuestion);
  }
  window.TOPIC_CATALOG = activeCatalog();
  window.TOPIC_ORDER_MAP = new Map(window.TOPIC_CATALOG.map((entry) => [entry.topic, entry.order]));
  window.TOPIC_UNIT_MAP = new Map(window.TOPIC_CATALOG.map((entry) => [entry.topic, entry.unit]));
  window.LINEAR_TOPIC_CATALOG = LINEAR_CATALOG;
  window.MODULAR_TOPIC_CATALOG = MODULAR_CATALOG;
  window.SITE_META = normalizeMeta(window.SITE_META || {});
})();
