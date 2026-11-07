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
    summary: "Food log, daily totals and macro targets",
    tools: [
      { name: "get_food_log", description: "Food logged on a day" },
      { name: "get_daily_nutrition", description: "Calories and nutrients for a day" },
      { name: "get_macro_targets", description: "Macro targets" },
    ],
  },
  {
    id: "health",
    risk: "read",
    title: "View your health data",
    summary: "Fasting history, weight and other biometrics",
    tools: [
      { name: "get_fasting_history", description: "Fasting sessions" },
      { name: "get_fasting_stats", description: "Fasting stats and streaks" },
      { name: "list_biometrics", description: "Biometric types you can record" },
      { name: "get_biometrics", description: "Biometric readings" },
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
    title: "Log food and update your diary",
    summary: "Add entries, copy the previous day, mark days complete",
    tools: [
      { name: "add_food_entry", description: "Add a food entry" },
      { name: "copy_day", description: "Copy the previous day's entries" },
      { name: "mark_day_complete", description: "Mark a day complete or incomplete" },
    ],
  },
  {
    id: "foods",
    risk: "write",
    title: "Search and create foods",
    summary: "Look up foods and save your own foods and recipes",
    tools: [
      { name: "search_foods", description: "Search the food database" },
      { name: "get_food_details", description: "View a food's nutrients and servings" },
      { name: "add_custom_food", description: "Save a custom food" },
      { name: "add_recipe", description: "Save a recipe" },
    ],
  },
  {
    id: "delete",
    risk: "delete",
    title: "Delete diary entries",
    summary: "Remove food entries you've logged",
    tools: [{ name: "remove_food_entry", description: "Remove a food entry" }],
  },
];
