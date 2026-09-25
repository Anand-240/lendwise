// Indicative product terms for the demo platform. All products use the same profile-based
// risk model; the purpose is recorded but does not change the decision.
export const PRODUCTS = [
  { purpose: "Personal", name: "Personal loan", use: "Weddings, travel, medical or big-ticket purchases", amount: "₹50,000 – ₹25 lakh", tenure: "12 – 60 months" },
  { purpose: "Home", name: "Home loan", use: "Buy, build or renovate a residential property", amount: "₹5 lakh – ₹1 crore", tenure: "Up to 30 years" },
  { purpose: "Vehicle", name: "Vehicle loan", use: "New or pre-owned cars and two-wheelers", amount: "₹1 lakh – ₹30 lakh", tenure: "12 – 84 months" },
  { purpose: "Education", name: "Education loan", use: "Tuition and living costs in India or abroad", amount: "₹1 lakh – ₹75 lakh", tenure: "Up to 15 years" },
  { purpose: "Business", name: "Business loan", use: "Working capital and expansion for small businesses", amount: "₹2 lakh – ₹1 crore", tenure: "12 – 120 months" },
] as const;

export const ELIGIBILITY = [
  ["Age", "21 to 79 years at the time of application"],
  ["Residency", "Resident of India with a current address in a listed city"],
  ["Employment", "Salaried or self-employed, with your total and current-job experience"],
  ["Income", "Gross annual income, declared in the application"],
  ["Contact", "A valid email address and a 10-digit Indian mobile number"],
] as const;

export const DOCUMENTS = [
  ["Identity proof", "PAN card and Aadhaar"],
  ["Address proof", "Aadhaar, passport, utility bill or rent agreement"],
  ["Income proof", "Last 3 months’ salary slips, or 2 years’ ITR if self-employed"],
  ["Bank statements", "Last 6 months, from your salary or primary account"],
] as const;

export const charges = (rate: number) =>
  [
    ["Interest rate", `From ${rate}% p.a. (fixed, reducing balance)`],
    ["Processing fee", "Nil"],
    ["Part-prepayment", "Nil after 6 EMIs"],
    ["Foreclosure", "Nil after 6 EMIs"],
    ["Late payment", "2% per month on the overdue EMI"],
    ["Cheque / mandate bounce", "₹500 per instance"],
    ["Stamp duty", "As applicable under state law"],
  ] as const;
