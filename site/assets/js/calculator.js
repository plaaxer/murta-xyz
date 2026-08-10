const form = document.querySelector("#tdee-form");
const results = document.querySelector("#results");
const error = document.querySelector("#form-error");
const movementMode = document.querySelector("#movement-mode");
const stepFields = document.querySelector("#step-fields");
const phoneActiveField = document.querySelector("#phone-active-field");
const stepsInput = document.querySelector("#steps");
const phoneActiveInput = document.querySelector("#phone-active");
const movementNote = document.querySelector("#movement-note");
const chartBar = document.querySelector("#component-bar");
const manualMacrosToggle = document.querySelector("#manual-macros-toggle");
const manualMacroFields = document.querySelector("#manual-macro-fields");
const carbsInput = document.querySelector("#carbs");
const fatInput = document.querySelector("#fat");

const value = (id) => Number(document.querySelector(`#${id}`).value);
const selected = (id) => document.querySelector(`#${id}`).value;
const rounded = (number) => Math.round(number);
const write = (id, content) => {
  document.querySelector(`#${id}`).textContent = content;
};

function calculateTef(calories, proteinGrams, carbsGrams, fatGrams, useManualMacros) {
  const proteinCalories = proteinGrams * 4;
  const explicitCarbohydrateCalories = carbsGrams * 4;
  const explicitFatCalories = fatGrams * 9;
  const remainingCalories = Math.max(0, calories - proteinCalories - explicitCarbohydrateCalories - explicitFatCalories);
  const carbohydrateCalories = useManualMacros
    ? explicitCarbohydrateCalories
    : remainingCalories * 0.55;
  const fatCalories = useManualMacros
    ? explicitFatCalories + remainingCalories
    : remainingCalories * 0.45;

  return proteinCalories * 0.25
    + carbohydrateCalories * 0.075
    + fatCalories * 0.025;
}

function updateMacroMode() {
  const usingManualMacros = manualMacrosToggle.checked;
  manualMacroFields.hidden = !usingManualMacros;
  carbsInput.disabled = !usingManualMacros;
  fatInput.disabled = !usingManualMacros;
}

function updateMovementMode() {
  const usingSteps = movementMode.value === "steps";
  stepFields.hidden = !usingSteps;
  phoneActiveField.hidden = usingSteps;
  stepsInput.disabled = !usingSteps;
  phoneActiveInput.disabled = usingSteps;
  movementNote.textContent = usingSteps
    ? "If step length is blank, distance uses the rough proxy of 41.4% of height. Measure and enter your own average to remove that assumption. Walking uses a net cost of 0.5 kcal/kg/km. Background NEAT covers standing, dishes, hygiene, fidgeting, and walking without your phone."
    : "Phone active calories replace only the step-derived movement subtotal. Background NEAT remains because a phone misses activity when it is not carried. This mode is less transparent and should not be combined with overlapping exercise or lifting calories.";
}

movementMode.addEventListener("change", updateMovementMode);
updateMovementMode();
manualMacrosToggle.addEventListener("change", updateMacroMode);
updateMacroMode();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  error.textContent = "";

  const weight = value("weight");
  const height = value("height");
  const bodyFat = value("body-fat");
  const steps = value("steps");
  const phoneActive = value("phone-active");
  const eat = value("eat");
  const gymDays = value("gym-days");
  const caloriesLow = value("calories-low");
  const caloriesHigh = value("calories-high");
  const protein = value("protein");
  const carbs = value("carbs");
  const fat = value("fat");
  const usingManualMacros = manualMacrosToggle.checked;

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  if (caloriesLow > caloriesHigh) {
    error.textContent = "The low food-intake value cannot exceed the high value.";
    return;
  }

  if (protein * 4 > caloriesLow) {
    error.textContent = "Protein calories exceed the low end of the entered intake range.";
    return;
  }

  const explicitMacroCalories = protein * 4 + carbs * 4 + fat * 9;

  if (usingManualMacros && explicitMacroCalories > caloriesLow) {
    error.textContent = "Protein, carbohydrate, and fat calories exceed the low end of the entered intake range.";
    return;
  }

  const leanMass = weight * (1 - bodyFat / 100);
  const bmr = 370 + 21.6 * leanMass;

  const usingSteps = selected("movement-mode") === "steps";
  const measuredStepLength = value("step-length");
  const stepLengthMeters = measuredStepLength > 0
    ? measuredStepLength / 100
    : (height / 100) * 0.414;
  const distanceKm = steps * stepLengthMeters / 1000;
  const stepCalories = 0.5 * weight * distanceKm;
  const movementCalories = usingSteps ? stepCalories : phoneActive;

  const optimismFactors = { low: 0.7, mid: 1, high: 1.3 };
  const backgroundNeat = 150 * (weight / 75) * optimismFactors[selected("optimism")];

  const gymBases = { low: 90, mid: 140, high: 190 };
  const gymEpoc = { low: 1.05, mid: 1.1, high: 1.15 };
  const volumeFactor = selected("gym-volume") === "high" ? 1.15 : 0.8;
  const gymIntensity = selected("gym-intensity");
  const weightFactor = weight / 75;
  const gymPerSession = Math.min(
    250,
    gymBases[gymIntensity] * volumeFactor * gymEpoc[gymIntensity] * weightFactor,
  );
  const gymDaily = gymPerSession * gymDays / 7;

  const tefLow = calculateTef(caloriesLow, protein, carbs, fat, usingManualMacros);
  const tefHigh = calculateTef(caloriesHigh, protein, carbs, fat, usingManualMacros);
  const expenditureBeforeTef = bmr + movementCalories + backgroundNeat + eat + gymDaily;
  const tdeeLow = expenditureBeforeTef + tefLow;
  const tdeeHigh = expenditureBeforeTef + tefHigh;

  write("tdee-low", rounded(tdeeLow));
  write("tdee-high", rounded(tdeeHigh));
  write("result-bmr", `${rounded(bmr)} kcal`);
  write("result-movement-label", usingSteps ? "Steps" : "Phone active calories");
  write("result-steps", `${rounded(movementCalories)} kcal`);
  write("result-neat", `${rounded(backgroundNeat)} kcal`);
  write("result-eat", `${rounded(eat)} kcal`);
  write("result-gym", `${rounded(gymDaily)} kcal`);
  write("result-tef", `${rounded(tefLow)}–${rounded(tefHigh)} kcal`);
  write("multiplier-sedentary", `${rounded(bmr * 1.2)} kcal/day`);
  write("multiplier-light", `${rounded(bmr * 1.375)} kcal/day`);
  write("multiplier-moderate", `${rounded(bmr * 1.55)} kcal/day`);
  write("multiplier-very", `${rounded(bmr * 1.725)} kcal/day`);
  write("multiplier-extra", `${rounded(bmr * 1.9)} kcal/day`);

  const chartComponents = [
    ["chart-bmr", "BMR", bmr],
    ["chart-movement", usingSteps ? "Steps" : "Phone active calories", movementCalories],
    ["chart-neat", "Untracked NEAT", backgroundNeat],
    ["chart-eat", "Entered exercise", eat],
    ["chart-gym", "Resistance training", gymDaily],
    ["chart-tef", "TEF", (tefLow + tefHigh) / 2],
  ];
  const chartTotal = chartComponents.reduce((total, [, , calories]) => total + calories, 0);

  chartComponents.forEach(([id, label, calories]) => {
    const segment = document.querySelector(`#${id}`);
    const share = calories / chartTotal * 100;
    segment.hidden = calories <= 0;
    segment.tabIndex = calories > 0 ? 0 : -1;
    segment.style.flexGrow = calories;
    segment.textContent = share >= 9 ? label : "";
    segment.title = `${label}: ${rounded(calories)} kcal/day (${share.toFixed(1)}%)`;
    segment.setAttribute("aria-label", segment.title);
  });
  chartBar.setAttribute("aria-label", chartComponents
    .filter(([, , calories]) => calories > 0)
    .map(([, label, calories]) => `${label} ${rounded(calories)} kcal/day`)
    .join(", "));
  write(
    "result-detail",
    `${usingSteps
      ? `${steps.toLocaleString()} steps are modeled as ${distanceKm.toFixed(1)} km using a ${Math.round(stepLengthMeters * 100)} cm ${measuredStepLength > 0 ? "entered" : "estimated"} step length.`
      : `${rounded(phoneActive)} phone-reported active kcal are used in place of the step calculation.`} `
      + `Each lifting session is estimated at ${rounded(gymPerSession)} kcal including EPOC, `
      + `then averaged across ${gymDays} session${gymDays === 1 ? "" : "s"} per week. `
      + `${usingManualMacros ? "TEF uses the entered carbohydrate and fat grams; any unassigned calories are treated conservatively as fat." : "TEF estimates the non-protein calories as 55% carbohydrate and 45% fat."}`,
  );

  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
});
