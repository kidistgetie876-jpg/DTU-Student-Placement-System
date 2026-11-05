ALTER TABLE placement_settings
    ADD COLUMN public_rules_json LONGTEXT NULL;

UPDATE placement_settings
SET public_rules_json = '{
  "overview": {
    "title": "Placement Rules and Criteria",
    "summary": "The university uses a transparent and fair merit-based placement process based on academic performance and approved support points."
  },
  "formula": {
    "title": "Placement Formula and Merit Score",
    "components": [
      { "label": "CGPA", "denominator": 4, "weight_key": "gpa_weight" },
      { "label": "Grade 12 mark", "denominator_key": "g12_total_base", "weight_key": "grade_12_weight" },
      { "label": "COC", "denominator": 30, "weight_key": "coc_weight" }
    ],
    "bonus_note": "Applicable affirmative-action bonus points are added to the academic score."
  },
  "affirmative_action": {
    "title": "Affirmative-Action Bonus Points",
    "bonus_points": [
      { "label": "Female students", "value_key": "female_bonus_points" },
      { "label": "Students with a disability", "value_key": "disability_bonus_points" },
      { "label": "Minority / emerging-region students", "value_key": "minority_male_bonus_points" },
      { "label": "Minority / emerging-region female students", "value_key": "minority_female_bonus_points" },
      { "label": "Minority / emerging-region students with a disability", "value_key": "minority_disability_bonus_points" },
      { "label": "Female students with a disability from a minority / emerging region", "value_key": "female_disability_minority_bonus_points" }
    ],
    "description": "Without minority or emerging-region status, eligible female and disability bonuses are added together. For students with minority or emerging-region status, the applicable combined scenario amount is used instead of stacking separate bonuses."
  },
  "choice_preference": {
    "title": "Department Choice Preference Order Policy",
    "details": [
      "Eligible students are considered in descending order of total merit score.",
      "For each student, the system checks the submitted department choices in preference order.",
      "The student is assigned to the highest-ranked choice with an eligible stream, matching scope, and available quota or capacity.",
      "If all listed choices are full or ineligible, the student remains unassigned for review."
    ]
  },
  "capacity_quota": {
    "title": "Department Intake Capacity and Quota Management",
    "details": [
      "Department capacity is the maximum number of students assigned to that department.",
      "The configured general quota is open to eligible students; the reserved female quota is held for female students.",
      "The reserved quota is rounded up to a whole seat and cannot exceed the department capacity.",
      "Placements stop when the applicable quota or the department’s remaining capacity is exhausted.",
      "Existing placements count against capacity; capacities and quota percentages are managed by the university."
    ]
  },
  "tie_breaking": {
    "title": "Tie-Breaking Policy",
    "criteria": [
      "Higher CGPA",
      "Higher Grade 12 examination result",
      "Higher COC / relevant specific-subject score"
    ],
    "details": "If these measures are also equal, the placement system applies its additional affirmative-action priority rules."
  },
  "appeals": {
    "title": "Appeals Policy and Criteria",
    "criteria": [
      "A suspected error in the placement score or its underlying academic records.",
      "Missing or incorrect eligibility, affirmative-action, or student profile information.",
      "A concern that submitted department choices or capacity rules were not applied correctly."
    ],
    "submission": "Sign in to the student portal and submit an appeal to the Registrar with a clear explanation and supporting evidence.",
    "deadline_note": "Appeals must be submitted within the published appeal window. Check the dates below and university announcements for any approved changes."
  },
  "publishing": {
    "title": "Provisional and Official Result Publishing",
    "provisional": "Placement outcomes produced during processing are provisional and remain subject to verification and Registrar review.",
    "official": "Results become official only after the Registrar publishes them in the system. Students should rely on the published result in their portal.",
    "appeal": "Use the appeal process during the published appeal window if you identify a result or record issue."
  }
}'
WHERE id = 1 AND (public_rules_json IS NULL OR TRIM(public_rules_json) = '');
