export const AGE_LIMITS = {
  current: { min: 25, max: 85 },   // was 30–62 on the landing hero
  // Floor is 35, not 45. The old floor wasn't protecting anyone — every engine
  // here is age-parameterized, §72(t)/SEPP and the Rule-of-55 exemptions are
  // modeled, and the Monte Carlo genuinely bootstraps the full horizon, so a
  // 50-year retirement gets simulated honestly. All the floor did was refuse
  // to answer, which just pushed FIRE users to fake their birth date instead.
  // That's worse: birth year drives RMD start, Medicare/IRMAA, SS claiming and
  // the early-withdrawal penalty all at once, so a fake DOB breaks four
  // correct calculations just to dodge one arbitrary bound.
  //
  // What a long horizon actually does break, we say so instead of hiding it —
  // see the long-horizon notice in MCTab (ACA/pre-65 healthcare isn't modeled,
  // and the Blanchett smile gets extrapolated well past the data it was fit on).
  retire:  { min: 35, max: 80 },   // was 45; before that, 50–68 on the slider vs 50–100 on the wizard
  end:     { min: 60, max: 105 },
  // Social Security's claiming window is statutory, not a UI preference: 62 is
  // the earliest you can claim and 70 is the last age that earns delayed
  // retirement credits (8%/yr past FRA — waiting past 70 gains nothing). It's
  // defined here rather than inline so the sidebar slider and the wizard input
  // can't drift apart the way the retire-age controls did; capping this below
  // 70 would hide the single highest-value decision this app exists to model.
  ss:      { min: 62, max: 70 },
};
