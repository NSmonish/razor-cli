# Excluded: t7 rows graded against a mis-specified criterion

The first t7 prompt asked for FSTSEC002 to be called with "the referenced
schema id", but the hidden test (from the real fix) expects the `$ref` string
exactly as written, including the trailing `#`. Every session, in both arms,
failed only AC7, and did what the prompt asked. This was a task-design defect,
so these rows are kept here for the record and excluded from the run's summary.

Excluding AC7, all 6 sessions passed. Razor/naive medians: tokens 1.06×,
time 0.90×, cost 1.02×.

The prompt was corrected and t7 was re-run.
