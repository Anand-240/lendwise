export type Option = { value: string; label: string };

export type Metrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
};

export type Range = { min: number; max: number };

export type Metadata = {
  mode: "live" | "demo";
  model_version: string;
  options: {
    marital_status: Option[];
    house_ownership: Option[];
    car_ownership: Option[];
    profession: Option[];
    state: Option[];
    city: Option[];
  };
  state_to_cities: Record<string, string[]>;
  ranges: Record<"income" | "age" | "experience" | "current_job_years" | "current_house_years", Range>;
  metrics: Metrics;
  metrics_note?: string;
  training_rows: number;
  test_rows: number;
  n_features: number;
  interest_rate: number;
  purposes: string[];
  limits: Record<"loan_amount" | "tenure_months" | "age", Range>;
};

export type Health = {
  status: string;
  model_loaded: boolean;
  mode: "live" | "demo";
  model_version: string;
  email_mode: "live" | "demo";
  sms_mode: "live" | "demo";
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

export type OtpSent = {
  verification_id: string;
  phone_masked: string;
  expires_in: number;
  resend_after: number;
  mode: "live" | "demo";
  demo_code: string | null;
};

export type Factor = {
  key: string;
  label: string;
  direction: "risk" | "strength";
  detail?: string | null;
  value?: number | null;
  median?: number | null;
};

export type Decision = "APPROVED" | "REJECTED";
export type FinalDecision = Decision | "PENDING";
export type RiskBand = "Low" | "Moderate" | "High";
export type AppStatus = "Pending Review" | "Info Requested" | "Decided" | "Overridden" | "Under Review";
export type ThreadMessage = { author: "officer" | "applicant"; body: string; created_at: string };

export type ApplicantSummary = {
  full_name: string;
  email: string;
  phone_masked: string;
  age: number;
  marital_status: string;
  profession: string;
  experience: number;
  current_job_years: number;
  income: number;
  state: string;
  city: string;
  house_ownership: string;
  current_house_years: number;
  car_ownership: string;
  loan_amount: number;
  tenure_months: number;
  purpose: string;
};

export type ApplicationResult = {
  application_id: string;
  decision: FinalDecision;
  model_decision: Decision | null;
  status: AppStatus;
  risk_class: number | null;
  default_probability: number | null;
  approval_score: number | null;
  confidence: number | null;
  risk_band: RiskBand | null;
  indicative_factors: Factor[];
  engineered_features: Record<string, number | string>;
  warnings: string[];
  estimated_emi: number | null;
  interest_rate: number;
  model_version: string;
  is_demo: boolean;
  timestamp: string;
  applicant: ApplicantSummary;
  officer_note_present: boolean;
  phone_verified: boolean;
  emails: EmailSummary[];
  messages: ThreadMessage[];
  decided_at: string | null;
};

/** A result an officer has decided: model outputs are always present. */
export type DecidedResult = ApplicationResult & {
  decision: Decision;
  model_decision: Decision;
  risk_class: number;
  default_probability: number;
  approval_score: number;
  confidence: number;
  risk_band: RiskBand;
};

export type AdminApplication = {
  id: number;
  application_id: string;
  created_at: string;
  updated_at: string;
  full_name: string;
  email: string;
  phone: string;
  loan_amount: number;
  tenure_months: number;
  purpose: string;
  income: number;
  age: number;
  experience: number;
  marital_status: string;
  house_ownership: string;
  car_ownership: string;
  profession: string;
  city: string;
  state: string;
  current_job_years: number;
  current_house_years: number;
  engineered_features: Record<string, number | string>;
  risk_class: number;
  default_probability: number;
  confidence: number;
  risk_band: RiskBand;
  decision: Decision;
  final_decision: FinalDecision;
  indicative_factors: Factor[];
  warnings: string[];
  model_version: string;
  is_demo: boolean;
  interest_rate: number;
  status: AppStatus;
  officer_note: string | null;
  reviewed_at: string | null;
  phone_verified: boolean;
  messages: ThreadMessage[];
};

export type AdminPage = {
  items: AdminApplication[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type GroupStat = {
  value: string;
  label: string;
  total: number;
  approved: number;
  rejected: number;
  approval_rate: number;
};

export type AdminStats = {
  total: number;
  approved: number;
  rejected: number;
  approval_rate: number;
  rejection_rate: number;
  avg_default_probability: number;
  under_review: number;
  overridden: number;
  awaiting_review: number;
  info_requested: number;
  model_would_approve: number;
  demo_count: number;
  by_risk_band: Record<RiskBand, number>;
  per_day: { date: string; approved: number; rejected: number }[];
  probability_histogram: { bucket: string; count: number }[];
  by_profession: GroupStat[];
  by_state: GroupStat[];
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
