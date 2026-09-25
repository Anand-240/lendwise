export const FAQS: { q: string; a: string; category: "General" | "Decision" | "Privacy" }[] = [
  {
    category: "General",
    q: "What is LendWise?",
    a: "LendWise is a demonstration loan platform. You fill in an application and a trained Random Forest model assesses your default risk to produce an instant, explainable decision. It is built for education and is not an actual credit offer.",
  },
  {
    category: "Decision",
    q: "How is my application decided?",
    a: "Your profile (income, age, experience, job and residence tenure, marital status, house and car ownership, profession, city and state) is converted into 414 model features. A Random Forest predicts whether the profile is low or high risk. Low risk is approved; high risk is declined.",
  },
  {
    category: "Decision",
    q: "Does the loan amount affect the decision?",
    a: "No. Loan amount, tenure and purpose are recorded with your application and used to estimate your EMI, but they are not model inputs. The decision is based only on your applicant profile risk.",
  },
  {
    category: "Decision",
    q: "How long does a decision take?",
    a: "Usually just a few seconds after you submit. You'll see the result immediately and can download a PDF decision letter.",
  },
  {
    category: "Decision",
    q: "Why was my application declined?",
    a: "The model judged your profile to be higher risk. The decision page lists indicative factors — simple comparisons of your details with typical applicants — to help you understand the result. These are indications, not exact model explanations.",
  },
  {
    category: "Decision",
    q: "Can I reapply?",
    a: "Yes. We recommend waiting 90 days, during which factors like time in your current job or residence may improve.",
  },
  {
    category: "General",
    q: "How do I check my application status later?",
    a: "Use the Check Status page with your application ID (for example LW-2026-000123) and the email address you applied with.",
  },
  {
    category: "Privacy",
    q: "Is my data safe?",
    a: "Data travels over encrypted connections, is stored only to process and display your application, and is never sold. Officer access is protected by authentication. See our privacy policy for details.",
  },
  {
    category: "Privacy",
    q: "Is the model fair?",
    a: "The model learns from historical data that may contain bias — for example through location or profession. We disclose this openly on the How it works page, and a loan officer can review and override any decision.",
  },
];
