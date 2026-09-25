import { z } from "@/lib/zod";
import type { Metadata } from "./types";
import { PURPOSES } from "./site";

const int = (label: string) =>
  z
    .number({ error: `${label} is required` })
    .refine((v) => Number.isFinite(v), { message: `${label} is required` })
    .refine((v) => Number.isInteger(v), { message: `${label} must be a whole number` });

const oneOf = (values: Set<string>, label: string) =>
  z
    .string({ error: `Please select ${label}` })
    .min(1, `Please select ${label}`)
    .refine((v) => values.has(v), { message: `Please select a valid ${label}` });

/** Mirrors the backend's Pydantic validation. Built from /metadata so categorical
 *  options and the state → city mapping stay in sync with the model. */
export function buildApplicationSchema(md: Metadata) {
  const set = (k: keyof Metadata["options"]) => new Set(md.options[k].map((o) => o.value));

  const base = z.object({
    // Step 1
    full_name: z
      .string()
      .trim()
      .min(2, "Enter your full name (at least 2 characters)")
      .max(80, "Name must be 80 characters or fewer")
      .regex(/^[A-Za-z][A-Za-z .'-]*$/, "Use letters, spaces, dots, apostrophes or hyphens only"),
    email: z.email("Enter a valid email address").max(254),
    phone: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number starting with 6–9"),
    phone_verification_token: z.string({ error: "Verify your mobile number to continue" }).min(1, "Verify your mobile number to continue"),
    age: int("Age").pipe(z.number().min(21, "You must be at least 21").max(79, "Age must be 79 or below")),
    marital_status: oneOf(set("marital_status"), "marital status"),
    // Step 2
    profession: oneOf(set("profession"), "a profession"),
    experience: int("Experience").pipe(z.number().min(0, "Cannot be negative").max(61, "Must be 61 or fewer")),
    current_job_years: int("Years in current job").pipe(z.number().min(0, "Cannot be negative").max(61, "Must be 61 or fewer")),
    income: int("Annual income").pipe(z.number().min(0, "Cannot be negative").max(100_000_000, "Must be ₹10 crore or less")),
    // Step 3
    state: oneOf(set("state"), "a state"),
    city: oneOf(set("city"), "a city"),
    house_ownership: oneOf(set("house_ownership"), "house ownership"),
    current_house_years: int("Years at current house").pipe(z.number().min(0, "Cannot be negative").max(79, "Must be 79 or fewer")),
    car_ownership: oneOf(set("car_ownership"), "car ownership"),
    // Step 4
    loan_amount: int("Loan amount").pipe(
      z.number().min(10_000, "Minimum loan amount is ₹10,000").max(10_000_000, "Maximum loan amount is ₹1,00,00,000"),
    ),
    tenure_months: int("Tenure").pipe(z.number().min(6, "Minimum tenure is 6 months").max(360, "Maximum tenure is 360 months")),
    purpose: z.enum(PURPOSES, { error: "Please select a loan purpose" }),
    // Step 5
    consent: z.boolean().refine((v) => v, { message: "Please confirm your consent to continue" }),
  });

  return base
    .refine((d) => d.experience <= d.age - 18, {
      path: ["experience"],
      message: "Experience cannot exceed your age minus 18",
      when: (p) => base.pick({ age: true, experience: true }).safeParse(p.value).success,
    })
    .refine((d) => d.current_job_years <= d.experience, {
      path: ["current_job_years"],
      message: "Cannot exceed your total experience",
      when: (p) => base.pick({ experience: true, current_job_years: true }).safeParse(p.value).success,
    })
    .refine((d) => (md.state_to_cities[d.state] ?? []).includes(d.city), {
      path: ["city"],
      message: "Please pick a city in the selected state",
      when: (p) => base.pick({ state: true, city: true }).safeParse(p.value).success,
    });
}

export type ApplicationForm = z.infer<ReturnType<typeof buildApplicationSchema>>;

export const STEP_FIELDS: (keyof ApplicationForm)[][] = [
  ["full_name", "email", "phone", "phone_verification_token", "age", "marital_status"],
  ["profession", "experience", "current_job_years", "income"],
  ["state", "city", "house_ownership", "current_house_years", "car_ownership"],
  ["loan_amount", "tenure_months", "purpose"],
  ["consent"],
];

/** Soft warnings for values outside the training data range (still allowed). */
export function rangeWarnings(values: Partial<ApplicationForm>, md: Metadata): string[] {
  const labels: Record<string, string> = {
    income: "Annual income",
    experience: "Experience",
    current_job_years: "Years in current job",
    current_house_years: "Years at current house",
  };
  const out: string[] = [];
  for (const [k, label] of Object.entries(labels)) {
    const v = values[k as keyof ApplicationForm] as number | undefined;
    const r = md.ranges[k as keyof Metadata["ranges"]];
    if (typeof v === "number" && Number.isFinite(v) && r && (v < r.min || v > r.max)) {
      out.push(`${label} is outside the range seen in training data (${r.min.toLocaleString("en-IN")}–${r.max.toLocaleString("en-IN")}). You can still apply; the prediction may be less reliable.`);
    }
  }
  return out;
}
