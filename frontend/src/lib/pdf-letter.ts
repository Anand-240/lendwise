import type { ApplicationResult } from "./types";
import { DISCLAIMER, SITE_URL } from "./site";

// jsPDF's built-in fonts don't include the ₹ glyph, so amounts use "Rs." in the letter.
const rs = (n: number) => `Rs. ${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
const dateStr = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export async function downloadDecisionLetter(r: ApplicationResult) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 20;
  const approved = r.decision === "APPROVED";

  // Letterhead
  doc.setFillColor(28, 25, 23);
  doc.rect(0, 0, W, 30, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, 9, 12, 12, 2.5, 2.5, "F");
  doc.setDrawColor(28, 25, 23);
  doc.setLineWidth(1.2);
  doc.line(M + 3.4, 12, M + 3.4, 18.4);
  doc.line(M + 3.4, 18.4, M + 7, 18.4);
  doc.setDrawColor(201, 154, 46);
  doc.line(M + 6.2, 15.4, M + 7.6, 16.8);
  doc.line(M + 7.6, 16.8, M + 10, 13.2);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("LendWise", M + 16, 17.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Instant AI-powered loan decisions", M + 16, 22.5);
  doc.text(new URL(SITE_URL).host, W - M, 17.5, { align: "right" });

  let y = 44;
  doc.setTextColor(87, 83, 78);
  doc.setFontSize(10);
  doc.text(`Date: ${dateStr(r.timestamp)}`, M, y);
  doc.text(`Application ID: ${r.application_id}`, W - M, y, { align: "right" });
  y += 12;

  doc.setTextColor(28, 25, 23);
  doc.setFontSize(11);
  doc.text(`Dear ${r.applicant.full_name},`, M, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(approved ? "Subject: Loan application approved" : "Subject: Update on your loan application", M, y);
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const intro = approved
    ? `We are pleased to inform you that your application for a ${r.applicant.purpose.toLowerCase()} loan of ${rs(r.applicant.loan_amount)} has been approved based on our automated risk assessment.`
    : `Thank you for applying with LendWise. After careful assessment, we are unable to approve your application for a ${r.applicant.purpose.toLowerCase()} loan of ${rs(r.applicant.loan_amount)} at this time.`;
  const lines = doc.splitTextToSize(intro, W - 2 * M);
  doc.text(lines, M, y);
  y += lines.length * 5.5 + 6;

  // Summary box
  const rows: [string, string][] = [
    ["Decision", approved ? "APPROVED" : "NOT APPROVED"],
    ["Loan amount", rs(r.applicant.loan_amount)],
    ["Tenure", `${r.applicant.tenure_months} months`],
    ["Risk band", r.risk_band],
    [approved ? "Approval score" : "Estimated default risk", `${Math.round((approved ? r.approval_score : r.default_probability) * 100)}%`],
  ];
  if (approved && r.estimated_emi) {
    rows.push(["Indicative EMI", `${rs(r.estimated_emi)} / month`], ["Indicative interest rate", `${r.interest_rate}% p.a.`]);
  }
  const boxH = rows.length * 8 + 8;
  doc.setFillColor(approved ? 236 : 255, approved ? 253 : 241, approved ? 245 : 242);
  doc.setDrawColor(approved ? 5 : 225, approved ? 150 : 29, approved ? 105 : 72);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, W - 2 * M, boxH, 3, 3, "FD");
  let ry = y + 9;
  for (const [k, v] of rows) {
    doc.setTextColor(87, 83, 78);
    doc.setFont("helvetica", "normal");
    doc.text(k, M + 6, ry);
    doc.setTextColor(28, 25, 23);
    doc.setFont("helvetica", "bold");
    doc.text(v, W - M - 6, ry, { align: "right" });
    ry += 8;
  }
  y += boxH + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(28, 25, 23);
  doc.text(approved ? "Next steps" : "Indicative factors", M, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const bullets = approved
    ? [
        "Keep your KYC documents (PAN, Aadhaar, address proof) ready for verification.",
        "Recent salary slips or ITRs may be requested to confirm income.",
        "Review the final loan agreement, interest rate and charges carefully before signing.",
      ]
    : [
        ...r.indicative_factors.map((f) => f.label),
        "These are indicative factors, not exact model explanations.",
        "You may reapply after 90 days.",
      ];
  for (const b of bullets) {
    const bl = doc.splitTextToSize(b, W - 2 * M - 6);
    doc.text("•", M + 1, y);
    doc.text(bl, M + 6, y);
    y += bl.length * 5.2 + 1.5;
  }
  y += 6;
  doc.text("Warm regards,", M, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("LendWise Credit Team", M, y);

  // Footer disclaimer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(120, 113, 108);
  const footer = doc.splitTextToSize(
    `${r.is_demo ? "PROVISIONAL: decided while the risk model was unavailable. " : ""}${DISCLAIMER} Model: ${r.model_version}.`,
    W - 2 * M,
  );
  const fy = doc.internal.pageSize.getHeight() - 12 - footer.length * 3.8;
  doc.setDrawColor(231, 229, 228);
  doc.line(M, fy - 4, W - M, fy - 4);
  doc.text(footer, M, fy);

  doc.save(`LendWise-${r.application_id}-decision-letter.pdf`);
}
