export type Range = { min: number; max: number };

export type Recommendation = "APPROVE" | "REVIEW" | "REJECT";
export type EligibilityTier = "Likely" | "Borderline" | "Unlikely";
export type RiskTier = "Low" | "Moderate" | "High";
export type FinalDecision = "APPROVED" | "REJECTED" | "PENDING";
export type AppStatus = "Pending Review" | "Info Requested" | "Decided" | "Overridden";

export type ScreenInputs = { loan_amount: number; fico: number; dti: number };
export type Eligibility = { score: number; tier: EligibilityTier };
export type ChargeOff = { probability: number; tier: RiskTier; expected_loss: number };

export type Screening = {
  inputs: ScreenInputs;
  eligibility: Eligibility;
  charge_off: ChargeOff | null;
  decision: Recommendation;
  reasons: string[];
  guard: { flagged: boolean; reasons: string[] };
  counter_offer: { loan_amount: number; eligibility: Eligibility; charge_off: ChargeOff } | null;
  model_version: string;
  elapsed_ms?: number | null;
};

export type Decile = { decile: number; predicted: number; observed: number; count: number };

export type EligibilityMetrics = {
  roc_auc: number;
  accuracy: number;
  precision: number;
  recall: number;
  brier: number;
  rule_accuracy: number;
  rule_agreement: number;
  rule: string;
  train_rows: number;
  test_rows: number;
  fico_659_vs_660: { loan_amount: number; dti: number; fico_659: number; fico_660: number };
};

export type ChargeOffMetrics = {
  roc_auc: number;
  mean_predicted: number;
  mean_observed: number;
  brier: number;
  brier_base_rate: number;
  max_decile_gap: number;
  train_rate: number;
  test_rate: number;
  train_rows: number;
  test_rows: number;
  deciles: Decile[];
  guard_flag_rate_train: number;
  guard_flag_rate_test: number;
};

export type Variant = {
  variant: "A" | "B" | "C" | "D";
  label: string;
  eligibility_auc: number;
  eligibility_jumpy: number;
  chargeoff_auc: number;
  chargeoff_jumpy: number;
};

export type Evaluation = {
  variants: Variant[];
  behaviour: { checks: number; unconstrained_failed: number; constrained_failed: number; unconstrained_failures: string[] };
  nudge: { profiles: number; loan_pct: number; fico_points: number; dti_points: number; eligibility_limit: number; risk_limit: number };
  audit: {
    rows: { label: string; auc: number }[];
    fico_multiple_of_5?: { accepted: number; rejected: number; unconstrained_700: number; unconstrained_701: number };
    purpose_adds: number;
    three_inputs_unconstrained: number;
    rejected_emp_lt_1y_share: number;
    accepted_emp_lt_1y_share: number;
  };
  subgroups: { group: string; band: string; rows: number; default_rate: number; auc: number }[];
  algorithms: { algorithm: string; auc: number }[];
  algorithms_range: { min: number; max: number };
  extended_inputs: { auc: number; fields: string[] } | null;
  severity: { mean_severity: number; r2_regression: number; r2_mean: number; r2_gain: number };
};

export type AcceptanceCheck = { id: number; group: string; name: string; status: "PASS" | "FAIL" | "WARN"; detail: string; seconds: number };
export type TestCase = { id: string; input: string; expected: string; actual: string; status: string };

export type Acceptance = {
  summary: {
    passed: number;
    failed: number;
    warnings: number;
    total: number;
    bad_values: number;
    grid_size: number;
    seconds: number;
    run_at: string;
    model_version: string;
  };
  test_cases: TestCase[];
  checks: AcceptanceCheck[];
};

export type Metadata = {
  mode: "live" | "unavailable";
  model_version: string;
  trained_at: string;
  features: string[];
  input_ranges: Record<"loan_amount" | "fico" | "dti", Range>;
  constraints: { eligibility: number[]; chargeoff: number[] };
  hgb_params: Record<string, number | boolean>;
  calibration: { method: string; folds: number };
  severity: number;
  thresholds: {
    reject_eligibility: number;
    approve_eligibility: number;
    reject_pd: number;
    approve_pd: number;
    reject_el: number;
    approve_el: number;
  };
  counter_offer_step: number;
  guard: {
    limits: Record<"loan_amount" | "fico" | "dti", { low: number; high: number }>;
    lower_quantile: number;
    upper_quantile: number;
    isolation_trees: number;
    contamination: number;
  };
  data: {
    eligibility: {
      rows: number;
      train_rows: number;
      test_rows: number;
      accepted_2016_raw: number;
      rejected_2016_raw: number;
      real_acceptance_rate: number;
      rejected_emp_lt_1y_share: number;
    };
    chargeoff: { train_rows: number; test_rows: number; train_rate: number; test_rate: number };
    severity: number;
  };
  metrics: { eligibility: EligibilityMetrics; chargeoff: ChargeOffMetrics };
  environment: { python: string; scikit_learn: string; pandas: string; numpy: string; seed: number };
  evaluation: Evaluation | Record<string, never>;
  acceptance: Acceptance | Record<string, never>;
  purposes: string[];
};

export type Health = {
  status: string;
  model_loaded: boolean;
  mode: "live" | "unavailable";
  model_version: string;
  email_mode: "live" | "demo";
};

export type EmailSummary = {
  id: number;
  kind: string;
  subject: string;
  to_masked: string;
  created_at: string;
  status: "demo" | "queued" | "sent" | "failed";
  html: string;
};

export type AdminEmail = {
  id: number;
  created_at: string;
  kind: string;
  to_email: string;
  subject: string;
  html: string;
  text: string;
  application_id: string | null;
  message_id: number | null;
  status: "demo" | "queued" | "sent" | "failed";
  provider: string;
  error: string | null;
};

export type AdminEmailPage = { items: AdminEmail[]; total: number; mode: "live" | "demo" };

export type ThreadMessage = { author: "officer" | "applicant"; body: string; created_at: string };

export type ApplicantSummary = {
  full_name: string;
  email: string;
  purpose: string;
  loan_amount: number;
  fico: number;
  dti: number;
};

export type ApplicationResult = {
  application_id: string;
  status: AppStatus;
  decision: FinalDecision;
  approved_amount: number | null;
  screening: Screening;
  applicant: ApplicantSummary;
  timestamp: string;
  decided_at: string | null;
  emails: EmailSummary[];
  messages: ThreadMessage[];
};

export type AdminApplication = {
  id: number;
  application_id: string;
  created_at: string;
  updated_at: string;
  full_name: string;
  email: string;
  purpose: string;
  loan_amount: number;
  fico: number;
  dti: number;
  eligibility_score: number;
  eligibility_tier: EligibilityTier;
  default_probability: number;
  expected_loss: number;
  risk_tier: RiskTier;
  guard_flagged: boolean;
  guard_reasons: string[];
  recommendation: Recommendation;
  recommendation_reasons: string[];
  counter_offer: number | null;
  model_version: string;
  final_decision: FinalDecision;
  approved_amount: number | null;
  status: AppStatus;
  officer_note: string | null;
  reviewed_at: string | null;
  messages: ThreadMessage[];
};

export type AdminPage = {
  items: AdminApplication[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type AdminStats = {
  total: number;
  approved: number;
  rejected: number;
  approval_rate: number;
  rejection_rate: number;
  awaiting_review: number;
  info_requested: number;
  overridden: number;
  flagged: number;
  counter_offers: number;
  agreement_rate: number | null;
  avg_default_probability: number;
  avg_eligibility: number;
  by_recommendation: Record<Recommendation, number>;
  by_eligibility_tier: Record<EligibilityTier, number>;
  by_risk_tier: Record<RiskTier, number>;
  per_day: { date: string; approved: number; rejected: number; pending: number }[];
  probability_histogram: { bucket: string; count: number }[];
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    details: { field: string | null; message: string }[];
    request_id?: string | null;
  };
};

export type ContactMessage = {
  id: number;
  reference: string;
  created_at: string;
  name: string;
  email: string;
  topic: string;
  application_id: string | null;
  message: string;
  resolved: boolean;
  replies: { created_at: string; body: string; status: string }[];
};

export type ContactPage = { items: ContactMessage[]; total: number; unresolved: number };
