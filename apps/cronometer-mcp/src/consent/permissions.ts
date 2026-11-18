export type PermissionRisk = "read" | "write" | "delete";

export interface PermissionGroup {
  readonly id: string;
  readonly risk: PermissionRisk;
  readonly title: string;
  readonly summary: string;
  readonly tools: readonly { readonly name: string; readonly description: string }[];
}

/**
 * What the consent screen tells people the client will be able to do, grouped
 * from least to most risky. Every MCP tool except `connection_status` must
 * appear in exactly one group (enforced by test/tools.test.ts).
 */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    id: "diary",
    risk: "read",
    title: "View your diary and nutrition",
    summary: "Food log, reports, trends, streaks, diary groups, and nutrition targets",
    tools: [
      { name: "get_food_log", description: "Food logged on a day" },
      { name: "get_daily_nutrition", description: "Calories and nutrients for a day" },
      { name: "get_macro_targets", description: "Macro targets" },
      { name: "get_diary_groups", description: "Configured diary meal groups" },
      { name: "get_logging_streak", description: "Consecutive days of food logging" },
      { name: "get_all_time_stats", description: "Lifetime logging counts" },
      { name: "get_calendar_summary", description: "Per-day logging and completion flags across dates" },
      { name: "get_nutrition_scores", description: "Nutrition adequacy scores for a day" },
      { name: "get_nutrient_definitions", description: "Catalog of tracked nutrient IDs, names, and units" },
      { name: "get_nutrition_report", description: "Consolidated nutrition report over a date range" },
      { name: "get_nutrition_trends", description: "Historical intake trends for an individual nutrient" },
      { name: "get_energy_trends", description: "Historical calorie intake and expenditure trends" },
      { name: "get_nutrient_targets", description: "Configured targets for all tracked nutrients" },
      { name: "get_macro_schedule", description: "Macro targets scheduled by weekday" },
      { name: "list_macro_templates", description: "Saved macro target templates" },
    ],
  },
  {
    id: "health",
    risk: "read",
    title: "View your health data",
    summary: "Fasting history, biometrics, weight trends, sleep scores, and exercise catalog",
    tools: [
      { name: "get_fasting_history", description: "Fasting sessions" },
      { name: "get_fasting_stats", description: "Fasting stats and streaks" },
      { name: "list_biometrics", description: "Biometric types you can record" },
      { name: "get_biometrics", description: "Biometric readings" },
      { name: "search_activities", description: "Search exercise and activity types" },
      { name: "get_recent_exercises", description: "Recently logged exercises" },
      { name: "get_weight_trends", description: "Historical weight trend chart series" },
      { name: "get_recent_biometrics", description: "Recently logged biometric measurements" },
      { name: "get_sleep_score", description: "Recorded sleep score for a day" },
    ],
  },
  {
    id: "exports",
    risk: "read",
    title: "Download your exports",
    summary: "CSV of nutrition, servings, exercise, biometrics and notes",
    tools: [
      {
        name: "get_cronometer_data",
        description: "Up to 31 days per export; uses your daily export quota",
      },
    ],
  },
  {
    id: "log",
    risk: "write",
    title: "Log entries and update your diary",
    summary: "Add food, exercise, biometrics and notes, copy days, mark days complete",
    tools: [
      { name: "add_food_entry", description: "Add a food entry" },
      { name: "copy_day", description: "Copy the previous day's entries" },
      { name: "mark_day_complete", description: "Mark a day complete or incomplete" },
      { name: "add_note", description: "Add a diary note" },
      { name: "update_note", description: "Edit an existing diary note" },
      { name: "add_exercise", description: "Log an exercise entry" },
      { name: "add_biometric", description: "Log a biometric measurement" },
    ],
  },
  {
    id: "foods",
    risk: "write",
    title: "Search and manage custom foods",
    summary: "Look up foods, list recent or custom foods, and create or update your foods and recipes",
    tools: [
      { name: "search_foods", description: "Search the food database" },
      { name: "get_food_details", description: "View a food's nutrients and servings" },
      { name: "add_custom_food", description: "Save a custom food" },
      { name: "add_recipe", description: "Save a recipe" },
      { name: "get_recent_foods", description: "List recently logged foods" },
      { name: "list_custom_foods", description: "List your custom foods and recipes" },
      { name: "update_custom_food", description: "Edit an existing custom food" },
      { name: "import_recipe", description: "Import a recipe from free-text ingredients" },
    ],
  },
  {
    id: "targets",
    risk: "write",
    title: "Update nutrition targets",
    summary: "Set macro targets, percentage macro splits, and individual nutrient targets",
    tools: [
      { name: "set_nutrient_target", description: "Set minimum and maximum targets for a nutrient" },
      { name: "set_macro_targets", description: "Set fixed gram macro and calorie targets" },
      { name: "set_macro_split", description: "Set percentage macro split" },
    ],
  },
  {
    id: "delete",
    risk: "delete",
    title: "Delete entries, foods, and recipes",
    summary: "Remove logged food entries, retire custom foods, or delete recipes",
    tools: [
      { name: "remove_food_entry", description: "Remove a food entry" },
      { name: "delete_custom_food", description: "Retire a custom food while keeping diary history" },
      { name: "delete_recipe", description: "Retire or delete a saved recipe" },
    ],
  },
];
