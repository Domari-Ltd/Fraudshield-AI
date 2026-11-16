import { GoogleGenerativeAI } from "@google/generative-ai";
import { ScamAnalysis, MessageType } from "@/types/fraudshield";

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Please check your .env.local file.");
  }
  return new GoogleGenerativeAI(apiKey);
}

const messageTypeLabels: Record<MessageType, string> = {
  job: "job offer",
  scholarship: "scholarship offer",
  grant: "grant offer",
  email: "email",
  sms: "SMS or WhatsApp message",
  investment: "investment opportunity",
  unknown: "message or offer",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Strip emojis, pictograms, and symbols to uphold clean aesthetic
function stripEmojis(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function callGeminiWithRetry(
  model: ReturnType<typeof GoogleGenerativeAI.prototype.getGenerativeModel>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contentParts: string | Array<any>,
  retries = 4
): Promise<string> {
  try {
    const parts = Array.isArray(contentParts) ? contentParts : [contentParts];
    const result = await model.generateContent(parts);
    return result.response.text().trim();
  } catch (err: unknown) {
    const error = err as { status?: number; statusText?: string; message?: string };
    const errMsg = error?.message || (err instanceof Error ? err.message : String(err));

    const is429 =
      error?.status === 429 ||
      errMsg.includes("429") ||
      errMsg.includes("Quota exceeded") ||
      errMsg.includes("Too Many Requests");

    const isTemporaryServerLoad =
      error?.status === 503 ||
      error?.status === 502 ||
      error?.status === 504 ||
      errMsg.includes("503") ||
      errMsg.includes("502") ||
      errMsg.includes("504") ||
      errMsg.includes("Service Unavailable") ||
      errMsg.includes("overloaded") ||
      errMsg.includes("high demand");

    if (is429 && retries > 0) {
      await sleep(30000);
      return callGeminiWithRetry(model, contentParts, retries - 1);
    }
    if (isTemporaryServerLoad && retries > 0) {
      await sleep(4000);
      return callGeminiWithRetry(model, contentParts, retries - 1);
    }
    throw err;
  }
}

export interface AnalyzeScamOptions {
  text?: string;
  image?: {
    base64: string;
    mimeType: string;
  };
  messageType?: MessageType;
  learnedThreatCount?: number;
  learnedThreatExamples?: Array<{ snippet: string; category?: string | null }>;
}

export async function analyzeScam(options: AnalyzeScamOptions): Promise<ScamAnalysis> {
  const {
    text = "",
    image,
    messageType = "unknown",
    learnedThreatCount = 0,
    learnedThreatExamples = [],
  } = options;

  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ googleSearch: {} }] as any,
  });

  const typeLabel = messageTypeLabels[messageType];

  const hasImage = Boolean(image?.base64);

  // Dynamic In-Context Learning Prompt: The AI's decisiveness increases as more cases are provided
  const memoryBlock =
    learnedThreatExamples.length > 0
      ? `ADAPTIVE THREAT TRAINING MEMORY (${learnedThreatCount} historical cases indexed):
FraudShield's adaptive network has accumulated verified scam patterns and image scans. Use these precedents to train your decision:
${learnedThreatExamples
        .slice(0, 6)
        .map(
          (ex, idx) =>
            `[Precedent #${idx + 1}] Type: ${ex.category || "Scam"} | Pattern: "${ex.snippet.slice(0, 160).replace(/\n/g, " ")}"`
        )
        .join("\n")}

DECISIVENESS & CONTINUOUS LEARNING DIRECTIVE:
1. As more screenshots and scam samples are entered into FraudShield, the model's decisiveness and specificity must increase.
2. If the current scan exhibits traits matching any historical precedents, cite the matched vector in "matched_learned_patterns" and state a high decisiveness rating in "decisiveness_factor" (e.g., "98% decisive - Matches known upfront fee advance fee fraud").
3. If this is a novel vector, state that it will now train future scans across the FraudShield network.`
      : `ADAPTIVE THREAT TRAINING MEMORY:
Initial baseline threat memory active. This scan will be indexed to train future analyses.`;

  const prompt = `You are FraudShield AI, an advanced scam detection intelligence engine with real-time web-search and multimodal vision capabilities.
Analyze the following ${typeLabel} ${hasImage ? "screenshot/image and accompanying context" : "text"} and determine whether it is a scam, phishing attempt, fake job offer, fake scholarship, fake grant, fake investment, fraudulent delivery notice, or suspicious offer.

${hasImage ? `IMAGE / VISION & OCR INSTRUCTIONS:
- You have been provided with an image / screenshot.
- You MUST perform optical character recognition (OCR) and transcribe all visible text accurately into "extracted_text".
- Inspect visual markers, formatting, logos, seals, sender handles, URL bars, watermark forgery, and urgency banners. Detail these in "visual_indicators".
- Evaluate whether visual elements mimic trusted institutions (banks, government, delivery couriers, universities) or use spoofed branding.` : ""}

EVALUATION CRITERIA:
1. Requests for money, fees, deposits, starter kit purchases, registration payments, or processing fees.
2. Requests for passwords, OTPs, bank credentials, ID numbers, passport photos, or sensitive documents.
3. Unrealistic promises such as guaranteed jobs, instant scholarship grants, high investment returns, or lottery winnings.
4. Artificial urgency, pressure tactics, countdowns, or instructions to hide the conversation.
5. Suspicious contact channels (unofficial domains, personal WhatsApp/Telegram recruitment, generic webmail).
6. Grammar errors, odd phrasing, mismatched company names, or domain spoofing.

${memoryBlock}

CRITICAL: You MUST use your web search tool to check if similar scams, phone numbers, email domains, or complaint threads are reported online (Reddit, consumer forums, official scam alerts). Extract specific reference details or URLs into "sources".

${text ? `Accompanying Text:\n"""\n${text}\n"""` : ""}

Return ONLY valid JSON (no markdown fences, no explanatory prose, just raw JSON) matching this exact schema:
{
  "risk_score": <integer 0-100>,
  "risk_level": <"Low Risk" | "Medium Risk" | "High Risk">,
  "scam_category": <"Fake job" | "Fake scholarship" | "Fake grant" | "Phishing" | "Fake investment" | "Romance/social scam" | "Fake delivery/payment scam" | "General suspicious message" | "Unknown">,
  "confidence_level": <"Low" | "Medium" | "High">,
  "summary": <string: 1-2 sentence concise, factual summary>,
  "warning_signs": <array of strings: specific red flags detected>,
  "recommended_actions": <array of strings: practical next steps to protect the user>,
  "sources": <array of strings: relevant URLs or verified external warnings found online>,
  "disclaimer": "This result is for guidance only. Always verify important opportunities through official sources.",
  "extracted_text": <string: all text recognized from the image via OCR, or empty string if no image>,
  "visual_indicators": <array of strings: detected visual artifacts, spoofed logos, layout cues, or empty array if none>,
  "decisiveness_factor": <string: e.g. "98% decisive - Matched to verified threat patterns in training memory">,
  "matched_learned_patterns": <array of strings: specific learned threat templates matching this submission>
}

CRITICAL RULES:
- Do NOT include any emojis, icons, or pictorial characters in any field. Use clean English text only.
- Risk score: 0-30 = Low Risk, 31-70 = Medium Risk, 71-100 = High Risk. Risk level must strictly correspond.
- Maintain an objective, professional tone.`;

  // Build content parts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentParts: Array<any> = [prompt];

  if (hasImage && image) {
    // Clean base64 prefix if present
    const cleanBase64 = image.base64.replace(/^data:[^;]+;base64,/, "").trim();
    contentParts.push({
      inlineData: {
        data: cleanBase64,
        mimeType: image.mimeType || "image/jpeg",
      },
    });
  }

  const responseText = await callGeminiWithRetry(model, contentParts);

  // Strip any accidental markdown code fences
  const cleaned = responseText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: ScamAnalysis;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
    } else {
      throw new Error("Unable to parse AI verification response as JSON.");
    }
  }

  // Validate and clamp risk score
  parsed.risk_score = Math.max(0, Math.min(100, Math.round(Number(parsed.risk_score) || 0)));

  // Ensure risk_level matches score
  if (parsed.risk_score <= 30) parsed.risk_level = "Low Risk";
  else if (parsed.risk_score <= 70) parsed.risk_level = "Medium Risk";
  else parsed.risk_level = "High Risk";

  // Sanitize text fields
  parsed.summary = stripEmojis(parsed.summary || "");
  parsed.warning_signs = (parsed.warning_signs || []).map(stripEmojis).filter(Boolean);
  parsed.recommended_actions = (parsed.recommended_actions || []).map(stripEmojis).filter(Boolean);
  parsed.sources = Array.isArray(parsed.sources) ? parsed.sources : [];

  // Vision & OCR sanitation
  parsed.extracted_text = stripEmojis(parsed.extracted_text || "");
  parsed.visual_indicators = (parsed.visual_indicators || []).map(stripEmojis).filter(Boolean);
  parsed.has_image = hasImage;

  // Training & Decisiveness metrics
  parsed.learned_patterns_count = learnedThreatCount;
  parsed.decisiveness_factor = stripEmojis(
    parsed.decisiveness_factor ||
    (parsed.risk_score > 70
      ? "96% decisive - Grounded by historical threat memory"
      : "Standard verification decisive rating")
  );
  parsed.matched_learned_patterns = (parsed.matched_learned_patterns || []).map(stripEmojis).filter(Boolean);

  return parsed;
}

// Backward-compatible export for existing callers
export async function analyzeScamText(
  text: string,
  messageType: MessageType = "unknown"
): Promise<ScamAnalysis> {
  return analyzeScam({ text, messageType });
}
