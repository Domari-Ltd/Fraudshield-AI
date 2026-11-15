export interface ScamAnalysis {
  risk_score: number;
  risk_level: "Low Risk" | "Medium Risk" | "High Risk";
  scam_category:
    | "Fake job"
    | "Fake scholarship"
    | "Fake grant"
    | "Phishing"
    | "Fake investment"
    | "Romance/social scam"
    | "Fake delivery/payment scam"
    | "General suspicious message"
    | "Unknown";
  confidence_level: "Low" | "Medium" | "High";
  summary: string;
  warning_signs: string[];
  recommended_actions: string[];
  sources: string[];
  disclaimer: string;
  // Multimodal image recognition & OCR fields
  extracted_text?: string;
  visual_indicators?: string[];
  has_image?: boolean;
  image_preview?: string;
  // Adaptive threat memory & training telemetry
  learned_patterns_count?: number;
  decisiveness_factor?: string;
  matched_learned_patterns?: string[];
}

export type MessageType =
  | "job"
  | "scholarship"
  | "grant"
  | "email"
  | "sms"
  | "investment"
  | "unknown";

export interface ScamCheckRecord {
  id: string;
  inputText: string;
  selectedType: string | null;
  riskScore: number;
  riskLevel: string;
  scamCategory: string;
  summary: string;
  warningSigns: string;
  recommendedActions: string;
  confidenceLevel: string;
  sources: string | null;
  disclaimer: string;
  hasImage?: boolean;
  extractedText?: string | null;
  visualIndicators?: string | null;
  decisivenessFactor?: string | null;
  createdAt: Date;
}

export interface AnalyzeRequest {
  inputText?: string;
  imageBase64?: string;
  imageMimeType?: string;
  selectedType?: MessageType;
}

export interface AnalyzeResponse {
  success: boolean;
  data?: ScamAnalysis & {
    id: string;
    matchingReports?: Array<{
      id: string;
      reportedMessage: string;
      category: string | null;
      country: string | null;
      userEmail: string | null;
      createdAt: string;
    }>;
  };
  error?: string;
}

export interface ReportRequest {
  reportedMessage: string;
  category?: string;
  country?: string;
  userEmail?: string;
}

export interface FeedbackRequest {
  scamCheckId: string;
  userRating: 0 | 1;
  userComment?: string;
}
