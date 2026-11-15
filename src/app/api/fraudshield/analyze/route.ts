import { NextRequest, NextResponse } from "next/server";
import { analyzeScam } from "@/lib/gemini";
import { prisma } from "@/lib/db";
import { AnalyzeRequest, MessageType } from "@/types/fraudshield";

export const maxDuration = 90; // seconds — needed for Gemini retry waits

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequest = await req.json();
    const { inputText, imageBase64, imageMimeType, selectedType } = body;

    const hasImage = Boolean(imageBase64 && imageBase64.trim().length > 50);
    const textContent = (inputText || "").trim();

    if (!hasImage && (!textContent || textContent.length < 10)) {
      return NextResponse.json(
        { success: false, error: "Please upload an image/screenshot or provide text with at least 10 characters." },
        { status: 400 }
      );
    }

    if (textContent.length > 10000) {
      return NextResponse.json(
        { success: false, error: "Text exceeds maximum limit of 10,000 characters." },
        { status: 400 }
      );
    }

    // 1. DYNAMIC THREAT MEMORY & CONTINUOUS IN-CONTEXT LEARNING
    // Retrieve historical threat records and image scans from the database to train the AI
    let learnedThreatCount = 0;
    const learnedThreatExamples: Array<{ snippet: string; category?: string | null }> = [];

    try {
      const [totalReports, totalChecks, sampleReports, sampleChecks] = await Promise.all([
        prisma.scamReport.count().catch(() => 0),
        prisma.scamCheck.count().catch(() => 0),
        prisma.scamReport.findMany({
          take: 6,
          orderBy: { createdAt: "desc" },
          select: { reportedMessage: true, category: true },
        }).catch(() => []),
        prisma.scamCheck.findMany({
          take: 6,
          where: { riskScore: { gte: 70 } },
          orderBy: { createdAt: "desc" },
          select: { inputText: true, scamCategory: true, extractedText: true },
        }).catch(() => []),
      ]);

      learnedThreatCount = (totalReports || 0) + (totalChecks || 0);

      // Add community reported scams into learned memory
      for (const r of sampleReports) {
        if (r.reportedMessage) {
          learnedThreatExamples.push({
            snippet: r.reportedMessage,
            category: r.category,
          });
        }
      }

      // Add previously verified scans (including image OCRs) into learned memory
      for (const c of sampleChecks) {
        const snippet = c.extractedText || c.inputText;
        if (snippet) {
          learnedThreatExamples.push({
            snippet,
            category: c.scamCategory,
          });
        }
      }
    } catch (memError) {
      console.error("Non-blocking threat memory retrieval note:", memError);
    }

    // 2. RUN MULTIMODAL GEMINI SCANNER
    const analysis = await analyzeScam({
      text: textContent,
      image: hasImage
        ? {
            base64: imageBase64!,
            mimeType: imageMimeType || "image/jpeg",
          }
        : undefined,
      messageType: (selectedType as MessageType) ?? "unknown",
      learnedThreatCount,
      learnedThreatExamples,
    });

    // 3. OVERLAP SEARCH WITH COMMUNITY THREAT DATABASE
    // Evaluate matching threats using both user text and image OCR extracted text
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let matchingReports: any[] = [];
    try {
      const allReports = await prisma.scamReport.findMany({
        take: 200,
        orderBy: { createdAt: "desc" },
      });

      const STOP_WORDS = new Set([
        "this", "that", "with", "from", "your", "have", "will", "here", "they", "been",
        "please", "would", "about", "there", "their", "what", "when", "where", "which",
        "should", "could", "about", "more", "some", "other", "than", "then",
        "them", "were", "went", "once", "only", "also"
      ]);

      const cleanText = (t: string) => t.toLowerCase().replace(/[^\w\s]/g, " ");
      const combinedInput = `${textContent} ${analysis.extracted_text || ""}`.trim();
      const inputNormalized = cleanText(combinedInput);
      const inputWords = new Set(
        inputNormalized
          .split(/\s+/)
          .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
      );

      for (const report of allReports) {
        const reportMsg = report.reportedMessage;
        const reportNormalized = cleanText(reportMsg);

        // Substring match
        if (
          (combinedInput.length >= 20 && reportMsg.toLowerCase().includes(combinedInput.toLowerCase())) ||
          (reportMsg.length >= 20 && combinedInput.toLowerCase().includes(reportMsg.toLowerCase()))
        ) {
          matchingReports.push(report);
          continue;
        }

        // Keyword overlap match
        const reportWords = reportNormalized
          .split(/\s+/)
          .filter(w => w.length >= 4 && !STOP_WORDS.has(w));

        let overlapCount = 0;
        for (const rw of reportWords) {
          if (inputWords.has(rw)) {
            overlapCount++;
          }
        }

        if (overlapCount >= 3) {
          matchingReports.push(report);
        }
      }

      matchingReports = matchingReports.slice(0, 4);
    } catch (searchError) {
      console.error("Non-blocking DB search error for community threats:", searchError);
    }

    // 4. LOG SCAN RECORD TO DATABASE TO CONTINUOUSLY TRAIN THE NETWORK
    let recordId = "temp-" + Math.random().toString(36).substring(2, 15);
    try {
      const record = await prisma.scamCheck.create({
        data: {
          inputText: textContent || analysis.extracted_text || "Image scan submission",
          selectedType: selectedType ?? null,
          riskScore: analysis.risk_score,
          riskLevel: analysis.risk_level,
          scamCategory: analysis.scam_category,
          summary: analysis.summary,
          warningSigns: JSON.stringify(analysis.warning_signs),
          recommendedActions: JSON.stringify(analysis.recommended_actions),
          confidenceLevel: analysis.confidence_level,
          sources: JSON.stringify(analysis.sources),
          disclaimer: analysis.disclaimer,
          hasImage,
          extractedText: analysis.extracted_text || null,
          visualIndicators: JSON.stringify(analysis.visual_indicators || []),
          decisivenessFactor: analysis.decisiveness_factor || null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
      recordId = record.id;
    } catch (dbError) {
      console.error("Non-blocking DB logging note:", dbError);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: recordId,
        ...analysis,
        has_image: hasImage,
        matchingReports,
      },
    });
  } catch (error) {
    console.error("Analyze error:", error);

    const err = error as { status?: number };

    if (err?.status === 429) {
      return NextResponse.json(
        { success: false, error: "The AI service is rate limited. Please wait 30 seconds and try again." },
        { status: 429 }
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: "AI returned an unexpected response. Please try again." },
        { status: 500 }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("API_KEY") || message.includes("API key")) {
      return NextResponse.json(
        { success: false, error: "API key is invalid or not set. Please check your .env file." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: `Analysis failed: ${message}` },
      { status: 500 }
    );
  }
}
