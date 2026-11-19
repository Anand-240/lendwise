export const FAQS: { q: string; a: string; category: "General" | "Models" | "Decision" | "Privacy" }[] = [
  {
    category: "General",
    q: "What is LendWise?",
    a: "LendWise is a loan screening prototype built on the public LendingClub data, which includes both funded loans and rejected applications. From three inputs (loan amount, FICO score and debt-to-income ratio) it gives an eligibility score, a charge-off probability, a decision and, where possible, a smaller amount that could be offered instead. It is meant to help a human reviewer, not to make lending decisions on its own.",
  },
  {
    category: "Models",
    q: "Why only three inputs?",
    a: "Loan amount, FICO score and DTI are the only inputs that both the accepted and the rejected files record in a comparable way. Employment length, state and loan purpose exist in both files but are recorded differently, and using them pushed our first model to an AUC of 0.99 for reasons that had nothing to do with the applicants. Fields set by the lender after reviewing the application, such as grade and interest rate, cannot be used either.",
  },
  {
    category: "Models",
    q: "Is the eligibility score my chance of approval?",
    a: "No. It shows how closely the application resembles the ones LendingClub accepted. The model was trained on a 50/50 sample of accepted and rejected applications, while in reality only about 8% were accepted, so a score of 75 corresponds to a real acceptance chance of only about 21%.",
  },
  {
    category: "Decision",
    q: "How is the decision made?",
    a: "An application is rejected if its eligibility score is below 40 or its expected loss is above 11.07% of the loan (a default probability above 22%). It is approved if the score is 75 or more and the expected loss is at most 6.04% (a default probability up to 12%), and the range guard has not flagged it. Everything else goes to review. Expected loss is the default probability times the average loss on a charged-off loan, which is 50.3% of the principal in the training data.",
  },
  {
    category: "Decision",
    q: "What is a counter-offer?",
    a: "When an application is rejected or sent for review, LendWise tries smaller loan amounts in $500 steps and offers the largest one the rules would approve. If no smaller amount would be approved with the same FICO score and DTI, there is no counter-offer.",
  },
  {
    category: "Decision",
    q: "What is the range guard?",
    a: "It flags inputs outside the 0.1st to 99.9th percentile of the funded loans the risk model learned from, and unusual combinations of inputs found by an Isolation Forest with 200 trees. A flagged case is never approved automatically; it goes to a human reviewer instead.",
  },
  {
    category: "Models",
    q: "Why does a FICO score below 660 always score so low?",
    a: "LendingClub's screening is close to a fixed rule: FICO at least 660, DTI at most 35 and a loan below $40,000. The eligibility model agrees with that rule on more than 99% of applications, so it is best seen as a consistent copy of the lender's policy. LendingClub funded almost no loans below 660, so the charge-off risk for those scores is a guess.",
  },
  {
    category: "Models",
    q: "How accurate is the charge-off model?",
    a: "Its AUC on loans from 2015, a year it never saw, is about 0.63: if you pick one charged-off loan and one repaid loan at random, it gives the charged-off one a higher risk about 63% of the time. That is modest, but twelve different algorithms on the same three inputs all land in the same place, so the limit comes from the inputs. Its probabilities are well calibrated: about 13.9% predicted against 14.8% observed.",
  },
  {
    category: "General",
    q: "Can I use LendWise for a real loan in India?",
    a: "No. The models were trained on US data and use the US FICO score. Using them in India would mean retraining on local bureau data such as CIBIL scores and revising the thresholds, and a fairness and adverse-impact analysis would be needed first.",
  },
  {
    category: "Privacy",
    q: "What happens to the numbers I type in?",
    a: "Screening on the Screen page stores nothing. If you submit an application, your name, email, purpose and the three inputs are saved with the screening result so a loan officer can review it. You can ask for it to be deleted through the contact form.",
  },
];
