"use client";

import { useState, useRef, useEffect } from "react";
import {
  ShieldCheck,
  Loader2,
  ChevronDown,
  AlertCircle,
  UploadCloud,
  Image as ImageIcon,
  X,
  Zap,
  ScanText,
  FileText,
} from "lucide-react";
import { ScamAnalysis, MessageType, AnalyzeResponse } from "@/types/fraudshield";
import ScamResultCard from "@/components/ScamResultCard";
import { cn } from "@/lib/utils";

const messageTypes: { value: MessageType | ""; label: string }[] = [
  { value: "", label: "All Categories" },
  { value: "job", label: "Job Offer" },
  { value: "scholarship", label: "Scholarship" },
  { value: "grant", label: "Grant / Award" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS / WhatsApp" },
  { value: "investment", label: "Investment" },
];

const exampleTextMessages = [
  {
    label: "Scholarship text sample",
    text: `Congratulations! You have been selected for a $15,000 international scholarship. To claim your award, please send a registration fee of $200 via Western Union to secure your slot. Act now — only 3 spots remaining! Reply with your full name, ID number, and bank details to: scholarshipoffice247@gmail.com`,
  },
  {
    label: "Job offer text sample",
    text: `URGENT HIRING: Remote Data Entry Clerk — Earn $500/day working from home. No experience needed. We will provide training. To start, purchase our starter kit for $150 and we will refund it on your first paycheck. WhatsApp us now: +1-555-0198. Limited positions available TODAY ONLY!`,
  },
];

// SVG-based screenshot samples for immediate 1-click testing
const samplePostalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380" fill="#0f172a"><rect width="600" height="380" rx="16" fill="#0f172a"/><rect x="0" y="0" width="600" height="36" fill="#1e293b"/><text x="20" y="24" fill="#94a3b8" font-family="sans-serif" font-size="13" font-weight="bold">Messages · 9:41 AM</text><rect x="30" y="55" width="540" height="295" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/><circle cx="60" cy="85" r="14" fill="#dc2626"/><text x="60" y="90" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">!</text><text x="85" y="90" fill="#f87171" font-family="sans-serif" font-size="15" font-weight="bold">URGENT: Postal Redelivery Notice</text><text x="50" y="130" fill="#f1f5f9" font-family="sans-serif" font-size="13" font-weight="bold">Tracking: #US-9400-11883-SUSPENDED</text><text x="50" y="160" fill="#cbd5e1" font-family="sans-serif" font-size="12">Your parcel cannot be dispatched due to an incomplete street address.</text><text x="50" y="185" fill="#cbd5e1" font-family="sans-serif" font-size="12">A mandatory redelivery processing fee of $1.99 must be settled within 24 hours.</text><rect x="50" y="210" width="500" height="42" rx="8" fill="#dc2626"/><text x="300" y="236" fill="#ffffff" font-family="sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Pay Redelivery: http://usps-redelivery-tracking-secure.com</text><text x="50" y="285" fill="#94a3b8" font-family="sans-serif" font-size="11">Reply STOP to opt out. Automated dispatch notification system.</text></svg>`;

const sampleCryptoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380" fill="#0b1329"><rect width="600" height="380" rx="16" fill="#0b1329"/><rect x="0" y="0" width="600" height="36" fill="#132042"/><text x="20" y="24" fill="#64748b" font-family="sans-serif" font-size="13" font-weight="bold">Telegram Bot · 11:20 PM</text><rect x="30" y="55" width="540" height="295" rx="12" fill="#15264f" stroke="#1e3a8a" stroke-width="2"/><text x="50" y="92" fill="#facc15" font-family="sans-serif" font-size="17" font-weight="bold">VIP AUTOMATED CRYPTO ARBITRAGE BOT</text><text x="50" y="125" fill="#38bdf8" font-family="sans-serif" font-size="14" font-weight="bold">Guaranteed Return: 300% Weekly (Zero Risk)</text><text x="50" y="155" fill="#e2e8f0" font-family="sans-serif" font-size="12">Our quantum AI algorithm exploits cross-exchange liquidity spreads.</text><text x="50" y="180" fill="#e2e8f0" font-family="sans-serif" font-size="12">To activate VIP tier bot, deposit minimum 0.05 BTC ($3,200) to trading wallet.</text><text x="50" y="205" fill="#e2e8f0" font-family="sans-serif" font-size="12">Wallet Address: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh</text><rect x="50" y="225" width="500" height="40" rx="8" fill="#eab308"/><text x="300" y="250" fill="#000000" font-family="sans-serif" font-size="13" font-weight="bold" text-anchor="middle">OFFER EXPIRES IN 02:45:10 - ACT NOW</text><text x="50" y="300" fill="#94a3b8" font-family="sans-serif" font-size="11">Telegram VIP Trading Network. Unregulated digital asset program.</text></svg>`;

interface SelectedImageState {
  dataUrl: string;
  base64: string;
  mimeType: string;
  fileName: string;
  fileSize: string;
}

export default function CheckPage() {
  const [text, setText] = useState("");
  const [selectedType, setSelectedType] = useState<MessageType | "">("");
  const [selectedImage, setSelectedImage] = useState<SelectedImageState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(ScamAnalysis & { id: string }) | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const charCount = text.length;
  const isOverLimit = charCount > 10000;

  // Process File to base64
  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, or WebP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image size exceeds 10MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setSelectedImage({
        dataUrl,
        base64,
        mimeType: file.type || "image/jpeg",
        fileName: file.name,
        fileSize: `${Math.round(file.size / 1024)} KB`,
      });
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  // Clipboard Paste (Ctrl+V) listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            processImageFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const loadSampleImage = (title: string, svgContent: string) => {
    const base64 = btoa(unescape(encodeURIComponent(svgContent)));
    const dataUrl = `data:image/svg+xml;base64,${base64}`;
    setSelectedImage({
      dataUrl,
      base64,
      mimeType: "image/svg+xml",
      fileName: `${title.toLowerCase().replace(/\s+/g, "_")}.svg`,
      fileSize: "4 KB",
    });
    setError(null);
  };

  const handleAnalyze = async () => {
    const hasImage = Boolean(selectedImage);
    const hasText = Boolean(text.trim().length >= 10);

    if (!hasImage && !hasText) {
      setError("Please attach an image screenshot or enter at least 10 characters.");
      return;
    }

    if (isOverLimit) {
      setError("Text exceeds 10,000 characters.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/fraudshield/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputText: text.trim(),
          imageBase64: selectedImage?.base64,
          imageMimeType: selectedImage?.mimeType,
          selectedType: selectedType || "unknown",
        }),
      });

      const data: AnalyzeResponse = await res.json();

      if (!data.success || !data.data) {
        setError(data.error ?? "Analysis could not be completed. Please try again.");
        return;
      }

      // Attach image preview to result card if image was scanned
      const enrichedResult = {
        ...data.data,
        image_preview: selectedImage?.dataUrl,
      };

      setResult(enrichedResult);

      setTimeout(() => {
        document.getElementById("results-section")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } catch {
      setError("Connection failure. Unable to contact scanner engine.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setText("");
    setSelectedImage(null);
    setSelectedType("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isSubmitDisabled = loading || (!selectedImage && (!text.trim() || text.trim().length < 10)) || isOverLimit;

  return (
    <div className="min-h-screen bg-[#F8F6F0] py-10 px-4">
      <div className="mx-auto max-w-3xl">
        {/* Header - concise, app-like */}
        <div className="mb-6 text-center animate-fade-in space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
            Scam Scanner
          </h1>
          <p className="text-black text-xs sm:text-sm font-medium">
            Upload screenshot or paste message to detect fraud patterns.
          </p>

          {/* Adaptive Learning Telemetry Pill */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0A2417]/10 border border-[#0A2417]/25 text-xs font-bold text-[#0A2417]">
            <Zap className="h-3.5 w-3.5" />
            <span>Adaptive Threat Memory Active — Each scan trains the network</span>
          </div>
        </div>

        <div className="card-editorial rounded-2xl p-5 sm:p-7 bg-white border border-[#E5E0D8] shadow-xs animate-scale-in space-y-5">
          {/* Category Selector */}
          <div>
            <label className="block text-xs font-bold text-black mb-1.5">
              Category
            </label>
            <div className="relative">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as MessageType)}
                className="w-full appearance-none rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] px-3.5 py-2.5 text-xs sm:text-sm text-black focus:border-[#0A2417] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2417]/10 transition-all font-semibold cursor-pointer"
              >
                {messageTypes.map((type) => (
                  <option key={type.value} value={type.value} className="bg-white text-black font-medium">
                    {type.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black" />
            </div>
          </div>

          {/* Image Screenshot Upload & Drag-and-Drop Zone */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-black flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-[#0A2417]" />
                Screenshot / Image (Vision & OCR)
              </label>
              <span className="text-[11px] font-bold text-black">
                PNG, JPG, WebP (up to 10MB)
              </span>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept="image/*"
              className="hidden"
            />

            {selectedImage ? (
              /* Image Attached Preview Card */
              <div className="relative p-3 rounded-xl border border-[#0A2417] bg-[#0A2417]/5 flex items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-14 w-14 rounded-lg overflow-hidden border border-[#E5E0D8] bg-white shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedImage.dataUrl}
                      alt="Attached screenshot preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-black truncate">
                      {selectedImage.fileName}
                    </p>
                    <p className="text-[11px] text-black font-semibold mt-0.5">
                      {selectedImage.fileSize} • Vision & OCR Ready
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedImage(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="p-1.5 rounded-lg border border-[#E5E0D8] bg-white hover:bg-[#FAF8F5] text-black transition-all cursor-pointer"
                  title="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              /* Dropzone */
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "p-5 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all",
                  isDragging
                    ? "border-[#0A2417] bg-[#0A2417]/5"
                    : "border-[#E5E0D8] bg-[#FAF8F5] hover:border-[#0A2417] hover:bg-white"
                )}
              >
                <div className="flex justify-center mb-2">
                  <UploadCloud className="h-6 w-6 text-[#0A2417]" />
                </div>
                <p className="text-xs font-bold text-black">
                  Click to upload screenshot, drag and drop, or press <kbd className="px-1.5 py-0.5 bg-white border border-[#E5E0D8] rounded font-mono text-[10px]">Ctrl+V</kbd>
                </p>
                <p className="text-[11px] text-black font-medium mt-1">
                  Recognizes text, fake seals, spoofed domains, and visual fraud cues.
                </p>
              </div>
            )}
          </div>

          {/* Message Content Input */}
          <div>
            <div className="flex justify-between items-end mb-1.5">
              <label className="text-xs font-bold text-black flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-[#0A2417]" />
                {selectedImage ? "Accompanying Notes (Optional)" : "Message Content"}
              </label>
              <div className={cn("text-xs font-bold", isOverLimit ? "text-[#DC2626]" : "text-black")}>
                {charCount.toLocaleString()} / 10,000
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                selectedImage
                  ? "Add any notes or context about this screenshot (optional)..."
                  : "Paste suspicious email, SMS, or job offer here..."
              }
              className="min-h-[140px] w-full rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] p-3.5 text-black text-xs sm:text-sm placeholder:text-black/50 focus:border-[#0A2417] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2417]/10 transition-all leading-relaxed font-sans resize-y font-medium"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-xs text-[#991B1B] shadow-2xs animate-scale-in">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#DC2626] mt-0.5" />
              <p className="font-semibold">{error}</p>
            </div>
          )}

          {/* Quick Samples Section */}
          {!text && !selectedImage && (
            <div className="space-y-2 pt-1 border-t border-[#E5E0D8]">
              <div className="text-xs font-bold text-black">
                Quick test samples:
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Image samples */}
                <button
                  type="button"
                  onClick={() => loadSampleImage("Fake SMS Notice", samplePostalSvg)}
                  className="rounded-xl border border-[#0A2417]/30 bg-[#0A2417]/5 px-3 py-1.5 text-xs font-bold text-[#0A2417] hover:bg-[#0A2417]/10 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Postal SMS Screenshot
                </button>
                <button
                  type="button"
                  onClick={() => loadSampleImage("Crypto Scam Flyer", sampleCryptoSvg)}
                  className="rounded-xl border border-[#0A2417]/30 bg-[#0A2417]/5 px-3 py-1.5 text-xs font-bold text-[#0A2417] hover:bg-[#0A2417]/10 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Crypto Bot Screenshot
                </button>

                {/* Text samples */}
                {exampleTextMessages.map((msg) => (
                  <button
                    key={msg.label}
                    type="button"
                    onClick={() => setText(msg.text)}
                    className="rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] px-3 py-1.5 text-xs font-bold text-black hover:bg-white hover:border-[#0A2417] transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                  >
                    <FileText className="h-3 w-3 text-black" />
                    {msg.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleAnalyze}
            disabled={isSubmitDisabled}
            className="w-full flex items-center justify-center gap-2 rounded-xl btn-pine py-3.5 text-xs font-bold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {selectedImage ? "Recognizing Image & Scanning Patterns..." : "Scanning Message Patterns..."}
              </>
            ) : (
              <>
                {selectedImage ? (
                  <>
                    <ScanText className="h-4 w-4" />
                    Scan Image {text.trim() ? "& Notes" : ""}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Scan Message
                  </>
                )}
              </>
            )}
          </button>
        </div>

        {/* Results Section */}
        <div id="results-section" className="mt-8 scroll-mt-24">
          {result && !loading && (
            <ScamResultCard result={result} onReset={handleReset} />
          )}

          {loading && (
            <div className="card-editorial rounded-2xl border border-[#E5E0D8] bg-white p-10 text-center shadow-xs animate-scale-in">
              <div className="flex justify-center mb-3">
                <Loader2 className="h-8 w-8 text-[#0A2417] animate-spin" />
              </div>
              <h3 className="text-sm font-bold text-black mb-1">
                {selectedImage ? "Recognizing visual content & OCR text..." : "Scanning for scam patterns..."}
              </h3>
              <p className="text-black text-xs font-medium max-w-sm mx-auto">
                Correlating with adaptive threat memory, evaluating fee demands, domain validity, and visual badges.
              </p>
            </div>
          )}
        </div>

        {/* Disclaimer Info */}
        <div className="mt-8 text-center text-black font-medium text-xs px-4">
          <p className="max-w-xl mx-auto leading-relaxed">
            Educational security tool. Always verify financial or employment requests through official channels.
          </p>
        </div>
      </div>
    </div>
  );
}
